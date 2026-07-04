import { jsPDF } from 'jspdf';

export type PageSize = 'a4' | 'letter' | 'fit' | 'a3';
export type Orientation = 'portrait' | 'landscape' | 'auto';
export type PdfOutputMode = 'single' | 'multiple';

export interface ImageConvertOptions {
  pageSize: PageSize;
  orientation: Orientation;
  margin: number; // in mm
  outputMode: PdfOutputMode;
  onProgress?: (current: number, total: number) => void;
}

export interface ImageInput {
  file: File;
  dataUrl: string;
  previewUrl: string;
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

function getFormat(file: File): 'PNG' | 'JPEG' | 'WEBP' | 'AVIF' {
  const type = file.type.toLowerCase();
  if (type.includes('png')) return 'PNG';
  if (type.includes('webp')) return 'WEBP';
  if (type.includes('avif')) return 'AVIF';
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

interface PageLayout {
  width: number;
  height: number;
  format: number[] | Exclude<PageSize, 'fit'>;
  orientation: 'portrait' | 'landscape';
  margin: number;
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
}

export function calculatePageLayout(
  pageSize: PageSize,
  orientation: Orientation,
  margin: number,
  imgWidth: number,
  imgHeight: number
): PageLayout {
  const imgRatio = imgWidth / imgHeight;
  let pageW: number;
  let pageH: number;

  if (pageSize === 'fit') {
    pageW = imgWidth * 0.264583;
    pageH = imgHeight * 0.264583;
  } else {
    const base = PAGE_SIZES[pageSize];
    if (orientation === 'auto') {
      const useLandscape = imgRatio > 1;
      pageW = useLandscape ? base.h : base.w;
      pageH = useLandscape ? base.w : base.h;
    } else if (orientation === 'landscape') {
      pageW = base.h;
      pageH = base.w;
    } else {
      pageW = base.w;
      pageH = base.h;
    }
  }

  const pageOrientation = pageW > pageH ? 'landscape' : 'portrait';
  const pageFormat = pageSize === 'fit' ? [pageW, pageH] : pageSize;
  const pageMargin = pageSize === 'fit' ? 0 : margin;

  const availW = pageW - pageMargin * 2;
  const availH = pageH - pageMargin * 2;

  let drawW = availW;
  let drawH = drawW / imgRatio;
  if (drawH > availH) {
    drawH = availH;
    drawW = drawH * imgRatio;
  }

  const x = (pageW - drawW) / 2;
  const y = (pageH - drawH) / 2;

  return {
    width: pageW,
    height: pageH,
    format: pageFormat,
    orientation: pageOrientation,
    margin: pageMargin,
    drawX: x,
    drawY: y,
    drawW,
    drawH,
  };
}

function convertImageToPng(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx?.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}

async function createPdfForImage(image: ImageInput, options: Omit<ImageConvertOptions, 'outputMode' | 'onProgress'>) {
  const img = await loadImage(image.dataUrl);
  const format = getFormat(image.file);
  const layout = calculatePageLayout(options.pageSize, options.orientation, options.margin, img.width, img.height);

  const pdf = new jsPDF({
    orientation: layout.orientation,
    unit: 'mm',
    format: layout.format,
  });

  const useDataUrl = format === 'AVIF' ? convertImageToPng(img) : image.dataUrl;
  const useFormat = format === 'AVIF' ? 'PNG' : format;
  pdf.addImage(useDataUrl, useFormat, layout.drawX, layout.drawY, layout.drawW, layout.drawH, undefined, 'FAST');
  return pdf;
}

export async function convertImagesToPdf(
  images: ImageInput[],
  options: ImageConvertOptions,
): Promise<Blob | Blob[]> {
  if (images.length === 0) throw new Error('No images provided');

  const total = images.length;

  if (options.outputMode === 'multiple') {
    const blobs: Blob[] = [];
    for (let i = 0; i < total; i++) {
      const pdf = await createPdfForImage(images[i], {
        pageSize: options.pageSize,
        orientation: options.orientation,
        margin: options.margin,
      });
      blobs.push(pdf.output('blob'));
      options.onProgress?.(i + 1, total);
    }
    return blobs;
  }

  let pdf: jsPDF | null = null;

  for (let i = 0; i < total; i++) {
    const image = images[i];
    const img = await loadImage(image.dataUrl);
    const layout = calculatePageLayout(options.pageSize, options.orientation, options.margin, img.width, img.height);

    if (pdf === null) {
      pdf = new jsPDF({
        orientation: layout.orientation,
        unit: 'mm',
        format: layout.format,
      });
    } else {
      pdf.addPage(layout.format, layout.orientation);
    }

    const format = getFormat(image.file);
    const useDataUrl = format === 'AVIF' ? convertImageToPng(img) : image.dataUrl;
    const useFormat = format === 'AVIF' ? 'PNG' : format;
    pdf.addImage(useDataUrl, useFormat, layout.drawX, layout.drawY, layout.drawW, layout.drawH, undefined, 'FAST');
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
