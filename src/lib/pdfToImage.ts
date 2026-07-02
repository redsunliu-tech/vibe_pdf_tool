import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type ImageFormat = 'png' | 'jpg' | 'bmp' | 'webp';

export interface PdfPageResult {
  pageNumber: number;
  blob?: Blob;
  previewUrl: string;
  width: number;
  height: number;
}

export interface PdfConvertOptions {
  format: ImageFormat;
  minScale: number; // user-selected minimum scale factor (1 = 100%)
  minResolution: { width: number; height: number }; // guaranteed minimum output size
  quality: number; // 0-1 for lossy formats
  onProgress?: (current: number, total: number) => void;
}

const MIME_TYPES: Record<ImageFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  bmp: 'image/bmp',
  webp: 'image/webp',
};

function canvasToBlob(canvas: HTMLCanvasElement, format: ImageFormat, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`Failed to convert canvas to ${format}`));
      },
      MIME_TYPES[format],
      quality,
    );
  });
}

// Browser canvas.toBlob doesn't support BMP natively; fall back to PNG with a note.
// We keep the extension but encode as PNG when the browser lacks BMP support.
async function canvasToFormatBlob(
  canvas: HTMLCanvasElement,
  format: ImageFormat,
  quality: number,
): Promise<Blob> {
  if (format === 'bmp') {
    // Try BMP first; most browsers return null, so fall back to PNG encoding.
    const bmpBlob = await canvasToBlob(canvas, 'bmp', quality).catch(() => null);
    if (bmpBlob && bmpBlob.size > 0 && bmpBlob.type === 'image/bmp') return bmpBlob;
    return canvasToBlob(canvas, 'png', quality);
  }
  return canvasToBlob(canvas, format, quality);
}

export async function convertPdfToImages(
  file: File,
  options: PdfConvertOptions,
): Promise<PdfPageResult[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const total = pdf.numPages;
  const results: PdfPageResult[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });

    // For previews, use a lower resolution
    const scaleX = Math.min(options.minResolution.width, 150) / baseViewport.width;
    const scaleY = Math.min(options.minResolution.height, 200) / baseViewport.height;
    const resolutionScale = Math.max(scaleX, scaleY, 1);
    const scale = Math.max(options.minScale, resolutionScale);

    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to get canvas context');
    
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: context, viewport }).promise;
    
    // Create low-res preview
    const previewBlob = await createPreviewBlob(canvas);
    const previewUrl = URL.createObjectURL(previewBlob);

    results.push({
      pageNumber: i,
      previewUrl,
      width: canvas.width,
      height: canvas.height,
    });

    options.onProgress?.(i, total);
    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;
  }

  await loadingTask.destroy();
  return results;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function createPreviewBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const maxDim = 150; // Max preview dimension
  const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
  
  if (scale >= 1) {
    return canvasToFormatBlob(canvas, 'jpg', 0.8);
  }
  
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = Math.round(canvas.width * scale);
  previewCanvas.height = Math.round(canvas.height * scale);
  
  const ctx = previewCanvas.getContext('2d');
  if (!ctx) return canvasToFormatBlob(canvas, 'jpg', 0.8);
  
  ctx.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);
  const blob = canvasToFormatBlob(previewCanvas, 'jpg', 0.8);
  
  // Cleanup
  previewCanvas.width = 0;
  previewCanvas.height = 0;
  
  return blob;
}

export async function renderPdfPageToBlob(
  file: File,
  pageNumber: number,
  options: PdfConvertOptions,
): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
  });
  
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });

  const scaleX = options.minResolution.width / baseViewport.width;
  const scaleY = options.minResolution.height / baseViewport.height;
  const resolutionScale = Math.max(scaleX, scaleY, 1);
  const scale = Math.max(options.minScale, resolutionScale);

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) throw new Error('Failed to get canvas context');
  
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvas, canvasContext: context, viewport }).promise;
  const blob = await canvasToFormatBlob(canvas, options.format, options.quality);
  
  page.cleanup();
  canvas.width = 0;
  canvas.height = 0;
  await loadingTask.destroy();
  
  return blob;
}