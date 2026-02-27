/* PDF.js Worker Shim
   Provides minimal DOM stubs that pdf.js expects.
   Must be imported BEFORE pdf.min.mjs in the Web Worker. */

const baseUrl = new URL('./', import.meta.url).href;

globalThis.document = {
    baseURI: baseUrl,
    currentScript: null,
    createElement: (tag) => {
        if (tag === 'canvas') {
            // pdf.js may probe for canvas support
            return new OffscreenCanvas(1, 1);
        }
        return { style: {}, setAttribute() { }, getAttribute() { return null; }, addEventListener() { } };
    },
    documentElement: { getElementsByTagName: () => [] },
    getElementsByTagName: () => [],
    head: { appendChild(el) { return el; }, removeChild() { } },
    body: { appendChild(el) { return el; }, removeChild() { } }
};

// pdf.js checks for document.fonts (FontFaceSet API) for font loading
globalThis.document.fonts = {
    ready: Promise.resolve(),
    add() { },
    delete() { },
    has() { return false; },
    forEach() { },
    [Symbol.iterator]: function* () { }
};
