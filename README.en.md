# PDF Converter

A fully local, backend-free PDF conversion tool. Supports PDF-to-image and image-to-PDF — all processing happens entirely in your browser, and your files never leave your device.

[中文文档](./README.md)

## Highlights

- 🔒 **Fully Local** — No backend server; all conversions run in the browser, files are never uploaded anywhere
- 🛡️ **Privacy First** — Your files never leave your device, ideal for sensitive documents
- ⚡ **Simple & Safe** — No registration, no login, no upload size limits, ready to use on open
- 🎯 **Zero-Dependency Deployment** — The build output is just a set of static files, hostable on any static server or openable locally

## Features

### PDF to Image

Convert each page of a PDF into an image with rich output controls:

- **Output Format**: Auto (smart detection), PNG, JPG
- **DPI Resolution**: Original, 72 / 150 / 300 / 600 DPI
- **Quality Control**: In JPG mode, choose "Original Quality" or a custom compression ratio
- **Per-page Preview**: Thumbnail previews generated after conversion
- **Download**: Single page, or download all as a ZIP archive
- **Smart Format Detection**: Automatically analyzes page content to determine the optimal output format

### Image to PDF

Convert one or more images into a PDF with layout and output controls:

- **Supported Formats**: PNG, JPG, BMP, WebP, AVIF
- **Page Size**: A4, A3, Letter, Fit to Image
- **Orientation**: Auto, Portrait, Landscape
- **Margin**: 0–40 mm adjustable
- **Output Mode**:
  - Merge into a single PDF (all images as pages of one file)
  - One independent PDF per image
- **Reordering**: Drag to reorder images
- **Preview**: Preview each page's layout before downloading
- **Download**: Single file, or download all as a ZIP archive
- **On-demand Generation**: The PDF is only generated at download time to save resources

## Tech Stack

| Category | Technology |
| --- | --- |
| Frontend Framework | React 18 + TypeScript |
| Build Tool | Vite 5 |
| Styling | Tailwind CSS |
| PDF Generation | pdf-lib |
| PDF Rendering | pdfjs-dist |
| Zip Download | JSZip + file-saver |
| Icons | lucide-react |
| Testing | Vitest + Testing Library |

### Characteristics

- **Pure Frontend Architecture**: No backend, no API, no database; the build output is static assets
- **Web Worker Rendering**: PDF parsing runs in a Worker, keeping the UI responsive
- **Lazy Generation Strategy**: For image-to-PDF, only previews are generated; the actual PDF is produced only when the user clicks download, avoiding unnecessary computation
- **Resource Management**: Uses `URL.revokeObjectURL` to release memory promptly, with one-click cleanup
- **Type Safety**: Full TypeScript with `tsc --noEmit` type checking

## Installation

### Requirements

- Node.js 18+
- npm (or pnpm / yarn)

### Steps

```bash
# 1. Clone the repository
git clone <repo-url>
cd vibe_pdf_tool

# 2. Install dependencies
npm install
```

## Usage

### Development

```bash
# Start the dev server (default: http://localhost:5173)
npm run dev
```

### Build & Preview

```bash
# Build for production into dist/
npm run build

# Preview the build locally
npm run preview
```

### Static Deployment

After building, the `dist/` directory is a deployable static site. Host it with any static server — two local preview options are provided below, choose as needed:

#### Option 1: miniserve (default, bundled script)

[miniserve](https://github.com/svenstaro/miniserve) is a lightweight, zero-config static file server. The project includes the corresponding script, but you need to install miniserve first:

```bash
# Install miniserve (choose one)
cargo install miniserve      # via the Rust toolchain
brew install miniserve       # macOS via Homebrew

# Start the static server (http://127.0.0.1:8081)
npm run static

# Stop the static server
npm run stop
```

#### Option 2: npx serve (no pre-install needed)

[serve](https://github.com/vercel/serve) runs directly via npx with no global install required, ideal for quick previews:

```bash
# Start a temporary static server (default http://localhost:3000)
npx serve dist
```

#### Hosting Platforms

You can also deploy to any static hosting platform, such as:

- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages
- Nginx / Apache

> Since this is a purely static site, no backend or environment variables are required.

### Other Commands

```bash
# Lint
npm run lint

# Type checking
npm run typecheck

# Run tests
npm run test

# Tests in watch mode
npm run test:watch
```

## Project Structure

```
vibe_pdf_tool/
├── src/
│   ├── components/
│   │   ├── Dropzone.tsx          # Drag-and-drop upload component
│   │   ├── PdfToImagePanel.tsx   # PDF to Image panel
│   │   └── ImageToPdfPanel.tsx   # Image to PDF panel
│   ├── lib/
│   │   ├── pdfToImage.ts         # PDF to Image core logic
│   │   ├── imageToPdf.ts         # Image to PDF core logic
│   │   └── zipUtils.ts           # ZIP packaging utility
│   ├── test/
│   │   └── setup.ts              # Test environment setup
│   ├── App.tsx                   # App entry and layout
│   ├── main.tsx
│   └── index.css
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── package.json
```

## Privacy

This tool **has no backend server**. All file reading, PDF parsing, image rendering, PDF generation, and zip packaging happen locally in your browser.

- Files are never uploaded to any server
- No user data is collected
- No cookies or tracking scripts are used
- Works offline after the initial page load

## License

MIT License

Copyright (c) 2026 Hubert Liu

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
