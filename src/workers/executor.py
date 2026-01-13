"""
Scene Detection Playground Executor.
Orchestrates asynchronous VLM inference tasks for model evaluation.
This module has been stripped of all production data annotation and export logic.
"""

from concurrent.futures import ThreadPoolExecutor

# Global executor for background tasks. 
# 4 workers is sufficient for local evaluation and concurrent cloud API requests.
executor = ThreadPoolExecutor(max_workers=4)

# Core status tracking and cost calculation utilities
from .utils import (
    TASK_STATUS, 
    update_status, 
    calculate_cost
)

# Load the primary Playground task
from .tasks.analysis_tasks import (
    run_playground_inference_task
)

# Load Asset Management tasks
from .tasks.asset_tasks import (
    run_model_download_task
)

__all__ = [
    "executor",
    "TASK_STATUS",
    "update_status",
    "calculate_cost",
    "run_playground_inference_task",
    "run_model_download_task"
]