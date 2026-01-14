/**
 * Asset Manager
 * Handles the dynamic import of Hugging Face models and the upload of LoRA adapters.
 * Manages the shared asset progress bar and the collapsible asset list.
 * This module is self-contained and responsible for rendering its own UI.
 */

import * as api from '../service.js';

export class AssetManager {
    /**
     * @param {Object} callbacks - Hooks to refresh other UI components.
     * @param {Function} callbacks.onAdapterChange - Called when adapter list changes.
     */
    constructor(callbacks = {}) {
        this.callbacks = callbacks;
        this.POLL_INTERVAL = 1000;

        this.els = {
            // Asset List
            assetContainer: document.getElementById('assetManagerContainer'),
            modelSelect: document.getElementById('modelSelect'), // Primary config dropdown

            // Import Modal Inputs
            hfModelIdInput: document.getElementById('hfModelId'),
            importBtn: document.getElementById('importModelBtn'),

            // Import Progress
            importContainer: document.getElementById('importProgressContainer'),
            importBar: document.getElementById('importProgressBar'),
            importStatus: document.getElementById('importStatusText'),
            importPercent: document.getElementById('importPercentText'),

            // Upload Modal Inputs
            adapterInput: document.getElementById('adapterUploadInput'),
            adapterDropZone: document.getElementById('adapterDropZone'),

            // Upload Progress
            uploadContainer: document.getElementById('uploadProgressContainer'),
            uploadBar: document.getElementById('uploadProgressBar'),
            uploadStatus: document.getElementById('uploadStatusText'),
            uploadPercent: document.getElementById('uploadPercentText')
        };

        this.init();
    }

    init() {
        if (this.els.importBtn) {
            this.els.importBtn.addEventListener('click', () => this.handleModelImport());
        }

        if (this.els.adapterInput) {
            this.els.adapterInput.addEventListener('change', (e) => this.handleAdapterUpload(e));
        }

        if (this.els.adapterDropZone) {
            this.setupAdapterDnD();
        }

        // Initial asset fetch
        this.fetchAndRenderAssets();
    }

    // --- RENDER & DISPLAY LOGIC ---

    async fetchAndRenderAssets() {
        if (!this.els.assetContainer) return;
        this.els.assetContainer.innerHTML = `
            <div class="asset-group">
                <div class="asset-group-header collapsed">
                    <span>Base Models</span>
                    <i class="fa-solid fa-chevron-down"></i>
                </div>
                <div id="modelAssetList" class="asset-list collapsed">
                    <div class="asset-item" style="justify-content:center;">Loading...</div>
                </div>
            </div>
            <div class="asset-group">
                <div class="asset-group-header collapsed">
                    <span>LoRA Adapters</span>
                    <i class="fa-solid fa-chevron-down"></i>
                </div>
                <div id="adapterAssetList" class="asset-list collapsed">
                    <div class="asset-item" style="justify-content:center;">Loading...</div>
                </div>
            </div>
        `;

        try {
            const [modelsData, adaptersData] = await Promise.all([api.fetchModels(), api.fetchAdapters()]);
            this.renderModelList(modelsData.cloud, modelsData.local);
            this.renderAdapterList(adaptersData);
            this.setupAccordion();
        } catch (e) {
            console.error("Failed to render assets:", e);
            if (this.els.assetContainer) this.els.assetContainer.innerHTML = '<div class="sys-label" style="text-align:center; color: var(--danger);">Error loading assets.</div>';
        }
    }

    renderModelList(cloud, local) {
        const modelsGroup = this.els.assetContainer.querySelector('#modelAssetList');
        if (!modelsGroup) return;

        modelsGroup.innerHTML = '';
        if ([...cloud, ...local].length === 0) {
            modelsGroup.innerHTML = '<div class="asset-item" style="justify-content:center;">No models found.</div>';
            return;
        }

        cloud.forEach(id => {
            const item = document.createElement('div');
            item.className = 'asset-item';
            item.innerHTML = `
                <span class="asset-name" title="${id}"><i class="fa-solid fa-cloud" style="color: var(--accent);"></i> ${id}</span>
                <button class="asset-delete-btn" disabled><i class="fa-solid fa-lock"></i></button>
            `;
            modelsGroup.appendChild(item);
        });

        local.forEach(id => {
            const item = document.createElement('div');
            item.className = 'asset-item';
            item.innerHTML = `
                <span class="asset-name" title="${id}"><i class="fa-solid fa-server"></i> ${id}</span>
                <button class="asset-delete-btn" data-model-id="${id}"><i class="fa-solid fa-trash"></i></button>
            `;
            item.querySelector('button').onclick = (e) => this.handleModelDelete(e);
            modelsGroup.appendChild(item);
        });
    }

