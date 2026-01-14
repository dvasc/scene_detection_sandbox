/**
 * HUD UI Module
 * Handles updates to the Header Status Bar (Stats HUD).
 */

const getHud = () => ({
    container: document.getElementById('simHud')
});

export function resetHUD() {
    const hud = getHud();
    if (hud.container) hud.container.style.opacity = '0';
}

/**
 * Renders rich session metadata into the header HUD.
 * @param {Object} metadata - The full session metadata object from JSON.
 */
export function updateHUD(metadata) {
    const hud = getHud();
    if (!hud.container) return;

    hud.container.style.opacity = '1';
    hud.container.innerHTML = ''; // Clear previous content

    // Helper for formatting duration
    const formatDuration = (sec) => {
        if (sec === undefined || sec === null) return '0.0s';
        if (typeof sec === 'string') return sec;
        return sec.toFixed(1) + 's';
    };

    // 1. Model Name
    const modelId = metadata.model_id || 'Unknown';
    const modelName = modelId.split('/').pop();
    const modelTag = document.createElement('span');
    modelTag.className = 's-tag model';
    modelTag.style.marginRight = '8px';
    modelTag.title = modelId;
    modelTag.innerHTML = `<i class="fa-solid fa-brain" style="margin-right:4px;"></i> ${modelName}`;
    hud.container.appendChild(modelTag);

    // 2. Adapter (if present)
    if (metadata.adapter) {
        const adapterName = metadata.adapter.split(/[\\/]/).pop();
        const adapterTag = document.createElement('span');
        adapterTag.className = 's-tag';
        adapterTag.style.background = '#4c1d95';
        adapterTag.style.color = '#ddd6fe';
        adapterTag.style.marginRight = '8px';
        adapterTag.title = metadata.adapter;
        adapterTag.innerHTML = `<i class="fa-solid fa-puzzle-piece" style="margin-right:4px;"></i> ${adapterName}`;
        hud.container.appendChild(adapterTag);
    }

    // 3. Runtime
    const runtime = metadata.performance?.total_task;
    const runTag = document.createElement('span');
    runTag.className = 's-tag';
    runTag.style.marginRight = '8px';
    runTag.innerHTML = `<i class="fa-solid fa-stopwatch" style="margin-right:4px;"></i> ${formatDuration(runtime)}`;
    hud.container.appendChild(runTag);

    // 4. Hyperparameters
    const p = metadata.inference_params || {};
    const tags = [];

    if (p.temperature !== undefined) tags.push(`T:${p.temperature}`);
    if (p.top_p !== undefined) tags.push(`P:${p.top_p}`);
    if (p.max_tokens !== undefined) tags.push(`Tk:${p.max_tokens}`);
    if (p.repetition_penalty !== undefined) tags.push(`Rep:${p.repetition_penalty}`);
    if (metadata.window_size) tags.push(`Win:${metadata.window_size}`);

    tags.forEach(text => {
        const t = document.createElement('span');
        t.className = 's-tag';
        t.style.marginRight = '4px';
        t.innerText = text;
        hud.container.appendChild(t);
    });

    // 5. Special Modes
    if (p.lora_scale !== undefined && p.lora_scale !== 1.0) {
        const scaleTag = document.createElement('span');
        scaleTag.className = 's-tag';
        scaleTag.innerText = `Scale:${p.lora_scale}`;
        hud.container.appendChild(scaleTag);
    }

    if (p.high_fidelity_mode) {
        const hifi = document.createElement('span');
        hifi.className = 's-tag';
        hifi.style.background = 'var(--success)';
        hifi.style.color = '#000';
        hifi.style.fontWeight = '800';
        hifi.innerText = 'HiFi';
        hud.container.appendChild(hifi);
    }

    if (p.bypass_validation) {
        const force = document.createElement('span');
        force.className = 's-tag';
        force.style.background = 'var(--break-border)';
        force.style.color = '#fff';
        force.innerText = 'FORCE';
        hud.container.appendChild(force);
    }
}