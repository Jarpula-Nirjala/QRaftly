/** Turning text into the QR bit stream: modes, character counts, padding. */

export type Mode = 'numeric' | 'alphanumeric' | 'byte';

export const MODE_BITS: Record<Mode, number> = { numeric: 0x1, alphanumeric: 0x2, byte: 0x4 };
const COUNT_BITS: Record<Mode, [number, number, number]> = {
  numeric: [10, 12, 14],
  alphanumeric: [9, 11, 13],
  byte: [8, 16, 16],
};
export const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

/** Bits used for the character count of `mode` in symbols of `version`. */
export function countBits(mode: Mode, version: number): number {
  return COUNT_BITS[mode][version <= 9 ? 0 : version <= 26 ? 1 : 2];
}

export class BitBuffer {
  readonly bits: number[] = [];
  append(value: number, length: number) {
    if (length < 0 || length > 31 || value >>> length !== 0) throw new RangeError('Value out of range');
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
}

export interface Segment {
  mode: Mode;
  /** Number of characters (digits, alphanumerics or bytes). */
  count: number;
  data: BitBuffer;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

/** The most compact single mode for the whole text: digits only, then the 45-character set, else UTF-8 bytes. */
export function pickMode(text: string): Mode {
  if (/^[0-9]*$/.test(text)) return 'numeric';
  if ([...text].every((ch) => ALPHANUMERIC.includes(ch))) return 'alphanumeric';
  return 'byte';
}

export function makeSegment(text: string, mode: Mode = pickMode(text)): Segment {
  const data = new BitBuffer();
  if (mode === 'numeric') {
    // Groups of three digits in 10 bits; a final group of two in 7, of one in 4.
    for (let i = 0; i < text.length; i += 3) {
      const group = text.slice(i, i + 3);
      data.append(Number(group), group.length * 3 + 1);
    }
    return { mode, count: text.length, data };
  }
  if (mode === 'alphanumeric') {
    // Pairs as 45·a + b in 11 bits; a last single character in 6.
    let i = 0;
    for (; i + 1 < text.length; i += 2) data.append(ALPHANUMERIC.indexOf(text[i]) * 45 + ALPHANUMERIC.indexOf(text[i + 1]), 11);
    if (i < text.length) data.append(ALPHANUMERIC.indexOf(text[i]), 6);
    return { mode, count: text.length, data };
  }
  const bytes = utf8(text);
  for (const b of bytes) data.append(b, 8);
  return { mode, count: bytes.length, data };
}

/** Bits the segment needs in a symbol of `version`, or Infinity when its count does not fit the count field. */
export function segmentBits(seg: Segment, version: number): number {
  const cb = countBits(seg.mode, version);
  if (seg.count >= 1 << cb) return Infinity;
  return 4 + cb + seg.data.bits.length;
}

/** The final data codewords: segment, terminator, byte alignment and the 0xEC/0x11 pad bytes. */
export function toCodewords(seg: Segment, version: number, dataCodewords: number): number[] {
  const bb = new BitBuffer();
  bb.append(MODE_BITS[seg.mode], 4);
  bb.append(seg.count, countBits(seg.mode, version));
  bb.bits.push(...seg.data.bits);
  const capacity = dataCodewords * 8;
  if (bb.bits.length > capacity) throw new RangeError('Data too long for this version');
  bb.append(0, Math.min(4, capacity - bb.bits.length));
  bb.append(0, (8 - (bb.bits.length % 8)) % 8);
  for (let pad = 0xec; bb.bits.length < capacity; pad ^= 0xec ^ 0x11) bb.append(pad, 8);
  const out = new Array<number>(dataCodewords).fill(0);
  bb.bits.forEach((bit, i) => (out[i >>> 3] |= bit << (7 - (i & 7))));
  return out;
}
