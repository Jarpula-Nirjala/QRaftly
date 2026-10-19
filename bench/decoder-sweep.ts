/**
 * Decoder benchmark: 200 random synthetic photos (any rotation, strong perspective, blur, noise, shadow),
 * read by our decoder and by jsQR for comparison. Run: node bench/decoder-sweep.ts
 */
import jsQRModule from 'jsqr';
import { quadToQuad, scanImage } from '../shared/qr/detect.ts';
import { encodeText } from '../shared/qr/encode.ts';
const jsQR = jsQRModule as unknown as (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null;
let seed = 7; const R = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
let ours = 0, theirs = 0, N = 200, fails: string[] = []; let t0 = 0, tOurs = 0;
for (let k = 0; k < N; k++) {
  const len = [10, 40, 90, 180][k % 4];
  const text = Array.from({ length: len }, () => 'abcdefghijklmnopqrstuvwxyz0123456789/:.'[Math.floor(R() * 39)]).join('');
  const qr = encodeText(text, { ecl: (['L', 'M', 'Q', 'H'] as const)[Math.floor(R() * 4)] });
  const n = qr.size, total = n + 8, w = 640, h = 480;
  const half = 90 + R() * 130, a = R() * Math.PI * 2, cx = 320 + (R() - .5) * 60, cy = 240 + (R() - .5) * 40;
  const quad = [[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([sx, sy]) => { const k2 = 1 + (R() - .5) * 0.35; return [cx + half * k2 * (sx * Math.cos(a) - sy * Math.sin(a)), cy + half * k2 * (sx * Math.sin(a) + sy * Math.cos(a))]; });
  const map = quadToQuad(quad, [0, 0, total, 0, total, total, 0, total]);
  const g = new Float64Array(w * h), shade = R() < .5, noise = 5 + R() * 20, blur = R() < .5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (const [ox, oy] of [[.25, .25], [.75, .25], [.25, .75], [.75, .75]]) { const p = map(x + ox, y + oy); const mx = Math.floor(p.x) - 4, my = Math.floor(p.y) - 4; const out = p.x < 0 || p.y < 0 || p.x >= total || p.y >= total; v += (out ? 120 + 60 * Math.sin(x / 23) : mx >= 0 && my >= 0 && mx < n && my < n && qr.modules[my][mx] ? 35 : 220) / 4; } if (shade) v *= .5 + .5 * x / w; g[y * w + x] = v; }
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { let v = g[i]; if (blur) { const x = i % w, y = (i / w) | 0; if (x > 0 && y > 0 && x < w - 1 && y < h - 1) v = (g[i] * 4 + g[i - 1] + g[i + 1] + g[i - w] + g[i + w]) / 8; } v += (R() - .5) * 2 * noise; rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255; }
  t0 = performance.now(); const o = scanImage(rgba, w, h); tOurs += performance.now() - t0;
  if (o?.text === text) ours++; else fails.push(`v${qr.version}${qr.ecl} mod=${(2 * half / total).toFixed(1)}px a=${(a * 180 / Math.PI).toFixed(0)} blur=${blur} shade=${shade} noise=${noise.toFixed(0)}`);
  if (jsQR(rgba, w, h)?.data === text) theirs++;
}
console.log(`ours ${ours}/${N}  jsQR ${theirs}/${N}  avg ${(tOurs / N).toFixed(1)} ms/frame`); console.log(fails.slice(0, 15).join('\n'));
