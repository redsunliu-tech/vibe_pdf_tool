import '@testing-library/jest-dom';
import { vi } from 'vitest';

(globalThis as any).URL.createObjectURL = vi.fn(() => `blob://${Math.random().toString(36).substring(2, 11)}`);
(globalThis as any).URL.revokeObjectURL = vi.fn();

const mockCanvasToDataURL = vi.fn(() => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
const mockGetContext = vi.fn(() => ({
  fillStyle: '',
  fillRect: vi.fn(),
  drawImage: vi.fn(),
}));

interface MockCanvas {
  width: number;
  height: number;
  getContext: typeof mockGetContext;
  toDataURL: typeof mockCanvasToDataURL;
}

(globalThis as any).document.createElement = vi.fn((tag: string) => {
  if (tag === 'canvas') {
    return {
      width: 0,
      height: 0,
      getContext: mockGetContext,
      toDataURL: mockCanvasToDataURL,
    } as MockCanvas;
  }
  return {};
});

interface MockImage {
  onload?: ((ev: Event) => void) | null;
  onerror?: ((ev: Event) => void) | null;
  _src?: string;
  width: number;
  height: number;
  src?: string;
}

(globalThis as any).Image = vi.fn(function Image() {
  const img: MockImage = {
    onload: null,
    onerror: null,
    _src: '',
    width: 1080,
    height: 1920,
  };
  Object.defineProperty(img, 'src', {
    set(value) {
      img._src = value;
      setTimeout(() => {
        if (typeof img.onload === 'function') {
          img.onload!(new Event('load'));
        }
      }, 0);
    },
    get() {
      return img._src;
    },
  });
  return img;
});