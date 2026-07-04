import '@testing-library/jest-dom';

global.URL.createObjectURL = vi.fn((blob) => `blob://${Math.random().toString(36).substr(2, 9)}`);
global.URL.revokeObjectURL = vi.fn();

const mockCanvasToDataURL = vi.fn(() => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
const mockGetContext = vi.fn(() => ({
  fillStyle: '',
  fillRect: vi.fn(),
  drawImage: vi.fn(),
}));

global.document.createElement = vi.fn((tag) => {
  if (tag === 'canvas') {
    return {
      width: 0,
      height: 0,
      getContext: mockGetContext,
      toDataURL: mockCanvasToDataURL,
    };
  }
  return {};
});

global.Image = vi.fn(function Image(this: Partial<HTMLImageElement>) {
  const img: Partial<HTMLImageElement> = {
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
          img.onload!();
        }
      }, 0);
    },
    get() {
      return img._src;
    },
  });
  return img;
});