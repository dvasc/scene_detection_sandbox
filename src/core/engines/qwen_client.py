import os
import logging
import json
import datetime
import gc
import torch
from typing import List, Dict, Optional, Callable, Union
from PIL import Image

from src.config import Config
from src.core.engines.qwen.loader import ModelLoader
from src.core.engines.qwen.generator import InferenceGenerator

# Configure logging
logger = logging.getLogger(__name__)

class QwenClient:
    """
    Singleton Orchestrator for the local Qwen-VL model.
    Refactored to support the 'Rehydration Pattern' where model_interaction.json
    is the Single Source of Truth (SSOT).
    """
    _instance = None
    
    # State Containers
    _model = None
    _processor = None
    _loader = None
    _generator = None
    
    # Metadata
    _current_base_id = None
    _current_adapter_name = None
    _is_peft_wrapped = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(QwenClient, cls).__new__(cls)
            cls._instance._loader = ModelLoader()
        return cls._instance

    def _validate_adapter_integrity(self, adapter_path: str, base_model_id: str, bypass_validation: bool = False) -> bool:
        """Pre-flight integrity and compatibility check."""
        if not os.path.exists(adapter_path):
            raise ValueError(f"Adapter directory not found at: {adapter_path}")

        config_path = os.path.join(adapter_path, 'adapter_config.json')
        
        if not os.path.exists(config_path):
            raise ValueError(f"Missing 'adapter_config.json' in {adapter_path}.")
        
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                adapter_config = json.load(f)
        except Exception as e:
            raise ValueError(f"Failed to parse 'adapter_config.json': {str(e)}")

        target_base = adapter_config.get('base_model_name_or_path')
        if not target_base:
            raise ValueError("Invalid adapter config: Missing 'base_model_name_or_path'.")

        target_basename = os.path.basename(os.path.normpath(target_base))
        current_basename = os.path.basename(os.path.normpath(base_model_id))
        is_match = (target_base == base_model_id) or (target_basename == current_basename)

        if not is_match:
            msg = (f"INCOMPATIBILITY DETECTED: Tuned on '{target_base}', loading on '{base_model_id}'.")
            if bypass_validation:
                logger.warning(f"[FORCE MODE] Bypassing compatibility check. {msg}")
                return True 
            else:
                raise ValueError(f"{msg} Operation aborted.")

        return True

    def load_model(self, 
                   target_model_id: str = None, 
                   adapter_path: str = None, 
                   status_callback: Optional[Callable[[str], None]] = None, 
                   logger_instance=None, 
                   bypass_validation: bool = False,
                   high_fidelity_mode: bool = False):
        """Orchestrates the loading of the VLM context."""
        model_id = target_model_id if target_model_id else Config.LOCAL_MODEL_ID
        
        if adapter_path:
            self._validate_adapter_integrity(adapter_path, model_id, bypass_validation)

        needs_base_reload = (self._model is None) or (self._current_base_id != model_id)

        if needs_base_reload:
            if self._model is not None:
                if status_callback: status_callback(f"Offloading previous base model '{self._current_base_id}'...")
                del self._model
                del self._processor
                self._model = None
                self._processor = None
                self._is_peft_wrapped = False
                self._loader._clear_vram()

            self._model, self._processor = self._loader.load_base_model(
                model_id, 
                high_fidelity_mode=high_fidelity_mode,
                logger_func=status_callback
            )
            
            self._generator = InferenceGenerator(self._model, self._processor)
            self._current_base_id = model_id
            self._current_adapter_name = None
            self._is_peft_wrapped = False

            if logger_instance:
                mode_desc = "Native BF16" if high_fidelity_mode else "4-Bit NF4"
                logger_instance.log_vlm_load_mode(mode_desc, f"{model_id} on {self._model.device}")

        new_adapter_name = os.path.basename(os.path.normpath(adapter_path)) if adapter_path else None

        if self._current_adapter_name != new_adapter_name:
            if adapter_path:
                self._model = self._loader.mount_adapter(
                    self._model, 
                    adapter_path, 
                    new_adapter_name, 
                    is_already_peft=self._is_peft_wrapped,
                    logger_func=status_callback
                )
                self._current_adapter_name = new_adapter_name
                self._is_peft_wrapped = True
                if status_callback: status_callback("✓ Adapter loaded and active.")

            elif self._is_peft_wrapped:
                self._model = self._loader.unload_adapter(self._model, status_callback)
                self._is_peft_wrapped = False
                self._current_adapter_name = None
                if status_callback: status_callback("✓ Base Model restored.")
        
        if self._generator:
            self._generator.model = self._model

        if status_callback: status_callback("✅ VLM Context Ready.")

    def generate_response(self, 
                          images: Union[Image.Image, List[Image.Image]], 
                          prompt_text: str = None, 
                          session_folder: str = None,
                          granular_logger=None,
                          inference_params: Optional[Dict] = None,
                          batch_context: Optional[Dict] = None,
                          interaction_id: str = None) -> Dict:
        """
        Public facade for the inference task. 
        Delegates execution to the internal InferenceGenerator.
        Handles structured logging to model_interaction.json (SSOT).
        """
        if self._generator is None or self._model is None:
            raise RuntimeError("VLM Pipeline Error: Model not loaded. Initialize `load_model` first.")

        if isinstance(images, Image.Image):
            images = [images]
        elif not isinstance(images, list):
            images = list(images)

        if inference_params is None:
            inference_params = {}

        final_prompt = prompt_text if prompt_text else Config.INFERENCE_PROMPT
        final_system = inference_params.get('system_prompt', Config.INFERENCE_SYSTEM_PROMPT)

        try:
            result = self._generator.generate(
                images=images,
                prompt_text=final_prompt,
                system_prompt=final_system,
                inference_params=inference_params,
                granular_logger=granular_logger
            )

            if session_folder:
                # Log usage only, no metadata duplication
                usage_data = {
                    "input_tokens": result['usage']['input_tokens'], 
                    "output_tokens": result['usage']['output_tokens'], 
                    "inference_time": result['usage']['inference_time'], 
                    "image_count": len(images)
                }
                
                self._log_interaction(
                    session_folder=session_folder, 
                    interaction_id=interaction_id,
                    prompt_text=final_prompt, 
                    response_text=result['text'], 
                    thinking=result['thinking'], 
                    usage=usage_data,
                    batch_context=batch_context
                )

            return result

        except Exception as e:
            if granular_logger: granular_logger.log_error("VLM_GENERATE_TASK", e)
            raise e

    def _log_interaction(self, session_folder: str, interaction_id: str, prompt_text: str, response_text: str, thinking: str = None, usage: dict = None, error: Exception = None, batch_context: dict = None):
        """
        Appends a new interaction entry to the 'interactions' list in model_interaction.json.
        Schema V3: No redundant metadata, explicit ID.
        """
        if not session_folder or not os.path.exists(session_folder):
            return

        log_path = os.path.join(session_folder, 'model_interaction.json')
        
        log_entry = {
            "interaction_id": interaction_id or f"int_{int(time.time()*1000)}",
            "batch_context": batch_context or {}, 
            "prompt_text": prompt_text,
            "response_text": response_text if response_text else "[Empty Output]",
            "thinking": thinking,
            "usage": usage,
            "error": str(error) if error else None
        }

        try:
            data = {}
            if os.path.exists(log_path):
                with open(log_path, 'r', encoding='utf-8') as f:
                    try:
                        data = json.load(f)
                    except json.JSONDecodeError:
                        data = {}
            
            if "interactions" not in data:
                data["interactions"] = []
                
            data["interactions"].append(log_entry)

            with open(log_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
                
        except Exception as e:
            logger.error(f"Failed to write to model_interaction.json: {e}")