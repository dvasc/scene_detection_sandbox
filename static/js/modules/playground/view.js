/**
 * View.js
 * Playground UI Module.
 * Handles DOM manipulation, view state transitions, hierarchical terminal 
 * rendering, and history list synchronization.
 */

import { store } from './store.js';

// DOM Element Registry
const getViews = () => ({
    config: document.getElementById('configView'),
    processing: document.getElementById('processingView'),
    results: document.getElementById('resultsView')
});

const getHud = () => ({
    container: document.getElementById('simHud'),
    time: document.getElementById('inferenceTime'),
    badge: document.getElementById('modeBadge')
});

const getDebug = () => ({
    panel: document.getElementById('debugPanel'),
    btn: document.getElementById('toggleDebugBtn'),
    tabs: document.querySelectorAll('.debug-tab')
});

const getInspector = () => ({
    content: document.getElementById('inspectorContent')
});

let lastRenderedLogCount = 0;

/**
 * Transitions between the three primary application states.
 * @param {string} state - 'config', 'processing', or 'results'
 */
export function toggleViewState(state) {
    const views = getViews();
    Object.values(views).forEach(v => {
        if (v) v.classList.remove('active');
    });
    if (views[state]) {
        views[state].classList.add('active');
    }

    if (state !== 'results') {
        hideDebugPanel();
    }

    if (state === 'config') {
        lastRenderedLogCount = 0;
        const consoleEl = document.getElementById('consoleLog');
        if (consoleEl) consoleEl.innerHTML = '';

        // Reset Inspector on config return
        const inspector = getInspector();
        if (inspector.content) {
            inspector.content.innerHTML = `
                <div class="placeholder-state">
                    <i class="fa-solid fa-crosshairs"></i>
                    <p>Hover over a parameter or select an asset to view technical details.</p>
                </div>
            `;
        }
    }
}

/**
 * Updates the content of the Context Inspector Panel (Column 3).
 * @param {string} type - The category of information ('model', 'adapter', 'param').
 * @param {Object} data - The data object to render.
 */
export function updateInspector(type, data) {
    const container = getInspector().content;
    if (!container) return;

    let html = '';

    if (type === 'model') {
        // Find VRAM capability match
        // Note: GPU caps are passed via server template, but we can infer or pass via JS global
        html = `
            <div class="info-tile">
                <span class="info-label">Selected Checkpoint</span>
                <span class="info-val" style="color:var(--accent);">${data.id}</span>
                <div class="info-desc">
                    Base Foundation Model. Defines the primary reasoning capabilities and visual encoder resolution.
                </div>
            </div>
            <div class="info-tile">
                <span class="info-label">Family</span>
                <span class="info-val">${data.id.toLowerCase().includes('qwen') ? 'Qwen2-VL' : 'Unknown / Cloud'}</span>
            </div>
        `;
    }
    else if (type === 'adapter') {
        html = `
            <div class="info-tile">
                <span class="info-label">Active LoRA Adapter</span>
                <span class="info-val" style="color:var(--purple-accent);">${data.name}</span>
            </div>
            <div class="info-tile">
                <span class="info-label">Training Rank (r)</span>
                <span class="info-val">${data.rank || 'N/A'}</span>
            </div>
            <div class="info-tile">
                <span class="info-label">Alpha Scaling (α)</span>
                <span class="info-val">${data.alpha || 'N/A'}</span>
            </div>
            <div class="info-desc">
                Targeted fine-tuning layer. Modifies attention weights to specialize in narrative boundary detection.
            </div>
        `;
    }
    else if (type === 'param') {
        html = `
            <div class="info-tile">
                <span class="info-label">Parameter Focus</span>
                <span class="info-val" style="color:var(--success);">${data.label}</span>
            </div>
            <div class="info-tile">
                <span class="info-label">Typical Range</span>
                <span class="info-val">${data.range}</span>
            </div>
            <div class="info-desc">
                ${data.desc}
            </div>
        `;
    }

    container.innerHTML = html;
}

/**
 * Helper to open/close system modal dialogs.
 */
export function toggleModal(modalId, visible) {
    const dialog = document.getElementById(modalId);
    if (!dialog) return;

    if (visible) {
        dialog.showModal();
    } else {
        dialog.close();
    }
}

/**
 * Toggles the visibility of the overlay debug panel.
 */
export function toggleDebugPanel() {
    const debug = getDebug();
    if (!debug.panel) return false;
    const isActive = debug.panel.classList.toggle('active');
    if (debug.btn) debug.btn.classList.toggle('btn-primary', isActive);
    return isActive;
}

export function hideDebugPanel() {
    const debug = getDebug();
    if (debug.panel) debug.panel.classList.remove('active');
    if (debug.btn) debug.btn.classList.remove('btn-primary');
}

export function setActiveDebugTab(logType) {
    const debug = getDebug();
    debug.tabs.forEach(tab => {
        const isMatch = tab.dataset.log === logType;
        tab.classList.toggle('active', isMatch);
    });
}

export function updateHUD(duration, modelName) {
    const hud = getHud();
    if (hud.container) {
        hud.container.style.opacity = '1';
        hud.time.textContent = duration;
        hud.badge.textContent = modelName.split('/').pop();
    }
}

export function resetHUD() {
    const hud = getHud();
    if (hud.container) hud.container.style.opacity = '0';
}

/**
 * Hierarchical Terminal Renderer.
 */
