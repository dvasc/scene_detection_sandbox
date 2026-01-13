import os
import traceback
import logging
import time
import threading
from huggingface_hub import snapshot_download
from src.config import Config
from src.workers.utils import update_status, is_task_cancelled

logger = logging.getLogger(__name__)

def get_directory_size(path):
    """Calculates total size of a directory in bytes."""
    total_size = 0
    try:
        for dirpath, dirnames, filenames in os.walk(path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                # Skip if it is symbolic link
                if not os.path.islink(fp):
                    total_size += os.path.getsize(fp)
    except Exception:
        pass # Fail silently during calculation
    return total_size

def format_size(bytes_val):
    """Formats bytes to human readable string."""
    if bytes_val < 1024:
        return f"{bytes_val} B"
    elif bytes_val < 1024**2:
        return f"{bytes_val/1024:.1f} KB"
    elif bytes_val < 1024**3:
        return f"{bytes_val/(1024**2):.1f} MB"
    else:
        return f"{bytes_val/(1024**3):.2f} GB"

def monitor_download(task_id, folder_path, stop_event):
    """Background thread to poll directory size and update status."""
    while not stop_event.is_set():
        if os.path.exists(folder_path):
            size = get_directory_size(folder_path)
            # Only update if we have data, keeps the UI feeling 'alive'
            if size > 0:
                update_status(task_id, 'PROGRESS', 1, 3, f"Downloading... ({format_size(size)})")
        time.sleep(1.5)

def run_model_download_task(task_id: str, model_id: str):
    """
    Background task to download a Hugging Face model to the local cache.
    Fixed for Windows non-admin privileges by disabling symlinks.
    Includes active storage monitoring for UI feedback.
    """
    stop_monitor = threading.Event()
    monitor_thread = None

    try:
        update_status(task_id, 'PROGRESS', 0, 3, f"Initializing request for {model_id}...")
        
        # 1. Validation & Setup
        if not model_id:
            raise ValueError("Invalid Model ID provided.")
            
        models_root = os.path.join(Config.BASE_DIR, 'models')
        os.makedirs(models_root, exist_ok=True)
        
        # Construct target directory name manually to match HF cache structure 
        # but without using the cache system's symlink requirement.
        # Structure: models/models--org--repo
        safe_name = model_id.replace('/', '--')
        folder_name = f"models--{safe_name}"
        target_dir = os.path.join(models_root, folder_name)
        
        if is_task_cancelled(task_id):
            update_status(task_id, 'FAILURE', status="Download aborted by user.")
            return

        # 2. Execution
        update_status(task_id, 'PROGRESS', 1, 3, "Contacting Hugging Face Hub...")
        
        # Start the monitoring thread
        monitor_thread = threading.Thread(
            target=monitor_download, 
            args=(task_id, target_dir, stop_monitor),
            daemon=True
        )
        monitor_thread.start()

        # Download using local_dir + no_symlinks to avoid WinError 1314
        local_path = snapshot_download(
            repo_id=model_id,
            local_dir=target_dir,
            local_dir_use_symlinks=False, # FORCE COPY MODE
            resume_download=True
        )
        
        # Stop monitoring
        stop_monitor.set()
        if monitor_thread:
            monitor_thread.join(timeout=2.0)

        if is_task_cancelled(task_id):
            update_status(task_id, 'FAILURE', status="Download aborted by user.")
            return

        update_status(task_id, 'PROGRESS', 2, 3, "Finalizing file integrity...")
        
        # 3. Completion
        final_size = get_directory_size(target_dir)
        update_status(
            task_id, 
            'SUCCESS', 
            3, 
            3, 
            f"Download complete ({format_size(final_size)}).", 
            result={'model_id': model_id, 'local_path': local_path}
        )

    except Exception as e:
        stop_monitor.set()
        if monitor_thread:
            monitor_thread.join(timeout=1.0)
            
        logger.error(f"Download Task Failed: {traceback.format_exc()}")
        
        err_msg = str(e)
        if "401" in err_msg or "403" in err_msg:
            err_msg = "Authentication failed. Model may be gated/private or ID is incorrect."
        elif "404" in err_msg:
            err_msg = f"Model ID '{model_id}' not found on Hugging Face."
            
        update_status(
            task_id, 
            'FAILURE', 
            status=f"Error: {err_msg}"
        )