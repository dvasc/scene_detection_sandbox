/**
 * View.js (Facade)
 * Aggregates specialized UI modules for the Playground.
 * Acts as the single entry point for UI manipulation to maintain backward compatibility.
 */

// Import specialized UI modules
import {
    toggleModal,
    toggleDebugPanel,
    hideDebugPanel,
    setActiveDebugTab
} from './ui/panels.js';

import {
    updateInspector,
    resetInspector
} from './ui/inspector.js';

import {
    logConsole,
    updateProgressBar,
    clearConsole
} from './ui/console.js';

import {
    updateHUD,
    resetHUD
} from './ui/hud.js';

import {
    renderSessionList
} from './ui/session_list.js';

// Re-export functions for consumers
export {
    toggleModal,
    toggleDebugPanel,
    hideDebugPanel,
    setActiveDebugTab,
    updateInspector,
    resetInspector,
    logConsole,
    updateProgressBar,
    clearConsole,
    updateHUD,
    resetHUD,
    renderSessionList
};

/**
 * Transitions between the three primary application states.
 * Orchestrates the cleanup/reset of sub-components during transitions.
 * @param {string} state - 'config', 'processing', or 'results'
 */
export function toggleViewState(state) {
    const views = {
        config: document.getElementById('configView'),
        processing: document.getElementById('processingView'),
        results: document.getElementById('resultsView')
    };

    // Deactivate all views
    Object.values(views).forEach(v => {
        if (v) v.classList.remove('active');
    });

    // Activate target view
    if (views[state]) {
        views[state].classList.add('active');
    }

    // Side Effects & Cleanup
    if (state !== 'results') {
        hideDebugPanel();
    }

    if (state === 'config') {
        clearConsole();
        resetInspector();
    }
}