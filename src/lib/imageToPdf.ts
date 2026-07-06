import { PDFDocument, PageSizes } from 'pdf-lib';

export type PageSize = 'a4' | 'letter' | 'fit' | 'a3';
export type Orientation = 'portrait' | 'landscape' | 'auto';
export type PdfOutputMode = 'single' | 'multiple';

export interface ImageConvertOptions {
  pageSize: PageSize;
  orientation: Orientation;
  margin: number;
  outputMode: PdfOutputMode;
  onProgress?: (current: number, total: number) => void;
}

export interface ImageInput {
  file: File;
  dataUrl: string;
  previewUrl: string;
  width: number;
  height: number;
  bytes: Uint8Array;
  dpi: number;
}

const PDF_PAGE_SIZES: Record<Exclude<PageSize, 'fit'>, number[]> = {
  a4: PageSizes.A4,
  letter: PageSizes.Letter,
  a3: PageSizes.A3,
};

function getFormat(file: File): 'PNG' | 'JPEG' | 'WEBP' | 'AVIF' {
  const type = file.type.toLowerCase();
  if (type.includes('png')) return 'PNG';
  if (type.includes('webp')) return 'WEBP';
  if (type.includes('avif')) return 'AVIF';
  return 'JPEG';
}

const PIXELS_PER_METER_TO_DPI = 0.0254;

function readPngDimensions(bytes: Uint8Array): { width: number; height: number; dpi: number } | null {
  if (bytes.length < 24) return null;
  const signature = bytes.subarray(0, 8);
  const pngSig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 8; i++) {
    if (signature[i] !== pngSig[i]) return null;
  }
  const ihdrLength = (bytes[8] << 24) | (bytes[9] << 16) | (bytes[10] << 8) | bytes[11];
  const ihdrType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (ihdrType !== 'IHDR' || ihdrLength !== 13) return null;
  const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];

  let dpi = 72;
  let offset = 8 + 4 + 4 + ihdrLength + 4;
  while (offset + 12 <= bytes.length) {
    const chunkLength = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    const chunkType = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (chunkType === 'pHYs') {
      if (chunkLength >= 9 && offset + 16 < bytes.length) {
        const xDensity = (bytes[offset + 8] << 24) | (bytes[offset + 9] << 16) | (bytes[offset + 10] << 8) | bytes[offset + 11];
        const unit = bytes[offset + 16];
        if (unit === 1) {
          dpi = Math.round(xDensity * 0.0254);
        } else if (unit === 0) {
          dpi = 96;
        }
      }
      break;
    }
    offset += 12 + chunkLength;
  }

  return { width, height, dpi };
}

async function renderImageToPng(img: HTMLImageElement, width: number, height: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create canvas context');
  }
  ctx.imageSmoothingEnabled = false;
  const sourceW = img.naturalWidth || img.width;
  const sourceH = img.naturalHeight || img.height;
  ctx.drawImage(img, 0, 0, sourceW, sourceH, 0, 0, width, height);
  const pngDataUrl = canvas.toDataURL('image/png');
  return dataUrlToUint8Array(pngDataUrl);
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number; dpi: number } | null {
  if (bytes.length < 12) return null;
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
  
  let width = 0, height = 0;
  let dpi = 72;
  
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xFF) return null;
    const marker = bytes[offset + 1];
    
    if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) ||
        (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (offset + length <= bytes.length && length >= 8) {
        height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      }
    } else if (marker === 0xE0) {
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (offset + length <= bytes.length && length >= 16) {
        const app0Data = String.fromCharCode(
          bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7], bytes[offset + 8]
        );
        if (app0Data.startsWith('JFIF')) {
          const xDensity = (bytes[offset + 12] << 8) | bytes[offset + 13];
          const unit = bytes[offset + 16];
          if (unit === 1) {
            dpi = xDensity;
          } else if (unit === 2) {
            dpi = Math.round(xDensity / 2.54);
          }
        }
      }
    }
    
    const segLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    offset += 2 + segLength;
  }
  
  if (width > 0 && height > 0) {
    return { width, height, dpi };
  }
  return null;
}

