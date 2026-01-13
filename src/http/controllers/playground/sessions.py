import os
import json
import re
import shutil
from flask import jsonify
from src.config import Config
from . import playground_bp

@playground_bp.route('/api/playground/sessions', methods=['GET'])
def list_sessions():
    """Returns the registry of archived inference runs by parsing SSOT files."""
    if not os.path.exists(Config.PLAYGROUND_FOLDER): 
        return jsonify([])

    sessions = []
    try:
        with os.scandir(Config.PLAYGROUND_FOLDER) as entries:
            for entry in entries:
                if entry.is_dir():
                    ssot_path = os.path.join(entry.path, 'model_interaction.json')
                    
                    if os.path.exists(ssot_path):
                        try:
                            with open(ssot_path, 'r', encoding='utf-8') as f:
                                data = json.load(f)
                                if "session_metadata" in data:
                                    meta = data['session_metadata']
                                    cv = data.get('shot_list', data.get('cv_manifest', []))
                                    perf = meta.get('performance', {})
                                    
                                    sessions.append({
                                        'session_id': entry.name,
                                        'timestamp': meta.get('created_at', ''),
                                        'video_filename': meta.get('video_filename', 'Unknown'),
                                        'model_id': meta.get('model_id', 'Unknown'),
                                        'adapter': meta.get('adapter'),
                                        'window_size': meta.get('window_size', 32),
                                        'shot_count': len(cv),
                                        'scene_count': meta.get('scene_count', 0),
                                        'video_duration': meta.get('video_duration', None),
                                        'duration': perf.get('total_task', 0),
                                        'inference_params': meta.get('inference_params', {})
                                    })
                        except Exception as e:
                            print(f"Skipping corrupt SSOT session {entry.name}: {e}")
                            continue
                            
                    # Fallback for Legacy Sessions (state.json)
                    legacy_path = os.path.join(entry.path, 'state.json')
                    if not os.path.exists(ssot_path) and os.path.exists(legacy_path):
                         try:
                            with open(legacy_path, 'r', encoding='utf-8') as f:
                                data = json.load(f)
                                meta = data.get('metadata', {})
                                shots = data.get('shots', [])
                                perf = meta.get('performance', {})
                                sessions.append({
                                    'session_id': entry.name,
                                    'timestamp': meta.get('timestamp', ''),
                                    'video_filename': meta.get('video_filename', 'Unknown') + " (LEGACY)",
                                    'model_id': meta.get('model_id', 'Unknown'),
                                    'adapter': meta.get('adapter'),
                                    'window_size': meta.get('window_size', 32),
                                    'shot_count': len(shots),
                                    'scene_count': len([s for s in shots if s.get('is_scene_break')]) + 1,
                                    'video_duration': meta.get('video_duration', None),
                                    'duration': perf.get('total_task', 0),
                                    'inference_params': meta.get('inference_params', {})
                                })
                         except:
                             continue

        sessions.sort(key=lambda x: x['timestamp'], reverse=True)
        return jsonify(sessions)
    except Exception as e: 
        return jsonify({'error': str(e)}), 500

@playground_bp.route('/api/playground/session/<session_id>', methods=['GET'])
def get_session_data(session_id):
    """
    Hydrates the full session state from the SSOT interaction log.
    Strictly re-derives narrative breaks by parsing interaction text.
    """
    session_dir = os.path.join(Config.PLAYGROUND_FOLDER, session_id)
    ssot_path = os.path.join(session_dir, 'model_interaction.json')
    
    if not os.path.exists(ssot_path): 
        legacy_path = os.path.join(session_dir, 'state.json')
        if os.path.exists(legacy_path):
            with open(legacy_path, 'r', encoding='utf-8') as f: 
                return jsonify(json.load(f))
        return jsonify({'error': 'Session data not found'}), 404

    try:
        with open(ssot_path, 'r', encoding='utf-8') as f: 
            data = json.load(f)

        manifest = data.get('shot_list', data.get('cv_manifest', []))
        interactions = data.get('interactions', [])
        metadata = data.get('session_metadata', {})

        # 1. Create a quick lookup map for shots
        shot_map = {shot['shot_id']: shot for shot in manifest}
        
        # 2. Reset flags (The manifest is strictly CV data now)
        for shot in manifest:
            shot['is_scene_break'] = False
            shot['scene_logic'] = {"case_type": "NARRATIVE_UNITY"}
            shot['logic_analysis'] = {"reasoning": ""}

        # 3. Dynamic Rehydration
        scene_count = 1
        
        for ix in interactions:
            resp_text = ix.get('response_text', '')
            thinking = ix.get('thinking', '')
            
            # Robust JSON extraction
            match = re.search(r'\{.*\}', resp_text, re.DOTALL)
            if match:
                try:
                    ai_result = json.loads(match.group())
                    break_at = str(ai_result.get('break_at', 'NONE')).strip()
                    
                    if break_at.upper() != 'NONE' and break_at in shot_map:
                        target_shot = shot_map[break_at]
                        target_shot['is_scene_break'] = True
                        target_shot['scene_logic'] = {"case_type": ai_result.get('case_type', 'RUPTURE')}
                        target_shot['logic_analysis'] = {"reasoning": thinking}
                        scene_count += 1
                except:
                    pass 

        response_payload = {
            "metadata": metadata,
            "shots": manifest
        }
        
        response_payload['metadata']['scene_count'] = scene_count
        
        return jsonify(response_payload)

    except Exception as e: 
        return jsonify({'error': str(e)}), 500

@playground_bp.route('/api/playground/session/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    session_dir = os.path.join(Config.PLAYGROUND_FOLDER, session_id)
    if not os.path.exists(session_dir): 
        return jsonify({'error': 'Session not found'}), 404
    try:
        shutil.rmtree(session_dir)
        return jsonify({'status': 'deleted'}), 200
    except Exception as e: 
        return jsonify({'error': str(e)}), 500