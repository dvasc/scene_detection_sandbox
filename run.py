import os
import logging
import requests
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
    """
    def log_request(self, code='-', size='-'):
        if 'GET /api/playground/hardware' in self.requestline:
            return
        super().log_request(code, size)

def configure_logging():
    """
    Attaches the suppression filter to the Werkzeug logger.
    """
    werkzeug_logger = logging.getLogger('werkzeug')
    # Additional safety to ensure we don't duplicate filters on reload
    if not any(isinstance(f, logging.Filter) for f in werkzeug_logger.filters):
        pass # The WSGI handler override handles this, but good practice to keep the hook

def get_gce_external_ip():
    """
    Attempts to fetch the External IP from the GCE Metadata Server.
    Returns None if not on GCE or unreachable.
    """
    try:
        headers = {"Metadata-Flavor": "Google"}
        url = "http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip"
        response = requests.get(url, headers=headers, timeout=1)
        if response.status_code == 200:
            return response.text.strip()
    except Exception:
        return None
    return None

def init_ngrok(port):
    """
    Initializes an ngrok tunnel to expose the local server to the internet.
    """
    token = os.environ.get("NGROK_AUTHTOKEN")
    if not token or not NGROK_AVAILABLE:
        return

    if os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        try:
            conf.get_default().auth_token = token
            public_url = ngrok.connect(port).public_url
            print(f"🚀 NGROK TUNNEL ACTIVE: {public_url}")
        except Exception as e:
            print(f"\n[DEPLOY] Failed to start ngrok tunnel: {e}")

if __name__ == '__main__':
    port = 5000
    
    # 1. Detect Environment
    external_ip = get_gce_external_ip()
    
    # 2. Print Access Information
    print("\n" + "="*65)
    print(f"🚀 SERVER STARTING ON PORT {port}")
    
    if external_ip:
        print(f"☁️  GCE DETECTED. DIRECT ACCESS LINK:")
        print(f"🔗 http://{external_ip}:{port}")
        print(f"⚠️  (Ensure VPC Firewall allows TCP:{port} ingress)")
        print("-" * 65)
    
    # 3. Initialize Tunnel (Optional Backup)
    init_ngrok(port)
    print("="*65 + "\n")
    
    app.run(
        debug=True, 
        port=port, 
        host="0.0.0.0", 
        request_handler=FilteredRequestHandler
    )