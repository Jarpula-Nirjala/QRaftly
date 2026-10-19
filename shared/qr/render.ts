import type { QrCode } from './encode.ts';

export type DotStyle = 'square' | 'rounded' | 'dots' | 'classy' | 'fluid';
export type EyeStyle = 'square' | 'rounded' | 'circle' | 'leaf';

export interface Design {
  fg: string;
  bg: string;
  /** Optional second colour: dots fade from fg to this, top-left to bottom-right. */
  fg2?: string | null;
  eyeColor?: string | null;
  dots: DotStyle;
  eyes: EyeStyle;
  /** Quiet zone in modules (the standard asks for 4). */
  margin: number;
  /** Logo image as a data: URL. */
  logo?: string | null;
  /** Logo width as a fraction of the symbol width (0.1–0.3). */
  logoScale: number;
  transparent?: boolean;
}

export const DEFAULT_DESIGN: Design = { fg: '#111111', bg: '#ffffff', fg2: null, eyeColor: null, dots: 'square', eyes: 'square', margin: 4, logo: null, logoScale: 0.22, transparent: false };

/** The module box hidden behind a logo (centred, one module of breathing space), or null without a logo. */
export function logoBox(size: number, design: Pick<Design, 'logo' | 'logoScale'>) {
  if (!design.logo) return null;
  const scale = Math.min(0.3, Math.max(0.1, design.logoScale));
  const span = Math.max(3, Math.round(size * scale) + 2);
  const start = Math.floor((size - span) / 2);
  return { x0: start, y0: start, x1: start + span, y1: start + span };
}

