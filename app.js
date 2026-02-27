/* ============================================
   SafePDF — Main Application Logic
   ============================================ */

(function () {
    'use strict';

    const APP_VERSION = '1.0.1';

    // --- DOM References ---
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const multiFileCheckbox = document.getElementById('multiFileCheckbox');
    const processingSection = document.getElementById('processingSection');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const queueSection = document.getElementById('queueSection');
    const queueList = document.getElementById('queueList');
    const resultsSection = document.getElementById('resultsSection');
    const previewBtn = document.getElementById('previewBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const resetBtn = document.getElementById('resetBtn');
    const previewContainer = document.getElementById('previewContainer');
    const previewPages = document.getElementById('previewPages');

    // --- State ---
    let isMultiFile = false;
    let isProcessing = false;
    let sanitizedBlobs = []; // Array of { name, blob, url, pageBlobs }

    // --- Multi-file toggle ---
    multiFileCheckbox.addEventListener('change', () => {
        isMultiFile = multiFileCheckbox.checked;
        fileInput.multiple = isMultiFile;
    });

    // --- Browse button ---
    browseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    // --- Drop zone click ---
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    // --- Drag & Drop ---
    dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        // Only remove if leaving the drop zone itself
        if (!dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove('drag-over');
        }
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer.files).filter(
            f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
        );

        if (files.length === 0) return;

        if (!isMultiFile) {
            handleFiles([files[0]]);
        } else {
            handleFiles(files);
        }
    });

    // --- File input ---
    fileInput.addEventListener('change', () => {
        const files = Array.from(fileInput.files);
        if (files.length > 0) handleFiles(files);
        fileInput.value = ''; // Reset so same file can be selected again
    });

    // --- Main processing pipeline ---
    async function handleFiles(files) {
        if (isProcessing) return;
        isProcessing = true;
        sanitizedBlobs = [];

        // Hide results, show processing
        resultsSection.hidden = true;
        previewContainer.hidden = true;
        processingSection.hidden = false;
        dropZone.hidden = true;

        if (files.length > 1) {
            queueSection.hidden = false;
            buildQueueUI(files);
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            // Update UI
            fileName.textContent = file.name;
            fileSize.textContent = formatSize(file.size);
            progressFill.style.width = '0%';
            progressText.textContent = 'Reading…';

            if (files.length > 1) {
                updateQueueItem(i, 'active');
            }

            try {
                const buffer = await file.arrayBuffer();
                const result = await sanitizeInWorker(buffer, `file-${i}`);
                const cleanPdf = await buildCleanPdf(result.pages);

                const blob = cleanPdf.output('blob');
                const url = URL.createObjectURL(blob);
                const cleanName = file.name.replace(/\.pdf$/i, '') + '_safe.pdf';

                sanitizedBlobs.push({ name: cleanName, blob, url, pageBlobs: result.pages.map(p => p.png) });

                if (files.length > 1) {
                    updateQueueItem(i, 'done');
                }
            } catch (err) {
                console.error(`Error processing ${file.name}:`, err);
                progressText.textContent = 'Error!';
                if (files.length > 1) {
                    updateQueueItem(i, 'error');
                }
            }
        }

        // Done — show results only if we have sanitized files
        processingSection.hidden = true;
        if (sanitizedBlobs.length > 0) {
            showResults();
        } else {
            // All files failed — show drop zone again with error state
            dropZone.hidden = false;
        }
        isProcessing = false;
    }

    // --- Worker communication ---
    function sanitizeInWorker(buffer, fileId) {
        return new Promise((resolve, reject) => {
            // Cache-bust the worker URL to prevent stale file issues
            const workerUrl = `sanitize.worker.js?v=${APP_VERSION}`;
            const worker = new Worker(workerUrl, { type: 'module' });

            worker.onmessage = (e) => {
                const msg = e.data;

                switch (msg.type) {
                    case 'progress':
                        const { page, total, percent } = msg.data;
                        progressFill.style.width = percent + '%';
                        progressText.textContent = `Page ${page} / ${total}`;
                        break;

                    case 'status':
                        progressText.textContent = msg.data;
                        break;

                    case 'done':
                        worker.terminate();
                        resolve(msg);
                        break;

                    case 'error':
                        worker.terminate();
                        reject(new Error(msg.message));
                        break;
                }
            };

            worker.onerror = (err) => {
                worker.terminate();
                reject(err);
            };

            // Transfer the buffer (zero-copy)
            worker.postMessage(
                { type: 'sanitize', buffer, fileId },
                [buffer]
            );
        });
    }

    // --- Build clean PDF from flat images ---
    async function buildCleanPdf(pages) {
        const { jsPDF } = window.jspdf;

        // First page determines initial orientation
        const first = pages[0];
        const orientation = first.width > first.height ? 'landscape' : 'portrait';

        const doc = new jsPDF({
            orientation,
            unit: 'px',
            format: [first.width, first.height],
            hotfixes: ['px_scaling']
        });

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];

            if (i > 0) {
                doc.addPage([page.width, page.height],
                    page.width > page.height ? 'landscape' : 'portrait');
            }

            // Convert blob to data URL
            const dataUrl = await blobToDataUrl(page.png);
            doc.addImage(dataUrl, 'PNG', 0, 0, page.width, page.height);
        }

        return doc;
    }

    // --- Show results ---
    function showResults() {
        resultsSection.hidden = false;

        if (sanitizedBlobs.length === 1) {
            // Single file
            downloadBtn.textContent = 'Download';
            downloadBtn.onclick = () => downloadFile(sanitizedBlobs[0]);
            previewBtn.onclick = () => togglePreview(sanitizedBlobs[0]);
        } else if (sanitizedBlobs.length > 1) {
            // Multi file — download all
            downloadBtn.textContent = `Download all (${sanitizedBlobs.length})`;
            downloadBtn.onclick = () => {
                sanitizedBlobs.forEach(f => downloadFile(f));
            };
            // Preview first file
            previewBtn.onclick = () => togglePreview(sanitizedBlobs[0]);
        }
    }

    // --- Preview toggle ---
    function togglePreview(fileData) {
        try {
            if (previewContainer.hidden) {
                // Render page images from PNG blobs
                previewPages.innerHTML = '';
                const blobs = fileData.pageBlobs || [];
                if (blobs.length === 0) {
                    console.warn('[SafePDF] No page images available for preview');
                    return;
                }
                blobs.forEach((blob, i) => {
                    const img = document.createElement('img');
                    img.src = URL.createObjectURL(blob);
                    img.alt = `Page ${i + 1}`;
                    img.loading = 'lazy';
                    previewPages.appendChild(img);
                });
                previewContainer.hidden = false;
                previewBtn.textContent = 'Hide preview';
            } else {
                // Revoke image URLs and clear
                previewPages.querySelectorAll('img').forEach(img => URL.revokeObjectURL(img.src));
                previewPages.innerHTML = '';
                previewContainer.hidden = true;
                previewBtn.textContent = 'Preview';
            }
        } catch (err) {
            console.error('[SafePDF] Preview error:', err);
        }
    }

    // --- Download helper ---
    function downloadFile({ name, url }) {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // --- Reset ---
    resetBtn.addEventListener('click', () => {
        // Revoke blob URLs
        sanitizedBlobs.forEach(f => URL.revokeObjectURL(f.url));
        sanitizedBlobs = [];

        // Reset UI
        resultsSection.hidden = true;
        previewContainer.hidden = true;
        previewPages.querySelectorAll('img').forEach(img => URL.revokeObjectURL(img.src));
        previewPages.innerHTML = '';
        processingSection.hidden = true;
        queueSection.hidden = true;
        queueList.innerHTML = '';
        dropZone.hidden = false;
        progressFill.style.width = '0%';
        progressText.textContent = 'Preparing…';
    });

    // --- Queue UI ---
    function buildQueueUI(files) {
        queueList.innerHTML = '';
        files.forEach((file, i) => {
            const item = document.createElement('div');
            item.className = 'queue-item';
            item.id = `queue-item-${i}`;
            item.innerHTML = `
                <span class="queue-item-name">${escapeHtml(file.name)}</span>
                <span class="queue-item-status" id="queue-status-${i}">Waiting</span>
            `;
            queueList.appendChild(item);
        });
    }

    function updateQueueItem(index, status) {
        const statusEl = document.getElementById(`queue-status-${index}`);
        if (!statusEl) return;

        statusEl.className = 'queue-item-status';
        switch (status) {
            case 'active':
                statusEl.textContent = 'Processing…';
                statusEl.classList.add('active');
                break;
            case 'done':
                statusEl.textContent = 'Done ✓';
                statusEl.classList.add('done');
                break;
            case 'error':
                statusEl.textContent = 'Error ✗';
                break;
        }
    }

    // --- Utilities ---
    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // --- PWA Service Worker Registration ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {
            // SW registration failed — app still works fine
        });
    }
})();
