import os
import uuid
import time
from flask import request, jsonify
from src.config import Config
from src.workers.executor import executor, run_playground_inference_task
from src.workers.utils import request_task_cancellation, TASK_STATUS
from . import playground_bp

@playground_bp.route('/api/playground/inference', methods=['POST'])
def trigger_inference():
    """
    Initiates a background multimodal inference task.
    """
    if 'video' not in request.files: 
        return jsonify({'error': 'No video file provided'}), 400
        
    file = request.files['video']
    if file.filename == '': 
        return jsonify({'error': 'No video file selected'}), 400

    window_size = int(request.form.get('window_size', 32))
    model_id = request.form.get('model_id')
    adapter_input = request.form.get('adapter_path') 
    adapter_path = None
    
    # Resolve hyperparams
    inference_params = {
        'temperature': float(request.form.get('temperature', Config.INFERENCE_TEMPERATURE)),
        'top_p': float(request.form.get('top_p', Config.INFERENCE_TOP_P)),
        'max_tokens': int(request.form.get('max_tokens', Config.INFERENCE_MAX_TOKENS)),
        'repetition_penalty': float(request.form.get('repetition_penalty', Config.INFERENCE_REPETITION_PENALTY)),
        'system_prompt': request.form.get('system_prompt', Config.INFERENCE_SYSTEM_PROMPT),
        'main_prompt': request.form.get('main_prompt', Config.INFERENCE_PROMPT),
        'bypass_validation': request.form.get('bypass_validation') == 'true',
        'lora_scale': float(request.form.get('lora_scale', 1.0)),
        'high_fidelity_mode': request.form.get('high_fidelity_mode') == 'true',
        
        # Operational params
        'stream_interval': int(request.form.get('stream_interval', 30))
    }
    
    if adapter_input:
        potential_path = os.path.join(Config.BASE_DIR, 'models', 'model_adapters', adapter_input)
        if os.path.exists(potential_path):
            adapter_path = potential_path
        else:
            adapter_path = adapter_input

    # Generate IDs
    task_id = str(uuid.uuid4())
    session_id = f"play_{int(time.time())}"
    
    session_folder = os.path.join(Config.PLAYGROUND_FOLDER, session_id)
    os.makedirs(session_folder, exist_ok=True)
    
    upload_path = os.path.join(session_folder, file.filename)
    file.save(upload_path)

    # Dispatch
    executor.submit(
        run_playground_inference_task, 
        task_id, 
        session_id, 
        file.filename, 
        window_size, 
        model_id,
        adapter_path,
        inference_params
    )

    return jsonify({
        'status': 'queued', 
        'task_id': task_id, 
        'model_used': model_id
    }), 202

@playground_bp.route('/api/playground/abort/<task_id>', methods=['POST'])
def abort_task(task_id):
    """
    Signals the background worker to cease execution at the next checkpoint.
    """
    request_task_cancellation(task_id)
    return jsonify({'status': 'cancel_requested', 'task_id': task_id}), 200

@playground_bp.route('/status/<task_id>')
def task_status(task_id):
    """
    Polling endpoint for task progress.
    """
    return jsonify(TASK_STATUS.get(task_id, {'state': 'PENDING', 'status': 'Queued...'}))