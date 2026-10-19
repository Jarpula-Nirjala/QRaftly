import { generator, remainder } from './rs.ts';
import { makeSegment, pickMode, segmentBits, toCodewords, type Mode } from './segments.ts';
import { alignmentPositions, blockLayout, ECL_BITS, ECLS, MAX_VERSION, MIN_VERSION, rawDataModules, sizeOf, type Ecl } from './tables.ts';

export interface QrCode {
  version: number;
  size: number;
  ecl: Ecl;
  mask: number;
  mode: Mode;
  /** modules[y][x] — true is dark. */
  modules: boolean[][];
  /** Finder, separator, timing, alignment, format and version areas (not data). */
  isFunction: boolean[][];
}

export interface EncodeOptions {
  /** Minimum error-correction level (default M). */
  ecl?: Ecl;
  /** Raise the level for free when the text still fits the same version (default true). */
  boostEcl?: boolean;
  minVersion?: number;
  maxVersion?: number;
  /** Force a mask 0–7; by default the one with the lowest penalty is chosen. */
  mask?: number;
}

/** Encodes text as a QR code, choosing the smallest version that fits. */
export function encodeText(text: string, opts: EncodeOptions = {}): QrCode {
  const mode = pickMode(text);
  const seg = makeSegment(text, mode);
  const minV = opts.minVersion ?? MIN_VERSION;
  const maxV = opts.maxVersion ?? MAX_VERSION;
  let ecl = opts.ecl ?? 'M';
  let version = minV;
  for (; ; version++) {
    if (segmentBits(seg, version) <= blockLayout(version, ecl).dataCodewords * 8) break;
    if (version >= maxV) throw new RangeError(`Too much data: it does not fit a QR code at level ${ecl}.`);
  }
  if (opts.boostEcl !== false)
    for (const higher of ECLS.slice(ECLS.indexOf(ecl) + 1)) if (segmentBits(seg, version) <= blockLayout(version, higher).dataCodewords * 8) ecl = higher;

  const layout = blockLayout(version, ecl);
  const data = toCodewords(seg, version, layout.dataCodewords);
  const codewords = addEccAndInterleave(data, version, ecl);
  const base = functionPatterns(version);
  placeCodewords(base.modules, base.isFunction, codewords);

  let best = -1;
  let bestPenalty = Infinity;
  for (let m = 0; m < 8; m++) {
    if (opts.mask !== undefined && opts.mask !== m) continue;
    const trial = base.modules.map((r) => r.slice());
    applyMask(trial, base.isFunction, m);
    drawFormat(trial, ecl, m);
    const p = opts.mask !== undefined ? 0 : penalty(trial);
    if (p < bestPenalty) {
      bestPenalty = p;
      best = m;
    }
  }
  const modules = base.modules;
  applyMask(modules, base.isFunction, best);
  drawFormat(modules, ecl, best);
  return { version, size: sizeOf(version), ecl, mask: best, mode, modules, isFunction: base.isFunction };
}

/** Splits data into blocks, appends each block's error-correction codewords and interleaves them. */
export function addEccAndInterleave(data: number[], version: number, ecl: Ecl): number[] {
  const L = blockLayout(version, ecl);
  if (data.length !== L.dataCodewords) throw new RangeError('Wrong number of data codewords');
  const gen = generator(L.eccPerBlock);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < L.numBlocks; i++) {
    const len = L.shortBlockLen - L.eccPerBlock + (i < L.numShortBlocks ? 0 : 1);
    const dat = data.slice(k, k + len);
    k += len;
    const ecc = remainder(dat, gen);
    if (i < L.numShortBlocks) dat.push(0); // placeholder so all blocks line up
    blocks.push(dat.concat(ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++)
    for (let j = 0; j < blocks.length; j++) if (i !== L.shortBlockLen - L.eccPerBlock || j >= L.numShortBlocks) result.push(blocks[j][i]);
  if (result.length !== Math.floor(rawDataModules(version) / 8)) throw new Error('Internal error: codeword count');
  return result;
}

/** A blank symbol with the finder, timing and alignment patterns drawn and format/version areas reserved. */
export function functionPatterns(version: number): { modules: boolean[][]; isFunction: boolean[][] } {
  const size = sizeOf(version);
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ])
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, dist !== 2 && dist !== 4);
      }
  const pos = alignmentPositions(version);
  const last = pos.length - 1;
  for (let i = 0; i < pos.length; i++)
    for (let j = 0; j < pos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  // Reserve the format areas (drawn later, once the mask is known) and draw version information.
  drawFormat(modules, 'L', 0, isFunction);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit);
      set(b, a, bit);
    }
  }
  return { modules, isFunction };
}

