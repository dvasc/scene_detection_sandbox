/**
 * Adapter Manager
 * Handles the logic for fetching, filtering, selecting, and displaying adapter options.
 * Integrates with the new Inspector Panel for context-aware feedback.
 */

import * as api from '../service.js';
import * as ui from '../view.js'; // Import view to trigger inspector updates

export class AdapterManager {
    constructor() {
        this.els = {
            modelSelect: document.getElementById('modelSelect'),
            adapterInput: document.getElementById('adapterPath'),
            adapterMetaHint: document.getElementById('adapterMetaHint'),
            adapterContainer: document.getElementById('adapterContainer'),
            forceLoadCheckbox: document.getElementById('forceLoadAdapter')
        };

        // Cache for adapter metadata
        this.adapterCache = window.ADAPTER_MANIFEST || [];

        this.init();
    }

    init() {
        if (this.els.modelSelect) {
            this.els.modelSelect.addEventListener('change', () => this.updateOptions());
        }

        if (this.els.adapterInput) {
            this.els.adapterInput.addEventListener('change', () => this.handleSelection());
            // Add focus/hover hooks for Inspector
            this.els.adapterInput.addEventListener('focus', () => this.handleSelection());
            this.els.adapterInput.addEventListener('mouseenter', () => this.handleSelection());
        }

        if (this.els.forceLoadCheckbox) {
            this.els.forceLoadCheckbox.addEventListener('change', () => this.updateOptions());
        }

        // Initial state check
        this.updateOptions();
    }

    /**
     * Re-fetches the adapter list from the server and updates the UI.
     * Called by AssetManager after a successful upload.
     */
    async refreshList() {
        try {
            const adapters = await api.fetchAdapters();
            this.adapterCache = adapters;
            this.updateOptions();
            return true;
        } catch (e) {
            console.error("[AdapterManager] Failed to refresh list:", e);
            return false;
        }
    }

    /**
     * Determines if validation should be bypassed.
     */
    isForceMode() {
        return this.els.forceLoadCheckbox && this.els.forceLoadCheckbox.checked;
    }

    /**
     * Updates the Inspector panel based on current selection.
     */
    handleSelection() {
        const sel = this.els.adapterInput;
        if (!sel || sel.selectedIndex < 0) return;

        const opt = sel.options[sel.selectedIndex];

        if (sel.value === "") {
            // Default "None" selected
            ui.updateInspector('param', {
                label: "LoRA Adapter",
                range: "N/A",
                desc: "No adapter selected. Model will run in base configuration without specialized tuning."
            });
        } else {
            // Actual adapter selected
            const meta = {
                name: opt.textContent.split('(')[0].trim(),
                rank: opt.dataset.rank,
                alpha: opt.dataset.alpha,
                id: sel.value
            };
            ui.updateInspector('adapter', meta);
        }
    }

    /**
     * Updates the adapter dropdown options based on the selected base model
     * and the state of the Force Load checkbox.
     */
    updateOptions() {
        const selectedModel = this.els.modelSelect.value;
        const isCloud = window.CLOUD_MODELS && window.CLOUD_MODELS.includes(selectedModel);

        // Reset UI State
        if (this.els.adapterInput) {
            this.els.adapterInput.innerHTML = '<option value="">None (Base Model)</option>';
            this.els.adapterInput.disabled = true;
            this.els.adapterInput.value = "";
        }
        this.hideHint();

        // 1. Cloud Model or No Selection -> Hide Container
        if (!selectedModel || isCloud) {
            if (this.els.adapterContainer) this.els.adapterContainer.style.display = 'none';
            return;
        }

        // 2. Local Model Selected -> Show Container
        if (this.els.adapterContainer) this.els.adapterContainer.style.display = 'block';

        const isForce = this.isForceMode();

        // Helper: Get filename from path
        const getBasename = (path) => path ? path.split(/[/\\]/).pop() : '';
        const targetBaseName = getBasename(selectedModel);

        // Filter Logic
        let availableAdapters = [];

        if (isForce) {
            // FORCE MODE: Show everything
            availableAdapters = this.adapterCache;
        } else {
            // SAFE MODE: Filter by compatibility
            availableAdapters = this.adapterCache.filter(adapter => {
                if (!adapter.base_model) return false;
                const adapterBaseName = getBasename(adapter.base_model);
                // Strict match OR basename match
                return adapter.base_model === selectedModel || adapterBaseName === targetBaseName;
            });
        }

        // Populate Dropdown
        if (availableAdapters.length > 0) {
            this.els.adapterInput.disabled = false;

            availableAdapters.forEach(adapter => {
                const opt = document.createElement('option');
                opt.value = adapter.path;

                let label = adapter.name;
                if (adapter.rank && adapter.rank !== 'N/A') {
                    label += ` (r=${adapter.rank}, α=${adapter.alpha})`;
                }

                // Visual indicator for force mode mismatch
                if (isForce) {
                    const adapterBaseName = getBasename(adapter.base_model);
                    const isMatch = adapter.base_model === selectedModel || adapterBaseName === targetBaseName;
                    if (!isMatch) {
                        label = `⚠️ ${label}`;
                        opt.style.color = '#ffb800'; // Warning color
                    }
                }

                opt.textContent = label;
                opt.dataset.rank = adapter.rank;
                opt.dataset.alpha = adapter.alpha;

                this.els.adapterInput.appendChild(opt);
            });
        } else {
            const opt = document.createElement('option');
            opt.textContent = isForce ? "-- Archive Empty --" : "-- No compatible adapters found --";
            opt.disabled = true;
            this.els.adapterInput.appendChild(opt);
        }
    }

    hideHint() {
        if (this.els.adapterMetaHint) {
            this.els.adapterMetaHint.style.display = 'none';
            this.els.adapterMetaHint.textContent = '';
        }
    }
}