    renderAdapterList(adapters) {
        const adaptersGroup = this.els.assetContainer.querySelector('#adapterAssetList');
        if (!adaptersGroup) return;

        adaptersGroup.innerHTML = '';
        if (adapters.length === 0) {
            adaptersGroup.innerHTML = '<div class="asset-item" style="justify-content:center;">No adapters found.</div>';
            return;
        }

        adapters.forEach(adapter => {
            const item = document.createElement('div');
            item.className = 'asset-item';
            item.innerHTML = `
                <span class="asset-name" title="${adapter.id}"><i class="fa-solid fa-puzzle-piece"></i> ${adapter.id}</span>
                <button class="asset-delete-btn" data-adapter-id="${adapter.id}"><i class="fa-solid fa-trash"></i></button>
            `;
            item.querySelector('button').onclick = (e) => this.handleAdapterDelete(e);
            adaptersGroup.appendChild(item);
        });
    }

    setupAccordion() {
        const headers = this.els.assetContainer.querySelectorAll('.asset-group-header');
        headers.forEach(header => {
            header.onclick = () => {
                header.classList.toggle('collapsed');
                const list = header.nextElementSibling;
                if (list) list.classList.toggle('collapsed');
            };
        });
    }

    setupAdapterDnD() {
        const zone = this.els.adapterDropZone;
        if (!zone) return;

        zone.ondragover = (e) => {
            e.preventDefault();
            zone.style.borderColor = 'var(--accent)';
            zone.style.background = 'rgba(0, 240, 255, 0.05)';
        };

        zone.ondragleave = () => {
            zone.style.borderColor = 'var(--border)';
            zone.style.background = '';
        };

        zone.ondrop = (e) => {
            e.preventDefault();
            zone.style.borderColor = 'var(--border)';
            zone.style.background = '';
            if (e.dataTransfer.files.length) {
                this.handleAdapterFile(e.dataTransfer.files[0]);
            }
        };
    }

    // --- DELETE LOGIC ---

    async handleModelDelete(e) {
        const modelId = e.currentTarget.dataset.modelId;
        if (!confirm(`Permanently delete model '${modelId}'? This cannot be undone.`)) return;

        try {
            await api.deleteModelApi(modelId);
            await this.refreshAllAssets(); // Full refresh
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    }

    async handleAdapterDelete(e) {
        const adapterId = e.currentTarget.dataset.adapterId;
        if (!confirm(`Permanently delete adapter '${adapterId}'? This cannot be undone.`)) return;

        try {
            await api.deleteAdapterApi(adapterId);
            await this.refreshAllAssets(); // Full refresh
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    }

    // --- MODEL IMPORT LOGIC ---

    async handleModelImport() {
        const modelId = this.els.hfModelIdInput.value.trim();
        if (!modelId) {
            alert("Please enter a valid Hugging Face Model ID (e.g., google/siglip-so400m).");
            return;
        }

        this.setImportBusy(true);
        this.updateImportProgress(0, "Initiating download request...");

        try {
            const data = await api.importModel(modelId);
            this.pollDownloadStatus(data.task_id);
        } catch (err) {
            this.endImportWithError(`Import failed: ${err.message}`);
        }
    }

    pollDownloadStatus(taskId) {
        const intervalId = setInterval(async () => {
            try {
                const status = await api.pollTaskStatus(taskId);

                if (status.state === 'PROGRESS') {
                    const pct = (status.step / status.total) * 100;
                    this.updateImportProgress(pct, status.status || "Downloading assets...");
                }

                if (status.state === 'SUCCESS') {
                    clearInterval(intervalId);
                    this.updateImportProgress(100, "Download complete. Updating registry...");
                    await this.refreshAllAssets(status.result.model_id); // Pass new model to select it
                } else if (status.state === 'FAILURE') {
                    clearInterval(intervalId);
                    this.endImportWithError(status.status);
                }

            } catch (err) {
                console.warn("[AssetManager] Poll error:", err);
            }
        }, this.POLL_INTERVAL);
    }

    // --- ADAPTER UPLOAD LOGIC ---

    handleAdapterUpload(e) {
        const file = e.target.files[0];
        if (file) this.handleAdapterFile(file);
    }

    async handleAdapterFile(file) {
        if (file.name.split('.').pop().toLowerCase() !== 'zip') {
            alert("Only .zip files are allowed.");
            this.els.adapterInput.value = '';
            return;
        }

        this.setUploadBusy(true);
        this.updateUploadProgress(10, `Uploading ${file.name}...`);

        const formData = new FormData();
        formData.append('file', file);

        try {
            this.updateUploadProgress(50, "Extracting on server...");
            const result = await api.uploadAdapter(formData);
            this.updateUploadProgress(100, "Installation complete.");

            await this.refreshAllAssets();
            this.endUploadWithSuccess(result.message);

        } catch (err) {
            this.endUploadWithError(`Upload failed: ${err.message}`);
        } finally {
            this.els.adapterInput.value = '';
        }
    }

    // --- CENTRALIZED REFRESH LOGIC ---

    async refreshAllAssets(newModelIdToSelect = null) {
        // 1. Refresh this manager's own asset list UI
        await this.fetchAndRenderAssets();

        // 2. Refresh the primary model selection dropdown in the main config panel
        await this.refreshPrimaryModelSelect(newModelIdToSelect);

        // 3. Notify other managers (like AdapterManager) that things have changed
        if (this.callbacks.onAdapterChange) {
            await this.callbacks.onAdapterChange();
        }
    }

    async refreshPrimaryModelSelect(newModelIdToSelect = null) {
        try {
            const { cloud, local } = await api.fetchModels();
            const models = [...cloud, ...local];
            const currentVal = this.els.modelSelect.value;

            this.els.modelSelect.innerHTML = '<option value="" disabled>-- Select Base Model --</option>';

            models.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                this.els.modelSelect.appendChild(opt);
            });

            // Logic to re-select the correct model
            if (newModelIdToSelect) {
                this.els.modelSelect.value = newModelIdToSelect;
            } else if (models.includes(currentVal)) {
                this.els.modelSelect.value = currentVal;
            }

            // IMPORTANT: Trigger change to update adapter list
            this.els.modelSelect.dispatchEvent(new Event('change'));

        } catch (err) {
            console.error("Failed to refresh primary model select:", err);
        }
    }

