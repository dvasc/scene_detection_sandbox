import os
import cv2
import time
import numpy as np
from scenedetect import VideoManager, SceneManager
from scenedetect.detectors import ContentDetector
from src.config import Config

class CVEngine:
    """
    Handles low-level computer vision tasks for the evaluation pipeline.
    Responsible for technical shot boundary detection and representative 
    frame (visual anchor) extraction.
    """

    @staticmethod
    def analyze_shot_boundaries(video_path, logger=None):
        """
        Uses PySceneDetect to identify all technical cuts/shots in the video source.
        Returns a list of shot metadata dictionaries.
        """
        start_detect = time.time()
        video_manager = VideoManager([video_path])
        scene_manager = SceneManager()
        threshold = Config.SCENE_DETECTION_THRESHOLD
        
        # Use content-based detection to find hard cuts and significant transitions
        scene_manager.add_detector(ContentDetector(threshold=threshold))
        video_manager.start()
        
        fps = video_manager.frame_rate
        try:
            duration = video_manager.get_duration()
            total_frames = duration[1].get_frames()
            if total_frames == 0:
                raise ValueError("Scenedetect returned 0 frames")
        except:
            # Fallback to direct OpenCV count if scenedetect duration fetch fails
            cap = cv2.VideoCapture(video_path)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            cap.release()

        if logger:
            logger.log_scene_detect_start(video_path, fps, total_frames)
            logger.log_scene_detect_threshold(threshold)

        # Execute the frame-by-frame analysis pass
        scene_manager.detect_scenes(frame_source=video_manager)
        scene_list = scene_manager.get_scene_list()
        shots = []

        for i, scene in enumerate(scene_list):
            start_time, end_time = scene
            shots.append({
                "shot_id": f"shot_{i:05d}",
                "start_time": start_time.get_seconds(),
                "end_time": end_time.get_seconds(),
                "start_frame": start_time.get_frames(),
                "end_frame": end_time.get_frames(),
                "is_scene_break": False 
            })

            if logger and i % 10 == 0:
                logger.log_scene_detect_boundary(
                    start_time.get_frames(), 
                    score=threshold, 
                    fps=fps, 
                    is_cut=True
                )
            
        video_manager.release()
        
        if logger:
            elapsed = (time.time() - start_detect) * 1000
            logger.log_scene_detect_complete(len(shots), elapsed)

        return shots, duration[0].get_seconds() if duration else total_frames / fps


    @staticmethod
    def generate_visual_anchors(video_path, shots, session_folder, logger=None):
        """
        Extracts representative frames for every detected shot with a robust 3-tier fallback strategy.
        Guarantees 100% frame generation or raises an error to prevent data corruption.
        
        Strategies:
        1. Exact Midpoint (Ideal representation)
        2. Jitter Search (Radius +/- 5 frames from midpoint)
        3. Absolute Start Frame (High probability keyframe/I-frame)
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise IOError(f"Native OpenCV backend failed to open source: {video_path}")

        # Store frames in a dedicated sub-folder for the session
        frames_dir = os.path.join(session_folder, 'frames')
        os.makedirs(frames_dir, exist_ok=True)

        if logger:
            logger.push_context('visual_anchor_extraction', shot_count=len(shots))

        for idx, shot in enumerate(shots):
            shot_id = shot["shot_id"]
            start_f = shot["start_frame"]
            end_f = shot["end_frame"]
            
            # --- STRATEGY DEFINITION ---
            mid_idx = (start_f + end_f) // 2
            
            # Tier 1: Primary Target (Midpoint)
            candidates = [(mid_idx, "Strategy 1: Midpoint")]
            
            # Tier 2: Jitter Search (Search outwards from midpoint)
            # Useful if the midpoint lands on a corrupt frame
            for offset in range(1, 6):
                lower = mid_idx - offset
                upper = mid_idx + offset
                if lower >= start_f:
                    candidates.append((lower, f"Strategy 2: Jitter ({lower})"))
                if upper < end_f:
                    candidates.append((upper, f"Strategy 2: Jitter ({upper})"))
            
            # Tier 3: Absolute Fallback (Start Frame)
            # Usually aligns with an I-frame/Keyframe, highest read success probability
            if start_f != mid_idx:
                candidates.append((start_f, "Strategy 3: Start Frame"))

            # --- EXECUTION ---
            extracted_frame = None
            success_meta = None
            
            for frame_idx, strategy_name in candidates:
                # Seek and Read
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                ret, frame = cap.read()
                
                # Verify Validity
                if ret and frame is not None and frame.size > 0:
                    extracted_frame = frame
                    success_meta = (frame_idx, strategy_name)
                    break # Success: Exit candidate loop
            
            # --- VALIDATION ---
            if extracted_frame is None:
                # Total Failure: File is likely corrupt at this segment.
                # We must fail hard to prevent silent data loss downstream.
                err_msg = f"CRITICAL: Failed to extract ANY frame for shot {shot_id} (Range: {start_f}-{end_f})"
                if logger: logger.log_error("CV_ENGINE", Exception(err_msg))
                cap.release()
                raise RuntimeError(err_msg)

            # --- LOGGING ---
            used_idx, strategy = success_meta
            if used_idx != mid_idx and logger:
                # Notify forensic log that a fallback was required
                logger.log('SHOT_DETECT', f"[WARNING] Fallback triggered for {shot_id}. Midpoint {mid_idx} failed. Used {used_idx} ({strategy}).")

            # --- PROCESSING ---
            # 1. Geometry Normalization
            height, width = extracted_frame.shape[:2]
            scale = Config.IMAGE_WIDTH / float(width)
            target_h = int(height * scale)
            extracted_frame = cv2.resize(extracted_frame, (Config.IMAGE_WIDTH, target_h), interpolation=cv2.INTER_AREA)

            # 2. Visual Grounding: Burn Shot ID into the pixels
            # This ensures the VLM can explicitly reference the ID seen in the image.
            text = f"SHOT ID: {shot_id}"
            font = cv2.FONT_HERSHEY_SIMPLEX
            (text_w, text_h), baseline = cv2.getTextSize(text, font, 0.5, 1)
            x, y = 8, 25 
            
            # Draw white backing box for readability
            cv2.rectangle(extracted_frame, (x - 4, y - text_h - 6), (x + text_w + 4, y + 4), (255, 255, 255), cv2.FILLED)
            # Draw black text
            cv2.putText(extracted_frame, text, (x, y), font, 0.5, (0, 0, 0), 1, cv2.LINE_AA)

            # 3. Persistence
            img_filename = f"{shot_id}_{used_idx}.jpg"
            img_path = os.path.join(frames_dir, img_filename)
            cv2.imwrite(img_path, extracted_frame, [cv2.IMWRITE_JPEG_QUALITY, Config.IMAGE_QUALITY])
            
            # Relative path used for frontend loading
            shot["image_paths"] = [os.path.join('frames', img_filename)]

            if logger and (idx + 1) % 20 == 0:
                logger.log('SHOT_DETECT', f"Extracted visual anchors for {idx + 1}/{len(shots)} shots")

        cap.release()

        # Final Verification
        valid_count = sum(1 for s in shots if s.get('image_paths') and len(s['image_paths']) > 0)
        
        if logger:
            if valid_count == len(shots):
                # Only log the "N/N" message if we actually verified it.
                logger.log('SHOT_DETECT', f"Extracted visual anchors for {valid_count}/{len(shots)} shots")
            else:
                # This should theoretically be unreachable due to the RuntimeError above,
                # but good for defensive programming.
                logger.log('ERROR', f"Visual anchor mismatch! Only {valid_count}/{len(shots)} shots have valid frames.")

        if logger: logger.pop_context('COMPLETE')
        return shots