import { decodeMatrix, type Decoded } from './decode.ts';

/**
 * Finds and reads a QR code in a camera frame or photo, from raw pixels:
 *   1. grey levels → black/white with a local-mean threshold (copes with shadows and uneven light);
 *   2. finder patterns: runs of dark:light:dark:light:dark in the ratio 1:1:3:1:1 on a row, confirmed down
 *      the column and back across the row;
 *   3. the three finders give the orientation and size; for version 2+ the bottom-right alignment pattern
 *      is located by template matching, which corrects for perspective;
 *   4. a perspective transform maps every module's centre into the image, the grid is sampled and the
 *      module matrix goes to the same decoder (with Reed–Solomon error correction) the tests use.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Detected extends Decoded {
  /** The code's corners in the image: top-left, top-right, bottom-right, bottom-left. */
  corners: [Point, Point, Point, Point];
}

interface Finder extends Point {
  size: number; // module size in pixels
  count: number; // how many scan lines confirmed it
}

// ------------------------------------------------------------- binarise

function toGray(rgba: ArrayLike<number>, n: number): Uint8Array {
  const g = new Uint8Array(n);
  for (let i = 0; i < n; i++) g[i] = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8;
  return g;
}

/** 1 = dark. A pixel is dark when it is clearly darker than the mean of the square around it. */
export function binarize(gray: Uint8Array, w: number, h: number): Uint8Array {
  const W = w + 1;
  const sum = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + row;
    }
  }
  const r = Math.max(6, Math.round(Math.min(w, h) / 18));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const total = sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0];
      const mean = total / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = gray[y * w + x] < mean * 0.94 - 2 ? 1 : 0;
    }
  }
  return out;
}

// ------------------------------------------------------------- finder patterns

function ratioOk(c: number[]): boolean {
  const total = c[0] + c[1] + c[2] + c[3] + c[4];
  if (total < 7) return false;
  const m = total / 7;
  const v = m / 1.6;
  return Math.abs(m - c[0]) < v && Math.abs(m - c[1]) < v && Math.abs(3 * m - c[2]) < 3 * v && Math.abs(m - c[3]) < v && Math.abs(m - c[4]) < v;
}

class Image {
  readonly bin: Uint8Array;
  readonly w: number;
  readonly h: number;
  constructor(bin: Uint8Array, w: number, h: number) {
    this.bin = bin;
    this.w = w;
    this.h = h;
  }
  /** 1 dark, 0 light, -1 outside the image. */
  at(x: number, y: number): number {
    const xi = Math.round(x);
    const yi = Math.round(y);
    return xi < 0 || yi < 0 || xi >= this.w || yi >= this.h ? -1 : this.bin[yi * this.w + xi];
  }

  /**
   * Checks for a 1:1:3:1:1 pattern through (cx, cy) along (dx, dy). Returns the refined centre (as a step
   * count from cx, cy) and the pattern's total length, or null.
   */
  cross(cx: number, cy: number, dx: number, dy: number, maxRun: number): { offset: number; total: number } | null {
    const c = [0, 0, 0, 0, 0];
    const at = (k: number) => this.at(cx + dx * k, cy + dy * k);
    let k = 0;
    if (at(0) !== 1) return null;
    while (at(k) === 1) (c[2]++, k--);
    while (at(k) === 0 && c[1] <= maxRun) (c[1]++, k--);
    if (at(k) !== 1 || c[1] > maxRun) return null;
    while (at(k) === 1 && c[0] <= maxRun) (c[0]++, k--);
    if (c[0] > maxRun) return null;
    k = 1;
    while (at(k) === 1) (c[2]++, k++);
    while (at(k) === 0 && c[3] <= maxRun) (c[3]++, k++);
    if (at(k) !== 1 || c[3] > maxRun) return null;
    while (at(k) === 1 && c[4] <= maxRun) (c[4]++, k++);
    if (c[4] > maxRun || !ratioOk(c)) return null;
    return { offset: k - c[4] - c[3] - c[2] / 2, total: c[0] + c[1] + c[2] + c[3] + c[4] };
  }
}

