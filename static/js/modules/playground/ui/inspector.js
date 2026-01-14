/**
 * Inspector UI Module
 * Handles updates to the Context Inspector (Right Sidebar Column).
 */

const getInspector = () => ({
    content: document.getElementById('inspectorContent')
});

export function resetInspector() {
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

/**
 * Updates the content of the Context Inspector Panel.
 * @param {string} type - The category of information ('model', 'adapter', 'param').
 * @param {Object} data - The data object to render.
 */
export function updateInspector(type, data) {
    const container = getInspector().content;
    if (!container) return;

    let html = '';

    if (type === 'model') {
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