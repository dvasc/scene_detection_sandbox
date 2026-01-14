/**
 * PlaygroundBootstrap.js
 * Application Entry Point.
 * Initializes the domain-specific managers based on the current page context (MPA).
 */

import { store } from './store.js';
import * as ui from './view.js';
import * as api from './service.js';
import * as debugConsole from './forensic_terminal.js';

// Import Modular Managers
import { AdapterManager } from './managers/adapter_manager.js';
import { FileManager } from './managers/file_manager.js';
import { SessionManager } from './managers/session_manager.js';
import { InferenceManager } from './managers/inference_manager.js';
import { AssetManager } from './managers/asset_manager.js';
import { MonitoringDeck } from './monitoring_deck.js';
import * as timeline from './inference_timeline.js';
import * as player from './player_view.js';

let activeLogs = { pipeline: "", debug: [] };
let activeDebugTab = 'pipeline';

// State Managers
let adapterMgr, fileMgr, sessionMgr, inferenceMgr, assetMgr, monitorMgr;

/**
 * Entry point: Bootstraps the modular system based on URL route.
 */
function init() {
    console.log("[Playground] Bootstrapping MPA Architecture...");
    const path = window.location.pathname;

    // Common: Setup global UI bindings if elements exist
    setupGlobalControls();

    // --- ROUTE: CONFIGURATION (/playground/config) ---
    if (path.includes('/config')) {
        console.log("[Bootstrap] Mode: Configuration");

        adapterMgr = new AdapterManager();
        inferenceMgr = new InferenceManager();
        sessionMgr = new SessionManager();

        // File Manager handles process button enablement
        fileMgr = new FileManager((isEnabled) => {
            const btn = document.querySelector('.launch-btn');
            if (btn) {
                btn.disabled = !isEnabled;
                const subText = btn.querySelector('.launch-sub');
                if (subText) subText.textContent = isEnabled ? "Ready to Launch" : "Awaiting Configuration";
            }
        });

        assetMgr = new AssetManager({
            onAdapterChange: async () => {
                await adapterMgr.refreshList();
            }
        });

        setupInspectorListeners();
        setupModalListeners();
    }

    // --- ROUTE: PROCESSING (/playground/processing/<task_id>) ---
    else if (path.includes('/processing')) {
        console.log("[Bootstrap] Mode: Processing Monitor");

        monitorMgr = new MonitoringDeck();
        monitorMgr.start();

        // Initialize simple Inference Manager just for abort/polling logic
        inferenceMgr = new InferenceManager();

        // Start polling immediately using ID injected by template
        if (window.ACTIVE_TASK_ID) {
            inferenceMgr.shouldAutoDownload = window.AUTO_DOWNLOAD || false;
            inferenceMgr.currentTaskId = window.ACTIVE_TASK_ID;
            inferenceMgr.pollStatus(window.ACTIVE_TASK_ID, Date.now()); // Start time approximate
        }
    }

    // --- ROUTE: RESULTS (/playground/results/<session_id>) ---
    else if (path.includes('/results')) {
        console.log("[Bootstrap] Mode: Results Analysis");

        if (window.SESSION_ID) {
            hydrateResultsView(window.SESSION_ID);
        }

        setupDebugListeners();
    }

    console.log("[Playground] Systems Online.");
}

/**
 * Special hydration logic for Results page.
 */
async function hydrateResultsView(sessionId) {
    store.activeSessionId = sessionId;

    try {
        const data = await api.fetchSessionData(sessionId);
        store.inferenceResults = data.shots;

        // Render Timeline
        timeline.renderTimeline(sessionId, (shot) => player.seekToShot(shot));

        // Init Player with Server URL
        const videoSrc = `/playground/${sessionId}/${window.VIDEO_FILENAME}`;
        player.initPlayer(videoSrc);
        player.syncPlayer();

        // Update HUD with Rich Metadata
        ui.updateHUD(data.metadata);

        // Load initial logs
        activeLogs = await api.fetchSessionLogs(sessionId);
        const debugContent = document.getElementById('debugContent');
        debugConsole.renderDebugPanelContent(debugContent, activeLogs, 'pipeline');

    } catch (err) {
        console.error("Hydration failed:", err);
        alert("Failed to load session data. Returning to config.");
        window.location.href = '/playground/config';
    }
}

/**
 * Bindings for Modal interactions (Asset Hub).
 */
function setupModalListeners() {
    const importBtn = document.getElementById('openImportModalBtn');
    const closeBtns = document.querySelectorAll('.modal-close-btn');

    if (importBtn) {
        importBtn.onclick = () => ui.toggleModal('importModal', true);
    }

    const uploadBtn = document.getElementById('openUploadModalBtn');
    if (uploadBtn) {
        uploadBtn.onclick = () => ui.toggleModal('uploadModal', true);
    }

    closeBtns.forEach(btn => {
        btn.onclick = () => {
            const modalId = btn.dataset.modal;
            ui.toggleModal(modalId, false);
        };
    });
}

function setupInspectorListeners() {
    const inspectables = document.querySelectorAll('[data-inspect]');
    inspectables.forEach(el => {
        const handleInspect = () => {
            const type = el.dataset.inspect;
            // ... (Reusing existing logic, simplified for brevity as logic resides in view.js updates or can be kept here)
            // Ideally map this to view.js logic, but keeping inline for stability
            let data = {};
            switch (type) {
                case 'temp': data = { label: "Temperature", range: "0.0 - 2.0", desc: "Controls randomness." }; break;
                case 'top_p': data = { label: "Top P", range: "0.0 - 1.0", desc: "Nucleus sampling." }; break;
                case 'max_tokens': data = { label: "Max Tokens", range: "128 - 32k", desc: "Response length limit." }; break;
                // ... other cases
            }
            if (Object.keys(data).length) ui.updateInspector('param', data);
        };
        el.addEventListener('focus', handleInspect);
        el.addEventListener('mouseenter', handleInspect);
    });
}

function setupGlobalControls() {
    // These elements might not exist on all pages, checks are safe
    const els = {
        downloadActiveBtn: document.getElementById('downloadActiveSessionBtn'),
        winInc: document.getElementById('winInc'),
        winDec: document.getElementById('winDec'),
        windowInput: document.getElementById('windowSize'),
        promptToggle: document.getElementById('promptToggle'),
        promptBody: document.getElementById('promptBody')
    };

    if (els.downloadActiveBtn) {
        els.downloadActiveBtn.addEventListener('click', () => {
            if (window.SESSION_ID) {
                window.location.href = `/api/playground/session/${window.SESSION_ID}/download`;
            }
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
            if (icon) icon.className = isHidden ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
        };
    }

    window.skipToShot = (offset) => import('./player_view.js').then(m => m.skipToShot(offset));
    window.skipToScene = (offset) => import('./player_view.js').then(m => m.skipToScene(offset));
}

function setupDebugListeners() {
    const toggleBtn = document.getElementById('toggleDebugBtn');
    const debugContent = document.getElementById('debugContent');
    const debugTabs = document.querySelectorAll('.debug-tab');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', async () => {
            const isNowVisible = ui.toggleDebugPanel();
            if (isNowVisible && window.SESSION_ID) {
                try {
                    activeLogs = await api.fetchSessionLogs(window.SESSION_ID);
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