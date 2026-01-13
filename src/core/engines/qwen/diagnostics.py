import torch
import logging
from typing import Dict, Union

# Configure logging for the diagnostics module
logger = logging.getLogger(__name__)

def check_gpu_capacity(required_vram_gb: float = 12.0) -> Dict[str, Union[bool, float, str]]:
    """
    Analyzes the host hardware to determine if it supports High-Fidelity (BF16) inference.
    
    This check is primarily based on TOTAL VRAM capacity to classify the hardware tier.
    It serves as a gatekeeper for enabling the 'High-Fidelity Mode' UI option.
    
    Args:
        required_vram_gb (float): The minimum total VRAM (in GB) required to be considered "capable"
                                  of running the model in native BF16 precision without quantization.
                                  Defaults to 12.0 GB (Safety margin for 2B model + Context + OS overhead).

    Returns:
        dict: {
            'is_capable': bool,      # True if hardware meets the total VRAM threshold
            'total_vram_gb': float,  # Total installed video memory
            'free_vram_gb': float,   # Currently available video memory
            'device_name': str,      # Name of the GPU
            'reason': str            # Human-readable status string
        }
    """
    result = {
        'is_capable': False,
        'total_vram_gb': 0.0,
        'free_vram_gb': 0.0,
        'device_name': "CPU / Unknown",
        'reason': "CUDA not available."
    }

    if not torch.cuda.is_available():
        logger.warning("[Diagnostics] CUDA not detected. Defaulting to CPU/Low-Spec mode.")
        return result

    try:
        # We assume Device 0 for the primary inference GPU in a local sandbox environment
        device_id = 0
        properties = torch.cuda.get_device_properties(device_id)
        result['device_name'] = properties.name
        
        # Total VRAM (Physical Capacity)
        total_bytes = properties.total_memory
        result['total_vram_gb'] = round(total_bytes / (1024 ** 3), 2)

        # Free VRAM (Runtime Availability)
        # mem_get_info returns (free, total) in bytes
        free_bytes, _ = torch.cuda.mem_get_info(device_id)
        result['free_vram_gb'] = round(free_bytes / (1024 ** 3), 2)

        # Capability Decision Logic
        # We check TOTAL capacity to determine if the card is technically capable (Hardware Tier).
        # We verify if it meets the safe threshold for BF16 loading (model weights + KV cache).
        if result['total_vram_gb'] >= required_vram_gb:
            result['is_capable'] = True
            result['reason'] = f"Hardware Capable ({result['total_vram_gb']}GB Total VRAM detected)."
        else:
            result['reason'] = (
                f"Insufficient VRAM for High-Fidelity Mode. "
                f"Detected: {result['total_vram_gb']}GB. Required: {required_vram_gb}GB."
            )

        logger.info(f"[Diagnostics] GPU Check: {result['device_name']} | "
                    f"Total: {result['total_vram_gb']}GB | "
                    f"Free: {result['free_vram_gb']}GB | "
                    f"BF16 Capable: {result['is_capable']}")

    except Exception as e:
        logger.error(f"[Diagnostics] Failed to query GPU properties: {e}")
        result['reason'] = f"Driver Error: {str(e)}"

    return result