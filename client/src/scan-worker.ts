import { scanImage } from '../../shared/qr/detect.ts';

interface Frame {
  id: number;
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

// Typed by hand: the "webworker" lib clashes with the DOM types the rest of the app compiles with.
const scope = self as unknown as { onmessage: ((e: MessageEvent<Frame>) => void) | null; postMessage(msg: unknown): void };

/** Decodes camera frames off the main thread, so the video stays smooth. */
scope.onmessage = (e) => {
  const { id, data, width, height } = e.data;
  let text: string | null = null;
  let corners: Array<{ x: number; y: number }> | null = null;
  try {
    const got = scanImage(data, width, height);
    if (got) ({ text, corners } = got);
  } catch {
    // an unreadable frame: try the next one
  }
  scope.postMessage({ id, text, corners });
};