function findFinders(img: Image): Finder[] {
  const found: Finder[] = [];
  const { w, h } = img;
  const step = h > 900 ? 2 : 1;
  const consider = (c: number[], endX: number, y: number) => {
    const total = c[0] + c[1] + c[2] + c[3] + c[4];
    const cx = endX - c[4] - c[3] - c[2] / 2;
    const v = img.cross(cx, y, 0, 1, c[2]);
    if (!v || 5 * Math.abs(v.total - total) >= 2 * total) return;
    const cy = y + v.offset;
    const hz = img.cross(cx, cy, 1, 0, c[2]);
    if (!hz) return;
    const x = cx + hz.offset;
    // A diagonal check rejects most text and texture that happens to match on a row and a column.
    const d = img.cross(x, cy, 1, 1, c[2]);
    if (!d) return;
    const size = (hz.total + v.total) / 14;
    const near = found.find((f) => Math.abs(f.x - x) <= f.size * 1.5 && Math.abs(f.y - cy) <= f.size * 1.5 && Math.abs(f.size - size) <= Math.max(1, f.size * 0.4));
    if (near) {
      const n = near.count + 1;
      near.x = (near.x * near.count + x) / n;
      near.y = (near.y * near.count + cy) / n;
      near.size = (near.size * near.count + size) / n;
      near.count = n;
    } else found.push({ x, y: cy, size, count: 1 });
  };
  const c = [0, 0, 0, 0, 0];
  for (let y = 0; y < h; y += step) {
    c.fill(0);
    let state = 0;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (img.bin[row + x]) {
        if (state & 1) state++;
        c[state]++;
      } else if (state & 1) c[state]++;
      else if (state === 0) {
        if (c[0]) (state = 1), (c[1] = 1);
      } else if (state === 4) {
        if (ratioOk(c)) consider(c, x, y);
        [c[0], c[1], c[2], c[3], c[4]] = [c[2], c[3], c[4], 1, 0];
        state = 3;
      } else c[++state]++;
    }
    if (state === 4 && ratioOk(c)) consider(c, w, y);
  }
  return found;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Triples that could be the three finders of one code, best first, as [top-left, top-right, bottom-left]. */
function triples(finders: Finder[]): Array<[Finder, Finder, Finder]> {
  const minCount = finders.filter((f) => f.count >= 2).length >= 3 ? 2 : 1;
  const pool = finders.filter((f) => f.count >= minCount).sort((a, b) => b.count - a.count).slice(0, 12);
  const out: Array<{ t: [Finder, Finder, Finder]; score: number }> = [];
  for (let i = 0; i < pool.length; i++)
    for (let j = i + 1; j < pool.length; j++)
      for (let k = j + 1; k < pool.length; k++) {
        const p = [pool[i], pool[j], pool[k]];
        const sizes = p.map((f) => f.size);
        if (Math.max(...sizes) / Math.min(...sizes) > 1.8) continue;
        // The corner finder is the one opposite the longest side.
        const d = [dist(p[1], p[2]), dist(p[0], p[2]), dist(p[0], p[1])];
        const corner = d.indexOf(Math.max(...d));
        const B = p[corner];
        let [A, C] = p.filter((_, n) => n !== corner);
        const ab = dist(A, B);
        const cb = dist(C, B);
        if (Math.max(ab, cb) / Math.min(ab, cb) > 2.2 || Math.min(ab, cb) < 7 * B.size) continue;
        const cos = ((A.x - B.x) * (C.x - B.x) + (A.y - B.y) * (C.y - B.y)) / (ab * cb);
        if (Math.abs(cos) > 0.6) continue;
        // In image coordinates (y down) top-right × bottom-left is positive for an unmirrored code.
        if ((A.x - B.x) * (C.y - B.y) - (A.y - B.y) * (C.x - B.x) < 0) [A, C] = [C, A];
        const sizeSpread = Math.max(...sizes) / Math.min(...sizes);
        out.push({ t: [B, A, C], score: p.reduce((s, f) => s + Math.min(f.count, 8), 0) - Math.abs(cos) * 6 - (sizeSpread - 1) * 6 - Math.abs(Math.log(ab / cb)) * 6 });
      }
  return out.sort((a, b) => b.score - a.score).map((x) => x.t);
}

// ------------------------------------------------------------- geometry

type M3 = number[]; // row-major 3×3, [X·w, Y·w, w] = M · [x, y, 1]

function squareToQuad(q: number[]): M3 {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q;
  const dx3 = x0 - x1 + x2 - x3;
  const dy3 = y0 - y1 + y2 - y3;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) return [x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0, 0, 1];
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const hh = (dx1 * dy3 - dx3 * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + hh * x3, x0, y1 - y0 + g * y1, y3 - y0 + hh * y3, y0, g, hh, 1];
}

const adjugate = (m: M3): M3 => [
  m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
  m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
  m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3],
];

function times(a: M3, b: M3): M3 {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return out;
}

/** The projective map taking quadrilateral `from` to quadrilateral `to` (each four x, y pairs in order). */
export function quadToQuad(from: number[], to: number[]): (x: number, y: number) => Point {
  const m = times(squareToQuad(to), adjugate(squareToQuad(from)));
  return (x, y) => {
    const d = m[6] * x + m[7] * y + m[8];
    return { x: (m[0] * x + m[1] * y + m[2]) / d, y: (m[3] * x + m[4] * y + m[5]) / d };
  };
}

/**
 * Finds the bottom-right alignment pattern near `guess` by scoring a 5×5-module template (dark ring, light
 * ring, dark centre) laid along the code's own axes, so it still matches when the code is rotated.
 */
