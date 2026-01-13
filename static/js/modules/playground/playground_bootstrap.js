/**
 * PlaygroundBootstrap.js
 * Application Entry Point.
 * Initializes the domain-specific managers and binds global event listeners.
 */

import { store } from './store.js';
import * as ui from './view.js';
import * as api from './service.js';
import * as debugConsole from './forensic_terminal.js';

// Import New Modular Managers
import { AdapterManager } from './managers/adapter_manager.js';
import { FileManager } from './managers/file_manager.js';
import { SessionManager } from './managers/session_manager.js';
import { InferenceManager } from './managers/inference_manager.js';
import { AssetManager } from './managers/asset_manager.js';
import { MonitoringDeck } from './monitoring_deck.js';

let activeLogs = { pipeline: "", debug: [] };
let activeDebugTab = 'pipeline';

// State Managers
let adapterMgr, fileMgr, sessionMgr, inferenceMgr, assetMgr, monitorMgr;

/**
 * Entry point: Bootstraps the modular system.
 */
function init() {
    console.log("[Playground] Bootstrapping Modular Architecture...");

    // Initialize Managers
    adapterMgr = new AdapterManager();
    inferenceMgr = new InferenceManager();
    sessionMgr = new SessionManager();
    monitorMgr = new MonitoringDeck();

    // Start Hardware Monitoring
    monitorMgr.start();

    // File Manager needs access to enable/disable the Inference Process Button
    fileMgr = new FileManager((isEnabled) => {
        // Find the launch button in Step 4
        const btn = document.querySelector('.launch-btn');
        if (btn) {
            btn.disabled = !isEnabled;
            const subText = btn.querySelector('.launch-sub');
            if (subText) subText.textContent = isEnabled ? "Ready to Launch" : "Awaiting Configuration";
        }
    });

    // Asset Manager handles dynamic imports and uploads
    // It provides callbacks to refresh other components when assets change
    assetMgr = new AssetManager({
        onAdapterAdded: async () => {
            console.log("[Bootstrap] Adapter added, refreshing list...");
            await adapterMgr.refreshList();
        }
    });

    setupGlobalControls();
    setupInspectorListeners();
    setupModalListeners();
    setupDebugListeners();

    console.log("[Playground] Systems Online.");
}

/**
 * Bindings for Modal interactions (Asset Hub).
 */
function setupModalListeners() {
    // Import Modal
    const importBtn = document.getElementById('openImportModalBtn');
    const closeBtns = document.querySelectorAll('.modal-close-btn');

    if (importBtn) {
        importBtn.onclick = () => ui.toggleModal('importModal', true);
    }

    // Upload Modal
    const uploadBtn = document.getElementById('openUploadModalBtn');
    if (uploadBtn) {
        uploadBtn.onclick = () => ui.toggleModal('uploadModal', true);
    }

    // Generic Close Handler
    closeBtns.forEach(btn => {
        btn.onclick = () => {
            const modalId = btn.dataset.modal;
            ui.toggleModal(modalId, false);
        };
    });
}

/**
 * Bindings for Context Inspector (Column 3).
 * Attaches hover/focus events to data-inspect elements.
 */
