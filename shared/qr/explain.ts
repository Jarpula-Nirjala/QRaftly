import { addEccAndInterleave, applyMask, drawFormat, encodeText, forEachDataModule, functionPatterns, penaltyParts, placeCodewords } from './encode.ts';
import { generator, remainder } from './rs.ts';
import { countBits, makeSegment, pickMode, toCodewords, type Mode } from './segments.ts';
import { blockLayout, type Ecl } from './tables.ts';

export interface Explained {
  text: string;
  mode: Mode;
  version: number;
  ecl: Ecl;
  size: number;
  /** Mode indicator, character count and data bits, before padding. */
  header: { modeBits: string; countBits: string; count: number };
  dataBits: string;
  dataCodewords: number[];
  blocks: Array<{ data: number[]; ecc: number[] }>;
  interleaved: number[];
  /** Data modules in the order the zigzag fills them. */
  order: Array<[number, number]>;
  masks: Array<{ mask: number; parts: [number, number, number, number]; total: number; modules: boolean[][] }>;
  chosen: number;
  modules: boolean[][];
  isFunction: boolean[][];
}

const bin = (n: number, w: number) => n.toString(2).padStart(w, '0');

/** Every intermediate step of encoding `text`, from the same functions the encoder uses. */
export function explain(text: string, ecl: Ecl = 'M'): Explained {
  const qr = encodeText(text, { ecl });
  const mode = pickMode(text);
  const seg = makeSegment(text, mode);
  const L = blockLayout(qr.version, qr.ecl);
  const dataCodewords = toCodewords(seg, qr.version, L.dataCodewords);
  const gen = generator(L.eccPerBlock);
  const blocks: Explained['blocks'] = [];
  for (let i = 0, k = 0; i < L.numBlocks; i++) {
    const len = L.shortBlockLen - L.eccPerBlock + (i < L.numShortBlocks ? 0 : 1);
    const data = dataCodewords.slice(k, k + len);
    k += len;
    blocks.push({ data, ecc: remainder(data, gen) });
  }
  const interleaved = addEccAndInterleave(dataCodewords, qr.version, qr.ecl);
  const base = functionPatterns(qr.version);
  placeCodewords(base.modules, base.isFunction, interleaved);
  const order: Array<[number, number]> = [];
  forEachDataModule(base.isFunction, (x, y) => order.push([x, y]));
  const masks = Array.from({ length: 8 }, (_, mask) => {
    const m = base.modules.map((r) => r.slice());
    applyMask(m, base.isFunction, mask);
    drawFormat(m, qr.ecl, mask);
    const parts = penaltyParts(m);
    return { mask, parts, total: parts.reduce((a, b) => a + b, 0), modules: m };
  });
  const modeIds: Record<Mode, number> = { numeric: 1, alphanumeric: 2, byte: 4 };
  return {
    text,
    mode,
    version: qr.version,
    ecl: qr.ecl,
    size: qr.size,
    header: { modeBits: bin(modeIds[mode], 4), countBits: bin(seg.count, countBits(mode, qr.version)), count: seg.count },
    dataBits: seg.data.bits.map((b) => (b ? '1' : '0')).join(''),
    dataCodewords,
    blocks,
    interleaved,
    order,
    masks,
    chosen: qr.mask,
    modules: qr.modules,
    isFunction: qr.isFunction,
  };
}
