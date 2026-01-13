import os
import json
import datetime
import time
import random
from google import genai
from google.genai import types
from src.config import Config

class GeminiClient:
    """
    Robust wrapper for the Google Gemini API (Vertex/AI Studio).
    Refactored to support the 'Rehydration Pattern' where model_interaction.json
    is the Single Source of Truth (SSOT).
    Schema V3: Pruned metadata, Interaction IDs.
    """

    def __init__(self):
        if not Config.GEMINI_API_KEY:
            raise ValueError("[Gemini Client] GEMINI_API_KEY not found in environment.")
        self.client = genai.Client(api_key=Config.GEMINI_API_KEY)

    def _get_safety_settings(self):
        return [
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH, 
                threshold=types.HarmBlockThreshold.BLOCK_NONE
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, 
                threshold=types.HarmBlockThreshold.BLOCK_NONE
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, 
                threshold=types.HarmBlockThreshold.BLOCK_NONE
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_HARASSMENT, 
                threshold=types.HarmBlockThreshold.BLOCK_NONE
            ),
        ]

    def _log_interaction(self, session_folder, input_count, response_obj, interaction_id, prompt_text, usage_info=None, error=None, batch_context=None):
        """
        Appends a new interaction entry to the 'interactions' list in model_interaction.json.
        """
        if not session_folder or not os.path.exists(session_folder): 
            return 
        
        log_path = os.path.join(session_folder, 'model_interaction.json')
        
        resp_text = None
        if response_obj:
            try: 
                resp_text = response_obj.text
            except: 
                resp_text = "[No Text Content - Potentially Blocked]"

        usage_data = usage_info
        if not usage_data and response_obj and response_obj.usage_metadata:
            usage_data = {
                "input_tokens": response_obj.usage_metadata.prompt_token_count,
                "output_tokens": response_obj.usage_metadata.candidates_token_count,
                "images_sent": input_count
            }

        log_entry = {
            "interaction_id": interaction_id or f"int_{int(time.time()*1000)}",
            "batch_context": batch_context or {},
            "prompt_text": prompt_text,
            "response_text": resp_text,
            "usage": usage_data,
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
            print(f"[GeminiClient] Log Write Error: {e}")

    def generate_with_backoff(self, model, contents, config, session_folder=None, image_count=0, label="Analysis Batch", prompt_text="", adapter_name=None, inference_params=None, batch_context=None, interaction_id=None):
        """
        Executes a multimodal generation request with robust retry logic.
        """
        if not config.safety_settings:
            config.safety_settings = self._get_safety_settings()

        max_retries = 10 
        base_delay = 2.0 
        last_exception = None

        for attempt in range(max_retries):
            try:
                response = self.client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=config
                )
                
                usage = {
                    "input_tokens": response.usage_metadata.prompt_token_count or 0,
                    "output_tokens": response.usage_metadata.candidates_token_count or 0
                }

                self._log_interaction(session_folder, image_count, response, interaction_id, prompt_text, usage_info=usage, batch_context=batch_context)
                
                if not response.text:
                    raise ValueError("Empty VLM response received.")
                    
                return response, usage

            except Exception as e:
                last_exception = e
                error_str = str(e).lower()
                
                is_rate_limit = (
                    "429" in error_str or 
                    "resource_exhausted" in error_str or 
                    "quota" in error_str or 
                    "too many requests" in error_str
                )
                
                if not is_rate_limit:
                    self._log_interaction(session_folder, image_count, None, interaction_id, prompt_text, error=e, batch_context=batch_context)
                    raise e
                
                if attempt == max_retries - 1:
                    self._log_interaction(session_folder, image_count, None, interaction_id, prompt_text, error=e, batch_context=batch_context)
                    raise e
                
                wait_time = min(base_delay * (2 ** attempt), 60.0) 
                jitter = random.uniform(0.5, 2.5)
                total_wait = wait_time + jitter
                
                print(f"[{label}] API Quota Exhausted. Retry {attempt+1}/{max_retries} in {total_wait:.2f}s...")
                time.sleep(total_wait)
        
        raise last_exception