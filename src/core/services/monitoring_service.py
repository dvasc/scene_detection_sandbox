import psutil
import logging
from typing import Dict, Any

try:
    import GPUtil
    GPU_AVAILABLE = True
except ImportError:
    GPU_AVAILABLE = False

logger = logging.getLogger(__name__)

def get_hardware_status() -> Dict[str, Any]:
    """
    Fetches real-time hardware statistics for the monitoring deck.
    Returns a dictionary containing CPU, RAM, and GPU metrics.
    """
    stats = {
        "cpu": {},
        "ram": {},
        "gpu": []
    }

    try:
        # CPU Stats
        stats["cpu"]["usage_percent"] = psutil.cpu_percent(interval=None)
        stats["cpu"]["cores"] = psutil.cpu_count(logical=True)
        stats["cpu"]["freq_current"] = psutil.cpu_freq().current if psutil.cpu_freq() else 0

        # RAM Stats
        vm = psutil.virtual_memory()
        stats["ram"]["total_gb"] = round(vm.total / (1024**3), 2)
        stats["ram"]["available_gb"] = round(vm.available / (1024**3), 2)
        stats["ram"]["used_gb"] = round(vm.used / (1024**3), 2)
        stats["ram"]["percent"] = vm.percent

        # Disk Stats
        du = psutil.disk_usage('.')
        stats["disk"] = {
            "total_gb": round(du.total / (1024**3), 2),
            "used_gb": round(du.used / (1024**3), 2),
            "free_gb": round(du.free / (1024**3), 2),
            "percent": du.percent
        }

        # GPU Stats
        try:
            # Method 1: GPUtil (Preferred)
            if GPU_AVAILABLE:
                gpus = GPUtil.getGPUs()
                for gpu in gpus:
                    stats["gpu"].append({
                        "id": gpu.id,
                        "name": gpu.name,
                        "load_percent": round(gpu.load * 100, 1),
                        "memory_total_mb": gpu.memoryTotal,
                        "memory_used_mb": gpu.memoryUsed,
                        "memory_percent": round((gpu.memoryUsed / gpu.memoryTotal) * 100, 1) if gpu.memoryTotal > 0 else 0,
                        "temperature_c": gpu.temperature
                    })
            
            # Method 2: nvidia-smi (Fallback)
            if not stats["gpu"]:
                import subprocess
                import shutil
                
                if shutil.which('nvidia-smi'):
                    cmd = [
                        'nvidia-smi', 
                        '--query-gpu=index,name,utilization.gpu,memory.total,memory.used,temperature.gpu', 
                        '--format=csv,noheader,nounits'
                    ]
                    result = subprocess.check_output(cmd, encoding='utf-8')
                    lines = result.strip().split('\n')
                    
                    for line in lines:
                        parts = [x.strip() for x in line.split(',')]
                        if len(parts) >= 6:
                            idx = parts[0]
                            name = parts[1]
                            load = float(parts[2])
                            mem_total = float(parts[3])
                            mem_used = float(parts[4])
                            temp = float(parts[5])
                            
                            stats["gpu"].append({
                                "id": int(idx),
                                "name": name,
                                "load_percent": load,
                                "memory_total_mb": mem_total,
                                "memory_used_mb": mem_used,
                                "memory_percent": round((mem_used / mem_total) * 100, 1) if mem_total > 0 else 0,
                                "temperature_c": temp
                            })

        except Exception as e:
            logger.warning(f"Failed to fetch GPU stats: {e}")
        
    except Exception as e:
        logger.error(f"Error fetching hardware stats: {e}")

    return stats
