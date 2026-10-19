import { forEachDataModule, formatBits, formatPositions, functionPatterns, maskCondition } from './encode.ts';
import { decode as rsDecode } from './rs.ts';
import { ALPHANUMERIC, countBits, type Mode } from './segments.ts';
import { blockLayout, ECLS, type Ecl } from './tables.ts';

export interface Decoded {
  text: string;
  version: number;
  ecl: Ecl;
  mask: number;
  /** Codewords repaired by error correction, per block. */
  correctedPerBlock: number[];
  /** Most codewords a block can repair (⌊ecc/2⌋). */
  correctablePerBlock: number;
}

const FORMATS: Array<{ ecl: Ecl; mask: number; bits: number }> = [];
for (const ecl of ECLS) for (let mask = 0; mask < 8; mask++) FORMATS.push({ ecl, mask, bits: formatBits(ecl, mask) });

const popcount = (n: number) => {
  let c = 0;
  for (; n; n &= n - 1) c++;
  return c;
};

/** Reads the level and mask from either copy of the format information, tolerating up to 3 wrong bits. */
function readFormat(m: boolean[][]): { ecl: Ecl; mask: number } {
  const size = m.length;
  let best = { ecl: 'L' as Ecl, mask: 0 };
  let bestDist = Infinity;
  for (const copy of formatPositions(size)) {
    let bits = 0;
    copy.forEach(([x, y], i) => (bits |= (m[y][x] ? 1 : 0) << i));
    for (const f of FORMATS) {
      const d = popcount(bits ^ f.bits);
      if (d < bestDist) {
        bestDist = d;
        best = { ecl: f.ecl, mask: f.mask };
      }
    }
  }
  if (bestDist > 3) throw new Error('Format information is unreadable');
  return best;
}

/** Decodes a module matrix (modules[y][x], true = dark) into text. Throws when it cannot be read. */
export function decodeMatrix(m: boolean[][]): Decoded {
  const size = m.length;
  const version = (size - 17) / 4;
  if (!Number.isInteger(version) || version < 1 || version > 40) throw new Error('Not a QR code size');
  const { ecl, mask } = readFormat(m);
  const { isFunction } = functionPatterns(version);

  // Read the masked data bits back in placement order.
  const L = blockLayout(version, ecl);
  const codewords = new Array<number>(L.total).fill(0);
  let i = 0;
  forEachDataModule(isFunction, (x, y) => {
    if (i < L.total * 8) {
      const bit = m[y][x] !== maskCondition(mask, x, y);
      if (bit) codewords[i >>> 3] |= 1 << (7 - (i & 7));
    }
    i++;
  });

  // Undo the interleaving: rebuild each block (short blocks have one data codeword fewer).
  const shortData = L.shortBlockLen - L.eccPerBlock;
  const blocks: number[][] = Array.from({ length: L.numBlocks }, () => []);
  let k = 0;
  for (let col = 0; col < L.shortBlockLen + 1; col++)
    for (let j = 0; j < L.numBlocks; j++) {
      if (col === shortData && j < L.numShortBlocks) continue; // short blocks have no codeword here
      blocks[j].push(codewords[k++]);
    }

  const data: number[] = [];
  const correctedPerBlock: number[] = [];
  for (const block of blocks) {
    const fixed = rsDecode(block, L.eccPerBlock);
    correctedPerBlock.push(fixed.corrected);
    data.push(...fixed.codeword.slice(0, block.length - L.eccPerBlock));
  }
  return { text: parseBits(data, version), version, ecl, mask, correctedPerBlock, correctablePerBlock: Math.floor(L.eccPerBlock / 2) };
}

/** Reads the segments of the data bit stream. */
function parseBits(data: number[], version: number): string {
  let pos = 0;
  const total = data.length * 8;
  const read = (n: number) => {
    if (pos + n > total) throw new Error('Data ended early');
    let v = 0;
    for (let i = 0; i < n; i++, pos++) v = (v << 1) | ((data[pos >>> 3] >>> (7 - (pos & 7))) & 1);
    return v;
  };
  let text = '';
  const bytes: number[] = [];
  const flush = () => {
    if (bytes.length) text += new TextDecoder('utf-8').decode(new Uint8Array(bytes.splice(0)));
  };
  while (total - pos >= 4) {
    const indicator = read(4);
    if (indicator === 0) break;
    if (indicator === 0x7) {
      // ECI designator (one-byte form): the character set is assumed to be UTF-8 either way.
      read(8);
      continue;
    }
    const mode: Mode | undefined = indicator === 1 ? 'numeric' : indicator === 2 ? 'alphanumeric' : indicator === 4 ? 'byte' : undefined;
    if (!mode) throw new Error(`Unsupported mode ${indicator}`);
    const count = read(countBits(mode, version));
    if (mode === 'byte') {
      for (let c = 0; c < count; c++) bytes.push(read(8));
      continue;
    }
    flush();
    if (mode === 'numeric') {
      let left = count;
      for (; left >= 3; left -= 3) text += String(read(10)).padStart(3, '0');
      if (left === 2) text += String(read(7)).padStart(2, '0');
      else if (left === 1) text += String(read(4));
    } else {
      let left = count;
      for (; left >= 2; left -= 2) {
        const v = read(11);
        text += ALPHANUMERIC[Math.floor(v / 45)] + ALPHANUMERIC[v % 45];
      }
      if (left === 1) text += ALPHANUMERIC[read(6)];
    }
  }
  flush();
  return text;
}