function readWebpDimensions(bytes: Uint8Array): { width: number; height: number; dpi: number } | null {
  if (bytes.length < 20) return null;
  if (bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) return null;
  if (bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50) return null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const chunkLength = (bytes[offset + 4] << 24) | (bytes[offset + 5] << 16) | (bytes[offset + 6] << 8) | bytes[offset + 7];
    if (chunkType === 'VP8 ' || chunkType === 'VP8L' || chunkType === 'VP8X') {
      if (chunkType === 'VP8 ') {
        if (offset + 8 + chunkLength >= 30) {
          const widthMinus1 = (bytes[offset + 26] << 8) | bytes[offset + 27];
          const heightMinus1 = (bytes[offset + 28] << 8) | bytes[offset + 29];
          return { width: widthMinus1 + 1, height: heightMinus1 + 1, dpi: 96 };
        }
      } else if (chunkType === 'VP8L') {
        if (offset + 8 + chunkLength >= 18) {
          const w = bytes[offset + 14] | ((bytes[offset + 15] & 0x3F) << 8);
          const h = ((bytes[offset + 15] >> 6) & 0x03) | (bytes[offset + 16] << 2) | ((bytes[offset + 17] & 0x0F) << 10);
          return { width: w + 1, height: h + 1, dpi: 96 };
        }
      } else if (chunkType === 'VP8X') {
        if (offset + 8 + chunkLength >= 20) {
          const widthMinus1 = (bytes[offset + 16] << 16) | (bytes[offset + 17] << 8) | bytes[offset + 18];
          const heightMinus1 = (bytes[offset + 18] << 16) | (bytes[offset + 19] << 8) | bytes[offset + 20];
          return { width: widthMinus1 + 1, height: heightMinus1 + 1, dpi: 96 };
        }
      }
      return null;
    }
    offset += 8 + chunkLength;
  }
  return null;
}

function readAvifDimensions(bytes: Uint8Array): { width: number; height: number; dpi: number } | null {
  if (bytes.length < 24) return null;
  if (bytes[0] !== 0x00 || bytes[1] !== 0x00 || bytes[2] !== 0x00 || bytes[3] !== 0x18) return null;
  if (bytes[4] !== 0x66 || bytes[5] !== 0x74 || bytes[6] !== 0x79 || bytes[7] !== 0x70) return null;
  if (bytes[8] !== 0x61 || bytes[9] !== 0x76 || bytes[10] !== 0x69 || bytes[11] !== 0x66) return null;
  let offset = 24;
  while (offset + 8 <= bytes.length) {
    const boxLength = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    const boxType = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (boxType === 'meta') {
      const metaOffset = offset + boxLength >= bytes.length ? bytes.length : offset + boxLength;
      let metaPos = offset + 8;
      while (metaPos + 8 < metaOffset) {
        const childLength = (bytes[metaPos] << 24) | (bytes[metaPos + 1] << 16) | (bytes[metaPos + 2] << 8) | bytes[metaPos + 3];
        const childType = String.fromCharCode(bytes[metaPos + 4], bytes[metaPos + 5], bytes[metaPos + 6], bytes[metaPos + 7]);
        if (childType === 'iprp') {
          let iprpPos = metaPos + 8;
          const iprpEnd = metaPos + childLength;
          while (iprpPos + 8 < iprpEnd) {
            const ipcoLength = (bytes[iprpPos] << 24) | (bytes[iprpPos + 1] << 16) | (bytes[iprpPos + 2] << 8) | bytes[iprpPos + 3];
            const ipcoType = String.fromCharCode(bytes[iprpPos + 4], bytes[iprpPos + 5], bytes[iprpPos + 6], bytes[iprpPos + 7]);
            if (ipcoType === 'ipco') {
              let ipcoPos = iprpPos + 8;
              const ipcoEnd = iprpPos + ipcoLength;
              while (ipcoPos + 8 < ipcoEnd) {
                const itemLength = (bytes[ipcoPos] << 24) | (bytes[ipcoPos + 1] << 16) | (bytes[ipcoPos + 2] << 8) | bytes[ipcoPos + 3];
                const itemType = String.fromCharCode(bytes[ipcoPos + 4], bytes[ipcoPos + 5], bytes[ipcoPos + 6], bytes[ipcoPos + 7]);
                if (itemType === 'ispe') {
                  if (ipcoPos + 24 <= ipcoEnd) {
                    const width = (bytes[ipcoPos + 16] << 24) | (bytes[ipcoPos + 17] << 16) | (bytes[ipcoPos + 18] << 8) | bytes[ipcoPos + 19];
                    const height = (bytes[ipcoPos + 20] << 24) | (bytes[ipcoPos + 21] << 16) | (bytes[ipcoPos + 22] << 8) | bytes[ipcoPos + 23];
                    return { width, height, dpi: 96 };
                  }
                }
                ipcoPos += itemLength;
              }
            }
            iprpPos += ipcoLength;
          }
        }
        metaPos += childLength;
      }
    }
    offset += boxLength;
  }
  return null;
}

