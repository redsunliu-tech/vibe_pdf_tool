import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculatePageLayout, convertImagesToPdf, type ImageConvertOptions } from './imageToPdf';

describe('calculatePageLayout', () => {
  it('should return correct dimensions for A4 portrait with landscape image', () => {
    const layout = calculatePageLayout('a4', 'auto', 10, 1920, 1080);
    expect(layout.width).toBe(297);
    expect(layout.height).toBe(210);
    expect(layout.orientation).toBe('landscape');
  });

  it('should return correct dimensions for A4 portrait with portrait image', () => {
    const layout = calculatePageLayout('a4', 'auto', 10, 1080, 1920);
    expect(layout.width).toBe(210);
    expect(layout.height).toBe(297);
    expect(layout.orientation).toBe('portrait');
  });

  it('should return correct dimensions for A4 landscape', () => {
    const layout = calculatePageLayout('a4', 'landscape', 10, 1080, 1920);
    expect(layout.width).toBe(297);
    expect(layout.height).toBe(210);
    expect(layout.orientation).toBe('landscape');
  });

  it('should return correct dimensions for Letter', () => {
    const layout = calculatePageLayout('letter', 'auto', 10, 1080, 1920);
    expect(layout.width).toBe(216);
    expect(layout.height).toBe(279);
    expect(layout.orientation).toBe('portrait');
  });

  it('should return fit to image dimensions', () => {
    const layout = calculatePageLayout('fit', 'auto', 0, 1080, 1920);
    expect(layout.margin).toBe(0);
    expect(layout.width).toBeCloseTo(1080 * 0.264583, 2);
    expect(layout.height).toBeCloseTo(1920 * 0.264583, 2);
  });

  it('should calculate correct draw position with margins', () => {
    const layout = calculatePageLayout('a4', 'portrait', 10, 1080, 1920);
    expect(layout.drawX).toBeGreaterThanOrEqual(0);
    expect(layout.drawY).toBeGreaterThanOrEqual(0);
    expect(layout.drawW).toBeLessThanOrEqual(layout.width - 20);
    expect(layout.drawH).toBeLessThanOrEqual(layout.height - 20);
  });
});

describe('convertImagesToPdf', () => {
  beforeEach(() => {
    const mockGetContext = vi.fn(() => ({
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    }));
    
    (globalThis as any).document.createElement = vi.fn((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: mockGetContext,
          toDataURL: vi.fn(() => 'data:image/png;base64,test'),
        };
      }
      return {};
    });

    interface MockImage {
      onload?: ((ev: Event) => any) | null;
      onerror?: ((ev: Event) => any) | null;
      _src?: string;
      width: number;
      height: number;
      src?: string;
    }
    
    (globalThis as any).Image = vi.fn(function Image() {
      const img: MockImage = {
        onload: null,
        onerror: null,
        width: 1080,
        height: 1920,
      };
      Object.defineProperty(img, 'src', {
        set(value: string) {
          img._src = value;
          setTimeout(() => {
            if (typeof img.onload === 'function') {
              img.onload(new Event('load'));
            }
          }, 0);
        },
        get() {
          return img._src;
        },
      });
      return img;
    });
  });

  it('should generate single PDF for single mode', async () => {
    const mockFile = new File([''], 'test.png', { type: 'image/png' });
    
    const result = await convertImagesToPdf([{
      file: mockFile,
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      previewUrl: 'blob://test',
      width: 1080,
      height: 1920,
    }], {
      pageSize: 'a4',
      orientation: 'auto',
      margin: 10,
      outputMode: 'single',
    } as ImageConvertOptions);

    expect(result).toBeInstanceOf(Blob);
    const blob = result as Blob;
    expect(blob.type).toBe('application/pdf');
  });

  it('should generate multiple PDFs for multiple mode', async () => {
    const mockFile1 = new File([''], 'test1.png', { type: 'image/png' });
    const mockFile2 = new File([''], 'test2.png', { type: 'image/png' });
    
    const result = await convertImagesToPdf([
      {
        file: mockFile1,
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        previewUrl: 'blob://test1',
        width: 1080,
        height: 1920,
      },
      {
        file: mockFile2,
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        previewUrl: 'blob://test2',
        width: 1080,
        height: 1920,
      },
    ], {
      pageSize: 'a4',
      orientation: 'auto',
      margin: 10,
      outputMode: 'multiple',
    } as ImageConvertOptions);

    expect(Array.isArray(result)).toBe(true);
    const blobs = result as Blob[];
    expect(blobs.length).toBe(2);
    blobs.forEach((blob) => {
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('application/pdf');
    });
  });

  it('should call onProgress callback', async () => {
    const mockFile = new File([''], 'test.png', { type: 'image/png' });
    const onProgress = vi.fn();
    
    await convertImagesToPdf([{
      file: mockFile,
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      previewUrl: 'blob://test',
      width: 1080,
      height: 1920,
    }], {
      pageSize: 'a4',
      orientation: 'auto',
      margin: 10,
      outputMode: 'single',
      onProgress,
    } as ImageConvertOptions);

    expect(onProgress).toHaveBeenCalled();
  });
});