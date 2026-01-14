/**
 * Session Manager
 * Handles the loading, deletion, and hydration of archived inference sessions.
 * Manages the sidebar history list and state restoration via MPA navigation.
 */

import { store } from '../store.js';
import * as api from '../service.js';
import * as ui from '../view.js';

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
                (id) => {
                    // MPA Navigation: Go to results page
                    window.location.href = `/playground/results/${id}`;
                },
                (id) => this.deleteSession(id)
            );
        } catch (err) {
            console.error(err);
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
}