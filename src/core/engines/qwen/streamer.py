import logging
from transformers import TextStreamer

# Configure logging
logger = logging.getLogger(__name__)

class ForensicStreamer(TextStreamer):
    """
    Custom token streamer for Hugging Face generation.
    Intercepts the token stream to provide real-time 'heartbeat' logging
    to the GranularLogger without blocking the generation process.
    """

    def __init__(self, tokenizer, granular_logger=None, update_interval: int = 40):
        """
        Args:
            tokenizer: The model's tokenizer/processor.
            granular_logger: Instance of GranularLogger for UI updates.
            update_interval (int): Log progress every N tokens.
        """
        super().__init__(tokenizer, skip_prompt=True, skip_special_tokens=True)
        self.granular_logger = granular_logger
        self.update_interval = update_interval
        self.token_count = 0
        self.last_log_count = 0
        self.is_first_chunk = True

    def on_finalized_text(self, text: str, stream_end: bool = False):
        """
        Called by the parent TextStreamer when a chunk of text is decoded.
        We override this to hook into the stream loop.
        """
        # TextStreamer prints to stdout by default. We suppress that by doing nothing here
        # regarding stdout, but we use the event to increment our counter.
        pass

    def put(self, value):
        """
        Receives input ids from the generator.
        """
        # Call parent to handle decoding state
        super().put(value)
        
        # Safety Check: Handle variable tensor dimensions
        # value can be 1D (num_tokens,) or 2D (batch, num_tokens)
        if len(value.shape) > 1:
            new_tokens = value.shape[0] * value.shape[1]
        else:
            new_tokens = value.shape[0]

        # Heuristic: Ignore the initial prompt chunk if it's large.
        # The first call to put() often contains the entire input prompt context.
        # We only want to log *newly generated* tokens.
        if self.is_first_chunk:
            self.is_first_chunk = False
            if new_tokens > 128: 
                return

        self.token_count += new_tokens

        if self.granular_logger:
            if (self.token_count - self.last_log_count) >= self.update_interval:
                self.granular_logger.log(
                    'TOKEN', 
                    f"Thinking... ({self.token_count} tokens generated)"
                )
                self.last_log_count = self.token_count

    def end(self):
        super().end()
        # Optional: Final log summary could go here, but the generator usually handles that.