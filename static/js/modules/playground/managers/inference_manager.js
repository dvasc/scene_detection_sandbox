/**
 * Inference Manager
 * Orchestrates the execution of the multimodal pipeline.
 * Collects UI parameters (including LoRA Scale, High Fidelity Mode, & Repetition Penalty), 
 * submits the job, polls for status, manages abortion, and finalizes the result.
 */

import { store } from '../store.js';
import * as api from '../service.js';
import * as ui from '../view.js';
import * as timeline from '../inference_timeline.js';
import * as player from '../player_view.js';

const POLLING_INTERVAL = 1500;

export class InferenceManager {
    constructor() {
        this.currentTaskId = null; // Track active task for abortion

        this.els = {
            modelSelect: document.getElementById('modelSelect'),
            adapterInput: document.getElementById('adapterPath'),
            windowInput: document.getElementById('windowSize'),

            // Hyperparameters
            paramTemp: document.getElementById('paramTemp'),
            paramTopP: document.getElementById('paramTopP'),
            paramMaxTokens: document.getElementById('paramMaxTokens'),
            paramSystem: document.getElementById('paramSystem'),
            paramMain: document.getElementById('paramMain'),
            paramLoraScale: document.getElementById('paramLoraScale'),
            paramRepPenalty: document.getElementById('paramRepPenalty'),
            streamInterval: document.getElementById('streamInterval'),

            // Toggles
            forceCheckbox: document.getElementById('forceLoadAdapter'),
            hifiCheckbox: document.getElementById('highFidelityMode'),

            // Actions
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

        // Reset Abort State
        this.currentTaskId = null;
        if (this.els.abortBtn) {
            this.els.abortBtn.disabled = false;
            this.els.abortBtn.innerHTML = '<i class="fa-solid fa-ban"></i> Stop Execution';
        }

        ui.toggleViewState('processing');
        ui.updateProgressBar(0);

        // --- Log Start Parameters ---
        let msg = "Dispatching multimodal payload...";

        const isForce = this.els.forceCheckbox && this.els.forceCheckbox.checked;
        const isHifi = this.els.hifiCheckbox && this.els.hifiCheckbox.checked && !this.els.hifiCheckbox.disabled;

        if (isForce || isHifi) {
            let modes = [];
            if (isForce) modes.push("FORCE ADAPTER");
            if (isHifi) modes.push("HIGH-FIDELITY (BF16)");
            ui.logConsole(`⚠️ ACTIVE MODES: ${modes.join(', ')}`, false, true);
        } else {
            ui.logConsole(msg);
        }

        const startTime = Date.now();
        const formData = new FormData();

        // Core Inputs
        formData.append('video', store.videoFile);
        formData.append('model_id', this.els.modelSelect.value);
        formData.append('window_size', this.els.windowInput.value);

        // Hyperparameters
        formData.append('temperature', this.els.paramTemp.value);
        formData.append('top_p', this.els.paramTopP.value);
        formData.append('max_tokens', this.els.paramMaxTokens.value);

        // System Prompt: Use override if exists, else it might fall back to default backend logic
        if (this.els.paramSystem) {
            formData.append('system_prompt', this.els.paramSystem.value);
        }

        // Stream Interval (Operational Param)
        if (this.els.streamInterval) {
            formData.append('stream_interval', this.els.streamInterval.value);
        }

        // Main Prompt Override
        if (this.els.paramMain) {
            formData.append('main_prompt', this.els.paramMain.value);
        }

        if (this.els.paramRepPenalty) {
            formData.append('repetition_penalty', this.els.paramRepPenalty.value);
        }

        if (this.els.paramLoraScale) {
            formData.append('lora_scale', this.els.paramLoraScale.value);
        }

        if (isForce) {
            formData.append('bypass_validation', 'true');
        }

        if (isHifi) {
            formData.append('high_fidelity_mode', 'true');
        }

        const adapterPath = this.els.adapterInput ? this.els.adapterInput.value.trim() : '';
        if (adapterPath) {
            formData.append('adapter_path', adapterPath);
        }

        try {
            const data = await api.triggerInferenceApi(formData);
            this.currentTaskId = data.task_id;
            this.pollStatus(data.task_id, startTime);
        } catch (err) {
            ui.logConsole(`[FATAL] ${err.message}`, false, true);
        }
    }

    async handleAbort() {
        if (!this.currentTaskId) return;

        if (this.els.abortBtn) {
            this.els.abortBtn.disabled = true;
            this.els.abortBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Stopping...';
        }

        ui.logConsole("⚠️ Sending abort signal to backend...", false, true);

        try {
            await api.abortTaskApi(this.currentTaskId);
        } catch (err) {
            ui.logConsole(`[ERROR] Failed to send abort signal: ${err.message}`, false, true);
        }
    }

    pollStatus(taskId, startTime) {
        const interval = setInterval(async () => {
            try {
                const status = await api.pollTaskStatus(taskId);

                if (status.logs && Array.isArray(status.logs) && status.logs.length > 0) {
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
                    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
                    await this.finalizeInference(status.result.session_id, totalTime);
                } else if (status.state === 'FAILURE') {
                    clearInterval(interval);
                    ui.logConsole(`[STOPPED] ${status.status}`, false, true);
                }
            } catch (err) {
                console.warn("[POLL] Connecting...", err);
            }
        }, POLLING_INTERVAL);
    }

    async finalizeInference(sessionId, totalTime) {
        ui.logConsole("Rehydrating session state from SSOT...", false, true);
        try {
            const data = await api.fetchSessionData(sessionId);

            store.inferenceResults = data.shots;
            store.activeSessionId = sessionId;

            timeline.renderTimeline(sessionId, (shot) => player.seekToShot(shot));
            player.initPlayer(store.videoUrl);
            player.syncPlayer();

            ui.updateHUD(`${totalTime}s`, this.els.modelSelect.value);
            ui.toggleViewState('results');
        } catch (err) {
            ui.logConsole(`[ERROR] Failed to hydrate session: ${err.message}`, false, true);
        }
    }
}