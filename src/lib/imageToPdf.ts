import { jsPDF } from 'jspdf';

export type PageSize = 'a4' | 'letter' | 'fit' | 'a3';
export type Orientation = 'portrait' | 'landscape' | 'auto';

export interface ImageConvertOptions {
  pageSize: PageSize;
  orientation: Orientation;
  margin: number; // in mm
  onProgress?: (current: number, total: number) => void;
}

export interface ImageInput {
  file: File;
  dataUrl: string;
  width: number;
  height: number;
}

interface Dimensions {
  w: number;
  h: number;
}

const PAGE_SIZES: Record<Exclude<PageSize, 'fit'>, Dimensions> = {
  a4: { w: 210, h: 297 },
  letter: { w: 216, h: 279 },
  a3: { w: 297, h: 420 },
};

function getFormat(file: File): 'PNG' | 'JPEG' | 'WEBP' {
  const type = file.type.toLowerCase();
  if (type.includes('png')) return 'PNG';
  if (type.includes('webp')) return 'WEBP';
  return 'JPEG';
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

export async function convertImagesToPdf(
  images: ImageInput[],
  options: ImageConvertOptions,
): Promise<Blob> {
  if (images.length === 0) throw new Error('No images provided');

  let pdf: jsPDF | null = null;
  const total = images.length;

  for (let i = 0; i < total; i++) {
    const { file, dataUrl } = images[i];
    const img = await loadImage(dataUrl);
    const format = getFormat(file);

    const imgRatio = img.width / img.height;
    let pageW: number;
    let pageH: number;

    if (options.pageSize === 'fit') {
      pageW = img.width * 0.264583; // px -> mm at 96dpi
      pageH = img.height * 0.264583;
    } else {
      const base = PAGE_SIZES[options.pageSize];
      if (options.orientation === 'auto') {
        const useLandscape = imgRatio > 1;
        pageW = useLandscape ? base.h : base.w;
        pageH = useLandscape ? base.w : base.h;
      } else if (options.orientation === 'landscape') {
        pageW = base.h;
        pageH = base.w;
      } else {
        pageW = base.w;
        pageH = base.h;
      }
    }

    if (pdf === null) {
      pdf = new jsPDF({
        orientation: pageW > pageH ? 'landscape' : 'portrait',
        unit: 'mm',
        format: options.pageSize === 'fit' ? [pageW, pageH] : options.pageSize,
      });
    } else {
      pdf.addPage(
        options.pageSize === 'fit' ? [pageW, pageH] : options.pageSize,
        pageW > pageH ? 'landscape' : 'portrait',
      );
    }

    const margin = options.pageSize === 'fit' ? 0 : options.margin;
    const availW = pageW - margin * 2;
    const availH = pageH - margin * 2;

    let drawW = availW;
    let drawH = drawW / imgRatio;
    if (drawH > availH) {
      drawH = availH;
      drawW = drawH * imgRatio;
    }

    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;

    pdf.addImage(dataUrl, format, x, y, drawW, drawH, undefined, 'FAST');

    options.onProgress?.(i + 1, total);
  }

  if (!pdf) throw new Error('Failed to create PDF');
  return pdf.output('blob');
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function getImageDimensions(file: File): Promise<{ width: number; height: number; dataUrl: string }> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);
  return { width: img.width, height: img.height, dataUrl };
}
