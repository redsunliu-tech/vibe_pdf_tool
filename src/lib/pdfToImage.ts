import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type ImageFormat = 'png' | 'jpg';

export interface PdfPageResult {
  pageNumber: number;
  blob?: Blob;
  previewUrl: string;
  width: number;
  height: number;
  format: ImageFormat;
}

export type QualityMode = 'original' | 'custom';

export interface PdfConvertOptions {
  format: ImageFormat | 'auto';
  dpi: number | 'original';
  quality: number;
  qualityMode: QualityMode;
  onProgress?: (current: number, total: number) => void;
  outputFormat?: ImageFormat;
}

async function extractRawJpeg(page: pdfjsLib.PDFPageProxy): Promise<Uint8Array | null> {
  try {
    const operators = await page.getOperatorList();
    const { fnArray, argsArray } = operators;
    const OPS = pdfjsLib.OPS;
    
    for (let i = 0; i < fnArray.length; i++) {
      const op = fnArray[i];
      
      if (op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject) {
        const imgName = argsArray[i][0];
        
        if (typeof imgName === 'string') {
          const imgObj = await new Promise((resolve) => {
            page.objs.get(imgName, resolve);
          });
          
          if (!imgObj || typeof imgObj !== 'object') continue;
          
          const obj = imgObj as Record<string, unknown>;
          
          let isJpegType = false;
          
          if (obj.dict && typeof obj.dict === 'object') {
            const dict = obj.dict as Record<string, unknown>;
            if (dict.get && typeof dict.get === 'function') {
              const filter = dict.get('Filter');
              if (filter && typeof filter === 'object') {
                const filterObj = filter as Record<string, unknown>;
                if (typeof filterObj.name === 'string') {
                  switch (filterObj.name) {
                    case 'DCTDecode':
                    case 'JPXDecode':
                      isJpegType = true;
                      break;
                  }
                }
              }
            }
          }
          
          if (!isJpegType && obj.data && obj.data instanceof Uint8Array) {
            const data = obj.data;
            if (data.length >= 2 && data[0] === 0xFF && data[1] === 0xD8) {
              isJpegType = true;
            }
          }
          
          if (isJpegType && obj.data && obj.data instanceof Uint8Array) {
            return obj.data;
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function calcFullImageCoverage(page: pdfjsLib.PDFPageProxy): Promise<boolean> {
  try {
    const operators = await page.getOperatorList();
    const { fnArray, argsArray } = operators;
    const OPS = pdfjsLib.OPS;
    
    const viewport = page.getViewport({ scale: 1 });
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;
    const pageArea = pageWidth * pageHeight;
    
    let totalImageArea = 0;
    
    for (let i = 0; i < fnArray.length; i++) {
      const op = fnArray[i];
      
      if (op === OPS.paintImageXObject) {
        const imgName = argsArray[i][0];
        if (typeof imgName === 'string') {
          const imgObj = await new Promise((resolve) => {
            page.objs.get(imgName, resolve);
          });
          
          if (imgObj && typeof imgObj === 'object') {
            const obj = imgObj as Record<string, unknown>;
            if (obj.width && obj.height) {
              const imgWidth = Number(obj.width);
              const imgHeight = Number(obj.height);
              totalImageArea += imgWidth * imgHeight;
            }
          }
        }
      }
    }
    
    return totalImageArea / pageArea > 0.9;
  } catch {
    return false;
  }
}

async function isScanPdf(page: pdfjsLib.PDFPageProxy): Promise<boolean> {
  try {

    const ops = await page.getOperatorList();
    const hasTextOp = ops.fnArray.some((f: number) => f === 32);
    const hasImageOp = ops.fnArray.some((f: number) => f === 35 || f === 85);
    
    const fullPageImage = await calcFullImageCoverage(page);
    
    if (!hasTextOp && hasImageOp && fullPageImage) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

const MIME_TYPES: Record<ImageFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
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

function writeUInt32BE(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = (value >> 24) & 0xff;
  buffer[offset + 1] = (value >> 16) & 0xff;
  buffer[offset + 2] = (value >> 8) & 0xff;
  buffer[offset + 3] = value & 0xff;
}

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  const table: number[] = [];
  
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  
  return (crc ^ 0xffffffff) >>> 0;
}

interface PngChunk {
  type: string;
  data: Uint8Array;
  crc: number;
}

async function setPngDpi(blob: Blob, dpi: number): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  
  const pngSig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== pngSig[i]) return blob;
  }
  
  const chunks: PngChunk[] = [];
  let offset = 8;
  
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) break;
    
    const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    
    if (offset + 12 + length > bytes.length) break;
    
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const crc = (bytes[offset + 8 + length] << 24) | 
                (bytes[offset + 9 + length] << 16) | 
                (bytes[offset + 10 + length] << 8) | 
                bytes[offset + 11 + length];
    
    chunks.push({ type, data, crc });
    offset += 12 + length;
  }
  
  const ppm = Math.round(dpi / 0.0254);
  
  const physChunkData = new Uint8Array(9);
  writeUInt32BE(physChunkData, 0, ppm);
  writeUInt32BE(physChunkData, 4, ppm);
  physChunkData[8] = 1;
  
  const physType = new TextEncoder().encode('pHYs');
  const crcData = new Uint8Array(4 + physChunkData.length);
  crcData.set(physType, 0);
  crcData.set(physChunkData, 4);
  
  const crcValue = crc32(crcData);
  
  const newChunks: PngChunk[] = [];
  let insertedPhys = false;
  
  for (const chunk of chunks) {
    if (chunk.type === 'pHYs') {
      continue;
    }
    
    newChunks.push(chunk);
    
    if (!insertedPhys && chunk.type === 'IHDR') {
      newChunks.push({
        type: 'pHYs',
        data: physChunkData,
        crc: crcValue,
      });
      insertedPhys = true;
    }
  }
  
  if (!insertedPhys && newChunks.length > 0) {
    newChunks.splice(1, 0, {
      type: 'pHYs',
      data: physChunkData,
      crc: crcValue,
    });
  }
  
  let totalSize = 8;
  for (const chunk of newChunks) {
    totalSize += 4 + 4 + chunk.data.length + 4;
  }
  
  const result = new Uint8Array(totalSize);
  
  result.set(pngSig, 0);
  offset = 8;
  
  for (const chunk of newChunks) {
    writeUInt32BE(result, offset, chunk.data.length);
    offset += 4;
    
    const typeBytes = new TextEncoder().encode(chunk.type);
    result.set(typeBytes, offset);
    offset += 4;
    
    result.set(chunk.data, offset);
    offset += chunk.data.length;
    
    writeUInt32BE(result, offset, chunk.crc);
    offset += 4;
  }
  
  return new Blob([result], { type: 'image/png' });
}

function injectExifDpi(jpgBuffer: Uint8Array, dpiX: number, dpiY: number): Uint8Array {
  const markerSOI = 0xffd8;
  if ((jpgBuffer[0] << 8 | jpgBuffer[1]) !== markerSOI) {
    return jpgBuffer;
  }
  
  const dpiXHigh = (dpiX >> 8) & 0xff;
  const dpiXLow = dpiX & 0xff;
  const dpiYHigh = (dpiY >> 8) & 0xff;
  const dpiYLow = dpiY & 0xff;
  
  const jfifApp0 = new Uint8Array([
    0xFF, 0xE0,
    0x00, 0x10,
    0x4A, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01,
    0x01,
    dpiXHigh, dpiXLow,
    dpiYHigh, dpiYLow,
    0x00, 0x00,
  ]);
  
  let offset = 2;
  while (offset + 3 < jpgBuffer.length) {
    const marker = (jpgBuffer[offset] << 8) | jpgBuffer[offset + 1];
    if ((marker & 0xFF00) !== 0xFF00) break;
    if (marker >= 0xFFE0 && marker <= 0xFFEF) {
      const length = (jpgBuffer[offset + 2] << 8) | jpgBuffer[offset + 3];
      offset += length + 2;
    } else {
      break;
    }
  }
  
  const total = 2 + jfifApp0.length + (jpgBuffer.length - offset);
  const out = new Uint8Array(total);
  let ptr = 0;
  out[ptr++] = 0xff;
  out[ptr++] = 0xd8;
  out.set(jfifApp0, ptr);
  ptr += jfifApp0.length;
  out.set(jpgBuffer.subarray(offset), ptr);
  return out;
}

function setJpegDpi(blob: Blob, dpi: number): Promise<Blob> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(arrayBuffer);
      const result = injectExifDpi(bytes, Math.round(dpi), Math.round(dpi));
      resolve(new Blob([new Uint8Array(result)], { type: 'image/jpeg' }));
    };
    reader.onerror = () => resolve(blob);
    reader.readAsArrayBuffer(blob);
  });
}

