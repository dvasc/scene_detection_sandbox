import os
import json
from flask import jsonify, send_from_directory
from src.config import Config
from . import playground_bp

@playground_bp.route('/api/playground/session/<session_id>/logs', methods=['GET'])
def get_session_logs(session_id):
    """
    Retrieves execution logs and raw VLM outputs.
    Supports both legacy flat logs and new SSOT interactions list.
    """
    session_dir = os.path.join(Config.PLAYGROUND_FOLDER, session_id)
    if not os.path.exists(session_dir): 
        return jsonify({'error': 'Session not found'}), 404

    pipeline_log_path = os.path.join(session_dir, 'qwen_inference_pipeline.log')
    ssot_path = os.path.join(session_dir, 'model_interaction.json')
    
    logs = {'pipeline': "", 'debug': []}

    if os.path.exists(pipeline_log_path):
        try:
            with open(pipeline_log_path, 'r', encoding='utf-8') as f: 
                logs['pipeline'] = f.read()
        except Exception as e: 
            logs['pipeline'] = f"Error reading log: {e}"

    if os.path.exists(ssot_path):
        try:
            with open(ssot_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                logs['debug'] = data.get('interactions', [])
        except Exception as e:
            logs['debug'] = [{"error": f"Failed to parse SSOT: {e}"}]

    return jsonify(logs)

@playground_bp.route('/playground/<path:filename>')
def serve_playground_asset(filename):
    """Serves static files (videos and frames) from the playground data sandbox."""
    return send_from_directory(Config.PLAYGROUND_FOLDER, filename)