function findAlignment(img: Image, guess: Point, ux: Point, uy: Point, module: number): Point | null {
  const want = (i: number, j: number) => (Math.max(Math.abs(i), Math.abs(j)) === 1 ? 0 : 1);
  let best = -1;
  let hits: Point[] = [];
  for (const radius of [4, 8]) {
    const R = Math.ceil(radius * module);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const cx = guess.x + dx;
        const cy = guess.y + dy;
        let score = 0;
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (img.at(cx + ux.x * i + uy.x * j, cy + ux.y * i + uy.y * j) === want(i, j)) score++;
        if (score > best) (best = score), (hits = [{ x: cx, y: cy }]);
        else if (score === best) hits.push({ x: cx, y: cy });
      }
    if (best >= 23) break;
  }
  if (best < 21) return null;
  // Several pixels inside one module score the same: use their middle.
  const near = hits.filter((p) => dist(p, hits[0]) <= module);
  return { x: near.reduce((s, p) => s + p.x, 0) / near.length, y: near.reduce((s, p) => s + p.y, 0) / near.length };
}

function sample(img: Image, map: (x: number, y: number) => Point, dim: number): boolean[][] | null {
  const m: boolean[][] = [];
  for (let y = 0; y < dim; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < dim; x++) {
      const p = map(x + 0.5, y + 0.5);
      const v = img.at(p.x, p.y);
      if (v < 0) return null;
      row.push(v === 1);
    }
    m.push(row);
  }
  return m;
}

function tryDecode(m: boolean[][]): Decoded | null {
  for (const grid of [m, m.map((_, y) => m.map((row) => row[y]))]) {
    try {
      return decodeMatrix(grid);
    } catch {
      // try the mirror image, then give up on this grid
    }
  }
  return null;
}

function locate(img: Image, [B, A, C]: [Finder, Finder, Finder]): Detected | null {
  // Runs were measured along image rows and columns; across a square turned by θ they are 1 / max(|cos θ|, |sin θ|) longer.
  const theta = Math.atan2(A.y - B.y, A.x - B.x);
  const module = ((B.size + A.size + C.size) / 3) * Math.max(Math.abs(Math.cos(theta)), Math.abs(Math.sin(theta)));
  const est = Math.round((dist(B, A) + dist(B, C)) / 2 / module) + 7;
  const base = est % 4 === 0 ? est + 1 : est % 4 === 2 ? est - 1 : est % 4 === 3 ? est + 2 : est;
  for (const dim of [base, base - 4, base + 4]) {
    if (dim < 21 || dim > 177) continue;
    const ux = { x: (A.x - B.x) / (dim - 7), y: (A.y - B.y) / (dim - 7) };
    const uy = { x: (C.x - B.x) / (dim - 7), y: (C.y - B.y) / (dim - 7) };
    const corner4: Point = { x: A.x + C.x - B.x, y: A.y + C.y - B.y };
    const candidates: Array<{ to: Point; at: number }> = [];
    if (dim > 21) {
      const k = dim - 10; // modules from the top-left finder centre to the alignment centre
      const guess = { x: B.x + (ux.x + uy.x) * k, y: B.y + (ux.y + uy.y) * k };
      const al = findAlignment(img, guess, ux, uy, module);
      if (al) candidates.push({ to: al, at: dim - 6.5 });
    }
    candidates.push({ to: corner4, at: dim - 3.5 });
    // Seen at an angle, the far corner is not where a parallelogram puts it. Without an alignment pattern to
    // anchor it (version 1, or one we could not find), try positions around the guess, nearest first.
    if (candidates.length === 1 && dim <= 61) {
      const offsets: Array<[number, number]> = [];
      for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (i || j) offsets.push([i, j]);
      offsets.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
      for (const [i, j] of offsets) candidates.push({ to: { x: corner4.x + ux.x * i + uy.x * j, y: corner4.y + ux.y * i + uy.y * j }, at: dim - 3.5 });
    }
    for (const c of candidates) {
      const map = quadToQuad([3.5, 3.5, dim - 3.5, 3.5, c.at, c.at, 3.5, dim - 3.5], [B.x, B.y, A.x, A.y, c.to.x, c.to.y, C.x, C.y]);
      const grid = sample(img, map, dim);
      const got = grid && tryDecode(grid);
      if (got) return { ...got, corners: [map(0, 0), map(dim, 0), map(dim, dim), map(0, dim)] };
    }
  }
  return null;
}

/** Reads the most prominent QR code in an RGBA image (a canvas ImageData, a decoded PNG…), or returns null. */
export function scanImage(rgba: ArrayLike<number>, width: number, height: number): Detected | null {
  const gray = toGray(rgba, width * height);
  const bin = binarize(gray, width, height);
  for (const invert of [false, true]) {
    if (invert) for (let i = 0; i < bin.length; i++) bin[i] ^= 1; // light code on a dark background
    const img = new Image(bin, width, height);
    const options = triples(findFinders(img)).slice(0, 6);
    for (const t of options) {
      const got = locate(img, t);
      if (got) return got;
    }
  }
  return null;
}
