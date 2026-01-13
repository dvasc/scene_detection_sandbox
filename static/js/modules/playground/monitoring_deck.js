/**
 * Hardware Monitoring Deck
 * Handles polling and rendering of system statistics (CPU, RAM, GPU).
 */
export class MonitoringDeck {
    constructor() {
        this.pollInterval = 2000; // 2 seconds
        this.isPolling = false;

        // DOM Elements
        this.cpuVal = document.getElementById('monitorCpuVal');
        this.cpuBar = document.getElementById('monitorCpuBar');

        this.ramVal = document.getElementById('monitorRamVal');
        this.ramBar = document.getElementById('monitorRamBar');
        this.ramDetail = document.getElementById('monitorRamDetail');

        this.gpuContainer = document.getElementById('monitorGpuContainer');
    }

    start() {
        if (this.isPolling) return;
        this.isPolling = true;
        this.poll();
        this.timer = setInterval(() => this.poll(), this.pollInterval);
    }

    stop() {
        this.isPolling = false;
        if (this.timer) clearInterval(this.timer);
    }

    async poll() {
        try {
            const response = await fetch('/api/playground/hardware');
            if (!response.ok) return;
            const stats = await response.json();
            this.render(stats);
        } catch (e) {
            console.error("Hardware monitor poll failed:", e);
        }
    }

    render(stats) {
        // CPU
        if (stats.cpu) {
            const cpuPct = stats.cpu.usage_percent;
            if (this.cpuVal) this.cpuVal.innerText = `${cpuPct}%`;
            if (this.cpuBar) this.cpuBar.style.width = `${cpuPct}%`;
        }

        // RAM
        if (stats.ram) {
            const ramPct = stats.ram.percent;
            if (this.ramVal) this.ramVal.innerText = `${ramPct}%`;
            if (this.ramBar) this.ramBar.style.width = `${ramPct}%`;
            if (this.ramDetail) this.ramDetail.innerText = `${stats.ram.used_gb} / ${stats.ram.total_gb} GB`;
        }

        // Disk
        if (stats.disk) {
            const diskPct = stats.disk.percent;
            const diskVal = document.getElementById('monitorDiskVal');
            const diskBar = document.getElementById('monitorDiskBar');
            const diskDetail = document.getElementById('monitorDiskDetail');

            if (diskVal) diskVal.innerText = `${diskPct}%`;
            if (diskBar) diskBar.style.width = `${diskPct}%`;
            if (diskDetail) diskDetail.innerText = `${stats.disk.used_gb} / ${stats.disk.total_gb} GB`;
        }

        // GPU
        if (stats.gpu && stats.gpu.length > 0 && this.gpuContainer) {
            this.gpuContainer.innerHTML = ''; // Clear previous
            stats.gpu.forEach(gpu => {
                const vramUsed = (gpu.memory_used_mb / 1024).toFixed(1);
                const vramTotal = (gpu.memory_total_mb / 1024).toFixed(1);

                const gpuWidget = document.createElement('div');
                gpuWidget.className = 'monitor-widget';
                gpuWidget.innerHTML = `
                    <div class="monitor-label">
                        <i class="fa-solid fa-microchip"></i> GPU ${gpu.id}: ${gpu.name}
                    </div>
                    <div class="monitor-main">
                        <div class="monitor-val">${gpu.load_percent}%</div>
                        <div class="monitor-bar-track">
                            <div class="monitor-bar-fill" style="width: ${gpu.load_percent}%"></div>
                        </div>
                    </div>
                    <div class="monitor-detail">
                        VRAM: ${vramUsed} / ${vramTotal} GB  (${gpu.temperature_c}°C)
                    </div>
                `;
                this.gpuContainer.appendChild(gpuWidget);
            });
            this.gpuContainer.style.display = 'flex';
        } else if (this.gpuContainer) {
            this.gpuContainer.style.display = 'none';
        }
    }
}
