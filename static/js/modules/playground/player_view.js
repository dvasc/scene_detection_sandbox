/**
 * PlayerView.js
 * Playground Video Player Module.
 * Manages media playback, high-contrast overlay synchronization, 
 * and playback-state navigation. Supports both Blob URLs and Server Paths.
 */

import { store } from './store.js';
import { updateActiveHighlight } from './inference_timeline.js';

let videoPlayer = null;
let overlay = null;

/**
 * Initializes the video element with a source.
 * @param {string} src - The URL (blob or path) of the video file to load.
 */
export function initPlayer(src) {
    videoPlayer = document.getElementById('videoPlayer');
    overlay = document.getElementById('overlayShotId');

    if (!videoPlayer) return;

    // Simple check to avoid reloading if src is identical
    const currentSrc = videoPlayer.getAttribute('src');
    if (currentSrc !== src) {
        videoPlayer.src = src;
        videoPlayer.load();
    }
}

/**
 * Attaches the timecode synchronization loop.
 * Updates the timeline UI and the on-screen overlay as the video plays.
 */
export function syncPlayer() {
    if (!videoPlayer) return;

    videoPlayer.ontimeupdate = () => {
        const t = videoPlayer.currentTime;

        // Perform range scan to identify the shot currently under the playhead
        const shotIdx = store.inferenceResults.findIndex(s =>
            t >= s.start_time && t < s.end_time
        );

        if (shotIdx !== -1 && shotIdx !== store.currentShotIndex) {
            store.currentShotIndex = shotIdx;
            const activeShot = store.inferenceResults[shotIdx];

            // Update global storyboard highlight
            updateActiveHighlight(activeShot.shot_id);

            // Update high-contrast HUD overlay
            if (overlay) {
                overlay.textContent = activeShot.shot_id;
                overlay.style.display = 'block';
            }
        }
    };
}

/**
 * Navigates the playhead by a relative number of technical shots.
 * @param {number} offset - Relative index change (e.g., -1 for previous shot).
 */
export function skipToShot(offset) {
    if (!store.inferenceResults.length || !videoPlayer) return;

    const newIdx = Math.max(0, Math.min(
        store.currentShotIndex + offset,
        store.inferenceResults.length - 1
    ));

    const targetShot = store.inferenceResults[newIdx];
    videoPlayer.currentTime = targetShot.start_time;

    // Ensure UI selection is synced even if video is paused
    if (videoPlayer.paused) {
        updateActiveHighlight(targetShot.shot_id);
    }
}

/**
 * Jumps the playhead to the nearest narrative scene boundary.
 * @param {number} offset - Direction of search (1 for next, -1 for previous).
 */
export function skipToScene(offset) {
    if (!store.inferenceResults.length || !videoPlayer) return;

    let idx = store.currentShotIndex + offset;
    while (idx >= 0 && idx < store.inferenceResults.length) {
        if (store.inferenceResults[idx].is_scene_break) {
            const targetShot = store.inferenceResults[idx];
            videoPlayer.currentTime = targetShot.start_time;

            if (videoPlayer.paused) {
                updateActiveHighlight(targetShot.shot_id);
            }
            return;
        }
        idx += (offset > 0 ? 1 : -1);
    }
}

/**
 * Direct seek to a specific shot's start time.
 * @param {Object} shot - The shot metadata object.
 */
export function seekToShot(shot) {
    if (!videoPlayer) return;
    videoPlayer.currentTime = shot.start_time;

    // Manual UI sync for paused state
    if (videoPlayer.paused) {
        updateActiveHighlight(shot.shot_id);
    }
}