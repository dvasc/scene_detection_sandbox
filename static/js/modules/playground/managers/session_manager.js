/**
 * Session Manager
 * Handles the loading, deletion, and hydration of archived inference sessions.
 * Manages the sidebar history list and state restoration.
 */

import { store } from '../store.js';
import * as api from '../service.js';
import * as ui from '../view.js';
import * as timeline from '../inference_timeline.js';
import * as player from '../player_view.js';

export class SessionManager {
    constructor() {
        this.init();
    }

    init() {
        // Load initial list
        this.refreshList();
    }

    async refreshList() {
        try {
            const sessions = await api.fetchSessions();
            ui.renderSessionList(
                sessions,
                (id) => this.hydrateSession(id), // On Select
                (id) => this.deleteSession(id)   // On Delete
            );
        } catch (err) {
            ui.logConsole(err.message, false, true);
        }
    }

    async deleteSession(id) {
        if (!confirm("Permanently delete this session and its assets?")) return;
        try {
            await api.deleteSessionApi(id);
            this.refreshList();
        } catch (err) {
            alert(err.message);
        }
    }

    async hydrateSession(sessionId) {
        try {
            ui.logConsole(`[ARCHIVE] Retrieving state for ${sessionId}...`);
            const data = await api.fetchSessionData(sessionId);

            store.inferenceResults = data.shots;
            store.activeSessionId = sessionId;

            // Restore Player & Timeline
            player.initPlayer(`/playground/${sessionId}/${data.metadata.video_filename}`);
            player.syncPlayer();
            timeline.renderTimeline(sessionId, (shot) => player.seekToShot(shot));

            // Restore HUD
            const perf = data.metadata.performance || {};
            const duration = perf.total_task ? perf.total_task.toFixed(1) + 's' : 'PERSISTED';
            ui.updateHUD(duration, data.metadata.model_id);

            // Switch View
            ui.toggleViewState('results');

        } catch (err) {
            console.error(err);
            alert("Failed to load archive: " + err.message);
        }
    }
}