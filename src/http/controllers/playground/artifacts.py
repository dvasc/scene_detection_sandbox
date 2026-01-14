import os
import json
import io
import zipfile
from flask import jsonify, send_from_directory, send_file
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

@playground_bp.route('/api/playground/session/<session_id>/download', methods=['GET'])
def download_session_archive(session_id):
    """
    Generates and serves a ZIP archive of the session directory on-the-fly.
    CRITICAL: Excludes the large source video file to optimize portability.
    """
    # 1. Security Check & Path Resolution
    # Ensure session_id is a simple identifier to prevent traversal
    safe_id = os.path.basename(session_id)
    session_dir = os.path.join(Config.PLAYGROUND_FOLDER, safe_id)
    
    if not os.path.exists(session_dir):
        return jsonify({'error': 'Session not found'}), 404

    # 2. Identify Exclusion Target (The Video Source)
    video_to_exclude = None
    
    # Check SSOT (V3)
    ssot_path = os.path.join(session_dir, 'model_interaction.json')
    if os.path.exists(ssot_path):
        try:
            with open(ssot_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                video_to_exclude = data.get('session_metadata', {}).get('video_filename')
        except:
            pass
            
    # Fallback to Legacy State (V1/V2)
    if not video_to_exclude:
        legacy_path = os.path.join(session_dir, 'state.json')
        if os.path.exists(legacy_path):
            try:
                with open(legacy_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    video_to_exclude = data.get('metadata', {}).get('video_filename')
            except:
                pass

    # 3. Build Archive In-Memory
    memory_file = io.BytesIO()
    
    try:
        with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(session_dir):
                for file in files:
                    # Skip the source video file to keep archive light
                    if video_to_exclude and file == video_to_exclude:
                        continue
                        
                    file_path = os.path.join(root, file)
                    # Create relative path inside the zip (preserve structure)
                    # e.g., session_id/frames/shot_001.jpg
                    arcname = os.path.relpath(file_path, Config.PLAYGROUND_FOLDER)
                    zf.write(file_path, arcname)
                    
        memory_file.seek(0)
        
        return send_file(
            memory_file,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f"session_{safe_id}_archive.zip"
        )
        
    except Exception as e:
        return jsonify({'error': f"Failed to create archive: {str(e)}"}), 500