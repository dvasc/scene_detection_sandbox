from flask import jsonify
from src.http.controllers.playground import playground_bp
from src.core.services.monitoring_service import get_hardware_status

@playground_bp.route('/api/playground/hardware', methods=['GET'])
def get_hardware_metrics():
    """
    API endpoint to retrieve real-time hardware statistics.
    """
    stats = get_hardware_status()
    return jsonify(stats)
