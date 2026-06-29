import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type ImageFormat = 'png' | 'jpg' | 'bmp' | 'webp';

export interface PdfPageResult {
  pageNumber: number;
  blob: Blob;
  dataUrl: string;
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

    // Compute the scale needed so the output meets the minimum resolution.
    // We guarantee both dimensions are >= the requested minimum by taking the
    // larger of the two per-dimension scale requirements.
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

    // White background so transparent PDFs don't render black on JPG/BMP.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: context, viewport }).promise;

    const blob = await canvasToFormatBlob(canvas, options.format, options.quality);
    const dataUrl = canvas.toDataURL(MIME_TYPES[options.format === 'bmp' ? 'png' : options.format], options.quality);

    results.push({
      pageNumber: i,
      blob,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
    });

    options.onProgress?.(i, total);
    page.cleanup();
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
