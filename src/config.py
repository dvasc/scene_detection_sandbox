import os
import yaml
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

class Config:
    """
    Centralized configuration for the standalone Scene Detection Playground.
    This version has been surgically decoupled from the main SceneMark-AI suite,
    removing all logic related to cinematic principle documentation, project 
    persistence, and dataset manufacturing.
    """
    
    # Base Directories
    BASE_DIR = Path(__file__).resolve().parent.parent
    CONFIG_DIR = os.path.join(BASE_DIR, 'config')
    PROMPTS_DIR = os.path.join(CONFIG_DIR, 'prompts')
    SETTINGS_DIR = os.path.join(CONFIG_DIR, 'settings')
    
    # Data & Persistence
    # The Playground maintains its own sandboxed data folder.
    PLAYGROUND_FOLDER = os.path.join(BASE_DIR, 'data', 'playground')
    
    # Credentials
    SECRET_KEY = os.environ.get('SECRET_KEY', 'playground-dev-key')
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')

    # Performance Tuning
    # Target: High concurrency for Cloud VLM calls during sliding-window analysis.
    MAX_WORKERS_IO = 60

    @staticmethod
    def load_config_yaml(filename, subfolder='settings'):
        """Utility to load configuration files from the settings or prompts directories."""
        directory = Config.SETTINGS_DIR if subfolder == 'settings' else Config.PROMPTS_DIR
        path = os.path.join(directory, filename)
        if not os.path.exists(path):
            return {}
        with open(path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)

# --- LOADER UTILITIES ---

def load_inference_prompt_config():
    """Loads the specialized VLM inference configuration for the Playground."""
    config_path = os.path.join(Config.PROMPTS_DIR, 'inference_prompt.yaml')
    if not os.path.exists(config_path): 
        # Fallback empty structure
        return {'inference': {}, 'prompt': {'main': '', 'system': ''}}
    with open(config_path, 'r', encoding='utf-8') as f: 
        return yaml.safe_load(f)

# --- DATA INITIALIZATION ---

# Load Core YAML Settings
app_params = Config.load_config_yaml('app_params.yaml')
local_model_params = Config.load_config_yaml('local_model.yaml')
PRICING_DATA = Config.load_config_yaml('model_pricing.yaml')

# Derive available models for UI selection from the pricing manifest
AVAILABLE_MODELS = [k for k in PRICING_DATA.keys() if k != 'default'][::-1]

# Load Forensic Inference Logic
INFERENCE_CONFIG_DATA = load_inference_prompt_config()

# --- ATTRIBUTE INJECTION ---
# We inject loaded values directly into the Config class for global static access.

# Video Processing Constants
Config.FRAMES_PER_SHOT = app_params.get('video_processing', {}).get('frames_per_shot', 1)
Config.SCENE_DETECTION_THRESHOLD = app_params.get('video_processing', {}).get('scene_detection_threshold', 27.0)
Config.IMAGE_WIDTH = app_params.get('video_processing', {}).get('image_width', 448)
Config.IMAGE_QUALITY = app_params.get('video_processing', {}).get('image_quality', 80)

# Window Logic Defaults
Config.SHOTS_PER_CHUNK = app_params.get('chunking', {}).get('shots_per_chunk', 50)
Config.CHUNK_STRIDE = app_params.get('chunking', {}).get('default_stride', 40)

# AI Runtime Parameters
Config.GEMINI_TEMP = app_params.get('ai_params', {}).get('temperature', 0.1)
Config.GEMINI_MAX_TOKENS = app_params.get('ai_params', {}).get('max_output_tokens', 8192)
Config.INCLUDE_THOUGHTS = app_params.get('ai_params', {}).get('include_thoughts', True)
Config.LOCAL_MODEL_ID = local_model_params.get('model', {}).get('id', "huihui-ai/Huihui-Qwen3-VL-2B-Thinking-abliterated")

# Centralized Inference Prompts
Config.INFERENCE_CONFIG = INFERENCE_CONFIG_DATA
Config.INFERENCE_PROMPT = INFERENCE_CONFIG_DATA.get('prompt', {}).get('main', '')
Config.INFERENCE_SYSTEM_PROMPT = INFERENCE_CONFIG_DATA.get('prompt', {}).get('system', '')

# Inference Sampling Settings
inference_meta = INFERENCE_CONFIG_DATA.get('inference', {})
Config.INFERENCE_TEMPERATURE = inference_meta.get('temperature', 0.1)
Config.INFERENCE_TOP_P = inference_meta.get('top_p', 0.9)
Config.INFERENCE_MAX_TOKENS = inference_meta.get('max_tokens', 8192)
Config.INFERENCE_REPETITION_PENALTY = inference_meta.get('repetition_penalty', 1.2)