/**
 * Playground Debug Console Module.
 * Handles top-level switching between Pipeline and Interaction logs,
 * and manages micro-tabs within each interaction card for deep inspection.
 */

/**
 * Renders the debug content into the provided container based on active tab.
 * @param {HTMLElement} container - The content div of the debug panel.
 * @param {Object} logs - { pipeline: string, debug: array }
 * @param {string} activeTab - 'pipeline' or 'logs'
 */
export function renderDebugPanelContent(container, logs, activeTab = 'pipeline') {
    if (!container) return;
    container.innerHTML = '';

    if (activeTab === 'pipeline') {
        const pre = document.createElement('div');
        pre.className = 'pipeline-log-text';
        pre.innerHTML = formatPipelineLog(logs.pipeline);
        container.appendChild(pre);
    }
    else {
        const wrapper = document.createElement('div');
        if (!logs.debug || logs.debug.length === 0) {
            wrapper.innerHTML = '<div class="sys-label" style="text-align:center; padding:3rem;">No interaction data captured yet.</div>';
        } else {
            logs.debug.forEach((entry, idx) => {
                wrapper.appendChild(createDebugEntry(entry, idx));
            });
        }
        container.appendChild(wrapper);
    }
}

/**
 * Formats pipeline log text with timestamp highlighting.
 */
function formatPipelineLog(text) {
    if (!text) return '<div class="sys-label">No pipeline trace found.</div>';
    // Highlight timestamps in the log text
    return text.replace(/\[(\d{2}:\d{2}:\d{2})\]/g, '<span class="ts">[$1]</span>');
}

/**
 * Creates a visual card for a single VLM interaction entry with integrated micro-tabs.
 * Tabs: Prompt (Input), Thinking (Process), Response (Output).
 */
function createDebugEntry(entry, index) {
    const card = document.createElement('div');
    card.className = 'debug-entry';

    const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : 'Unknown Time';

    // Metadata Header & Interaction Index
    card.innerHTML = `
        <div class="entry-header">
            <span>INTERACTION #${index + 1}</span>
            <span>${time}</span>
        </div>
        <div class="entry-body">
            <!-- Metadata Bar -->
            <div style="padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-light); font-size: 0.6rem; color: var(--text-dim); display: flex; gap: 1.5rem;">
                <div>ID: <span class="json-string">"${entry.model}"</span></div>
                <div>TIME: <span class="json-num">${entry.usage?.inference_time || 0}s</span></div>
                <div>TOKENS: <span class="json-num">${entry.usage?.input_tokens || 0}</span> in / <span class="json-num">${entry.usage?.output_tokens || 0}</span> out</div>
            </div>

            <!-- Micro Tabs Navigation -->
            <div class="micro-tabs">
                <div class="micro-tab" data-target="prompt">Prompt</div>
                <div class="micro-tab" data-target="thinking">Thinking</div>
                <div class="micro-tab active" data-target="response">Response</div>
            </div>

            <!-- Micro Panes (Content) -->
            <div class="micro-content">
                <div class="micro-pane" data-pane="prompt">${entry.prompt_text || "No prompt data available."}</div>
                <div class="micro-pane" data-pane="thinking">${entry.thinking || "No thinking logs emitted for this batch."}</div>
                <div class="micro-pane active" data-pane="response">${entry.response_text || "[Empty Response]"}</div>
            </div>
        </div>
    `;

    // Logic: Localized Micro-Tab Switching
    const tabs = card.querySelectorAll('.micro-tab');
    const panes = card.querySelectorAll('.micro-pane');

    tabs.forEach(tab => {
        tab.onclick = () => {
            const target = tab.dataset.target;

            // Sync Tab styles
            tabs.forEach(t => t.classList.toggle('active', t === tab));

            // Sync Pane visibility
            panes.forEach(p => {
                const isTarget = p.dataset.pane === target;
                p.classList.toggle('active', isTarget);
            });
        };
    });

    return card;
}