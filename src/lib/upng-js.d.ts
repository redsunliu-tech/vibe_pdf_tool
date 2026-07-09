declare module 'upng-js' {
  export function encode(bufs: Uint8Array[], w: number, h: number, ps?: number, dels?: number, forbidPlte?: boolean): Uint8Array;
  export function decode(data: Uint8Array): {
    width: number;
    height: number;
    depth: number;
    ctype: number;
    data: Uint8Array;
    frames?: {
      data: Uint8Array;
      rect: { x: number; y: number; width: number; height: number };
      delay: number;
      dispose: number;
      blend: number;
    }[];
    tabs: Record<string, unknown>;
  };
}