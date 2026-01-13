import os
import json
from flask import render_template
from src.config import Config, AVAILABLE_MODELS
from src.core.engines.qwen.diagnostics import check_gpu_capacity
from . import playground_bp

@playground_bp.route('/playground')
def index():
    """
    Renders the Playground evaluation interface.
    Performs model discovery and hardware capability checks.
    """
    models_dir = os.path.join(Config.BASE_DIR, 'models')
    local_models = []

    # 1. Discover Base Models
    if hasattr(Config, 'LOCAL_MODEL_ID') and Config.LOCAL_MODEL_ID:
        local_models.append(Config.LOCAL_MODEL_ID)

    if os.path.exists(models_dir):
        try:
            for item in os.listdir(models_dir):
                full_path = os.path.join(models_dir, item)
                if os.path.isdir(full_path):
                    if item.startswith('.') or item == 'model_adapters':
                        continue
                    model_name = item
                    if item.startswith("models--"):
                        clean_name = item[8:] 
                        model_name = clean_name.replace("--", "/")
                    if model_name not in local_models:
                        local_models.append(model_name)
        except OSError as e:
            print(f"[Playground View] Error scanning models: {e}")

    local_models = sorted(list(set(local_models)))
    combined_models = AVAILABLE_MODELS + local_models
    
    # 2. Discover Adapters
    adapters_dir = os.path.join(Config.BASE_DIR, 'models', 'model_adapters')
    local_adapters = []
    
    if os.path.exists(adapters_dir):
        try:
            for item in os.listdir(adapters_dir):
                adapter_path = os.path.join(adapters_dir, item)
                config_path = os.path.join(adapter_path, 'adapter_config.json')
                
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
                        print(f"[Playground View] Adapter config error {item}: {json_err}")
                        local_adapters.append({
                            'id': item,
                            'name': f"{item} (Metadata Error)",
                            'path': item,
                            'base_model': 'unknown',
                            'rank': '?',
                            'alpha': '?'
                        })
        except OSError as e:
            print(f"[Playground View] Error scanning adapters: {e}")

    # 3. Defaults & Hardware Check
    inference_defaults = {
        'temperature': Config.INFERENCE_TEMPERATURE,
        'top_p': Config.INFERENCE_TOP_P,
        'max_tokens': Config.INFERENCE_MAX_TOKENS,
        'repetition_penalty': Config.INFERENCE_REPETITION_PENALTY,
        'system_prompt': Config.INFERENCE_SYSTEM_PROMPT,
        'main_prompt': Config.INFERENCE_PROMPT,
        'lora_scale': 0.1,      # UPDATED DEFAULT
        'stream_interval': 100  # UPDATED DEFAULT
    }

    gpu_status = check_gpu_capacity(required_vram_gb=12.0)

    return render_template(
        'playground.html', 
        models=combined_models, 
        adapters=local_adapters, 
        cloud_models=AVAILABLE_MODELS,
        defaults=inference_defaults,
        gpu_capabilities=gpu_status 
    )