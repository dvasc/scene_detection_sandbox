import os
import base64

def encode_image_to_base64(filepath):
    """
    Reads an image file from disk and returns a Base64 Data URI string.
    Supported by most multimodal LLM APIs and useful for frontend rendering 
    without static file serving.
    
    Format: "data:image/jpeg;base64,..."
    """
    if not os.path.exists(filepath):
        return None
        
    try:
        with open(filepath, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            # Determine mime type based on extension, default to jpeg
            ext = os.path.splitext(filepath)[1].lower()
            mime_type = "image/png" if ext == ".png" else "image/jpeg"
            return f"data:{mime_type};base64,{encoded_string}"
    except Exception as e:
        print(f"[File Utils] Failed to encode image {filepath}: {e}")
        return None

def ensure_dir(directory_path):
    """Simple utility to ensure a directory exists."""
    if not os.path.exists(directory_path):
        os.makedirs(directory_path, exist_ok=True)