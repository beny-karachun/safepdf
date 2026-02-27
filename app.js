/* ============================================
   SafePDF — Main Application Logic
   
   Renders each PDF page to a regular <canvas>
   in the main thread (full font support), then
   merges the JPEG screenshots into a clean PDF.
   ============================================ */

import * as pdfjsLib from './pdf.min.mjs';

// Point pdf.js to its own web worker for parsing
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';

const APP_VERSION = '1.0.6';
const RENDER_SCALE = 3.0;   // ~225 DPI
const JPEG_QUALITY = 0.92;

// --- Theme toggle ---
const themeToggle = document.getElementById('themeToggle');
const root = document.documentElement;

// Restore saved preference
const savedTheme = localStorage.getItem('safepdf-theme');
if (savedTheme) root.setAttribute('data-theme', savedTheme);

themeToggle.addEventListener('click', () => {
    const current = root.getAttribute('data-theme');
    // Cycle: auto (no attr) → light → dark → auto
    if (!current) {
        // Auto → check what's currently rendered and flip
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const next = isDark ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        localStorage.setItem('safepdf-theme', next);
    } else if (current === 'light') {
        root.setAttribute('data-theme', 'dark');
        localStorage.setItem('safepdf-theme', 'dark');
    } else {
        root.removeAttribute('data-theme');
        localStorage.removeItem('safepdf-theme');
    }
});

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
const previewFrame = document.getElementById('previewFrame');

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

// --- Drag & Drop (full-page drop target, visual feedback on dropZone) ---
document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (dropZone.hidden) return;
    dropZone.classList.add('drag-over');
});

document.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (dropZone.hidden) return;
    dropZone.classList.add('drag-over');
});

document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    // Only remove highlight when leaving the page entirely
    if (!e.relatedTarget && !document.elementFromPoint(e.clientX, e.clientY)) {
        dropZone.classList.remove('drag-over');
    }
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (dropZone.hidden) return;

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
    fileInput.value = '';
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
            const pages = await renderPdfToImages(buffer);
            const cleanPdf = await buildCleanPdf(pages);

            const blob = cleanPdf.output('blob');
            const url = URL.createObjectURL(blob);
            const cleanName = file.name.replace(/\.pdf$/i, '') + '_safe.pdf';

            sanitizedBlobs.push({ name: cleanName, blob, url, pageBlobs: pages.map(p => p.jpeg) });

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
        dropZone.hidden = false;
    }
    isProcessing = false;
}

// --- Render PDF pages to JPEG images (main thread, full font support) ---
async function renderPdfToImages(buffer) {
    progressText.textContent = 'Loading PDF…';

    const pdf = await pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        isEvalSupported: false,
        cMapUrl: './cmaps/',
        cMapPacked: true,
        standardFontDataUrl: './standard_fonts/',
    }).promise;

    const numPages = pdf.numPages;
    const pages = [];

    progressText.textContent = `Rendering ${numPages} page${numPages > 1 ? 's' : ''}…`;

    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: RENDER_SCALE });

        // Use a regular <canvas> — main thread has full font rendering
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');

        // White background (JPEG has no transparency)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Render the page — fonts load properly in the main thread
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Convert to JPEG blob — this is the "pixel flattening" step
        // All scripts, macros, exploits are destroyed here
        const blob = await new Promise(resolve =>
            canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
        );

        pages.push({
            jpeg: blob,
            width: viewport.width,
            height: viewport.height,
            pageNum: i
        });

        // Report progress
        const percent = Math.round((i / numPages) * 100);
        progressFill.style.width = percent + '%';
        progressText.textContent = `Page ${i} / ${numPages}`;

        // Clean up
        page.cleanup();
    }

    return pages;
}

// --- Build clean PDF from flat images ---
async function buildCleanPdf(pages) {
    const { jsPDF } = window.jspdf;

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

        const dataUrl = await blobToDataUrl(page.jpeg);
        doc.addImage(dataUrl, 'JPEG', 0, 0, page.width, page.height);
    }

    return doc;
}

// --- Show results ---
function showResults() {
    resultsSection.hidden = false;

    if (sanitizedBlobs.length === 1) {
        downloadBtn.textContent = 'Download';
        downloadBtn.onclick = () => downloadFile(sanitizedBlobs[0]);
        previewBtn.onclick = () => togglePreview(sanitizedBlobs[0]);
    } else if (sanitizedBlobs.length > 1) {
        downloadBtn.textContent = `Download all (${sanitizedBlobs.length})`;
        downloadBtn.onclick = () => {
            sanitizedBlobs.forEach(f => downloadFile(f));
        };
        previewBtn.onclick = () => togglePreview(sanitizedBlobs[0]);
    }
}

// --- Preview toggle (renders inside sandboxed iframe) ---
async function togglePreview(fileData) {
    try {
        if (previewContainer.hidden) {
            const blobs = fileData.pageBlobs || [];
            if (blobs.length === 0) {
                console.warn('[SafePDF] No page images available for preview');
                return;
            }

            // Convert all blobs to base64 data URLs for embedding in srcdoc
            const dataUrls = await Promise.all(blobs.map(b => blobToDataUrl(b)));

            // Build a self-contained HTML page with just the images
            // This HTML runs inside <iframe sandbox=""> — no scripts can execute
            const imagesHtml = dataUrls.map((url, i) =>
                `<img src="${url}" alt="Page ${i + 1}" style="width:100%;max-width:100%;height:auto;display:block;margin:0 auto 8px;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,0.06);">`
            ).join('');

            const srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#f4f4f5;padding:16px;display:flex;flex-direction:column;align-items:center;gap:8px;}@media(prefers-color-scheme:dark){body{background:#1c1c1e;}}</style></head><body>${imagesHtml}</body></html>`;

            previewFrame.srcdoc = srcdoc;
            previewContainer.hidden = false;
            previewBtn.textContent = 'Hide preview';
        } else {
            previewFrame.srcdoc = '';
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
    sanitizedBlobs.forEach(f => URL.revokeObjectURL(f.url));
    sanitizedBlobs = [];

    resultsSection.hidden = true;
    previewContainer.hidden = true;
    previewFrame.srcdoc = '';
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