async function canvasToFormatBlob(
  canvas: HTMLCanvasElement,
  format: ImageFormat,
  quality: number,
  dpi?: number,
): Promise<Blob> {
  const blob = await canvasToBlob(canvas, format, quality);
  
  if (dpi && dpi !== 72) {
    if (format === 'png') {
      console.log('[DPI DEBUG] canvasToFormatBlob: calling setPngDpi with dpi=', dpi);
      return await setPngDpi(blob, dpi);
    } else if (format === 'jpg') {
      console.log('[DPI DEBUG] canvasToFormatBlob: calling setJpegDpi with dpi=', dpi);
      return await setJpegDpi(blob, dpi);
    }
  }
  
  return blob;
}

async function getNativeImageResolution(page: pdfjsLib.PDFPageProxy): Promise<{ width: number; height: number } | null> {
  try {
    const operators = await page.getOperatorList();
    const { fnArray, argsArray } = operators;
    let maxImageWidth = 0;
    let maxImageHeight = 0;

    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i];
      const args = argsArray[i];

      if (fn === pdfjsLib.OPS.paintImageXObject) {
        const objId = args[0];
        if (typeof objId === 'string') {
          const imgObj = await new Promise((resolve) => {
            page.objs.get(objId, resolve);
          });
          
          if (imgObj && typeof imgObj === 'object') {
            const obj = imgObj as Record<string, unknown>;
            let imgWidth: number | undefined;
            let imgHeight: number | undefined;
            
            if (typeof obj.width === 'number' && typeof obj.height === 'number') {
              imgWidth = obj.width;
              imgHeight = obj.height;
            } else if (obj.bitmap && typeof obj.bitmap === 'object') {
              const bitmap = obj.bitmap as Record<string, unknown>;
              imgWidth = bitmap.width as number | undefined;
              imgHeight = bitmap.height as number | undefined;
            }
            
            if (typeof imgWidth === 'number' && typeof imgHeight === 'number') {
              maxImageWidth = Math.max(maxImageWidth, imgWidth);
              maxImageHeight = Math.max(maxImageHeight, imgHeight);
            }
          }
        }
      } else if (fn === pdfjsLib.OPS.paintImageMaskXObject || fn === pdfjsLib.OPS.paintInlineImageXObject) {
        const imgData = args[0];
        if (imgData && typeof imgData === 'object' && typeof imgData.width === 'number' && typeof imgData.height === 'number') {
          maxImageWidth = Math.max(maxImageWidth, imgData.width);
          maxImageHeight = Math.max(maxImageHeight, imgData.height);
        }
      } else if (fn === pdfjsLib.OPS.paintImageXObjectRepeat) {
        const objId = args[0];
        if (typeof objId === 'string') {
          const imgObj = await new Promise((resolve) => {
            page.objs.get(objId, resolve);
          });
          
          if (imgObj && typeof imgObj === 'object') {
            const obj = imgObj as Record<string, unknown>;
            let imgWidth: number | undefined;
            let imgHeight: number | undefined;
            
            if (obj.bitmap && typeof obj.bitmap === 'object') {
              const bitmap = obj.bitmap as Record<string, unknown>;
              imgWidth = bitmap.width as number | undefined;
              imgHeight = bitmap.height as number | undefined;
            } else {
              imgWidth = obj.width as number | undefined;
              imgHeight = obj.height as number | undefined;
            }
            
            if (typeof imgWidth === 'number' && typeof imgHeight === 'number') {
              maxImageWidth = Math.max(maxImageWidth, imgWidth);
              maxImageHeight = Math.max(maxImageHeight, imgHeight);
            }
          }
        }
      }
    }

    if (maxImageWidth > 0 && maxImageHeight > 0) {
      return { width: maxImageWidth, height: maxImageHeight };
    }
  } catch {
    // ignore errors
  }

  return null;
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

  let autoFormat: ImageFormat = 'png';
  if (options.format === 'auto' && total > 0) {
    const firstPage = await pdf.getPage(1);
    const isScan = await isScanPdf(firstPage);
    autoFormat = isScan ? 'jpg' : 'png';
    firstPage.cleanup();
  }

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });

    const previewScale = 0.4;
    const previewViewport = page.getViewport({ scale: previewScale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to get canvas context');
    
    canvas.width = Math.floor(previewViewport.width);
    canvas.height = Math.floor(previewViewport.height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: context, viewport: previewViewport }).promise;
    
    const previewBlob = await canvasToFormatBlob(canvas, 'jpg', 0.8);
    const previewUrl = URL.createObjectURL(previewBlob);
    
    canvas.width = 0;
    canvas.height = 0;
    
    const outputFormat = options.format === 'auto' ? autoFormat : options.format;

    results.push({
      pageNumber: i,
      format: outputFormat,
      previewUrl,
      width: Math.floor(baseViewport.width),
      height: Math.floor(baseViewport.height),
    });

    options.onProgress?.(i, total);
    page.cleanup();
    
    await new Promise((r) => setTimeout(r, 0));
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

function createPHYsChunk(dpiX: number, dpiY: number): Uint8Array {
  const ppmX = Math.round(dpiX / 0.0254);
  const ppmY = Math.round(dpiY / 0.0254);
  
  const data = new Uint8Array(9);
  writeUInt32BE(data, 0, ppmX);
  writeUInt32BE(data, 4, ppmY);
  data[8] = 1;
  
  const type = new TextEncoder().encode('pHYs');
  const crcData = new Uint8Array(4 + data.length);
  crcData.set(type, 0);
  crcData.set(data, 4);
  
  const crcValue = crc32(crcData);
  
  const chunk = new Uint8Array(12 + data.length);
  writeUInt32BE(chunk, 0, data.length);
  chunk.set(type, 4);
  chunk.set(data, 8);
  writeUInt32BE(chunk, 8 + data.length, crcValue);
  
  return chunk;
}

function insertChunk(pngBuffer: Uint8Array, newChunk: Uint8Array): Uint8Array {
  const pngSig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  const result = new Uint8Array(pngBuffer.length + newChunk.length);
  
  let ptr = 0;
  for (const b of pngSig) {
    result[ptr++] = b;
  }
  
  let offset = 8;
  let inserted = false;
  
  while (offset < pngBuffer.length) {
    if (offset + 12 > pngBuffer.length) break;
    
    const length = (pngBuffer[offset] << 24) | (pngBuffer[offset + 1] << 16) | 
                   (pngBuffer[offset + 2] << 8) | pngBuffer[offset + 3];
    const type = String.fromCharCode(pngBuffer[offset + 4], pngBuffer[offset + 5], 
                                     pngBuffer[offset + 6], pngBuffer[offset + 7]);
    
    if (offset + 12 + length > pngBuffer.length) break;
    
    if (type === 'pHYs') {
      offset += 12 + length;
      continue;
    }
    
    if (!inserted && (type === 'IDAT' || type === 'IEND')) {
      result.set(newChunk, ptr);
      ptr += newChunk.length;
      inserted = true;
    }
    
    const chunkEnd = offset + 12 + length;
    result.set(pngBuffer.subarray(offset, chunkEnd), ptr);
    ptr += chunkEnd - offset;
    offset = chunkEnd;
  }
  
  if (!inserted) {
    result.set(newChunk, ptr);
    ptr += newChunk.length;
  }
  
  return result.subarray(0, ptr);
}

async function renderPageToCanvas(
  page: pdfjsLib.PDFPageProxy,
  viewport: pdfjsLib.PageViewport,
  format: ImageFormat,
  quality: number,
  dpi: number,
): Promise<Blob> {
  const width = Math.floor(viewport.width);
  const height = Math.floor(viewport.height);
  
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = dpi < 600;
      ctx.imageSmoothingQuality = 'high';
      await page.render({ 
        canvas: canvas as unknown as HTMLCanvasElement, 
        canvasContext: ctx as unknown as CanvasRenderingContext2D, 
        viewport,
        background: 'white',
      }).promise;
      
      let blob = await canvas.convertToBlob({ type: MIME_TYPES[format], quality });
      if (dpi !== 72 && format === 'png') {
        const arrayBuf = await blob.arrayBuffer();
        const pngRaw = new Uint8Array(arrayBuf);
        const pHYsChunk = createPHYsChunk(dpi, dpi);
        const finalPng = insertChunk(pngRaw, pHYsChunk);
        //const finalPngBuffer = finalPng.buffer.slice(finalPng.byteOffset, finalPng.byteOffset + finalPng.byteLength);
        blob = new Blob([new Uint8Array(finalPng)], { type: 'image/png' });
      } else if (dpi !== 72 && format === 'jpg') {
        const arrayBuf = await blob.arrayBuffer();
        const jpgRaw = new Uint8Array(arrayBuf);
        const jpgWithDpi = injectExifDpi(jpgRaw, Math.round(dpi), Math.round(dpi));
        //const jpgBuffer = jpgWithDpi.buffer.slice(jpgWithDpi.byteOffset, jpgWithDpi.byteOffset + jpgWithDpi.byteLength);
        blob = new Blob([new Uint8Array(jpgWithDpi)], { type: 'image/jpeg' });
      }
      return blob;
    }
    throw new Error('Failed to get canvas context');
  } else {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to get canvas context');
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = dpi < 600;
    context.imageSmoothingQuality = 'high';
    await page.render({ 
      canvas, 
      canvasContext: context, 
      viewport,
      background: 'white',
    }).promise;
    
    return await canvasToFormatBlob(canvas, format, quality, dpi);
  }
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

  const isScan = await isScanPdf(page);
  
  let outputFormat: ImageFormat;
  if (options.outputFormat) {
    outputFormat = options.outputFormat;
  } else if (options.format === 'auto') {
    outputFormat = isScan ? 'jpg' : 'png';
  } else {
    outputFormat = options.format;
  }
  
  let targetDpi = options.dpi;
  let nativeResolution: { width: number; height: number } | null = null;
  
  if (isScan) {
    nativeResolution = await getNativeImageResolution(page);
    
    if (targetDpi === 'original' && nativeResolution) {
      const pageView = page.view;
      const pageWidthInPoints = pageView[2] - pageView[0];
      const pageHeightInPoints = pageView[3] - pageView[1];
      const pageWidthInInches = pageWidthInPoints / 72;
      const pageHeightInInches = pageHeightInPoints / 72;
      
      const dpiX = Math.round(nativeResolution.width / pageWidthInInches);
      const dpiY = Math.round(nativeResolution.height / pageHeightInInches);
      const detectedDpi = Math.round((dpiX + dpiY) / 2);
      
      if (detectedDpi < 140) {
        targetDpi = 72;
      } else if (detectedDpi < 290) {
        targetDpi = 150;
      } else if (detectedDpi < 590) {
        targetDpi = 300;
      } else {
        targetDpi = 600;
      }
    } else if (targetDpi === 'original') {
      targetDpi = 300;
    }
  } else if (targetDpi === 'original') {
    targetDpi = 300;
  }
  
  let viewport: pdfjsLib.PageViewport;
  
  if (isScan && nativeResolution) {
    const pageView = page.view;
    const pageWidthInPoints = pageView[2] - pageView[0];
    const scale = nativeResolution.width / pageWidthInPoints;
    viewport = page.getViewport({ scale });
  } else {
    const scale = targetDpi / 72;
    viewport = page.getViewport({ scale });
  }
  
  const blob = await renderPageToCanvas(page, viewport, outputFormat, options.quality, targetDpi);
  
  page.cleanup();
  await loadingTask.destroy();
  
  return blob;
}