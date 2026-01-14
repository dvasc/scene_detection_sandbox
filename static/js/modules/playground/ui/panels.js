/**
 * Panels UI Module
 * Handles system modals and the debug panel overlay logic.
 */

const getDebug = () => ({
    panel: document.getElementById('debugPanel'),
    btn: document.getElementById('toggleDebugBtn'),
    tabs: document.querySelectorAll('.debug-tab')
});

/**
 * Helper to open/close system modal dialogs.
 */
export function toggleModal(modalId, visible) {
    const dialog = document.getElementById(modalId);
    if (!dialog) return;

    if (visible) {
        dialog.showModal();
    } else {
        dialog.close();
    }
}

/**
 * Toggles the visibility of the overlay debug panel.
 */
export function toggleDebugPanel() {
    const debug = getDebug();
    if (!debug.panel) return false;
    const isActive = debug.panel.classList.toggle('active');
    if (debug.btn) debug.btn.classList.toggle('btn-primary', isActive);
    return isActive;
}

export function hideDebugPanel() {
    const debug = getDebug();
    if (debug.panel) debug.panel.classList.remove('active');
    if (debug.btn) debug.btn.classList.remove('btn-primary');
}

export function setActiveDebugTab(logType) {
    const debug = getDebug();
    debug.tabs.forEach(tab => {
        const isMatch = tab.dataset.log === logType;
        tab.classList.toggle('active', isMatch);
    });
}