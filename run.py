import os
from werkzeug.serving import WSGIRequestHandler
from src import create_app

# Cloud Access Layer
try:
    from pyngrok import ngrok, conf
    NGROK_AVAILABLE = True
except ImportError:
    NGROK_AVAILABLE = False

app = create_app()

class FilteredRequestHandler(WSGIRequestHandler):
    """
    Custom Request Handler to suppress high-frequency logs from the hardware monitor.
    This intercepts the log_request call at the WSGI server level, guaranteeing suppression.
    """
    def log_request(self, code='-', size='-'):
        # If the request path contains our polling endpoint, skip logging entirely.
        if 'GET /api/playground/hardware' in self.requestline:
            return
        # Otherwise, proceed with standard logging
        super().log_request(code, size)

def init_ngrok(port):
    """
    Initializes an ngrok tunnel to expose the local server to the internet.
    """
    token = os.environ.get("NGROK_AUTHTOKEN")
    if not token or not NGROK_AVAILABLE:
        return

    # Ensure we only start ngrok once, preventing duplication during Flask reloads
    if os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        try:
            conf.get_default().auth_token = token
            public_url = ngrok.connect(port).public_url
            print("\n" + "="*65)
            print(f"🚀 PUBLIC CLOUD ACCESS ENABLED")
            print(f"🔗 ACCESS UI HERE: {public_url}")
            print("="*65 + "\n")
        except Exception as e:
            print(f"\n[DEPLOY] Failed to start ngrok tunnel: {e}")

if __name__ == '__main__':
    port = 5000
    
    init_ngrok(port)
    
    # Pass our custom handler to the Flask run method.
    # request_handler is a supported kwarg for the underlying werkzeug.serving.run_simple
    app.run(
        debug=True, 
        port=port, 
        host="0.0.0.0", 
        request_handler=FilteredRequestHandler
    )