/** The 15-bit format word (level + mask, BCH-protected and XOR-masked). */
export function formatBits(ecl: Ecl, mask: number): number {
  const data = (ECL_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** Where format bit i lives: two copies, [x, y] pairs (ISO/IEC 18004 figure 25). */
export function formatPositions(size: number): [Array<[number, number]>, Array<[number, number]>] {
  const a: Array<[number, number]> = [];
  const b: Array<[number, number]> = [];
  for (let i = 0; i < 15; i++) {
    a.push(i <= 5 ? [8, i] : i === 6 ? [8, 7] : i === 7 ? [8, 8] : i === 8 ? [7, 8] : [14 - i, 8]);
    b.push(i < 8 ? [size - 1 - i, 8] : [8, size - 15 + i]);
  }
  return [a, b];
}

export function drawFormat(modules: boolean[][], ecl: Ecl, mask: number, isFunction?: boolean[][]) {
  const size = modules.length;
  const bits = formatBits(ecl, mask);
  const [a, b] = formatPositions(size);
  for (let i = 0; i < 15; i++) {
    const dark = ((bits >>> i) & 1) !== 0;
    for (const [x, y] of [a[i], b[i]]) {
      modules[y][x] = dark;
      if (isFunction) isFunction[y][x] = true;
    }
  }
  modules[size - 8][8] = true; // the "dark module", always dark
  if (isFunction) isFunction[size - 8][8] = true;
}

/** Visits data modules in the standard order: two-column strips, zigzagging from the bottom right. */
export function forEachDataModule(isFunction: boolean[][], fn: (x: number, y: number) => void) {
  const size = isFunction.length;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip the vertical timing pattern
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x]) fn(x, y);
      }
  }
}

export function placeCodewords(modules: boolean[][], isFunction: boolean[][], codewords: number[]) {
  let i = 0;
  forEachDataModule(isFunction, (x, y) => {
    // Remainder bits after the last codeword stay light.
    modules[y][x] = i < codewords.length * 8 && ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
    i++;
  });
}

export function maskCondition(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      throw new RangeError('Mask must be 0–7');
  }
}

export function applyMask(modules: boolean[][], isFunction: boolean[][], mask: number) {
  for (let y = 0; y < modules.length; y++)
    for (let x = 0; x < modules.length; x++) if (!isFunction[y][x] && maskCondition(mask, x, y)) modules[y][x] = !modules[y][x];
}

const FINDER_LIKE = [
  [true, false, true, true, true, false, true, false, false, false, false],
  [false, false, false, false, true, false, true, true, true, false, true],
];

/** The standard's four penalty rules; the mask with the lowest score is the easiest to read. */
export function penalty(m: boolean[][]): number {
  return penaltyParts(m).reduce((a, b) => a + b, 0);
}

/** The four penalty rules scored separately: [runs, 2×2 blocks, finder-like patterns, dark/light balance]. */
export function penaltyParts(m: boolean[][]): [number, number, number, number] {
  const size = m.length;
  let r1 = 0;
  let r2 = 0;
  let r3 = 0;
  const lines: boolean[][] = [];
  for (let y = 0; y < size; y++) lines.push(m[y]);
  for (let x = 0; x < size; x++) lines.push(m.map((row) => row[x]));
  for (const line of lines) {
    // Rule 1: runs of five or more same-coloured modules.
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) r1 += 3 + (run - 5);
        run = 1;
      }
    }
    // Rule 3: patterns that look like a finder (1:1:3:1:1 with four light modules on one side).
    for (let i = 0; i + 11 <= size; i++)
      for (const pat of FINDER_LIKE) {
        let ok = true;
        for (let k = 0; k < 11 && ok; k++) if (line[i + k] !== pat[k]) ok = false;
        if (ok) r3 += 40;
      }
  }
  // Rule 2: 2×2 blocks of one colour.
  for (let y = 0; y + 1 < size; y++)
    for (let x = 0; x + 1 < size; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) r2 += 3;
    }
  // Rule 4: balance of dark and light.
  let dark = 0;
  for (const row of m) for (const v of row) if (v) dark++;
  const total = size * size;
  const r4 = (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return [r1, r2, r3, r4];
}
