"""
Playground Controller Package
----------------------------
Modularized logic for the Scene Detection Sandbox:
- views: UI rendering and model discovery.
- inference: Background task execution and control.
- sessions: SSOT rehydration and archive management.
- artifacts: Log retrieval and static asset serving.
- management: Dynamic model import and adapter upload.
"""

from flask import Blueprint

# Create the Blueprint shared by all sub-modules
playground_bp = Blueprint('playground', __name__)

# Import sub-modules to register routes
# Using delayed imports to allow the blueprint object to be initialized first
from . import views
from . import inference
from . import sessions
from . import artifacts
from . import management
from . import monitoring # Register monitoring routes