    // --- UI HELPERS ---

    setImportBusy(isBusy) {
        if (this.els.importBtn) this.els.importBtn.disabled = isBusy;
        if (this.els.hfModelIdInput) this.els.hfModelIdInput.disabled = isBusy;
        if (isBusy) this.els.importContainer.style.display = 'block';
    }

    updateImportProgress(percent, text) {
        this.els.importBar.style.width = `${percent}%`;
        this.els.importPercent.textContent = `${Math.round(percent)}%`;
        if (text) this.els.importStatus.textContent = text;
    }

    endImportWithSuccess(msg) {
        this.updateImportProgress(100, msg);
        this.els.importStatus.style.color = 'var(--success)';
        this.els.importBar.style.background = 'var(--success)';
        setTimeout(() => {
            this.resetImportUI();
            const modal = document.getElementById('importModal');
            if (modal) modal.close();
        }, 2000);
    }

    endImportWithError(msg) {
        this.els.importBar.style.width = '100%';
        this.els.importBar.style.background = 'var(--break-border)';
        this.els.importStatus.textContent = msg;
        this.els.importStatus.style.color = 'var(--break-border)';
        setTimeout(() => this.resetImportUI(), 4000);
    }

    resetImportUI() {
        this.setImportBusy(false);
        this.els.importContainer.style.display = 'none';
        this.els.importBar.style.width = '0%';
        this.els.importBar.style.background = 'var(--accent)';
        this.els.importPercent.textContent = '0%';
        this.els.importStatus.textContent = 'Idle';
    }

    setUploadBusy(isBusy) {
        if (this.els.adapterInput) this.els.adapterInput.disabled = isBusy;
        if (isBusy) this.els.uploadContainer.style.display = 'block';
    }

    updateUploadProgress(percent, text) {
        this.els.uploadBar.style.width = `${percent}%`;
        this.els.uploadPercent.textContent = `${Math.round(percent)}%`;
        if (text) this.els.uploadStatus.textContent = text;
    }

    endUploadWithSuccess(msg) {
        this.updateUploadProgress(100, msg);
        this.els.uploadStatus.style.color = 'var(--success)';
        this.els.uploadBar.style.background = 'var(--success)';
        setTimeout(() => {
            this.resetUploadUI();
            const modal = document.getElementById('uploadModal');
            if (modal) modal.close();
        }, 2000);
    }

    endUploadWithError(msg) {
        this.els.uploadBar.style.width = '100%';
        this.els.uploadBar.style.background = 'var(--break-border)';
        this.els.uploadStatus.textContent = msg;
        this.els.uploadStatus.style.color = 'var(--break-border)';
        setTimeout(() => this.resetUploadUI(), 4000);
    }

    resetUploadUI() {
        this.setUploadBusy(false);
        this.els.uploadContainer.style.display = 'none';
        this.els.uploadBar.style.width = '0%';
        this.els.uploadBar.style.background = 'var(--accent)';
        this.els.uploadPercent.textContent = '0%';
        this.els.uploadStatus.textContent = 'Idle';
    }
}