function readPngDpi(bytes: Uint8Array): number | null {
  if (bytes.length < 24) return null;
  const signature = bytes.subarray(0, 8);
  const pngSig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 8; i++) {
    if (signature[i] !== pngSig[i]) return null;
  }
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (type === 'pHYs') {
      if (offset + 16 + length <= bytes.length) {
        const xPixelsPerMeter = (bytes[offset + 8] << 24) | (bytes[offset + 9] << 16) | (bytes[offset + 10] << 8) | bytes[offset + 11];
        const unit = bytes[offset + 16];
        if (unit === 1) {
          return Math.round(xPixelsPerMeter * PIXELS_PER_METER_TO_DPI);
        }
      }
      return null;
    }
    offset += 12 + length;
  }
  return null;
}

function readJpegDpi(bytes: Uint8Array): number | null {
  if (bytes.length < 4) return null;
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xFF) return null;
    const marker = bytes[offset + 1];
    if ((marker >= 0xE0 && marker <= 0xEF)) {
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (offset + length <= bytes.length) {
        const appData = bytes.subarray(offset + 4, offset + length);
        const exifOffset = findExifOffset(appData);
        if (exifOffset !== -1) {
          const exifData = appData.subarray(exifOffset + 6);
          const dpi = readExifDpi(exifData);
          if (dpi !== null) return dpi;
        }
      }
    }
    const segLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    offset += 2 + segLength;
  }
  return null;
}

