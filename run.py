import os
from src import create_app

# Cloud Access Layer
# Integrated for GCE/Remote deployment using the blueprint from Qwen3VL-LoRA-Studio
try:
    from pyngrok import ngrok, conf
    NGROK_AVAILABLE = True
except ImportError:
    NGROK_AVAILABLE = False

app = create_app()

def init_ngrok(port):
    """
    Initializes an ngrok tunnel to expose the local server to the internet.
    Only runs if NGROK_AUTHTOKEN is found in the environment variables.
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
    # Default port for the Scene Detection Playground
    port = 5000
    
    # Initialize tunneling if configuration is present
    init_ngrok(port)
    
    # Standard Flask runner
    # Note: host="0.0.0.0" is required for the application to be reachable 
    # through the ngrok tunnel and within a cloud VM network.
    app.run(debug=True, port=port, host="0.0.0.0")