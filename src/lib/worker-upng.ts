import UPNG from 'upng-js';

function writeUInt32BE(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = (value >> 24) & 0xff;
  buffer[offset + 1] = (value >> 16) & 0xff;
  buffer[offset + 2] = (value >> 8) & 0xff;
  buffer[offset + 3] = value & 0xff;
}

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
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

self.onmessage = (e: MessageEvent) => {
  try {
    const { pixelData, w, h, dpi } = e.data;
    
    if (!pixelData || !pixelData.buffer) {
      throw new Error('pixelData is missing');
    }
    
    const pixelBuffer = pixelData.buffer;
    const rawPng = UPNG.encode([pixelBuffer], w, h, 0);
    
    const rawPngUint8 = new Uint8Array(rawPng);
    
    const pHYsChunk = createPHYsChunk(dpi, dpi);
    const finalPng = insertChunk(rawPngUint8, pHYsChunk);
    
    postMessage(finalPng);
  } catch (err) {
    postMessage({ error: (err as Error).message });
  }
};