function findExifOffset(data: Uint8Array): number {
  const exifSig = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  for (let i = 0; i <= data.length - 6; i++) {
    let match = true;
    for (let j = 0; j < 6; j++) {
      if (data[i + j] !== exifSig[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

function readExifDpi(data: Uint8Array): number | null {
  if (data.length < 12) return null;
  const isBigEndian = data[0] === 0x4D && data[1] === 0x4D;
  const tiffOffset = isBigEndian
    ? (data[2] << 8) | data[3]
    : (data[3] << 8) | data[2];
  if (tiffOffset < 8 || tiffOffset + 2 > data.length) return null;
  const numDirEntries = isBigEndian
    ? (data[tiffOffset] << 8) | data[tiffOffset + 1]
    : (data[tiffOffset + 1] << 8) | data[tiffOffset];
  let dirOffset = tiffOffset + 2;
  for (let i = 0; i < numDirEntries && dirOffset + 12 <= data.length; i++) {
    const tag = isBigEndian
      ? (data[dirOffset] << 8) | data[dirOffset + 1]
      : (data[dirOffset + 1] << 8) | data[dirOffset];
    if (tag === 0x011A) {
      const value = isBigEndian
        ? (data[dirOffset + 8] << 24) | (data[dirOffset + 9] << 16) | (data[dirOffset + 10] << 8) | data[dirOffset + 11]
        : (data[dirOffset + 11] << 24) | (data[dirOffset + 10] << 16) | (data[dirOffset + 9] << 8) | data[dirOffset + 8];
      return value;
    }
    dirOffset += 12;
  }
  return null;
}

export function detectImageDpi(file: File, bytes: Uint8Array): number {
  const type = file.type.toLowerCase();
  let dpi: number | null = null;
  if (type.includes('png')) {
    dpi = readPngDpi(bytes);
  } else if (type.includes('jpeg') || type.includes('jpg')) {
    dpi = readJpegDpi(bytes);
  }
  return dpi ?? 96;
}

export function getPngDimensions(bytes: Uint8Array): { width: number; height: number; dpi: number } | null {
  return readPngDimensions(bytes);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const parts = dataUrl.split(',');
  const bstr = atob(parts[1]);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }
  return u8arr;
}

interface PageLayout {
  width: number;
  height: number;
  format: number[];
  orientation: 'portrait' | 'landscape';
  margin: number;
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
}

const MM_TO_POINTS = 2.83465;

export function calculatePageLayout(
  pageSize: PageSize,
  orientation: Orientation,
  margin: number,
  imgWidth: number,
  imgHeight: number,
  dpi: number = 96
): PageLayout {
  const imgRatio = imgWidth / imgHeight;
  let pageW: number;
  let pageH: number;
  let pageFormat: number[];

  if (pageSize === 'fit') {
    pageW = imgWidth * (72 / dpi);
    pageH = imgHeight * (72 / dpi);
    pageFormat = [pageW, pageH];
  } else {
    const basePoints = PDF_PAGE_SIZES[pageSize];
    if (orientation === 'auto') {
      const useLandscape = imgRatio > 1;
      pageW = useLandscape ? basePoints[1] : basePoints[0];
      pageH = useLandscape ? basePoints[0] : basePoints[1];
    } else if (orientation === 'landscape') {
      pageW = basePoints[1];
      pageH = basePoints[0];
    } else {
      pageW = basePoints[0];
      pageH = basePoints[1];
    }
    pageFormat = orientation === 'landscape' ? [basePoints[1], basePoints[0]] : basePoints;
  }

  const pageOrientation = pageW > pageH ? 'landscape' : 'portrait';
  const pageMargin = pageSize === 'fit' ? 0 : margin * MM_TO_POINTS;

  const availW = pageW - pageMargin * 2;
  const availH = pageH - pageMargin * 2;

  const imgPointsW = imgWidth * (72 / dpi);
  const imgPointsH = imgHeight * (72 / dpi);

  let drawW = imgPointsW;
  let drawH = imgPointsH;
  if (drawW > availW || drawH > availH) {
    const scale = Math.min(availW / imgPointsW, availH / imgPointsH);
    drawW = imgPointsW * scale;
    drawH = imgPointsH * scale;
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

async function createPdfForImage(image: ImageInput, options: Omit<ImageConvertOptions, 'outputMode' | 'onProgress'>) {
  const img = await loadImage(image.dataUrl);
  const format = getFormat(image.file);

  let drawWidth = img.width;
  let drawHeight = img.height;
  let imageDpi = image.dpi || 72;

  if (format === 'PNG' && image.bytes.length > 0) {
    const pngDim = readPngDimensions(image.bytes);
    if (pngDim) {
      drawWidth = pngDim.width;
      drawHeight = pngDim.height;
      imageDpi = pngDim.dpi;
    }
  } else if (format === 'JPEG' && image.bytes.length > 0) {
    const jpegDim = readJpegDimensions(image.bytes);
    if (jpegDim) {
      drawWidth = jpegDim.width;
      drawHeight = jpegDim.height;
      imageDpi = jpegDim.dpi;
    }
  } else if (format === 'WEBP' && image.bytes.length > 0) {
    const webpDim = readWebpDimensions(image.bytes);
    if (webpDim) {
      drawWidth = webpDim.width;
      drawHeight = webpDim.height;
      imageDpi = webpDim.dpi;
    }
  } else if (format === 'AVIF' && image.bytes.length > 0) {
    const avifDim = readAvifDimensions(image.bytes);
    if (avifDim) {
      drawWidth = avifDim.width;
      drawHeight = avifDim.height;
      imageDpi = avifDim.dpi;
    }
  }

  const layout = calculatePageLayout(options.pageSize, options.orientation, options.margin, drawWidth, drawHeight, imageDpi);

  const pdfDoc = await PDFDocument.create();
  
  let embeddedImage;

  if (format === 'PNG' && image.bytes.length > 0) {
    embeddedImage = await pdfDoc.embedPng(image.bytes);
  } else if (format === 'JPEG' && image.bytes.length > 0) {
    embeddedImage = await pdfDoc.embedJpg(image.bytes);
  } else {
    const convertedPng = await renderImageToPng(img, drawWidth, drawHeight);
    embeddedImage = await pdfDoc.embedPng(convertedPng);
  }

  const pageWidth = drawWidth * (72 / imageDpi);
  const pageHeight = drawHeight * (72 / imageDpi);

  if (options.pageSize === 'fit') {
    pdfDoc.addPage([pageWidth, pageHeight] as [number, number]);
    pdfDoc.getPages()[0].drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });
  } else {
    const pageSize = PDF_PAGE_SIZES[options.pageSize];
    if (layout.orientation === 'landscape') {
      pdfDoc.addPage([pageSize[1], pageSize[0]] as [number, number]);
    } else {
      pdfDoc.addPage(pageSize as [number, number]);
    }
    const page = pdfDoc.getPages()[0];
    const scale = Math.min(
      (layout.width - layout.margin * 2) / pageWidth,
      (layout.height - layout.margin * 2) / pageHeight
    );
    const scaledW = pageWidth * scale;
    const scaledH = pageHeight * scale;
    const x = (layout.width - scaledW) / 2;
    const y = (layout.height - scaledH) / 2;
    page.drawImage(embeddedImage, {
      x,
      y,
      width: scaledW,
      height: scaledH,
    });
  }

  const pdfBytes = await pdfDoc.save({
    useObjectStreams: true,
  });

  return new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
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
      const blob = await createPdfForImage(images[i], {
        pageSize: options.pageSize,
        orientation: options.orientation,
        margin: options.margin,
      });
      blobs.push(blob);
      options.onProgress?.(i + 1, total);
    }
    return blobs;
  }

  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < total; i++) {
    const image = images[i];
    const img = await loadImage(image.dataUrl);
    const format = getFormat(image.file);

    let drawWidth = img.width;
    let drawHeight = img.height;
    let imageDpi = image.dpi || 72;

    if (format === 'PNG' && image.bytes.length > 0) {
      const pngDim = readPngDimensions(image.bytes);
      if (pngDim) {
        drawWidth = pngDim.width;
        drawHeight = pngDim.height;
        imageDpi = pngDim.dpi;
      }
    } else if (format === 'JPEG' && image.bytes.length > 0) {
      const jpegDim = readJpegDimensions(image.bytes);
      if (jpegDim) {
        drawWidth = jpegDim.width;
        drawHeight = jpegDim.height;
        imageDpi = jpegDim.dpi;
      }
    } else if (format === 'WEBP' && image.bytes.length > 0) {
      const webpDim = readWebpDimensions(image.bytes);
      if (webpDim) {
        drawWidth = webpDim.width;
        drawHeight = webpDim.height;
        imageDpi = webpDim.dpi;
      }
    } else if (format === 'AVIF' && image.bytes.length > 0) {
      const avifDim = readAvifDimensions(image.bytes);
      if (avifDim) {
        drawWidth = avifDim.width;
        drawHeight = avifDim.height;
        imageDpi = avifDim.dpi;
      }
    }

    const layout = calculatePageLayout(options.pageSize, options.orientation, options.margin, drawWidth, drawHeight, imageDpi);

    let embeddedImage;

    if (format === 'PNG' && image.bytes.length > 0) {
      embeddedImage = await pdfDoc.embedPng(image.bytes);
    } else if (format === 'JPEG' && image.bytes.length > 0) {
      embeddedImage = await pdfDoc.embedJpg(image.bytes);
    } else {
      const convertedPng = await renderImageToPng(img, drawWidth, drawHeight);
      embeddedImage = await pdfDoc.embedPng(convertedPng);
    }

    const pageWidth = drawWidth * (72 / imageDpi);
    const pageHeight = drawHeight * (72 / imageDpi);

    if (options.pageSize === 'fit') {
      pdfDoc.addPage([pageWidth, pageHeight] as [number, number]);
      pdfDoc.getPages()[i].drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });
    } else {
      const pageSize = PDF_PAGE_SIZES[options.pageSize];
      if (layout.orientation === 'landscape') {
        pdfDoc.addPage([pageSize[1], pageSize[0]] as [number, number]);
      } else {
        pdfDoc.addPage(pageSize as [number, number]);
      }
      const page = pdfDoc.getPages()[i];
      const scale = Math.min(
        (layout.width - layout.margin * 2) / pageWidth,
        (layout.height - layout.margin * 2) / pageHeight
      );
      const scaledW = pageWidth * scale;
      const scaledH = pageHeight * scale;
      const x = (layout.width - scaledW) / 2;
      const y = (layout.height - scaledH) / 2;
      page.drawImage(embeddedImage, {
        x,
        y,
        width: scaledW,
        height: scaledH,
      });
    }

    options.onProgress?.(i + 1, total);
  }

  const pdfBytes = await pdfDoc.save({
    useObjectStreams: true,
  });

  return new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function getImageDimensions(file: File): Promise<{ width: number; height: number; dataUrl: string; bytes: Uint8Array; dpi: number }> {
  const [dataUrl, arrayBuffer] = await Promise.all([
    readFileAsDataUrl(file),
    file.arrayBuffer(),
  ]);
  const img = await loadImage(dataUrl);
  const bytes = new Uint8Array(arrayBuffer);
  const dpi = detectImageDpi(file, bytes);
  return { width: img.width, height: img.height, dataUrl, bytes, dpi };
}