import os
import json
import uuid
import zipfile
import shutil
from flask import jsonify, request
from src.config import Config, AVAILABLE_MODELS
from src.workers.executor import executor, run_model_download_task
from . import playground_bp

# --- UTILITIES ---

def scan_local_models():
    """Scans the models directory for Hugging Face snapshots."""
    models_dir = os.path.join(Config.BASE_DIR, 'models')
    local_models = []
    
    # 1. Include Configured Default if present
    if hasattr(Config, 'LOCAL_MODEL_ID') and Config.LOCAL_MODEL_ID:
        local_models.append(Config.LOCAL_MODEL_ID)

    if os.path.exists(models_dir):
        try:
            for item in os.listdir(models_dir):
                full_path = os.path.join(models_dir, item)
                if os.path.isdir(full_path):
                    if item.startswith('.') or item == 'model_adapters':
                        continue
                    
                    # Convert folder name back to HF ID format
                    # e.g., models--org--repo -> org/repo
                    model_name = item
                    if item.startswith("models--"):
                        clean_name = item[8:] # remove prefix
                        model_name = clean_name.replace("--", "/")
                    
                    if model_name not in local_models:
                        local_models.append(model_name)
        except OSError as e:
            print(f"[Model Scan] Error: {e}")

    return sorted(list(set(local_models)))

def scan_local_adapters():
    """Scans the adapters directory for valid config files."""
    adapters_dir = os.path.join(Config.BASE_DIR, 'models', 'model_adapters')
    local_adapters = []
    
    if os.path.exists(adapters_dir):
        try:
            for item in os.listdir(adapters_dir):
                adapter_path = os.path.join(adapters_dir, item)
                config_path = os.path.join(adapter_path, 'adapter_config.json')
                
                # We only list folders that actually look like adapters
                if os.path.isdir(adapter_path) and os.path.exists(config_path):
                    try:
                        with open(config_path, 'r', encoding='utf-8') as f:
                            config_data = json.load(f)
                        local_adapters.append({
                            'id': item,
                            'name': item,
                            'path': item,
                            'base_model': config_data.get('base_model_name_or_path', 'unknown'),
                            'rank': config_data.get('r', 'N/A'),
                            'alpha': config_data.get('lora_alpha', 'N/A')
                        })
                    except Exception as json_err:
                        # Add broken adapters so user knows they exist but are invalid
                        local_adapters.append({
                            'id': item,
                            'name': f"{item} (Metadata Error)",
                            'path': item,
                            'base_model': 'unknown',
                            'rank': '?',
                            'alpha': '?'
                        })
        except OSError as e:
            print(f"[Adapter Scan] Error: {e}")
            
    return local_adapters

# --- ENDPOINTS ---

@playground_bp.route('/api/playground/models/list', methods=['GET'])
def list_models():
    """Returns the combined list of Cloud and Local models."""
    local = scan_local_models()
    # Combine with Cloud defaults defined in settings/model_pricing.yaml
    combined = AVAILABLE_MODELS + local
    # Deduplicate while preserving order preference (Cloud first)
    seen = set()
    unique_models = []
    for m in combined:
        if m not in seen:
            unique_models.append(m)
            seen.add(m)
            
    return jsonify(unique_models)

@playground_bp.route('/api/playground/adapters/list', methods=['GET'])
def list_adapters():
    """Returns the list of locally available LoRA adapters."""
    return jsonify(scan_local_adapters())

@playground_bp.route('/api/playground/models/import', methods=['POST'])
def import_model():
    """Initiates a background task to download a model from Hugging Face."""
    data = request.get_json()
    model_id = data.get('model_id')
    
    if not model_id or '/' not in model_id:
        return jsonify({'error': 'Invalid Hugging Face Model ID format (expected org/repo).'}), 400

    task_id = str(uuid.uuid4())
    
    # Dispatch non-blocking download
    executor.submit(run_model_download_task, task_id, model_id.strip())

    return jsonify({
        'status': 'queued',
        'task_id': task_id,
        'message': f"Download queued for {model_id}"
    }), 202

@playground_bp.route('/api/playground/adapters/upload', methods=['POST'])
def upload_adapter():
    """
    Handles .zip upload, secure extraction, and cleanup for LoRA adapters.
    This is a synchronous operation for simplicity as zip extraction is generally fast.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if not file.filename.endswith('.zip'):
        return jsonify({'error': 'Only .zip archives are supported.'}), 400

    # Prepare directories
    adapters_root = os.path.join(Config.BASE_DIR, 'models', 'model_adapters')
    os.makedirs(adapters_root, exist_ok=True)

    # Sanitize filename to create folder name
    folder_name = os.path.splitext(file.filename)[0].replace(' ', '_')
    target_dir = os.path.join(adapters_root, folder_name)
    
    # Save temp zip
    temp_zip_path = os.path.join(adapters_root, file.filename)
    file.save(temp_zip_path)

    try:
        # Check if target directory already exists
        if os.path.exists(target_dir):
            # Cleanup old version to allow overwrite
            shutil.rmtree(target_dir)
        os.makedirs(target_dir)

        # Secure extraction
        with zipfile.ZipFile(temp_zip_path, 'r') as zip_ref:
            # Prevent zip bombs / path traversal
            for member in zip_ref.infolist():
                if member.filename.startswith('/') or '..' in member.filename:
                    raise ValueError(f"Malicious path detected in zip: {member.filename}")
                zip_ref.extract(member, target_dir)
        
        # Cleanup zip
        os.remove(temp_zip_path)
        
        # Verify it looks like an adapter
        if not os.path.exists(os.path.join(target_dir, 'adapter_config.json')):
             return jsonify({
                 'status': 'warning', 
                 'message': 'Upload successful, but "adapter_config.json" was not found in the root. The adapter may not be recognized.'
             }), 200

        return jsonify({
            'status': 'success', 
            'adapter_id': folder_name,
            'message': f"Adapter '{folder_name}' successfully installed."
        }), 200

    except Exception as e:
        # Cleanup on failure
        if os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)
        if os.path.exists(target_dir):
            shutil.rmtree(target_dir)
            
        return jsonify({'error': f"Extraction failed: {str(e)}"}), 500