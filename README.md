# 🛡️ SafePDF — Client-Side PDF Sanitizer

**Content Disarm & Reconstruction (CDR) for PDF files, running entirely in your browser.**

SafePDF doesn't scan for malware — because scanners can be fooled by zero-days. Instead, it **assumes every file is compromised**. It physically destroys the original PDF's internal structure, renders each page as a flat image on a sterile HTML5 Canvas, and reconstructs a clean PDF from the screenshots. The malware is structurally annihilated.

Your file **never leaves your machine**. Zero servers. Zero uploads. Zero trust required.

🔗 **[Try it live →](https://beny-karachun.github.io/safepdf/)**

---

## Why SafePDF?

### 🔐 1. True Zero-Trust Privacy

Most "safe PDF" tools require uploading your document to a cloud server. If you're handling a sensitive file — a legal contract, a leaked document, a suspicious invoice — that upload is a privacy violation.

**SafePDF processes the entire file 100% locally on your hardware using JavaScript.** The file never touches a network. The developer has zero access, zero liability. You have total privacy.

### 🏗️ 2. Browser-Native Defense-in-Depth

Instead of requiring Docker containers or Linux sandboxes (like [Dangerzone](https://dangerzone.rocks/)), SafePDF replicates multi-layer isolation natively in the browser:

| Layer | Mechanism | Purpose |
|---|---|---|
| **Thread Isolation** | Web Worker | PDF parsing runs in an isolated execution thread |
| **Content Policy** | Strict CSP headers | Acts as a network kill switch — blocks all external connections |
| **Pixel Flattening** | Canvas API | Converts structured data to inert image pixels |

### 💀 3. Content Disarm & Reconstruction (CDR)

CDR is the gold standard used by government agencies and defense contractors. The principle is simple: **don't try to detect threats — eliminate the possibility of threats existing.**

```
Compromised PDF ──▶ PDF.js parses & renders to <canvas>
                          ──▶ Canvas exported as JPEG (pixel flattening)
                                 ──▶ jsPDF rebuilds a clean image-only PDF
                                        ──▶ Structurally sterile output
```

Every active content vector is destroyed in the rendering step:

| Threat Vector | Status |
|---|---|
| JavaScript / actions | 💀 Destroyed |
| Embedded files / attachments | 💀 Destroyed |
| Form fields / XFA | 💀 Destroyed |
| Macros | 💀 Destroyed |
| Launch actions | 💀 Destroyed |
| Hyperlinks | 💀 Destroyed |
| Metadata (author, timestamps) | 💀 Destroyed |
| Hidden layers | 💀 Destroyed |
| Tracking pixels | 💀 Destroyed |

### ⚡ 4. Frictionless Security

Security tools fail when they're annoying to use. SafePDF removes all friction:

- **No software to install** — it's a web page
- **No command line** — drag and drop
- **No accounts** — no sign-up, no login, no tracking
- **No internet required** — works offline as a PWA

A user drags a sketchy file into a browser tab, and it is instantly rendered safe.

---

## How It Works

1. **Parse** — [PDF.js](https://mozilla.github.io/pdf.js/) loads the document entirely in-browser
2. **Render** — Each page is drawn to a `<canvas>` at 225 DPI (3× scale)
3. **Flatten** — The canvas is exported as a JPEG blob, destroying all executable content
4. **Rebuild** — [jsPDF](https://github.com/parallax/jsPDF) assembles the images into a new, clean PDF

## Features

-  **Multi-file** — batch-process multiple PDFs at once
- 👁️ **Preview** — inspect sanitized pages before downloading
- 📱 **Responsive** — works on desktop and mobile
- 🌐 **Offline** — full PWA with service worker caching

---

## Getting Started

### Run Locally

```bash
git clone https://github.com/beny-karachun/safepdf.git
cd safepdf
npx -y http-server ./ -p 8080 --cors
```

Open `http://localhost:8080`. No build step required — it's just static HTML, CSS, and JavaScript.

### Project Structure

```
safepdf/
├── index.html              # Main page
├── app.js                  # Application logic (ES module)
├── style.css               # Styles
├── pdf.min.mjs             # PDF.js library
├── pdf.worker.min.mjs      # PDF.js web worker (parsing)
├── jspdf.umd.min.js        # jsPDF library
├── cmaps/                  # Character maps for international PDFs
├── standard_fonts/         # Standard PDF fonts (Foxit, Liberation)
├── sw.js                   # Service worker (offline PWA)
├── manifest.json           # PWA manifest
└── icons/                  # App icons
```

### Configuration

Rendering quality is adjustable in `app.js`:

```javascript
const RENDER_SCALE = 3.0;    // DPI multiplier (3.0 ≈ 225 DPI)
const JPEG_QUALITY = 0.92;   // JPEG compression (0.0–1.0)
```

## Browser Support

Chrome 80+ · Firefox 80+ · Safari 14+ · Edge 80+

## License

MIT

---

<p align="center">
  <strong>Your file never leaves your device. Ever.</strong>
</p>
