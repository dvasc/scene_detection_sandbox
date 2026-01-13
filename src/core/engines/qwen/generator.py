import torch
import time
import re
import json
import logging
from typing import List, Dict, Optional, Tuple, Union
from PIL import Image
from src.config import Config
from src.core.engines.qwen.streamer import ForensicStreamer

# Configure logging
logger = logging.getLogger(__name__)

class InferenceGenerator:
    """
    Handles the execution of the inference loop.
    Separated from loading logic to focus purely on data processing,
    token generation, and output parsing.
    """

    def __init__(self, model, processor):
        self.model = model
        self.processor = processor

    def generate(self, 
                 images: List[Image.Image], 
                 prompt_text: str, 
                 system_prompt: str,
                 inference_params: Dict, 
                 granular_logger=None) -> Dict:
        """
        Executes the forward pass of the model.

        Args:
            images (List[Image.Image]): Processed PIL images.
            prompt_text (str): User/Task prompt.
            system_prompt (str): System instruction.
            inference_params (Dict): Generation hyperparameters.
            granular_logger: Optional structured logger for forensic traces.

        Returns:
            Dict: { 'text': str, 'thinking': str, 'usage': dict }
        """
        start_time = time.time()
        
        # 1. Message Templating
        messages = [
            {"role": "system", "content": [{"type": "text", "text": system_prompt}]},
            {"role": "user", "content": [
                *[{"type": "image", "image": img} for img in images], 
                {"type": "text", "text": prompt_text}
            ]}
        ]

        # 2. Dynamic LoRA Scaling (if applicable)
        lora_scale = float(inference_params.get('lora_scale', 1.0))
        self._set_adapter_scale(lora_scale)

        # 3. Preprocessing (Tokenization)
        preproc_start = time.time()
        text_input = self.processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        
        inputs = self.processor(
            text=[text_input], 
            images=images, 
            videos=None, 
            padding=True, 
            return_tensors="pt"
        ).to(self.model.device)
        
        input_tokens_count = inputs.input_ids.shape[1]
        preproc_elapsed = (time.time() - preproc_start) * 1000
        
        if granular_logger:
            img_size = images[0].size if images else (0,0)
            granular_logger.log_vlm_preprocessing(len(images), img_size, input_tokens_count, preproc_elapsed)

        # 4. Streamer Setup
        # Use runtime interval parameter, default to 30
        stream_interval = int(inference_params.get('stream_interval', 30))
        streamer = None
        if granular_logger:
            streamer = ForensicStreamer(self.processor, granular_logger, update_interval=stream_interval)

        # 5. Generation Loop
        gen_start = time.time()
        
        p_temp = inference_params.get('temperature', 0.1)
        p_top_p = inference_params.get('top_p', 0.9)
        p_max_tokens = int(inference_params.get('max_tokens', 8192))
        p_rep_penalty = float(inference_params.get('repetition_penalty', Config.INFERENCE_REPETITION_PENALTY))
        
        with torch.no_grad():
            generated_ids = self.model.generate(
                **inputs, 
                max_new_tokens=p_max_tokens, 
                temperature=p_temp,
                top_p=p_top_p, 
                repetition_penalty=p_rep_penalty, 
                do_sample=True,
                streamer=streamer # Attach the heartbeat hook
            )

        # 6. Cleanup & Reset
        if lora_scale != 1.0:
            self._set_adapter_scale(1.0) # Reset to default

        # 7. Post-Processing (Decoding)
        # Trim input tokens from output to get only the new content
        generated_ids_trimmed = [out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs.input_ids, generated_ids)]
        output_tokens_count = generated_ids_trimmed[0].shape[0]
        
        gen_elapsed = (time.time() - gen_start) * 1000
        tps = output_tokens_count / (gen_elapsed / 1000) if gen_elapsed > 0 else 0
        
        if granular_logger:
            granular_logger.log_vlm_token_generation(output_tokens_count, p_max_tokens, gen_elapsed, tps)
        
        raw_output = self.processor.batch_decode(
            generated_ids_trimmed, 
            skip_special_tokens=True, 
            clean_up_tokenization_spaces=False
        )[0]

        # 8. Parsing
        clean_text, thinking = self._parse_thinking_output(raw_output)
        elapsedTotal = time.time() - start_time

        # 9. JSON Validation Log (Optional)
        if granular_logger:
            self._validate_json_log(clean_text, granular_logger)

        return {
            "text": clean_text, 
            "thinking": thinking, 
            "usage": {
                "input_tokens": input_tokens_count, 
                "output_tokens": output_tokens_count, 
                "inference_time": round(elapsedTotal, 2)
            }
        }

    def _set_adapter_scale(self, scale_factor: float):
        """Helper to dynamically adjust LoRA alpha/rank scaling at runtime."""
        # Only works if PeftModel
        if not hasattr(self.model, "active_adapter") or not self.model.active_adapter:
            return
            
        try:
            active_adapter = self.model.active_adapter
            if isinstance(active_adapter, str): # Handle single adapter case
                for module in self.model.modules():
                    if hasattr(module, "scaling") and isinstance(module.scaling, dict):
                        if active_adapter in module.scaling:
                            # Standard LoRA scaling logic: alpha / r
                            peft_config = self.model.peft_config.get(active_adapter)
                            if peft_config:
                                default_scale = peft_config.lora_alpha / peft_config.r
                                new_scale = default_scale * scale_factor
                                module.scaling[active_adapter] = new_scale
        except Exception as e:
            logger.warning(f"Failed to set LoRA scale: {e}")

    def _parse_thinking_output(self, raw_text: str) -> Tuple[str, Optional[str]]:
        """Splits raw VLM output into reasoning (<think>) and content."""
        if not raw_text: 
            return "", None

        thinking = None
        clean_text = raw_text

        # Pattern 1: Explicit XML Tags
        think_match = re.search(r'<think>(.*?)</think>', raw_text, flags=re.DOTALL | re.IGNORECASE)
        if think_match:
            thinking = think_match.group(1).strip()
            clean_text = re.sub(r'<think>.*?</think>', '', raw_text, flags=re.DOTALL | re.IGNORECASE).strip()
            return clean_text, thinking

        # Pattern 2: Fallback for models that emit raw reasoning before JSON
        # Assumes JSON starts with '{' and anything before it is reasoning
        json_start = raw_text.find('{')
        if json_start > 20: 
            thinking = raw_text[:json_start].strip()
            clean_text = raw_text[json_start:].strip()
            # Clean up common lead-in prefixes
            thinking = re.sub(r'^(thinking|analysis|reasoning|audit):\s*', '', thinking, flags=re.IGNORECASE)
            return clean_text, thinking

        return clean_text, thinking

    def _validate_json_log(self, text, logger_inst):
        """Helper to log whether valid JSON was emitted."""
        try:
            json_match = re.search(r'\{.*\}', text, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group())
                logger_inst.log_vlm_json_parse("SUCCESS", list(parsed.keys()))
            else:
                logger_inst.log_vlm_json_parse("MISSING", [], "VLM did not emit a JSON block.")
        except Exception as e:
            logger_inst.log_vlm_json_parse("FAILED", [], str(e))