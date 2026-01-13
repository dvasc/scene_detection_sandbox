import os
import json
import time
import traceback
import logging
import io
import re
from PIL import Image
from typing import List, Dict, Optional
from datetime import datetime
from src.config import Config, AVAILABLE_MODELS
from src.core.engines.cv_engine import CVEngine
from src.core.engines.qwen_client import QwenClient
from src.core.engines.gemini_client import GeminiClient
from src.core.services.logging.granular_logger import GranularLogger
from src.workers.utils import update_status, is_task_cancelled
from google.genai import types

logger_builtin = logging.getLogger(__name__)

MAX_RETRIES = 3

def run_playground_inference_task(
    task_id: str, 
    session_id: str, 
    video_filename: str, 
    window_size: int = 32, 
    model_id: str = None, 
    adapter_path: str = None,
    inference_params: Optional[Dict] = None
):
    """
    Hybrid Playground Pipeline with dynamic precision and forensic logging.
    Strict implementation of SSOT Pattern (V3 Schema).
    Enforces Fixed Visual Batch Size via Black Frame Padding.
    Supports Runtime Prompt Overrides and Operational Params Sanitization.
    """
    session_folder = os.path.join(Config.PLAYGROUND_FOLDER, session_id)
    video_path = os.path.join(session_folder, video_filename)
    log_path = os.path.join(session_folder, 'model_interaction.json')
    
    os.makedirs(session_folder, exist_ok=True)
    f_logger = GranularLogger(session_folder)
    
    if inference_params is None:
        inference_params = {}
    
    # Extract params for logic
    runtime_system = inference_params.get('system_prompt', Config.INFERENCE_SYSTEM_PROMPT)
    runtime_main_template = inference_params.get('main_prompt', Config.INFERENCE_PROMPT)
    bypass_validation = inference_params.get('bypass_validation', False)
    high_fidelity_mode = inference_params.get('high_fidelity_mode', False)

    # Sanitize params for metadata (remove operational flags)
    meta_params = inference_params.copy()
    meta_params.pop('stream_interval', None)

    try:
        timings = {}
        start_task = time.time()
        
        f_logger.push_context('inference_run', model=model_id, window=window_size, video=video_filename, adapter=adapter_path)
        f_logger.log('CLIENT', f"Runtime Params: Temp={inference_params.get('temperature')}, BypassValidation={bypass_validation}, HiFi={high_fidelity_mode}")
        update_status(task_id, 'PROGRESS', 0, 4, "Initializing Workspace", logs=f_logger.console_log)

        if is_task_cancelled(task_id):
            f_logger.log('PIPELINE', "⚠️ Process aborted by user command.")
            update_status(task_id, 'FAILURE', status="Aborted by User", logs=f_logger.console_log)
            return

        # 1. ENGINE SELECTION
        is_cloud_model = model_id and ("gemini" in model_id.lower() or model_id in AVAILABLE_MODELS)
        ai_service = None
        gemini_client = None
        
        if is_cloud_model:
            f_logger.log('CLIENT', f"Authenticating Cloud API session: {model_id}")
            gemini_client = GeminiClient()
        else:
            f_logger.log('CLIENT', "Warming local VLM context...")
            ai_service = QwenClient()
            ai_service.load_model(
                target_model_id=model_id, 
                adapter_path=adapter_path, 
                status_callback=lambda m: f_logger.log('VLM', m), 
                logger_instance=f_logger,
                bypass_validation=bypass_validation,
                high_fidelity_mode=high_fidelity_mode 
            )

        if is_task_cancelled(task_id):
            f_logger.log('PIPELINE', "⚠️ Process aborted by user command.")
            update_status(task_id, 'FAILURE', status="Aborted by User", logs=f_logger.console_log)
            return

        # 2. COMPUTER VISION STAGE
        f_logger.log('PIPELINE', "Commencing Computer Vision Stage")
        update_status(task_id, 'PROGRESS', 1, 4, "CV Analysis", logs=f_logger.console_log)
        
        shots, video_duration = CVEngine.analyze_shot_boundaries(video_path, logger=f_logger)

        if is_task_cancelled(task_id):
            f_logger.log('PIPELINE', "⚠️ Process aborted by user command.")
            update_status(task_id, 'FAILURE', status="Aborted by User", logs=f_logger.console_log)
            return

        shots = CVEngine.generate_visual_anchors(video_path, shots, session_folder, logger=f_logger)
        
        timings['cv_processing'] = round(time.time() - start_task, 2)
        
        # --- SSOT INITIALIZATION ---
        clean_manifest = []
        whitelist = ['shot_id', 'start_time', 'end_time', 'start_frame', 'end_frame', 'image_paths']
        for s in shots:
            clean_s = {k: v for k, v in s.items() if k in whitelist}
            clean_manifest.append(clean_s)

        init_data = {
            "session_metadata": {
                "session_id": session_id,
                "video_filename": video_filename,
                "video_duration": round(video_duration, 2),
                "model_id": model_id or "Unknown",
                "adapter": adapter_path,
                "created_at": datetime.now().isoformat(),
                "window_size": window_size,
                "inference_params": meta_params, # Use sanitized params
                "mode": "STANDALONE_PLAYGROUND_V3_SSOT"
            },
            "shot_list": clean_manifest, 
            "interactions": [] 
        }
        
        with open(log_path, 'w', encoding='utf-8') as f:
            json.dump(init_data, f, indent=4, ensure_ascii=False)
        
        # 3. NARRATIVE ADJUDICATION STAGE
        id_to_idx = {s['shot_id']: i for i, s in enumerate(shots)}
        current_idx = 0
        batch_count = 0
        overlap_frames = int(window_size * 0.25)
        default_stride = max(1, window_size - overlap_frames)

        f_logger.log('PIPELINE', "Transitioning to Narrative Adjudication")
        update_status(task_id, 'PROGRESS', 2, 4, "Narrative Adjudication", logs=f_logger.console_log)

        while current_idx < len(shots):
            if is_task_cancelled(task_id):
                f_logger.log('PIPELINE', "⚠️ Process aborted by user command.")
                update_status(task_id, 'FAILURE', status="Aborted by User", logs=f_logger.console_log)
                return

            batch_count += 1
            chunk_end = min(current_idx + window_size, len(shots))
            chunk = shots[current_idx : chunk_end]
            chunk_ids = [s['shot_id'] for s in chunk]
            
            f_logger.log_vlm_stage_start('ADJUDICATION', batch_count, f"{chunk[0]['shot_id']} → {chunk[-1]['shot_id']}")

            if len(chunk) < 2:
                f_logger.log('VLM', "Closing stream: Single shot tail batch.")
                f_logger.pop_context('SKIP')
                break 

            # Load VALID images
            pil_images = []
            for s in chunk:
                if s.get('image_paths'):
                    img_path = os.path.join(session_folder, s['image_paths'][0])
                    with Image.open(img_path) as img:
                        pil_images.append(img.convert('RGB'))

            # Padding Logic
            num_valid = len(pil_images)
            if num_valid > 0 and num_valid < window_size:
                padding_needed = window_size - num_valid
                f_logger.log('VLM', f"Padding batch with {padding_needed} black frames (Window: {window_size})")
                ref_w, ref_h = pil_images[-1].size
                black_frame = Image.new('RGB', (ref_w, ref_h), (0, 0, 0))
                for _ in range(padding_needed):
                    pil_images.append(black_frame)

            f_logger.log_prompt_construction(batch_count, len(chunk), chunk[0]['shot_id'], chunk[-1]['shot_id'])

            retry_attempt = 0
            valid_batch = False
            detected_break_id = 'NONE'
            
            interaction_id = f"int_{batch_count:03d}"
            batch_ctx = {
                "batch_id": batch_count,
                "range_start": chunk[0]['shot_id'],
                "range_end": chunk[-1]['shot_id']
            }
            
            while retry_attempt < MAX_RETRIES and not valid_batch:
                if is_task_cancelled(task_id):
                    f_logger.log('PIPELINE', "⚠️ Process aborted by user command.")
                    update_status(task_id, 'FAILURE', status="Aborted by User", logs=f_logger.console_log)
                    return

                retry_attempt += 1
                if retry_attempt > 1: 
                    f_logger.log_retry(retry_attempt, MAX_RETRIES, "Format violation or parse failure")

                try:
                    ids_str = ", ".join(chunk_ids)
                    grounded_prompt = runtime_main_template.replace('{{VALID_SHOT_IDS}}', ids_str)

                    if is_cloud_model:
                        contents = [grounded_prompt]
                        for img in pil_images:
                            buf = io.BytesIO()
                            img.save(buf, format='JPEG', quality=85)
                            contents.append(types.Part.from_bytes(data=buf.getvalue(), mime_type="image/jpeg"))
                        
                        start_cloud = time.time()
                        resp, usage_info = gemini_client.generate_with_backoff(
                            model=model_id, 
                            contents=contents,
                            config=types.GenerateContentConfig(
                                temperature=inference_params.get('temperature', Config.INFERENCE_TEMPERATURE), 
                                max_output_tokens=inference_params.get('max_tokens', Config.INFERENCE_MAX_TOKENS),
                                top_p=inference_params.get('top_p', Config.INFERENCE_TOP_P),
                                system_instruction=runtime_system,
                                response_mime_type="application/json"
                            ),
                            session_folder=session_folder,
                            image_count=len(pil_images),
                            label=f"Batch {batch_count}",
                            prompt_text=grounded_prompt,
                            inference_params=inference_params,
                            batch_context=batch_ctx,
                            interaction_id=interaction_id 
                        )
                        
                        gen_time = time.time() - start_cloud
                        usage_info['inference_time'] = round(gen_time, 2)
                        
                        response_data = {
                            'text': resp.text, 
                            'thinking': None,
                            'usage': usage_info
                        }
                    else:
                        response_data = ai_service.generate_response(
                            pil_images, 
                            prompt_text=grounded_prompt, 
                            session_folder=session_folder, 
                            granular_logger=f_logger,
                            inference_params=inference_params,
                            batch_context=batch_ctx,
                            interaction_id=interaction_id 
                        )

                    raw_json = response_data.get('text', '{}')
                    cleaned = raw_json.replace('```json', '').replace('```', '').strip()
                    cleaned = re.sub(r'<think>.*?</think>', '', cleaned, flags=re.DOTALL | re.IGNORECASE).strip()
                    
                    match = re.search(r'\{.*\}', cleaned, re.DOTALL)
                    if not match: 
                        raise ValueError("VLM response contained no valid JSON object.")
                    
                    ai_result = json.loads(match.group())
                    raw_break_id = ai_result.get('break_at', 'NONE')
                    
                    f_logger.log_vlm_break_result(raw_break_id)

                    normalized_id = str(raw_break_id).strip().upper()
                    if normalized_id == 'NONE':
                        detected_break_id = 'NONE'
                        valid_batch = True
                    elif raw_break_id in chunk_ids:
                        if raw_break_id == chunk_ids[0]:
                            f_logger.log('ERROR', f"Invalid Shot ID '{raw_break_id}'. Reason: The anchor shot cannot be a break point.")
                        else:
                            detected_break_id = raw_break_id
                            valid_batch = True
                    else:
                        f_logger.log('ERROR', f"Invalid Shot ID '{raw_break_id}'. Reason: Shot ID not in context.")

                except Exception as e:
                    f_logger.log_error("WINDOW_INFERENCE", e)
                    continue

            if detected_break_id != 'NONE' and detected_break_id in id_to_idx:
                global_break_idx = id_to_idx[detected_break_id]
                current_idx = global_break_idx
            else:
                current_idx += default_stride

            f_logger.pop_context('SUCCESS', elapsed_ms=round((time.time() - start_task) * 1000))
            update_status(task_id, 'PROGRESS', 3, 4, f"Batch {batch_count} processed.", logs=f_logger.console_log)

        total_runtime = round(time.time() - start_task, 2)
        
        try:
            with open(log_path, 'r', encoding='utf-8') as f:
                final_data = json.load(f)
            
            final_data['session_metadata']['performance'] = {"total_task": total_runtime}
            final_data['session_metadata']['status'] = "COMPLETED"
            
            with open(log_path, 'w', encoding='utf-8') as f:
                json.dump(final_data, f, indent=4, ensure_ascii=False)
        except Exception as e:
            f_logger.log_error("METADATA_UPDATE", e)

        f_logger.log('PIPELINE', "Narrative Evaluation Finalized.")
        f_logger.pop_context('COMPLETE', total_time=total_runtime)
        
        update_status(task_id, 'SUCCESS', 4, 4, "Inference Complete", result={'session_id': session_id}, logs=f_logger.console_log)

    except Exception as e:
        logger_builtin.error(traceback.format_exc())
        if f_logger: 
            f_logger.log_error("PIPELINE_CRITICAL_FAILURE", e)
        update_status(task_id, 'FAILURE', status=f"Pipeline Crash: {str(e)}", logs=f_logger.console_log if f_logger else None)