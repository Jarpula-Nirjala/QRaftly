/** Error-correction levels: how much of the symbol can be damaged and still read (≈7%, 15%, 25%, 30%). */
export type Ecl = 'L' | 'M' | 'Q' | 'H';
export const ECLS: Ecl[] = ['L', 'M', 'Q', 'H'];

/** The 2-bit value of each level in the format information (ISO/IEC 18004 table 12). */
export const ECL_BITS: Record<Ecl, number> = { L: 1, M: 0, Q: 3, H: 2 };

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

// Error-correction codewords per block and number of blocks, by level and version (index 0 unused).
// From ISO/IEC 18004 table 9.
const ECC_PER_BLOCK: Record<Ecl, number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
const NUM_BLOCKS: Record<Ecl, number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

export const sizeOf = (version: number) => version * 4 + 17;

/** Modules available for data and error correction (everything except function patterns and format/version info). */
export function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

export interface BlockLayout {
  /** Total codewords in the symbol. */
  total: number;
  numBlocks: number;
  eccPerBlock: number;
  /** Blocks with one data codeword fewer come first. */
  numShortBlocks: number;
  /** Length (data + ecc) of a short block; long blocks are one longer. */
  shortBlockLen: number;
  /** Data codewords in the whole symbol. */
  dataCodewords: number;
}

export function blockLayout(version: number, ecl: Ecl): BlockLayout {
  const total = Math.floor(rawDataModules(version) / 8);
  const numBlocks = NUM_BLOCKS[ecl][version];
  const eccPerBlock = ECC_PER_BLOCK[ecl][version];
  return {
    total,
    numBlocks,
    eccPerBlock,
    numShortBlocks: numBlocks - (total % numBlocks),
    shortBlockLen: Math.floor(total / numBlocks),
    dataCodewords: total - eccPerBlock * numBlocks,
  };
}

/** Centre coordinates of the alignment patterns along each axis (ISO/IEC 18004 annex E, computed). */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [6];
  for (let pos = sizeOf(version) - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}
