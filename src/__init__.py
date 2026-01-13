from flask import Flask
from src.config import Config

def create_app():
    """
    Application Factory for the standalone Scene Detection Playground.
    Initializes Flask environment and registers the modularized Playground Blueprint.
    """
    app = Flask(__name__, 
                template_folder='../templates',
                static_folder='../static')
    
    # Load settings from the decoupled config module
    app.config.from_object(Config)

    # Register the Playground Blueprint Package
    # Now importing from the modular package instead of the single file
    from src.http.controllers.playground import playground_bp
    app.register_blueprint(playground_bp)

    # Root Route Management
    @app.route('/')
    def index_redirect():
        from flask import redirect, url_for
        return redirect(url_for('playground.index'))

    return app