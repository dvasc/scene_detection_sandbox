import threading
from src.config import PRICING_DATA, Config

# Global registry to track the state of asynchronous background tasks.
# Supports 'logs' for real-time hierarchical terminal streaming.
TASK_STATUS = {}

# Registry for cancellation signals (Cooperative Multitasking)
TASK_CANCEL_REGISTRY = {}

# Thread-safe re-entrant lock for state updates and progress tracking.
state_lock = threading.RLock()

def update_status(task_id, state, step=0, total=4, status="", result=None, logs=None):
    """
    Updates the global task registry for frontend progress tracking.
    """
    with state_lock:
        TASK_STATUS[task_id] = {
            'state': state,
            'step': step,
            'total': total,
            'status': status,
            'result': result,
            'logs': logs or []
        }

def request_task_cancellation(task_id):
    """Sets the cancellation flag for a specific task."""
    with state_lock:
        TASK_CANCEL_REGISTRY[task_id] = True

def is_task_cancelled(task_id):
    """Checks if a cancellation signal has been received for the task."""
    with state_lock:
        return TASK_CANCEL_REGISTRY.get(task_id, False)

def cleanup_task_registry(task_id):
    """Removes task data from registries to free memory after completion."""
    with state_lock:
        if task_id in TASK_CANCEL_REGISTRY:
            del TASK_CANCEL_REGISTRY[task_id]
        # Note: We intentionally keep TASK_STATUS so the frontend can retrieve the final result.

def calculate_cost(model_id, input_tokens, output_tokens):
    """
    Calculates the financial cost of a VLM inference batch based on pricing metadata.
    Returns 0.0 for local models or unknown model IDs.
    """
    if not model_id:
        return 0.0

    # Pricing resolution
    prices = PRICING_DATA.get(model_id, PRICING_DATA.get('default', {'input_price': 0, 'output_price': 0}))
    
    # Tiered pricing support (common for Gemini Pro models)
    if "tier_1" in prices:
        tier_1 = prices['tier_1']
        tier_2 = prices['tier_2']
        if input_tokens <= tier_1['input_threshold']:
            i_price = tier_1['price_input_per_million']
            o_price = tier_1['price_output_per_million']
        else:
            i_price = tier_2['price_input_per_million']
            o_price = tier_2['price_output_per_million']
    else:
        # Standard flat pricing per million tokens
        i_price = prices.get('input_price', 0.0)
        o_price = prices.get('output_price', 0.0)

    total = ((input_tokens / 1000000) * i_price) + ((output_tokens / 1000000) * o_price)
    return round(total, 6)