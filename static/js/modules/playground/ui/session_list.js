/**
 * Session List UI Module
 * Handles rendering of the Archive sidebar list.
 */

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
                <div class="session-actions-group">
                    <span class="s-date">${date}</span>
                    <button class="session-action-btn download" title="Download Session Archive (.zip)" data-download="${s.session_id}">
                        <i class="fa-solid fa-download"></i>
                    </button>
                    <button class="session-action-btn delete" title="Delete Session" data-delete="${s.session_id}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
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

        const dlBtn = item.querySelector('[data-download]');
        dlBtn.onclick = (e) => {
            e.stopPropagation();
            // Trigger direct download via API endpoint
            window.location.href = `/api/playground/session/${s.session_id}/download`;
        };

        item.onclick = () => onSelect(s.session_id);
        listContainer.appendChild(item);
    });
}