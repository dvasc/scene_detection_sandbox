/**
 * InferenceTimeline.js
 * Playground Timeline Module.
 * Responsible for rendering the forensic shot grid and grouping results into
 * narrative scene blocks based on VLM output.
 */

import { store } from './store.js';

const getGridContainer = () => document.getElementById('shotGrid');

/**
 * Main entry point for rendering the narrative results.
 * Groups technical shots into logical scenes and injects them into the DOM.
 */
export function renderTimeline(sessionId, onShotClick) {
    const gridContainer = getGridContainer();
    if (!gridContainer) return;
    gridContainer.innerHTML = '';

    let sceneBuffer = [];
    let sceneCount = 1;

    store.inferenceResults.forEach((shot, idx) => {
        // Narrative boundary logic: if shot is marked as break, start a new scene block
        if (shot.is_scene_break && idx !== 0) {
            injectSceneBlock(gridContainer, sceneBuffer, sceneCount++, sessionId, onShotClick);
            sceneBuffer = [];
        }
        sceneBuffer.push(shot);
    });

    // Flush the final scene block
    if (sceneBuffer.length > 0) {
        injectSceneBlock(gridContainer, sceneBuffer, sceneCount, sessionId, onShotClick);
    }
}

/**
 * Internal helper to create a scene container with a header and its constituent shot cards.
 */
function injectSceneBlock(container, shots, index, sessionId, onShotClick) {
    if (!shots.length) return;

    const head = shots[0];
    const tail = shots[shots.length - 1];
    const duration = tail.end_time - head.start_time;

    // Determine unity logic label from the head shot (defaulting to a generic unity tag)
    const unityLabel = (head.scene_logic && head.scene_logic.case_type)
        ? head.scene_logic.case_type.replace(/_/g, ' ')
        : 'NARRATIVE UNITY';

    // 1. Construct Scene Header
    const header = document.createElement('div');
    header.className = 'scene-header-card';
    header.innerHTML = `
        <div class="scene-title">
            <div class="scene-info">
                <span class="scene-index">Scene ${index}</span>
                <span class="scene-meta">${shots.length} shots | ${formatTime(duration)}</span>
            </div>
            <div class="sys-label" style="color: var(--success); font-weight: 900; font-size: 0.55rem;">
                <i class="fa-solid fa-link" style="margin-right: 4px;"></i> ${unityLabel}
            </div>
        </div>
    `;
    container.appendChild(header);

    // 2. Construct Shot Cards
    shots.forEach(shot => {
        const card = document.createElement('div');
        card.className = `shot-card ${shot.is_scene_break ? 'is-break' : ''}`;
        card.id = `card-${shot.shot_id}`;
        card.dataset.time = shot.start_time;

        // Resolve thumbnail URL from the session frames directory
        let thumbUrl = "";
        if (shot.image_paths && shot.image_paths.length > 0) {
            const filename = shot.image_paths[0].split(/[/\\]/).pop();
            thumbUrl = `/playground/${sessionId}/frames/${filename}`;
        }

        // Logic for displaying the VLM reasoning trace on boundary shots
        let reasoningHtml = '';
        if (shot.is_scene_break && shot.logic_analysis && shot.logic_analysis.reasoning) {
            const logicText = shot.logic_analysis.reasoning.replace(/\n/g, '<br>');
            reasoningHtml = `
                <div class="card-body">
                    <div class="meta-row">
                        <span class="meta-label" style="color: var(--break-border); opacity: 1;">Forensic Audit Logic</span>
                        <div class="scroll-box" style="border-left: 2px solid var(--break-border); background: rgba(0,0,0,0.4); color: var(--text-main); max-height: 300px;">
                            ${logicText}
                        </div>
                    </div>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="card-header">
                <span>${shot.shot_id}</span>
                <span>${formatTime(shot.start_time)}</span>
            </div>
            <div class="thumb-container">
                <img src="${thumbUrl}" alt="Frame" onerror="this.style.display='none'">
            </div>
            ${reasoningHtml}
        `;

        // Interactivity: Bind seek to shot
        card.onclick = () => onShotClick(shot);
        container.appendChild(card);
    });
}

/**
 * Synchronizes visual selection in the timeline grid with the current video playhead.
 * @param {string} id - The Shot ID to highlight.
 */
export function updateActiveHighlight(id) {
    const gridContainer = getGridContainer();
    if (!gridContainer) return;

    // Clear existing selection
    gridContainer.querySelectorAll('.shot-card.active').forEach(el => {
        el.classList.remove('active');
    });

    // Apply highlight and scroll into view
    const target = document.getElementById(`card-${id}`);
    if (target) {
        target.classList.add('active');
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

/**
 * Utility: Formats seconds into a standard MM:SS timecode.
 */
function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}