/** True for modules inside one of the three finder patterns (drawn as "eyes", not as dots). */
export function inFinder(size: number, x: number, y: number) {
  return (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const safeColor = (c: string | null | undefined, fallback: string) => (c && /^#[0-9a-fA-F]{3,8}$|^rgba?\([\d\s.,%]+\)$|^[a-zA-Z]+$/.test(c) ? c : fallback);

/** A path for one module: rounded corners where `round` says so (tl, tr, br, bl), radius r. */
function modulePath(x: number, y: number, round: [boolean, boolean, boolean, boolean], r = 0.5) {
  const [tl, tr, br, bl] = round.map((v) => (v ? r : 0));
  return `M${x + tl} ${y}h${1 - tl - tr}${tr ? `a${tr} ${tr} 0 0 1 ${tr} ${tr}` : ''}v${1 - tr - br}${br ? `a${br} ${br} 0 0 1 ${-br} ${br}` : ''}h${-(1 - br - bl)}${bl ? `a${bl} ${bl} 0 0 1 ${-bl} ${-bl}` : ''}v${-(1 - bl - tl)}${tl ? `a${tl} ${tl} 0 0 1 ${tl} ${-tl}` : ''}z`;
}

/** A rectangle path with its own radius for each corner. */
function roundRect(x: number, y: number, w: number, h: number, [tl, tr, br, bl]: [number, number, number, number]) {
  return `M${x + tl} ${y}h${w - tl - tr}${tr ? `a${tr} ${tr} 0 0 1 ${tr} ${tr}` : ''}v${h - tr - br}${br ? `a${br} ${br} 0 0 1 ${-br} ${br}` : ''}h${-(w - br - bl)}${bl ? `a${bl} ${bl} 0 0 1 ${-bl} ${-bl}` : ''}v${-(h - bl - tl)}${tl ? `a${tl} ${tl} 0 0 1 ${tl} ${-tl}` : ''}z`;
}

function eye(x: number, y: number, style: EyeStyle): { frame: string; ball: string } {
  // Outer 7×7 frame (drawn with even-odd fill to cut the hole) and inner 3×3 ball.
  if (style === 'circle')
    return {
      frame: `M${x + 3.5} ${y}a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7zM${x + 3.5} ${y + 1}a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z`,
      ball: `M${x + 3.5} ${y + 2}a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3z`,
    };
  const r: Record<Exclude<EyeStyle, 'circle'>, [[number, number, number, number], [number, number, number, number], [number, number, number, number]]> = {
    square: [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    rounded: [
      [2, 2, 2, 2],
      [1.2, 1.2, 1.2, 1.2],
      [1, 1, 1, 1],
    ],
    leaf: [
      [3, 0.6, 3, 0.6],
      [2.2, 0.4, 2.2, 0.4],
      [1.4, 0.2, 1.4, 0.2],
    ],
  };
  const [outer, inner, ball] = r[style];
  return { frame: roundRect(x, y, 7, 7, outer) + roundRect(x + 1, y + 1, 5, 5, inner), ball: roundRect(x + 2, y + 2, 3, 3, ball) };
}

/** The QR code as an SVG document in the chosen design. `px` sets the width/height attributes. */
export function toSvg(qr: Pick<QrCode, 'size' | 'modules'>, partial: Partial<Design> = {}, px?: number): string {
  const d: Design = { ...DEFAULT_DESIGN, ...partial };
  const size = qr.size;
  const m = Math.max(0, Math.min(10, Math.round(d.margin)));
  const total = size + m * 2;
  const fg = safeColor(d.fg, '#111111');
  const bg = safeColor(d.bg, '#ffffff');
  const eyeColor = safeColor(d.eyeColor, fg);
  const box = logoBox(size, d);
  const dark = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && qr.modules[y][x] && !(box && x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1);

  let dots = '';
  if (d.dots === 'square') {
    // Merge horizontal runs into one rectangle each: a much smaller file.
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        if (!dark(x, y) || inFinder(size, x, y)) continue;
        let run = 1;
        while (x + run < size && dark(x + run, y) && !inFinder(size, x + run, y)) run++;
        dots += `M${x + m} ${y + m}h${run}v1h${-run}z`;
        x += run - 1;
      }
  } else
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        if (!dark(x, y) || inFinder(size, x, y)) continue;
        const X = x + m;
        const Y = y + m;
        if (d.dots === 'dots') dots += `M${X + 0.5} ${Y + 0.08}a0.42 0.42 0 1 1 0 0.84a0.42 0.42 0 1 1 0-0.84z`;
        else if (d.dots === 'rounded') dots += roundRect(X + 0.05, Y + 0.05, 0.9, 0.9, [0.3, 0.3, 0.3, 0.3]);
        else if (d.dots === 'classy') dots += modulePath(X, Y, [true, false, true, false], 0.5);
        else {
          // fluid: a corner is rounded only where neither neighbour on that corner is dark, so shapes flow together.
          const up = dark(x, y - 1);
          const down = dark(x, y + 1);
          const left = dark(x - 1, y);
          const right = dark(x + 1, y);
          dots += modulePath(X, Y, [!up && !left, !up && !right, !down && !right, !down && !left], 0.5);
        }
      }

  let eyes = '';
  let balls = '';
  for (const [ex, ey] of [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ]) {
    const e = eye(ex + m, ey + m, d.eyes);
    eyes += e.frame;
    balls += e.ball;
  }

  // Named after its colours: several codes on one page each keep their own gradient (ids are page-global).
  const gid = `qrg-${`${fg}-${d.fg2 ?? ''}`.replace(/[^\w-]/g, '')}`;
  const gradient = d.fg2 ? `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${fg}"/><stop offset="1" stop-color="${safeColor(d.fg2, fg)}"/></linearGradient></defs>` : '';
  const dotFill = d.fg2 ? `url(#${gid})` : fg;
  let logo = '';
  if (box && d.logo && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(d.logo)) {
    const pad = 0.5;
    const s = box.x1 - box.x0;
    logo = `<rect x="${box.x0 + m + pad}" y="${box.y0 + m + pad}" width="${s - pad * 2}" height="${s - pad * 2}" rx="${(s - pad * 2) * 0.18}" fill="${d.transparent ? '#ffffff' : bg}"/><image href="${esc(d.logo)}" x="${box.x0 + m + pad * 2}" y="${box.y0 + m + pad * 2}" width="${s - pad * 4}" height="${s - pad * 4}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  const dims = px ? ` width="${px}" height="${px}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"${dims} shape-rendering="${d.dots === 'square' && d.eyes === 'square' ? 'crispEdges' : 'geometricPrecision'}">${gradient}${d.transparent ? '' : `<rect width="${total}" height="${total}" fill="${bg}"/>`}<path d="${dots}" fill="${dotFill}"/><path d="${eyes}" fill="${eyeColor}" fill-rule="evenodd"/><path d="${balls}" fill="${eyeColor}"/>${logo}</svg>`;
}
