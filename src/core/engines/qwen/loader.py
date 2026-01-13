import os
import torch
import gc
import logging
from transformers import AutoProcessor, AutoModelForImageTextToText, BitsAndBytesConfig
from peft import PeftModel

logger = logging.getLogger(__name__)

class ModelLoader:
    """
    Handles the instantiation of the Qwen VLM and its adapters.
    Implements the Dynamic Precision logic:
    - Path A: 4-Bit NormalFloat (NF4) for VRAM-constrained systems.
    - Path B: Native BFloat16 (High-Fidelity) for capable hardware.
    """

    @staticmethod
    def _clear_vram():
        """Force garbage collection and clear CUDA cache."""
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def load_base_model(self, model_id: str, high_fidelity_mode: bool = False, logger_func=None):
        """
        Loads the foundational model weights.

        Args:
            model_id (str): Hugging Face model identifier.
            high_fidelity_mode (bool): If True, loads in native BF16. Else, uses 4-bit quantization.
            logger_func (callable, optional): Callback for status updates.

        Returns:
            tuple: (model, processor)
        """
        self._clear_vram()
        cache_dir = os.path.join(os.getcwd(), 'models')
        os.makedirs(cache_dir, exist_ok=True)

        if logger_func: 
            mode_str = "HIGH-FIDELITY (BF16)" if high_fidelity_mode else "MEMORY-SAFE (4-BIT NF4)"
            logger_func(f"Initializing Base Model: {model_id} [{mode_str}]")

        try:
            # 1. Configure Quantization / Precision
            quantization_config = None
            torch_dtype = torch.bfloat16 

            if not high_fidelity_mode:
                # PATH A: Low VRAM (Default)
                # Uses BitsAndBytes for 4-bit NormalFloat quantization
                quantization_config = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_quant_type="nf4",
                    bnb_4bit_compute_dtype=torch.bfloat16,
                    bnb_4bit_use_double_quant=True
                )
                if logger_func: logger_func("Applying 4-bit NormalFloat quantization...")
            else:
                # PATH B: High Performance
                # Native loading. No quantization config needed, just dtype=bfloat16.
                if logger_func: logger_func("Applying native BFloat16 precision (No Quantization)...")

            # 2. Load Processor
            processor = AutoProcessor.from_pretrained(
                model_id, 
                trust_remote_code=True, 
                cache_dir=cache_dir
            )

            # 3. Load Model
            # Note: device_map="auto" handles layer placement on GPU
            model = AutoModelForImageTextToText.from_pretrained(
                model_id,
                device_map="auto",
                trust_remote_code=True,
                quantization_config=quantization_config,
                torch_dtype=torch_dtype,
                cache_dir=cache_dir,
                low_cpu_mem_usage=True
            )
            
            model.eval()
            return model, processor

        except Exception as e:
            logger.error(f"Failed to load base model {model_id}: {str(e)}")
            raise RuntimeError(f"Base Model Initialization Failure: {str(e)}")

    def mount_adapter(self, base_model, adapter_path: str, adapter_name: str, is_already_peft: bool = False, logger_func=None):
        """
        Mounts or hot-swaps a LoRA adapter onto the base model.
        
        Args:
            base_model: The loaded base model (transformers or PEFT model).
            adapter_path (str): Path to the adapter weights.
            adapter_name (str): Unique name for the adapter module.
            is_already_peft (bool): Whether the base_model is already wrapped by PeftModel.
            logger_func (callable, optional): Callback for status updates.

        Returns:
            The model with adapter active.
        """
        if logger_func: logger_func(f"Mounting LoRA adapter: {adapter_name}")

        try:
            if not is_already_peft:
                # First time mounting an adapter: Wrap the base model
                model = PeftModel.from_pretrained(base_model, adapter_path, adapter_name=adapter_name)
                return model
            else:
                # Hot-swap on existing PEFT model
                if logger_func: logger_func("Hot-swapping active LoRA weights in VRAM...")
                
                # Check if this specific adapter name is already loaded to avoid duplicates
                if adapter_name not in base_model.peft_config:
                    base_model.load_adapter(adapter_path, adapter_name=adapter_name)
                
                base_model.set_adapter(adapter_name)
                return base_model

        except Exception as e:
            logger.error(f"Failed to mount adapter {adapter_path}: {e}")
            raise RuntimeError(f"Adapter Mounting Failure: {str(e)}")

    def unload_adapter(self, model, status_callback=None):
        """Unloads all adapters and returns the base model."""
        if hasattr(model, "unload"):
            if status_callback: status_callback("Unloading adapter. Returning to Base Model state...")
            return model.unload()
        return model