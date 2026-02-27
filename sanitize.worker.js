/* ============================================
   SafePDF — Sanitization Web Worker (ES Module)
   Sandbox Layer 1: Execution Isolation
   
   This worker has ZERO access to:
   - DOM / document
   - window object
   - Cookies / localStorage
   - The main page's memory
   
   It receives raw PDF bytes, renders each page
   to flat pixels via pdf.js + OffscreenCanvas,
   and posts back sterile PNG image data.
   ============================================ */

import * as pdfjsLib from './pdf.min.mjs';

// pdf.js v4 requires explicit workerSrc inside a module Worker.
// We resolve to an absolute URL to avoid any path ambiguity.
// Note: pdf.js may fall back to "fake worker" mode (inline parsing)
// which is actually fine — we're already in an isolated Web Worker.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', import.meta.url).href;

// Default render scale (2.0 ≈ ~150 DPI for standard PDF pages)
const RENDER_SCALE = 2.0;

/**
 * Main message handler
 * Expects: { type: 'sanitize', buffer: ArrayBuffer, fileId?: string }
 */
self.onmessage = async function (e) {
    const { type, buffer, fileId } = e.data;

    if (type !== 'sanitize') return;

    try {
        postMsg('status', 'Loading PDF…', fileId);

        // Load the PDF from the raw bytes
        // isEvalSupported: false prevents pdf.js from using eval() — extra security
        const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(buffer),
            isEvalSupported: false
        });
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;
        const pages = [];

        postMsg('status', `Rendering ${numPages} page${numPages > 1 ? 's' : ''}…`, fileId);

        for (let i = 1; i <= numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: RENDER_SCALE });

            // Create an OffscreenCanvas (no DOM needed)
            const canvas = new OffscreenCanvas(
                Math.floor(viewport.width),
                Math.floor(viewport.height)
            );
            const ctx = canvas.getContext('2d');

            // Render the page to flat pixels
            await page.render({ canvasContext: ctx, viewport }).promise;

            // Convert to PNG blob — this is the "pixel flattening" step
            // All scripts, macros, exploits are destroyed here
            const blob = await canvas.convertToBlob({ type: 'image/png' });

            pages.push({
                png: blob,
                width: viewport.width,
                height: viewport.height,
                pageNum: i
            });

            // Report progress
            postMsg('progress', {
                page: i,
                total: numPages,
                percent: Math.round((i / numPages) * 100)
            }, fileId);

            // Clean up
            page.cleanup();
        }

        // Send back all sterile page images
        self.postMessage({
            type: 'done',
            fileId,
            pages
        });

    } catch (err) {
        self.postMessage({
            type: 'error',
            fileId,
            message: err.message || 'Failed to process PDF'
        });
    }
};

function postMsg(type, data, fileId) {
    self.postMessage({ type, data, fileId });
}