export function logConsole(content, isSuccess = false, isError = false) {
    const consoleEl = document.getElementById('consoleLog');
    if (!consoleEl) return;

    if (Array.isArray(content)) {
        const newLines = content.slice(lastRenderedLogCount);
        if (newLines.length === 0) return;

        newLines.forEach(line => renderStyledLine(consoleEl, line));
        lastRenderedLogCount = content.length;
    }
    else {
        const hasLevelTag = /\[(CLIENT|PIPELINE|SCENE_DETECT|VLM|TOKEN|PROMPT|ERROR)\]/.test(content);
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const finalLine = hasLevelTag
            ? `[${timestamp}] ${content}`
            : `[${timestamp}] [CLIENT] ${content}`;

        renderStyledLine(consoleEl, finalLine, isSuccess, isError);
    }

    consoleEl.scrollTop = consoleEl.scrollHeight;
}

function renderStyledLine(container, rawLine, forceSuccess = false, forceError = false) {
    const div = document.createElement('div');
    div.className = 'log-line';

    let styled = rawLine.replace(/\[(\d{2}:\d{2}:\d{2})\]/g, '<span class="ts">[$1]</span>');

    const levelColors = {
        'CLIENT': 'var(--accent)',
        'PIPELINE': '#818cf8',
        'SCENE_DETECT': '#10b981',
        'PROMPT': '#fbbf24',
        'VLM': '#a78bfa',
        'TOKEN': '#22d3ee',
        'ERROR': 'var(--break-border)'
    };

    Object.entries(levelColors).forEach(([level, color]) => {
        const regex = new RegExp(`\\[${level}\\]`, 'g');
        styled = styled.replace(regex, `<span style="color:${color}; font-weight:900;">[${level}]</span>`);
    });

    styled = styled.replace(/→/g, '<span style="color:var(--accent); font-weight:bold;">→</span>');
    styled = styled.replace(/✓/g, '<span style="color:var(--success); font-weight:bold;">✓</span>');
    styled = styled.replace(/🎬/g, '<span style="filter: drop-shadow(0 0 2px var(--accent))">🎬</span>');

    if (forceSuccess || styled.includes('COMPLETE') || styled.includes('Inference Complete') || styled.includes('✓')) {
        div.style.color = 'var(--success)';
    }
    if (forceError || styled.includes('[ERROR]') || styled.includes('FAILURE')) {
        div.style.color = 'var(--break-border)';
    }

    div.innerHTML = styled;
    container.appendChild(div);
}

export function updateProgressBar(pct) {
    const progressBar = document.getElementById('progressBar');
    if (progressBar) progressBar.style.width = `${pct}%`;
}

/**
 * Renders the session history archive.
 * Displays ALL configuration parameters in the s-meta block.
 */
export function renderSessionList(sessions, onSelect, onDelete) {
    const listContainer = document.getElementById('sessionList');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (!sessions.length) {
        listContainer.innerHTML = `
            <div class="sys-label" style="text-align:center; padding:3rem; opacity:0.3;">
                Evaluation archive is empty.
            </div>`;
        return;
    }

    sessions.forEach(s => {
        const item = document.createElement('div');
        item.className = 'session-item';

        const date = new Date(s.timestamp).toLocaleString();
        const modelName = s.model_id.split('/').pop();

        const formatDuration = (sec) => {
            if (sec === undefined || sec === null) return '00:00:00.000';
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = Math.floor(sec % 60);
            const ms = Math.round((sec % 1) * 1000);
            const pad = (n, z = 2) => n.toString().padStart(z, '0');
            return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
        };

        const runtime = s.duration ? formatDuration(s.duration) : 'ARCHIVED';
        const videoDur = s.video_duration ? formatDuration(s.video_duration) : null;

        const p = s.inference_params || {};
        let paramTags = '';

        // Core Hyperparameters
        if (p.temperature !== undefined) paramTags += `<span class="s-tag">T:${p.temperature}</span>`;
        if (p.top_p !== undefined) paramTags += `<span class="s-tag">P:${p.top_p}</span>`;
        if (p.max_tokens !== undefined) paramTags += `<span class="s-tag">Tk:${p.max_tokens}</span>`;
        if (p.repetition_penalty !== undefined) paramTags += `<span class="s-tag">Rep:${p.repetition_penalty}</span>`;

        // LoRA Scaling
        if (p.lora_scale !== undefined && p.lora_scale !== 1.0) {
            paramTags += `<span class="s-tag">Scale:${p.lora_scale}</span>`;
        }

        // Special Modes
        if (p.high_fidelity_mode) {
            paramTags += `<span class="s-tag" style="background:var(--success); color:#000; border-color:var(--success); font-weight:800;">HiFi</span>`;
        }

        if (p.bypass_validation) {
            paramTags += `<span class="s-tag" style="background:var(--break-border); color:#fff; border-color:var(--break-border);">FORCE</span>`;
        }

        item.innerHTML = `
            <div class="s-top">
                <span class="s-name" title="${s.video_filename}">${s.video_filename}</span>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="s-date">${date}</span>
                    <i class="fa-solid fa-trash" style="font-size:0.7rem; color:var(--text-muted); cursor:pointer;" 
                       title="Delete Session" data-delete="${s.session_id}"></i>
                </div>
            </div>
            <div class="s-meta">
                <span class="s-tag model" title="${s.model_id}">${modelName}</span>
                ${s.adapter ? `<span class="s-tag" style="background:#4c1d95; color:#ddd6fe;" title="${s.adapter}">Adapter: ${s.adapter.split(/[\\\\/]/).pop()}</span>` : ''}
                ${videoDur ? `<span class="s-tag">Dur: ${videoDur}</span>` : ''}
                <span class="s-tag">Win: ${s.window_size}</span>
                <span class="s-tag">Run: ${runtime}</span>
                ${paramTags}
            </div>
        `;

        const delBtn = item.querySelector('[data-delete]');
        delBtn.onclick = (e) => {
            e.stopPropagation();
            onDelete(s.session_id);
        };

        item.onclick = () => onSelect(s.session_id);
        listContainer.appendChild(item);
    });
}