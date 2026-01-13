"""
Qwen Engine Package
-------------------
This package modularizes the Qwen VLM client by separating concerns:
- diagnostics: Hardware capability checks (VRAM).
- loader: Model and adapter loading logic with dynamic precision.
- generator: Inference execution and output parsing.
- streamer: Real-time token streaming hooks for logging.
- client: The main public-facing orchestrator.
"""

from .diagnostics import check_gpu_capacity
from .loader import ModelLoader
from .generator import InferenceGenerator
from .streamer import ForensicStreamer

__all__ = [
    "check_gpu_capacity",
    "ModelLoader",
    "InferenceGenerator",
    "ForensicStreamer"
]