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
        Extracts midpoint frames for every detected shot.
        Resizes images for VLM context windows and burns in high-contrast ID labels.
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
            shot_images = []
            
            # Extract the absolute midpoint frame of the shot
            mid_idx = (shot["start_frame"] + shot["end_frame"]) // 2

            cap.set(cv2.CAP_PROP_POS_FRAMES, mid_idx)
            ret, frame = cap.read()
            
            if ret:
                # 1. Geometry Normalization
                height, width = frame.shape[:2]
                scale = Config.IMAGE_WIDTH / float(width)
                target_h = int(height * scale)
                frame = cv2.resize(frame, (Config.IMAGE_WIDTH, target_h), interpolation=cv2.INTER_AREA)

                # 2. Visual Grounding: Burn Shot ID into the pixels
                # This ensures the VLM can explicitly reference the ID seen in the image.
                text = f"SHOT ID: {shot_id}"
                font = cv2.FONT_HERSHEY_SIMPLEX
                (text_w, text_h), baseline = cv2.getTextSize(text, font, 0.5, 1)
                x, y = 8, 25 
                
                # Draw white backing box for readability
                cv2.rectangle(frame, (x - 4, y - text_h - 6), (x + text_w + 4, y + 4), (255, 255, 255), cv2.FILLED)
                # Draw black text
                cv2.putText(frame, text, (x, y), font, 0.5, (0, 0, 0), 1, cv2.LINE_AA)

                # 3. Persistence
                img_filename = f"{shot_id}_{mid_idx}.jpg"
                img_path = os.path.join(frames_dir, img_filename)
                cv2.imwrite(img_path, frame, [cv2.IMWRITE_JPEG_QUALITY, Config.IMAGE_QUALITY])
                
                # Relative path used for frontend loading
                shot_images.append(os.path.join('frames', img_filename))

            shot["image_paths"] = shot_images

            if logger and (idx + 1) % 20 == 0:
                logger.log('SCENE_DETECT', f"Extracted visual anchors for {idx + 1}/{len(shots)} shots")

        cap.release()
        if logger: logger.pop_context('COMPLETE')
        return shots