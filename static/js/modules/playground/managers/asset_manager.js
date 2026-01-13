/**
 * Asset Manager
 * Handles the dynamic import of Hugging Face models and the upload of LoRA adapters.
 * Manages the shared asset progress bar within the new modal system.
 */

import * as api from '../service.js';

export class AssetManager {
    /**
     * @param {Object} callbacks - Hooks to refresh other UI components.
     * @param {Function} callbacks.onModelAdded - Called when a new model is successfully imported.
     * @param {Function} callbacks.onAdapterAdded - Called when a new adapter is successfully uploaded.
     */
    constructor(callbacks = {}) {
        this.callbacks = callbacks;
        this.POLL_INTERVAL = 1000;

        this.els = {
            // Import Modal Inputs
            hfModelIdInput: document.getElementById('hfModelId'),
            importBtn: document.getElementById('importModelBtn'),
            modelSelect: document.getElementById('modelSelect'),

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

        // Setup Drag & Drop for Adapter Upload
        if (this.els.adapterDropZone) {
            this.setupAdapterDnD();
        }
    }

    setupAdapterDnD() {
        const zone = this.els.adapterDropZone;

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
                const file = e.dataTransfer.files[0];
                this.handleAdapterFile(file);
            }
        };
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
            // Start polling the background worker
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
                    // Map step 0-3 to 0-100% roughly
                    let pct = 0;
                    if (status.step === 1) pct = 25;
                    if (status.step === 2) pct = 75;

                    this.updateImportProgress(pct, status.status || "Downloading assets...");
                }

                if (status.state === 'SUCCESS') {
                    clearInterval(intervalId);
                    this.updateImportProgress(100, "Download complete. Updating registry...");
                    await this.refreshModelList(status.result.model_id);
                } else if (status.state === 'FAILURE') {
                    clearInterval(intervalId);
                    this.endImportWithError(status.status);
                }

            } catch (err) {
                console.warn("[AssetManager] Poll error:", err);
            }
        }, this.POLL_INTERVAL);
    }

    async refreshModelList(newModelId) {
        try {
            const models = await api.fetchModels();

            // Rebuild the select dropdown
            this.els.modelSelect.innerHTML = '<option value="" disabled>-- Select Base Model --</option>';

            models.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                if (m === newModelId) opt.selected = true;
                this.els.modelSelect.appendChild(opt);
            });

            // Notify listeners
            this.els.modelSelect.dispatchEvent(new Event('change'));

            this.endImportWithSuccess(`Model '${newModelId}' is ready.`);
            this.els.hfModelIdInput.value = '';

        } catch (err) {
            this.endImportWithError("Failed to refresh model list.");
        }
    }

    // --- ADAPTER UPLOAD LOGIC ---

    handleAdapterUpload(e) {
        const file = e.target.files[0];
        if (file) this.handleAdapterFile(file);
    }

    async handleAdapterFile(file) {
        // Basic client-side validation
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

            if (this.callbacks.onAdapterAdded) {
                await this.callbacks.onAdapterAdded();
            }

            this.endUploadWithSuccess(result.message);

        } catch (err) {
            this.endUploadWithError(`Upload failed: ${err.message}`);
        } finally {
            this.els.adapterInput.value = '';
        }
    }

    // --- UI HELPERS (IMPORT) ---

    setImportBusy(isBusy) {
        if (this.els.importBtn) this.els.importBtn.disabled = isBusy;
        if (this.els.hfModelIdInput) this.els.hfModelIdInput.disabled = isBusy;

        if (isBusy) {
            this.els.importContainer.style.display = 'block';
            this.els.importStatus.style.color = 'var(--text-dim)';
        }
    }

    updateImportProgress(percent, text) {
        this.els.importBar.style.width = `${percent}%`;
        this.els.importPercent.textContent = `${percent}%`;
        if (text) this.els.importStatus.textContent = text;
    }

    endImportWithSuccess(msg) {
        this.updateImportProgress(100, msg);
        this.els.importStatus.style.color = 'var(--success)';
        this.els.importBar.style.background = 'var(--success)';

        setTimeout(() => {
            this.resetImportUI();
            // Close modal via global helper if available, or just reset state
            const modal = document.getElementById('importModal');
            if (modal && typeof modal.close === 'function') modal.close();
        }, 2000);
    }

    endImportWithError(msg) {
        this.els.importBar.style.width = '100%';
        this.els.importBar.style.background = 'var(--break-border)';
        this.els.importStatus.textContent = msg;
        this.els.importStatus.style.color = 'var(--break-border)';

        setTimeout(() => {
            this.resetImportUI();
        }, 4000);
    }

    resetImportUI() {
        this.setImportBusy(false);
        this.els.importContainer.style.display = 'none';
        this.els.importBar.style.width = '0%';
        this.els.importBar.style.background = 'var(--accent)';
        this.els.importPercent.textContent = '0%';
        this.els.importStatus.textContent = 'Idle';
    }

    // --- UI HELPERS (UPLOAD) ---

    setUploadBusy(isBusy) {
        if (this.els.adapterInput) this.els.adapterInput.disabled = isBusy;

        if (isBusy) {
            this.els.uploadContainer.style.display = 'block';
            this.els.uploadStatus.style.color = 'var(--text-dim)';
        }
    }

    updateUploadProgress(percent, text) {
        this.els.uploadBar.style.width = `${percent}%`;
        this.els.uploadPercent.textContent = `${percent}%`;
        if (text) this.els.uploadStatus.textContent = text;
    }

    endUploadWithSuccess(msg) {
        this.updateUploadProgress(100, msg);
        this.els.uploadStatus.style.color = 'var(--success)';
        this.els.uploadBar.style.background = 'var(--success)';

        setTimeout(() => {
            this.resetUploadUI();
            const modal = document.getElementById('uploadModal');
            if (modal && typeof modal.close === 'function') modal.close();
        }, 2000);
    }

    endUploadWithError(msg) {
        this.els.uploadBar.style.width = '100%';
        this.els.uploadBar.style.background = 'var(--break-border)';
        this.els.uploadStatus.textContent = msg;
        this.els.uploadStatus.style.color = 'var(--break-border)';

        setTimeout(() => {
            this.resetUploadUI();
        }, 4000);
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