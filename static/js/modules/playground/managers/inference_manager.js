/**
 * Inference Manager
 * Orchestrates the execution of the multimodal pipeline.
 * Collects UI parameters, submits jobs, polls status, and handles MPA transitions.
 */

import { store } from '../store.js';
import * as api from '../service.js';
import * as ui from '../view.js';

const POLLING_INTERVAL = 1500;

export class InferenceManager {
    constructor() {
        this.currentTaskId = null;
        this.shouldAutoDownload = false;

        this.els = {
            modelSelect: document.getElementById('modelSelect'),
            adapterInput: document.getElementById('adapterPath'),
            windowInput: document.getElementById('windowSize'),
            paramTemp: document.getElementById('paramTemp'),
            paramTopP: document.getElementById('paramTopP'),
            paramMaxTokens: document.getElementById('paramMaxTokens'),
            paramSystem: document.getElementById('paramSystem'),
            paramMain: document.getElementById('paramMain'),
            paramLoraScale: document.getElementById('paramLoraScale'),
            paramRepPenalty: document.getElementById('paramRepPenalty'),
            streamInterval: document.getElementById('streamInterval'),
            forceCheckbox: document.getElementById('forceLoadAdapter'),
            hifiCheckbox: document.getElementById('highFidelityMode'),
            autoDownloadCheck: document.getElementById('autoDownloadCheck'),
            processBtn: document.getElementById('processBtn'),
            abortBtn: document.getElementById('abortBtn')
        };

        this.init();
    }

    init() {
        if (this.els.processBtn) {
            this.els.processBtn.addEventListener('click', () => this.startInference());
        }
        if (this.els.abortBtn) {
            this.els.abortBtn.addEventListener('click', () => this.handleAbort());
        }
    }

    async startInference() {
        if (!store.videoFile) return;

        // Visual feedback before redirect
        const btn = this.els.processBtn;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Initializing...';

        this.shouldAutoDownload = this.els.autoDownloadCheck ? this.els.autoDownloadCheck.checked : false;

        const formData = new FormData();
        formData.append('video', store.videoFile);
        formData.append('model_id', this.els.modelSelect.value);
        formData.append('window_size', this.els.windowInput.value);
        formData.append('temperature', this.els.paramTemp.value);
        formData.append('top_p', this.els.paramTopP.value);
        formData.append('max_tokens', this.els.paramMaxTokens.value);

        if (this.els.paramSystem) formData.append('system_prompt', this.els.paramSystem.value);
        if (this.els.streamInterval) formData.append('stream_interval', this.els.streamInterval.value);
        if (this.els.paramMain) formData.append('main_prompt', this.els.paramMain.value);
        if (this.els.paramRepPenalty) formData.append('repetition_penalty', this.els.paramRepPenalty.value);
        if (this.els.paramLoraScale) formData.append('lora_scale', this.els.paramLoraScale.value);

        if (this.els.forceCheckbox && this.els.forceCheckbox.checked) formData.append('bypass_validation', 'true');
        if (this.els.hifiCheckbox && this.els.hifiCheckbox.checked) formData.append('high_fidelity_mode', 'true');

        const adapterPath = this.els.adapterInput ? this.els.adapterInput.value.trim() : '';
        if (adapterPath) formData.append('adapter_path', adapterPath);

        try {
            const data = await api.triggerInferenceApi(formData);
            // MPA Transition: Redirect to processing view
            const dlParam = this.shouldAutoDownload ? '?auto_download=true' : '';
            window.location.href = `/playground/processing/${data.task_id}${dlParam}`;
        } catch (err) {
            alert(`Failed to start inference: ${err.message}`);
            btn.disabled = false;
            btn.innerHTML = 'INITIALIZE MISSION';
        }
    }

    async handleAbort() {
        if (!this.currentTaskId) return;
        if (this.els.abortBtn) {
            this.els.abortBtn.disabled = true;
            this.els.abortBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Stopping...';
        }
        try {
            await api.abortTaskApi(this.currentTaskId);
        } catch (err) {
            console.error("Abort failed:", err);
        }
    }

    pollStatus(taskId, startTime) {
        const interval = setInterval(async () => {
            try {
                const status = await api.pollTaskStatus(taskId);

                if (status.logs && Array.isArray(status.logs)) {
                    ui.logConsole(status.logs);
                } else if (status.status) {
                    ui.logConsole(status.status);
                }

                if (status.step && status.total) {
                    const pct = (status.step / status.total) * 100;
                    ui.updateProgressBar(pct);
                }

                if (status.state === 'SUCCESS') {
                    clearInterval(interval);

                    // Handle Auto-Download before redirecting
                    if (this.shouldAutoDownload && status.result && status.result.session_id) {
                        ui.logConsole("[AUTO-DOWNLOAD] Triggering archive download...", true);
                        // Using hidden iframe or secondary window loc to prevent blocking the redirect
                        const downloadUrl = `/api/playground/session/${status.result.session_id}/download`;
                        const link = document.createElement('a');
                        link.href = downloadUrl;
                        link.download = '';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);

                        // Brief delay to allow download handshake
                        setTimeout(() => {
                            window.location.href = `/playground/results/${status.result.session_id}`;
                        }, 1000);
                    } else {
                        // MPA Transition: Redirect to results view
                        window.location.href = `/playground/results/${status.result.session_id}`;
                    }

                } else if (status.state === 'FAILURE') {
                    clearInterval(interval);
                    ui.logConsole(`[STOPPED] ${status.status}`, false, true);
                    if (this.els.abortBtn) {
                        this.els.abortBtn.innerHTML = 'Execution Stopped';
                    }
                }
            } catch (err) {
                console.warn("[POLL] Connecting...", err);
            }
        }, POLLING_INTERVAL);
    }
}