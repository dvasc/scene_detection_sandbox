# src/core/services/logging/granular_logger.py
"""
Forensic Logging System for Scene Detection Playground.
Implements absolute parity between disk-based persistence and real-time frontend streaming.
Allows researchers to audit the hierarchical execution of the inference pipeline.
"""

import json
import os
import time
from datetime import datetime
from typing import Optional, Dict, Any

class GranularLogger:
    """
    Structured logger that mirrors all operations to a local file and an in-memory 
    array for real-time hierarchical UI rendering in the terminal console.
    """
    
    def __init__(self, session_folder: str, filename: str = 'qwen_inference_pipeline.log'):
        """
        Initialize the forensic trace for a specific processing session.
        """
        self.session_folder = session_folder
        self.log_file = os.path.join(session_folder, filename)
        self.console_log = [] 
        self.start_time = time.time()
        self.context_stack = [] 
        
        os.makedirs(session_folder, exist_ok=True)
        self._write_header()
    
    def _write_header(self):
        """Emits the session initialization metadata."""
        header_data = {
            'session_start': datetime.now().isoformat(),
            'timestamp_unix': self.start_time,
            'session_folder': self.session_folder
        }
        # Human-readable preamble
        readable_start = f"[SESSION START] {self.session_folder} | {header_data['session_start']}"
        self.console_log.append(readable_start)
        
        with open(self.log_file, 'w', encoding='utf-8') as f:
            f.write(readable_start + "\n")
            f.write(f"  [JSON] {json.dumps(header_data)}\n")
    
    def _format_timestamp(self) -> str:
        """Calculates relative [HH:MM:SS] timestamp from session start."""
        elapsed = time.time() - self.start_time
        return datetime.fromtimestamp(self.start_time + elapsed).strftime('[%H:%M:%S]')
    
    def _get_context_prefix(self) -> str:
        """Calculates visual indentation based on context depth."""
        if not self.context_stack:
            return ""
        depth = len(self.context_stack)
        return "  " * (depth - 1)
    
    def log(self, level: str, message: str, data: Optional[Dict[str, Any]] = None, **kwargs):
        """
        The core logging primitive. Writes a line to console and file.
        """
        timestamp = self._format_timestamp()
        prefix = self._get_context_prefix()
        
        console_line = f"{timestamp} [{level}] {prefix}{message}"
        
        self.console_log.append(console_line)
        
        with open(self.log_file, 'a', encoding='utf-8') as f:
            f.write(console_line + "\n")
            if data or kwargs:
                json_entry = {
                    'timestamp': timestamp,
                    'level': level,
                    'message': message,
                    'depth': len(self.context_stack),
                    **(data or {}),
                    **kwargs
                }
                f.write(f"  [JSON] {json.dumps(json_entry)}\n")
    
    def push_context(self, stage_name: str, **metadata):
        """Pushes a new operational context onto the stack (increases indentation)."""
        self.context_stack.append({'name': stage_name, 'metadata': metadata})
        self.log('PIPELINE', f"→ {stage_name.upper()}", metadata)
    
    def pop_context(self, status: str = 'OK', **metadata):
        """Pops the current context (decreases indentation)."""
        if self.context_stack:
            ctx = self.context_stack.pop()
            elapsed_ms = metadata.pop('elapsed_ms', None)
            status_line = f"✓ {ctx['name']} ({status})"
            if elapsed_ms:
                status_line += f" - {elapsed_ms}ms"
            self.log('PIPELINE', status_line, metadata)

    # ========== COMPUTER VISION FACADES ==========
    
    def log_scene_detect_start(self, video_path: str, fps: float, total_frames: int):
        self.push_context('pyscenedetect_init', video=video_path, fps=fps, frames=total_frames)
        self.log('SCENE_DETECT', f"Loading source: {os.path.basename(video_path)} ({total_frames} frames @ {fps}fps)")
    
    def log_scene_detect_threshold(self, threshold: float):
        self.log('SCENE_DETECT', f"Shot detection threshold configured: {threshold}")
    
    def log_scene_detect_boundary(self, frame_num: int, score: float, fps: float, is_cut: bool = True):
        timestamp_sec = frame_num / fps
        self.log('SCENE_DETECT', f"🎬 Boundary detected at frame {frame_num} ({timestamp_sec:.2f}s)")
    
    def log_scene_detect_complete(self, shots_found: int, elapsed_ms: float):
        self.log('SCENE_DETECT', f"✓ Analysis complete. {shots_found} shots identified.")
        self.pop_context('COMPLETE', shots_found=shots_found, elapsed_ms=round(elapsed_ms))
    
    # ========== VLM INFERENCE FACADES ==========
    
    def log_vlm_stage_start(self, stage: str, batch_num: int, shot_range: str):
        self.push_context(f'vlm_batch_{batch_num}', stage=stage, batch_num=batch_num, shot_range=shot_range)
    
    def log_vlm_model_load(self, model_id: str, device: str, elapsed_ms: float):
        self.log('VLM', f"Model ready: {model_id.split('/')[-1]} on {device} ({elapsed_ms/1000:.1f}s)")
        
    def log_vlm_load_mode(self, mode: str, details: str):
        """Logs detailed hardware precision mode for forensic audit."""
        self.log('VLM', f"Hardware Precision Mode: [{mode}] | Context: {details}")
    
    def log_vlm_preprocessing(self, image_count: int, image_size: tuple, tokens: int, elapsed_ms: float):
        self.log('VLM', f"Preprocessing {image_count} images ({image_size[0]}x{image_size[1]}) | {tokens} input tokens")
    
    def log_vlm_token_generation(self, generated: int, max_tokens: int, elapsed_ms: float, tokens_per_sec: float):
        self.log('TOKEN', f"Generated {generated} tokens | Performance: {tokens_per_sec:.1f} tok/s")
    
    def log_vlm_json_parse(self, json_status: str, parsed_keys: list, error: Optional[str] = None):
        if error:
            self.log('ERROR', f"VLM JSON validation failed: {error}")
        else:
            self.log('VLM', f"JSON structure validated ({json_status}): {len(parsed_keys)} keys found")
    
    def log_prompt_construction(self, chunk_num: int, shot_count: int, start_id: str, end_id: str):
        self.log('PROMPT', f"Constructing payload for batch #{chunk_num}: {shot_count} shots | {start_id} to {end_id}")

    def log_vlm_break_result(self, break_at: str):
        """Human-readable narrative decision verdict."""
        decision = str(break_at).strip().lower()
        if decision == "none" or decision == "n/a":
            self.log('VLM', "Decision: [CONTINUITY]")
        else:
            self.log('VLM', f"Decision: [RUPTURE] at {break_at}")

    def log_error(self, component: str, error: Exception):
        self.log('ERROR', f"[{component}] {type(error).__name__}: {str(error)}")

    def log_retry(self, attempt: int, max_attempts: int, reason: str):
        self.log('PIPELINE', f"Recovering (Attempt {attempt}/{max_attempts}): {reason}")