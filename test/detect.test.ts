import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { quadToQuad, scanImage } from '../shared/qr/detect.ts';
import { encodeText } from '../shared/qr/encode.ts';
import type { Ecl } from '../shared/qr/tables.ts';

/** A seeded random number generator, so failures can be reproduced. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

interface Scene {
  text: string;
  ecl?: Ecl;
  /** Where the code's four corners land in the photo (TL, TR, BR, BL). */
  quad: number[];
  w?: number;
  h?: number;
  noise?: number;
  blur?: boolean;
  shadow?: boolean;
  invert?: boolean;
  mirror?: boolean;
  dark?: number;
  light?: number;
}

/** "Photographs" a code: projects it into the frame with bilinear sampling, then adds light falloff, blur and noise. */
function photo(s: Scene) {
  const w = s.w ?? 480;
  const h = s.h ?? 360;
  const qr = encodeText(s.text, { ecl: s.ecl ?? 'M' });
  const n = qr.size;
  const margin = 4;
  const total = n + margin * 2;
  const toCode = quadToQuad(s.quad, [0, 0, total, 0, total, total, 0, total]);
  const dark = s.dark ?? 30;
  const light = s.light ?? 225;
  const lum = (mx: number, my: number) => {
    let x = Math.floor(mx) - margin;
    const y = Math.floor(my) - margin;
    if (s.mirror) x = n - 1 - x;
    const on = x >= 0 && y >= 0 && x < n && y < n && qr.modules[y][x];
    return (on !== !!s.invert) ? dark : light;
  };
  const rand = rng(n * 7919 + w);
  let gray = new Float64Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = toCode(x + 0.5, y + 0.5);
      let v: number;
      if (p.x < 0 || p.y < 0 || p.x >= total || p.y >= total) v = 120 + 60 * Math.sin(x / 23) * Math.cos(y / 31); // a busy table top
      else {
        // 2×2 supersampling smooths module edges like a real lens does.
        v = 0;
        for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
          const q = toCode(x + ox, y + oy);
          v += lum(q.x, q.y) / 4;
        }
      }
      if (s.shadow) v *= 0.45 + 0.55 * (x / w); // light falls off towards the left
      gray[y * w + x] = v;
    }
  if (s.blur) {
    const b = new Float64Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let t = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) t += gray[(y + j) * w + x + i];
      b[y * w + x] = t / 9;
    }
    gray = b;
  }
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = gray[i] + (rand() - 0.5) * 2 * (s.noise ?? 12);
    rgba[i * 4] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  return { rgba, w, h, version: qr.version };
}

const rotated = (cx: number, cy: number, half: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([sx, sy]) => [cx + half * (sx * Math.cos(a) - sy * Math.sin(a)), cy + half * (sx * Math.sin(a) + sy * Math.cos(a))]);
};

const read = (s: Scene) => {
  const p = photo(s);
  return { got: scanImage(p.rgba, p.w, p.h), version: p.version };
};

describe('camera decoder (from raw pixels)', () => {
  it('reads a small, straight code', () => {
    const { got } = read({ text: 'HELLO', quad: rotated(240, 180, 60, 0) });
    assert.equal(got?.text, 'HELLO');
  });

  for (const deg of [17, 45, 90, 160, 210, 300]) {
    it(`reads a version 5 code rotated ${deg}°`, () => {
      const text = 'https://qraftly.example/t/AbCdEfGhIjKl.0123456789abcdef';
      const { got, version } = read({ text, quad: rotated(240, 180, 110, deg) });
      assert.ok(version >= 4);
      assert.equal(got?.text, text);
    });
  }

  it('reads a code seen at an angle (perspective), with blur and noise', () => {
    const text = 'WIFI:T:WPA;S:Hotel-101;P:correct horse battery;;';
    const { got } = read({ text, quad: [150, 50, 380, 85, 360, 320, 120, 300], blur: true, noise: 18 });
    assert.equal(got?.text, text);
  });

  it('reads a larger version (10+) tilted away from the camera', () => {
    const text = `https://qraftly.example/v/${'x'.repeat(220)}`;
    const { got, version } = read({ text, ecl: 'Q', w: 800, h: 700, quad: [140, 90, 660, 60, 700, 640, 100, 620] });
    assert.ok(version >= 10, `version ${version}`);
    assert.equal(got?.text, text);
  });

  it('copes with a shadow across the code and low contrast', () => {
    const text = 'upi://pay?pa=asha@ybl&pn=Asha&cu=INR';
    const { got } = read({ text, quad: rotated(240, 180, 120, 8), shadow: true, dark: 70, light: 170 });
    assert.equal(got?.text, text);
  });

  it('reads light-on-dark and mirrored codes', () => {
    assert.equal(read({ text: 'inverted', quad: rotated(240, 180, 110, 12), invert: true }).got?.text, 'inverted');
    assert.equal(read({ text: 'mirrored', quad: rotated(240, 180, 110, -20), mirror: true }).got?.text, 'mirrored');
  });

  it('reports the corners where the code is', () => {
    const { got } = read({ text: 'corners', quad: rotated(240, 180, 100, 0) });
    const [tl, , br] = got!.corners;
    // The detected box is the code without its quiet zone: 100 px × (n / (n + 8)) from the centre.
    assert.ok(tl.x > 140 && tl.x < 175 && tl.y > 80 && tl.y < 115, JSON.stringify(tl));
    assert.ok(br.x > 305 && br.x < 340, JSON.stringify(br));
  });

  it('finds nothing in a frame without a code', () => {
    const rand = rng(42);
    const w = 320;
    const h = 240;
    const rgba = new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : 128 + 100 * Math.sin(i / 97) + rand() * 40));
    assert.equal(scanImage(rgba, w, h), null);
  });
});
