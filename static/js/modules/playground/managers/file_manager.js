/**
 * File Manager
 * Handles video file selection, drag-and-drop zones, and UI card rendering.
 * Manages the client-side state of the uploaded asset within the new Workflow Canvas.
 */

import { store } from '../store.js';

export class FileManager {
    constructor(processBtnCallback) {
        this.els = {
            fileInput: document.getElementById('videoInput'),
            dropZone: document.getElementById('dropZone'),
            dropPrompt: document.getElementById('dropPrompt')
            // Note: Process/Launch button is managed via callback now
        };

        // Callback to enable the "Run Inference" button when a file is ready
        this.enableProcessBtn = processBtnCallback;

        this.init();
    }

    init() {
        if (this.els.fileInput) {
            this.els.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }
        this.setupDragAndDrop();
    }

    setupDragAndDrop() {
        if (!this.els.dropZone) return;

        this.els.dropZone.ondragover = (e) => {
            e.preventDefault();
            this.els.dropZone.style.borderColor = 'var(--accent)';
            this.els.dropZone.style.backgroundColor = 'rgba(0, 240, 255, 0.05)';
        };
        this.els.dropZone.ondragleave = () => {
            this.els.dropZone.style.borderColor = '';
            this.els.dropZone.style.backgroundColor = '';
        };
        this.els.dropZone.ondrop = (e) => {
            e.preventDefault();
            this.els.dropZone.style.borderColor = '';
            this.els.dropZone.style.backgroundColor = '';
            if (e.dataTransfer.files.length) {
                this.els.fileInput.files = e.dataTransfer.files;
                this.handleFileSelect({ target: this.els.fileInput });
            }
        };
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            store.videoFile = file;
            store.videoUrl = URL.createObjectURL(file);

            if (this.enableProcessBtn) this.enableProcessBtn(true);
            this.renderActiveFile(file);
        }
    }

    renderActiveFile(file) {
        if (this.els.dropPrompt) this.els.dropPrompt.classList.add('hidden');

        let fileCard = document.getElementById('activeFileCard');
        if (!fileCard) {
            fileCard = document.createElement('div');
            fileCard.id = 'activeFileCard';
            fileCard.className = 'upload-file-card active';
            this.els.dropZone.appendChild(fileCard);
        }

        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);

        // Metadata Probe
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        tempVideo.onloadedmetadata = () => {
            const duration = tempVideo.duration.toFixed(1);
            this.updateCardContent(fileCard, file.name, sizeMB, duration + 's');
            URL.revokeObjectURL(tempVideo.src);
        };
        tempVideo.onerror = () => {
            this.updateCardContent(fileCard, file.name, sizeMB, '???');
        };
        tempVideo.src = URL.createObjectURL(file);
    }

    updateCardContent(card, name, size, dur) {
        card.innerHTML = `
            <div class="file-icon-box"><i class="fa-solid fa-file-video"></i></div>
            <div class="file-info-stack">
                <div class="file-name" title="${name}">${name}</div>
                <div class="file-meta"><span>${size} MB</span><span style="color:var(--border);">|</span><span>${dur}</span></div>
            </div>
            <button class="file-remove-btn" id="removeFileBtn" title="Remove File"><i class="fa-solid fa-xmark"></i></button>
        `;

        const btn = document.getElementById('removeFileBtn');
        if (btn) {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.clearActiveFile();
            };
        }
    }

    clearActiveFile() {
        store.videoFile = null;
        if (store.videoUrl) URL.revokeObjectURL(store.videoUrl);
        store.videoUrl = null;

        this.els.fileInput.value = '';

        const fileCard = document.getElementById('activeFileCard');
        if (fileCard) fileCard.remove();

        if (this.els.dropPrompt) this.els.dropPrompt.classList.remove('hidden');
        if (this.enableProcessBtn) this.enableProcessBtn(false);
    }
}