function setupInspectorListeners() {
    const inspectables = document.querySelectorAll('[data-inspect]');

    inspectables.forEach(el => {
        const handleInspect = () => {
            const type = el.dataset.inspect;
            let data = {};

            switch (type) {
                case 'temp':
                    data = { label: "Temperature", range: "0.0 - 2.0", desc: "Controls randomness. Lower values are more deterministic; higher values are more creative." };
                    ui.updateInspector('param', data);
                    break;
                case 'top_p':
                    data = { label: "Top P (Nucleus)", range: "0.0 - 1.0", desc: "Limits the token pool to the top cumulative probability P. Filters out unlikely tokens." };
                    ui.updateInspector('param', data);
                    break;
                case 'max_tokens':
                    data = { label: "Max Output Tokens", range: "128 - 32k", desc: "Hard limit on response length. Set high (8192+) for Chain-of-Thought reasoning." };
                    ui.updateInspector('param', data);
                    break;
                case 'rep_penalty':
                    data = { label: "Repetition Penalty", range: "1.0 - 2.0", desc: "Penalizes tokens that have already appeared. Helps prevent looping in visual descriptions." };
                    ui.updateInspector('param', data);
                    break;
                case 'lora_scale':
                    data = { label: "LoRA Scale Factor", range: "0.0 - 2.0", desc: "Multiplies the influence of the adapter weights. >1.0 amplifies the specific training behavior." };
                    ui.updateInspector('param', data);
                    break;
                case 'hifi_mode':
                    data = { label: "High-Fidelity Mode", range: "Boolean", desc: "Loads model in native BFloat16 precision instead of 4-bit NF4 quantization. Requires ~2x VRAM." };
                    ui.updateInspector('param', data);
                    break;
                case 'force_mode':
                    data = { label: "Force Load", range: "Boolean", desc: "Bypasses safety checks preventing mismatched adapters (e.g. Qwen adapter on Llama base)." };
                    ui.updateInspector('param', data);
                    break;
                case 'model_select':
                    if (el.value) ui.updateInspector('model', { id: el.value });
                    break;
                // Add more cases as needed
            }
        };

        el.addEventListener('focus', handleInspect);
        el.addEventListener('mouseenter', handleInspect);

        // Special case for selects to update on change
        if (el.tagName === 'SELECT') {
            el.addEventListener('change', () => {
                if (el.id === 'modelSelect') ui.updateInspector('model', { id: el.value });
                // Adapter changes handled in adapter_manager via manual call
            });
        }
    });
}

/**
 * Global UI Bindings (Reset, Window Size, etc.)
 */
function setupGlobalControls() {
    const els = {
        resetBtn: document.getElementById('resetPlaygroundBtn'),
        winInc: document.getElementById('winInc'),
        winDec: document.getElementById('winDec'),
        windowInput: document.getElementById('windowSize'),
        promptToggle: document.getElementById('promptToggle'),
        promptBody: document.getElementById('promptBody')
    };

    if (els.resetBtn) {
        els.resetBtn.addEventListener('click', () => {
            store.reset();
            ui.resetHUD();
            ui.toggleViewState('config');
            sessionMgr.refreshList();
            fileMgr.clearActiveFile();
            adapterMgr.updateOptions(); // Reset filters
        });
    }

    if (els.winInc) {
        els.winInc.onclick = () => {
            const val = parseInt(els.windowInput.value);
            if (val < 128) els.windowInput.value = val + 8;
        };
    }

    if (els.winDec) {
        els.winDec.onclick = () => {
            const val = parseInt(els.windowInput.value);
            if (val > 8) els.windowInput.value = val - 8;
        };
    }

    if (els.promptToggle) {
        els.promptToggle.onclick = () => {
            const isHidden = els.promptBody.style.display === 'none';
            els.promptBody.style.display = isHidden ? 'block' : 'none';
            const icon = els.promptToggle.querySelector('i');
            if (icon) {
                icon.className = isHidden ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
            }
        };
    }

    window.skipToShot = (offset) => import('./player_view.js').then(m => m.skipToShot(offset));
    window.skipToScene = (offset) => import('./player_view.js').then(m => m.skipToScene(offset));
}

/**
 * Bindings for Debug Console.
 */
function setupDebugListeners() {
    const toggleBtn = document.getElementById('toggleDebugBtn');
    const debugContent = document.getElementById('debugContent');
    const debugTabs = document.querySelectorAll('.debug-tab');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', async () => {
            const isNowVisible = ui.toggleDebugPanel();
            if (isNowVisible && store.activeSessionId) {
                try {
                    activeLogs = await api.fetchSessionLogs(store.activeSessionId);
                    debugConsole.renderDebugPanelContent(debugContent, activeLogs, activeDebugTab);
                } catch (err) {
                    if (debugContent) debugContent.innerHTML = `<div class="sys-label" style="color:var(--break-border)">${err.message}</div>`;
                }
            }
        });
    }

    debugTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            activeDebugTab = tab.dataset.log;
            ui.setActiveDebugTab(activeDebugTab);
            debugConsole.renderDebugPanelContent(debugContent, activeLogs, activeDebugTab);
        });
    });
}

// Bootstrap
document.addEventListener('DOMContentLoaded', init);