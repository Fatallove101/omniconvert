# OmniConvert 万象转换

[中文](README.md) | **English**

A BentoPDF / Stirling-PDF style file conversion tool that runs **entirely in your browser** — files never leave your device.

**Zero backend. Zero upload. Works offline (PWA).** Works on both desktop and mobile browsers. Also ships as a Windows desktop app (Tauri) and a WeChat Mini Program skeleton.

## Quick Start

**Just want the desktop app? [Download from Releases](https://github.com/Fatallove101/omniconvert/releases/latest)**:
- [Installer OmniConvert_v0.4.2_x64-setup.exe](https://github.com/Fatallove101/omniconvert/releases/download/v0.4.2/OmniConvert_v0.4.2_x64-setup.exe) (~3.6MB: setup wizard + Start menu + uninstaller)
- [Portable OmniConvert_v0.4.2_x64-portable.exe](https://github.com/Fatallove101/omniconvert/releases/download/v0.4.2/OmniConvert_v0.4.2_x64-portable.exe) (~9.3MB: download and run, no install)

```
Double-click start.bat
→ starts a local server and opens http://localhost:8137
```

Or manually: `powershell -ExecutionPolicy Bypass -File server.ps1` (zero-dependency static server, no admin rights needed).

- **Mobile**: connect your phone to the same Wi-Fi, change the listener in `server.ps1` to `IPAddress.Any`, allow port 8137 in the firewall, then visit `http://<PC-IP>:8137`
- **Production**: the whole directory is pure static files — host it on GitHub Pages / Cloudflare Pages / EdgeOne Pages / Nginx for free

## Features (24 tools)

| Category | Tool | Description |
| --- | --- | --- |
| PDF | Merge | Combine multiple PDFs into one |
| PDF | Split | One file per page / custom ranges (`1-3,5`) / every N pages |
| PDF | To Image | Export each page as PNG/JPG at 96/150/300 DPI |
| PDF | To PPT | Image-based PPTX, each page full-bleed on a slide (layout preserved) |
| PDF | To Word | Image-based (layout preserved) or text-based (editable) docx |
| PDF | Flatten | Re-pack every page as a full-page image (prevents copy/edit) |
| PDF | Images to PDF | Merge images into a PDF with drag-and-drop ordering, rotation, removal |
| PDF | Compress | Re-encode pages, best for scanned/image-heavy PDFs |
| PDF | Extract Text | Export text as TXT (scanned pages need OCR — not yet) |
| PDF | Watermark | Text watermark with Chinese support, opacity, angle |
| PDF | Organize | Thumbnail drag-to-reorder, delete/rotate pages |
| PDF | Encrypt | Password protection (AES-256, qpdf WASM) |
| PDF | Decrypt | Remove password protection (requires the password) |
| PDF | Rotate | Rotate all or selected pages |
| Image | Convert | JPG / PNG / WebP / HEIC / BMP conversion |
| Image | Compress | Quality + max-edge control, shows savings |
| Image | Resize | By percentage or exact width/height |
| Image | HEIC to JPG | iPhone photos to universal formats |
| Image | ICO Generator | Multi-size Windows / favicon icons (16–256) |
| Music | Song Conversion | NCM (NetEase), QMC/MFLAC/MGG (QQ Music), KWM (Kuwo) → MP3/FLAC/OGG (engine: unlock-music WASM) |
| Music | KGG Conversion | KuGou KGG/KGMA/KGM/VPR → MP3/FLAC/OGG (v3 offline; v5 requires per-song eKey) |
| Document | Word to PDF | Renders docx then opens the print dialog — "Save as PDF" |
| Document | Excel ↔ CSV | xlsx/xls ↔ csv, direction auto-detected |
| Document | Word to HTML | docx → styled HTML page or plain text |
| Document | Markdown to HTML | Standalone styled web page |

> **Scope of music conversion**: this is *decryption* — it removes the encryption wrapper and recovers the audio file stored inside (lossless, format unchanged). It does **not** transcode (e.g. FLAC→MP3 needs an audio encoder, see roadmap). KGG v5 requires the per-song eKey (embedded in newer files, or paste it manually); KWM v2 is not supported. Only convert songs you are legally entitled to.

### UX details

- **Result preview drawer**: preview images / first PDF page / text content without downloading (bottom sheet on mobile), one-click copy for text results
- **Dark mode**: toggle in the top-right corner, follows system + remembers your choice
- **Option memory**: every tool remembers your last settings
- **Recent tools**: quick access chips on the home page
- **PWA**: installable on desktop / home screen, works offline

## Architecture

```
omniconvert/
├── index.html            # Single-page app entry
├── css/app.css           # Responsive styles (mobile-first, dark mode)
├── js/
│   ├── app.js            # Framework: tool registry, hash router, UI, progress/download/zip
│   ├── ooxml.js          # Minimal OOXML (docx) writer for PDF→Word
│   ├── kgg-decoder.js    # KGG v3 decoder (constants extracted from TriAgent)
│   ├── kgg-db.js         # KGMusicV3.db decryption + key extraction
│   ├── md5.js / aes.js   # Pure-JS MD5 / AES-128-CBC (no-padding) for the key db
│   └── tools/            # Tool implementations (auto-registered)
│       ├── pdf-tools.js  ├── image-tools.js
│       ├── doc-tools.js  └── music-tools.js
├── vendor/               # Local conversion engines (offline-capable)
│   ├── pdf-lib / pdf.js / qpdf WASM / SheetJS / mammoth / marked / heic2any
│   ├── pptx/             # pptxgenjs (PPTX writer)
│   ├── um/               # unlock-music WASM + KGG public key prefix
│   └── sqljs/            # sql.js (read the KuGou key database)
├── miniprogram/          # WeChat Mini Program skeleton (see its README)
├── src-tauri/            # Windows desktop app (Tauri v2)
├── server.ps1            # Zero-dependency local static server (TcpListener)
├── start.bat             # One-click launcher
└── test/                 # Fixture generator + self-test suites
```

**How it works**: all conversions run in your browser — PDF writing via pdf-lib, PDF rendering via pdf.js (Web Worker), images via Canvas, spreadsheets via SheetJS, music decryption via the unlock-music WASM. Files only ever live in memory; nothing is uploaded.

**Adding a tool**: call `App.registerTool({ id, name, desc, icon, category, accept, multiple, options, run })` in `js/tools/` — the home grid, routing, progress bar, preview and download/zip all come for free.

## Desktop app (Tauri)

Requirements: Rust (MSVC) + Node + VS Build Tools. Then:

```
npm install
powershell -ExecutionPolicy Bypass -File make-dist.ps1   # copy clean static assets to dist/
npm run tauri build
```

Artifacts:

- Portable: `src-tauri/target/release/omniconvert.exe` (~9 MB)
- Installer: `src-tauri/target/release/bundle/nsis/*-setup.exe` (~3.6 MB)

> Note: the desktop build **disables the Service Worker** and uses its own WebView2 user-data folder — a service worker on `tauri.localhost` gets DNS-poisoned on some networks and breaks navigation.

## WeChat Mini Program

`miniprogram/` contains a ready skeleton: in-browser Canvas image conversion works out of the box, PDF merge/split via pdf-lib (run "Build npm" in DevTools), heavy work goes to a cloud function skeleton. See `miniprogram/README.md`.

## Roadmap

1. **Free static hosting** (EdgeOne Pages / Cloudflare Pages) — publish to a public URL
2. **Music transcoding** (FLAC→MP3 etc. via ffmpeg.wasm, ~30 MB)
3. **Server mode** (optional FastAPI + LibreOffice) for high-fidelity Word→PDF, PDF→Excel, OCR
4. **UI batch 2**: mascot state machine, smart drag-drop detection, tesseract.js OCR
5. i18n (English UI)

## Compliance & Risk Boundary

> The following is an engineering compliance statement, not legal advice.

You should only use this project under these premises:

- Only process **local files that you personally have lawful access to**;
- Verify on your own that your usage complies with local laws, copyright rules, platform agreements, and organizational policies.

Do not use this project for:

- Bulk distribution, resale, monetization;
- Circumventing paid licensing.

This project makes no promises regarding:

- Suitability for any specific region, platform rules, or purpose;
- Compliance with the regulations of your jurisdiction;
- Readiness of any specific commercial use;
- Liability for user infringement, breach of contract, or rule violations.

## Privacy

All conversions happen inside your browser. Nothing is collected, nothing is uploaded. The Service Worker only caches app code for offline use.

## License & Attribution

- App code: MIT
- Conversion engines keep their own licenses: pdf-lib, pdf.js, SheetJS, mammoth, marked, heic2any, pptxgenjs, qpdf (Apache-2.0), unlock-music WASM (MIT OR Apache-2.0)
- KGG v3 decoder is ported from [TriAgent](https://github.com/Acooldog/TriAgent) (GPL-3.0) — if you distribute this project publicly, the GPL obligation applies to the whole work

## Testing

`test/` contains fixture generators and self-test suites (`test-um.mjs`, `test-kggdb.mjs`, `test-kgg.mjs`, `test-v5.mjs`, `check-ooxml.ps1`). Run them with Node; they verify MD5/AES against official vectors, key-db decryption round trips, and OOXML well-formedness.
