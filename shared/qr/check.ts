import { decodeMatrix } from './decode.ts';
import { encodeText, type QrCode } from './encode.ts';
import { DEFAULT_DESIGN, logoBox, type Design } from './render.ts';
import { alignmentPositions, type Ecl } from './tables.ts';

export interface Readability {
  qr: QrCode;
  /** True when every check passed and the code is safe to print. */
  ok: boolean;
  /** Plain-language problems, worst first. */
  issues: string[];
  /** Advice that does not stop the code from being printed (e.g. inverted colours, which most phones read). */
  notes: string[];
  /** Share of the error-correction budget the logo uses in the most affected block (0–1; above 1 cannot be read). */
  budgetUsed: number;
  /** WCAG contrast ratio between the dots and the background. */
  contrast: number;
}

function hexToRgb(c: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((ch) => ch + ch).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Relative luminance (WCAG 2.x). */
function luminance([r, g, b]: [number, number, number]) {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return 21;
  const [hi, lo] = [luminance(ra), luminance(rb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Encodes `text` for a design and proves it will scan: the modules hidden by the logo are inverted (the worst
 * case: every one read wrongly) and the symbol is decoded with our own decoder. Also checks colour contrast,
 * dark-on-light polarity and that the logo stays clear of the finder, timing and format areas.
 */
export function checkReadability(text: string, partial: Partial<Design> = {}, ecl?: Ecl): Readability {
  const design = { ...DEFAULT_DESIGN, ...partial };
  // A logo needs the strongest error correction.
  const qr = encodeText(text, { ecl: design.logo ? 'H' : (ecl ?? 'M') });
  const issues: string[] = [];
  let budgetUsed = 0;
  const box = logoBox(qr.size, design);
  if (box) {
    const damaged = qr.modules.map((r) => r.slice());
    // Alignment patterns may sit behind a logo (scanners manage without them); finders, timing and format may not.
    const align = alignmentPositions(qr.version);
    const inAlignment = (x: number, y: number) => align.some((ax) => Math.abs(x - ax) <= 2) && align.some((ay) => Math.abs(y - ay) <= 2) && x > 8 && y > 8;
    let blocksFunction = false;
    for (let y = box.y0; y < box.y1; y++)
      for (let x = box.x0; x < box.x1; x++) {
        damaged[y][x] = !damaged[y][x];
        if (qr.isFunction[y][x] && !inAlignment(x, y)) blocksFunction = true;
      }
    if (blocksFunction) issues.push('The logo covers the corner or timing patterns. Make it smaller.');
    try {
      const d = decodeMatrix(damaged);
      if (d.text !== text) throw new Error('mismatch');
      budgetUsed = Math.max(...d.correctedPerBlock) / d.correctablePerBlock;
      if (budgetUsed > 0.8) issues.push(`The logo uses ${Math.round(budgetUsed * 100)}% of the error correction, leaving little room for scratches or glare. Make it a little smaller.`);
    } catch {
      budgetUsed = Infinity;
      issues.unshift('With this logo size the code cannot be read. Make the logo smaller.');
    }
  }
  const fgRgb = hexToRgb(design.fg);
  const bgRgb = hexToRgb(design.transparent ? '#ffffff' : design.bg);
  const contrast = contrastRatio(design.fg, design.transparent ? '#ffffff' : design.bg);
  // Reflectance reversal is allowed by ISO/IEC 18004:2015, but many readers (Google Lens among them) often miss it,
  // so it is a strong warning; the design still decodes, so it is not marked as a failure.
  const notes: string[] = [];
  if (fgRgb && bgRgb && luminance(fgRgb) > luminance(bgRgb)) notes.push('Light squares on a dark background: many scanners, Google Lens among them, often cannot read this. Use dark dots on a light background for anything you share or print.');
  if (contrast < 3) issues.unshift(`Contrast is too low (${contrast.toFixed(1)}:1). Use a darker colour for the dots or a lighter background.`);
  else if (contrast < 4.5) issues.push(`Contrast is a little low (${contrast.toFixed(1)}:1). Darker dots scan more reliably.`);
  if (design.margin < 2) issues.push('Leave at least 2 modules of empty space around the code (4 is ideal).');
  return { qr, ok: issues.length === 0, issues, notes, budgetUsed, contrast };
}
