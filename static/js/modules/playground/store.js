/**
 * Store.js
 * Playground State Store.
 * Centralized source of truth for the inference session.
 * This module manages reactive data for the timeline, player synchronization, 
 * and session metadata.
 */

export const store = {
    // Media & Assets
    videoFile: null,
    videoUrl: null,

    // Session Context
    activeSessionId: null,
    inferenceResults: [], // Array of shot metadata with is_scene_break flags

    // Navigation State
    currentShotIndex: -1,

    // Performance & Model Tracking
    totalInferenceTime: "0.0s",
    activeModelName: "NONE",

    /**
     * Resets the store to initial values for a clean task run.
     * Called when the user returns to the configuration screen.
     */
    reset() {
        this.videoFile = null;
        this.videoUrl = null;
        this.activeSessionId = null;
        this.inferenceResults = [];
        this.currentShotIndex = -1;
        this.totalInferenceTime = "0.0s";
        this.activeModelName = "NONE";
    }
};