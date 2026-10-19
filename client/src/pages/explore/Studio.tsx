import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { CheckCircle2, Download, Eraser, ImagePlus, RotateCcw, Sparkles, Square, XCircle } from 'lucide-react';
import { contrastRatio } from '../../../../shared/qr/check.ts';
import { scanImage } from '../../../../shared/qr/detect.ts';
import { encodeText } from '../../../../shared/qr/encode.ts';
import type { Ecl } from '../../../../shared/qr/tables.ts';
import { fileName, saveBlob } from '../../api.ts';
import { DEFAULT_DESIGN } from '../../../../shared/qr/render.ts';
import { QrPreview } from '../../studio.tsx';
import { Field, Segmented } from '../../ui.tsx';
import { PedestalScene } from '../../visuals/mockups.tsx';
import { ExploreShell, Feature } from './shell.tsx';

const site = () => location.origin;
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const rgbOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error('That file could not be opened as an image.'));
    img.src = URL.createObjectURL(file);
  });
}

/** A built-in sample picture (a warm sunset over water), so every demo works before anything is uploaded. */
function samplePicture(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 240;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 240);
  sky.addColorStop(0, '#1d2b53');
  sky.addColorStop(0.45, '#c2577a');
  sky.addColorStop(0.7, '#f4a259');
  sky.addColorStop(1, '#264653');
  g.fillStyle = sky;
  g.fillRect(0, 0, 240, 240);
  g.fillStyle = '#ffd88a';
  g.beginPath();
  g.arc(120, 150, 52, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#16323f';
  g.fillRect(0, 168, 240, 72);
  return c;
}

// ------------------------------------------------------------ 1. palette from a photo

/** k-means on a 64×64 thumbnail: the picture's main colours, most common first. */
function palette(src: CanvasImageSource, k = 6): Array<{ c: string; n: number }> {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0, 64, 64);
  const d = g.getImageData(0, 0, 64, 64).data;
  const px: number[][] = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
  // Start from evenly spaced pixels sorted by brightness, so dark and light colours both get a centre.
  const sorted = [...px].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let centres = Array.from({ length: k }, (_, i) => sorted[Math.floor(((i + 0.5) / k) * sorted.length)].slice());
  let counts: number[] = [];
  for (let it = 0; it < 12; it++) {
    const sums = centres.map(() => [0, 0, 0]);
    counts = centres.map(() => 0);
    for (const p of px) {
      let best = 0;
      let bd = Infinity;
      centres.forEach((ce, j) => {
        const dd = (p[0] - ce[0]) ** 2 + (p[1] - ce[1]) ** 2 + (p[2] - ce[2]) ** 2;
        if (dd < bd) (bd = dd), (best = j);
      });
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
      counts[best]++;
    }
    centres = centres.map((ce, j) => (counts[j] ? sums[j].map((s) => s / counts[j]) : ce));
  }
  return centres.map((ce, j) => ({ c: hex(ce[0], ce[1], ce[2]), n: counts[j] })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
}

/** The darkest colour from the photo, darkened only as much as needed to scan on a white background. */
function scannablePair(cols: string[]): { fg: string; bg: string } {
  const byLum = [...cols].sort((a, b) => contrastRatio(a, '#ffffff') - contrastRatio(b, '#ffffff')).reverse();
  const base = byLum[0] ?? '#14243a';
  const [r, g, b] = rgbOf(base);
  let fg = base;
  for (let t = 0; t <= 1 && contrastRatio(fg, '#ffffff') < 4.5; t += 0.1) fg = hex(r * (1 - t), g * (1 - t), b * (1 - t));
  return { fg, bg: '#ffffff' };
}

function PaletteDemo() {
  const [cols, setCols] = useState<string[]>([]);
  const [pair, setPair] = useState({ fg: '#14243a', bg: '#ffffff' });
  const fileRef = useRef<HTMLInputElement>(null);
  const take = (src: CanvasImageSource) => {
    const p = palette(src).map((x) => x.c);
    setCols(p);
    setPair(scannablePair(p));
  };
  useEffect(() => take(samplePicture()), []);
  const design = useMemo(() => ({ ...DEFAULT_DESIGN, fg: pair.fg, bg: pair.bg, dots: 'rounded' as const, eyes: 'rounded' as const }), [pair]);
  return (
    <>
      <div className="demo-row">
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={17} /> Use your photo or logo
        </button>
        <button className="btn ghost" onClick={() => take(samplePicture())}>
          Sample picture
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && take(await loadImage(e.target.files[0]))} />
      </div>
      <div>
        <div className="field" style={{ marginBottom: 8 }}>Colours found (click: dots, shift-click: background)</div>
        <div className="swatch-row">
          {cols.map((c) => (
            <button key={c} style={{ background: c }} title={c} aria-label={c} aria-pressed={c === pair.fg || c === pair.bg} onClick={(e) => setPair(e.shiftKey ? { ...pair, bg: c } : { ...pair, fg: c })} />
          ))}
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          Chosen pair: {pair.fg} on {pair.bg} · contrast {contrastRatio(pair.fg, pair.bg).toFixed(1)}:1 {contrastRatio(pair.fg, pair.bg) >= 4.5 ? '(good for scanning)' : '(too low; pick another)'}
        </p>
      </div>
      <QrPreview text={site()} design={design} name="palette-qr" />
    </>
  );
}

// ------------------------------------------------------------ 2. picture QR

/**
 * Draws a code whose modules are filled with a picture. Only the centre of each module carries data (that is
 * where scanners sample), so the rest of the module can show the image. The finder, timing and alignment
 * patterns stay solid. The result is decoded from its own pixels before it is offered for download.
 */
function PictureQr() {
  const [text, setText] = useState(site());
  const [core, setCore] = useState(0.42);
  const [img, setImg] = useState<CanvasImageSource>(() => samplePicture());
  const [scan, setScan] = useState<string | null | undefined>(undefined);
  const ref = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const qr = (() => {
      try {
        return encodeText(text || ' ', { ecl: 'H' });
      } catch {
        return null;
      }
    })();
    const c = ref.current!;
    if (!qr) return;
    const unit = 12;
    const n = qr.size;
    const W = (n + 8) * unit;
    c.width = c.height = W;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, W);
    // The picture, scaled to the symbol.
    const pic = document.createElement('canvas');
    pic.width = pic.height = n * unit;
    const pg = pic.getContext('2d', { willReadFrequently: true })!;
    pg.drawImage(img, 0, 0, n * unit, n * unit);
    const pd = pg.getImageData(0, 0, n * unit, n * unit).data;
    const out = g.getImageData(0, 0, W, W);
    const o = out.data;
    const lo = Math.floor((unit * (1 - core)) / 2);
    const hi = unit - lo;
    for (let my = 0; my < n; my++)
      for (let mx = 0; mx < n; mx++) {
        const dark = qr.modules[my][mx];
        for (let py = 0; py < unit; py++)
          for (let px = 0; px < unit; px++) {
            const sx = mx * unit + px;
            const sy = my * unit + py;
            const i = (sy * n * unit + sx) * 4;
            const [r, gg, b] = [pd[i], pd[i + 1], pd[i + 2]];
            let rgb: number[];
            const inCore = px >= lo && px < hi && py >= lo && py < hi;
            if (qr.isFunction[my][mx] || inCore) rgb = dark ? [20, 36, 58] : [255, 255, 255];
            else {
              const lum = 0.299 * r + 0.587 * gg + 0.114 * b;
              // Keep the picture's colour, pushed dark or light so it never confuses the data.
              rgb = lum < 128 ? [r * 0.45, gg * 0.45, b * 0.45] : [255 - (255 - r) * 0.3, 255 - (255 - gg) * 0.3, 255 - (255 - b) * 0.3];
            }
            const oi = ((sy + 4 * unit) * W + sx + 4 * unit) * 4;
            o[oi] = rgb[0];
            o[oi + 1] = rgb[1];
            o[oi + 2] = rgb[2];
            o[oi + 3] = 255;
          }
      }
    g.putImageData(out, 0, 0);
    // Prove it: read the picture back with our own camera decoder.
    const got = scanImage(o, W, W);
    setScan(got?.text === text ? got.text : null);
  }, [text, core, img]);
  return (
    <>
      <Field label="What the code opens">
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div className="demo-row">
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={17} /> Choose a picture
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && setImg(await loadImage(e.target.files[0]))} />
        {scan === undefined ? null : scan ? (
          <span className="verdict-chip ok">
            <CheckCircle2 size={17} /> Scans: decoded from its own pixels
          </span>
        ) : (
          <span className="verdict-chip bad">
            <XCircle size={17} /> Does not scan: make the data dots bigger
          </span>
        )}
      </div>
      <Field label={`Data dot size: ${Math.round(core * 100)}% of each module`} hint="Smaller dots show more of the picture; bigger dots scan more easily.">
        <input type="range" min={0.25} max={0.7} step={0.01} value={core} onChange={(e) => setCore(Number(e.target.value))} />
      </Field>
      <canvas ref={ref} className="demo-canvas" aria-label="Picture QR code" />
      <div>
        <button className="btn primary" disabled={!scan} onClick={() => ref.current!.toBlob((b) => b && saveBlob(b, `${fileName('picture-qr')}.png`))}>
          <Download size={16} /> Download PNG
        </button>
      </div>
    </>
  );
}

// ------------------------------------------------------------ 3. print size calculator

const PLACES = [
  { label: 'Business card', cm: 25 },
  { label: 'Table tent', cm: 60 },
  { label: 'Shop window', cm: 200 },
  { label: 'Poster across a room', cm: 500 },
  { label: 'Billboard', cm: 2000 },
];

function PrintSize() {
  const [cm, setCm] = useState(60);
  const [text, setText] = useState(`${site()}/r/abc1234`);
  const [ecl, setEcl] = useState<Ecl>('M');
  const qr = useMemo(() => {
    try {
      return encodeText(text || ' ', { ecl });
    } catch {
      return null;
    }
  }, [text, ecl]);
  // A phone camera resolves about 3 pixels per module at 0.28% of the distance; never print below 0.33 mm.
  const moduleMm = Math.max(0.33, cm * 10 * 0.0028);
  const total = qr ? (qr.size + 8) * moduleMm : 0;
  return (
    <>
      <Field label="What the code contains">
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div className="demo-row">
        {PLACES.map((p) => (
          <button key={p.label} className={`btn sm${cm === p.cm ? ' primary' : ''}`} onClick={() => setCm(p.cm)}>
            {p.label}
          </button>
        ))}
      </div>
      <Field label={`Scanning distance: ${cm >= 100 ? `${(cm / 100).toFixed(1)} m` : `${cm} cm`}`}>
        <input type="range" min={10} max={3000} step={5} value={cm} onChange={(e) => setCm(Number(e.target.value))} />
      </Field>
      <Segmented label="Error correction" value={ecl} onChange={setEcl} options={(['L', 'M', 'Q', 'H'] as Ecl[]).map((v) => ({ value: v, label: `Level ${v}` }))} />
      {qr && (
        <dl className="kv">
          <dt>Code</dt>
          <dd>
            Version {qr.version} · {qr.size}×{qr.size} modules + quiet zone
          </dd>
          <dt>Each module</dt>
          <dd>{moduleMm.toFixed(2)} mm</dd>
          <dt>Print it at least</dt>
          <dd>
            {(total / 10).toFixed(1)} cm ({(total / 25.4).toFixed(2)} in) square
          </dd>
          <dt>At 300 dpi</dt>
          <dd>{Math.ceil((total / 25.4) * 300)} × {Math.ceil((total / 25.4) * 300)} pixels</dd>
          <dt>Tip</dt>
          <dd>{qr.version > 6 ? 'A shorter link (a dynamic code) makes a smaller version you can print smaller.' : 'Keep a white border of 4 modules around it.'}</dd>
        </dl>
      )}
    </>
  );
}

// ------------------------------------------------------------ 4. damage simulator

function DamageSim() {
  const [ecl, setEcl] = useState<Ecl>('M');
  const [tool, setTool] = useState<'scratch' | 'sticker'>('scratch');
  const [result, setResult] = useState<{ ok: boolean; corrected: number[]; correctable: number } | null>(null);
  const [nonce, setNonce] = useState(0);
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef(0);
  const text = `${site()}/damage-test`;
  const W = 330;
  useEffect(() => {
    const qr = encodeText(text, { ecl, boostEcl: false });
    const c = ref.current!;
    c.width = c.height = W;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    const unit = W / (qr.size + 8);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, W, W);
    g.fillStyle = '#14243a';
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) g.fillRect((x + 4) * unit, (y + 4) * unit, unit + 0.5, unit + 0.5);
    check();
  }, [ecl, nonce]);
  const check = () => {
    const c = ref.current!;
    const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, W);
    const got = scanImage(d.data, W, W);
    setResult(got ? { ok: got.text === text, corrected: got.correctedPerBlock, correctable: got.correctablePerBlock } : { ok: false, corrected: [], correctable: 0 });
  };
  const pos = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * W };
  };
  const paint = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const g = ref.current!.getContext('2d')!;
    const p = pos(e);
    if (tool === 'scratch') {
      g.strokeStyle = Math.random() < 0.5 ? '#ffffff' : '#14243a';
      g.lineWidth = 9;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(drag.current.x, drag.current.y);
      g.lineTo(p.x, p.y);
      g.stroke();
      drag.current = p;
    }
    clearTimeout(timer.current);
    timer.current = window.setTimeout(check, 120);
  };
  return (
    <>
      <div className="demo-row">
        <Segmented label="Tool" value={tool} onChange={setTool} options={[{ value: 'scratch', label: <><Eraser size={15} /> Scratch</> }, { value: 'sticker', label: <><Square size={15} /> Sticker</> }]} />
        <Segmented label="Error correction" value={ecl} onChange={setEcl} options={(['L', 'M', 'Q', 'H'] as Ecl[]).map((v) => ({ value: v, label: v }))} />
        <button className="btn sm" onClick={() => setNonce(nonce + 1)}>
          <RotateCcw size={15} /> Repair
        </button>
      </div>
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ cursor: 'crosshair' }}
        aria-label="Draw on the code to damage it"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = pos(e);
        }}
        onPointerMove={paint}
        onPointerUp={(e) => {
          if (tool === 'sticker' && drag.current) {
            const p = pos(e);
            const g = ref.current!.getContext('2d')!;
            g.fillStyle = '#f3d58f';
            g.fillRect(Math.min(p.x, drag.current.x), Math.min(p.y, drag.current.y), Math.abs(p.x - drag.current.x), Math.abs(p.y - drag.current.y));
            check();
          }
          drag.current = null;
        }}
      />
      {result && (
        <div className="stack" style={{ gap: 8 }}>
          {result.ok ? (
            <span className="verdict-chip ok">
              <CheckCircle2 size={17} /> Still scans
            </span>
          ) : (
            <span className="verdict-chip bad">
              <XCircle size={17} /> Too damaged to read
            </span>
          )}
          {result.ok && (
            <div className="small">
              Codewords repaired per block (of {result.correctable} possible):
              <div className="hbars" style={{ marginTop: 6 }}>
                {result.corrected.map((n, i) => (
                  <div key={i} className="hbar">
                    <span className="name">Block {i + 1}</span>
                    <div className="track">
                      <div className="fill" style={{ width: `${(n / Math.max(1, result.correctable)) * 100}%`, background: n / Math.max(1, result.correctable) > 0.8 ? 'var(--bad)' : 'var(--chart)' }} />
                    </div>
                    <span className="n">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------ 5. animated SVG

type Anim = 'build' | 'eyes' | 'shine';

/** An SVG with CSS animation. Every style ends (or rests) on the complete, scannable code. */
function animatedSvg(text: string, style: Anim, fg: string): string {
  const qr = encodeText(text, { ecl: 'M' });
  const n = qr.size;
  const finder = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  let dots = '';
  let eyes = '';
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!qr.modules[y][x]) continue;
      const r = `<rect x="${x}" y="${y}" width="1.02" height="1.02"${style === 'build' && !finder(x, y) ? ` style="animation-delay:${((x + y) * 22).toFixed(0)}ms"` : ''}/>`;
      if (finder(x, y)) eyes += r;
      else dots += r;
    }
  const css =
    style === 'build'
      ? `.d rect{transform-box:fill-box;transform-origin:center;animation:in .5s cubic-bezier(.2,.8,.2,1) both}@keyframes in{from{opacity:0;transform:scale(.1)}}`
      : style === 'eyes'
        ? `.e{transform-box:fill-box;transform-origin:center;animation:p 2.4s ease-in-out infinite}@keyframes p{50%{opacity:.82}}`
        : `.s{animation:s 3.2s ease-in-out infinite}@keyframes s{from{transform:translateX(-${n + 8}px)}to{transform:translateX(${n + 8}px)}}`;
  const shine = style === 'shine' ? `<defs><linearGradient id="sh" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>` : '';
  const band = style === 'shine' ? `<rect class="s" x="0" y="-4" width="${(n + 8) / 3}" height="${n + 8}" fill="url(#sh)" transform="skewX(-12)"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${n + 8} ${n + 8}" shape-rendering="crispEdges"><style>${css}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>${shine}<rect x="-4" y="-4" width="${n + 8}" height="${n + 8}" fill="#fff"/><g class="d" fill="${fg}">${dots}</g><g class="e" fill="${fg}">${eyes}</g>${band}</svg>`;
}

function AnimatedSvg() {
  const [style, setStyle] = useState<Anim>('build');
  const [fg, setFg] = useState('#14243a');
  const [replay, setReplay] = useState(0);
  const svg = useMemo(() => animatedSvg(site(), style, fg), [style, fg]);
  return (
    <>
      <div className="demo-row">
        <Segmented label="Animation" value={style} onChange={setStyle} options={[{ value: 'build', label: 'Assemble' }, { value: 'eyes', label: 'Breathing corners' }, { value: 'shine', label: 'Light sweep' }]} />
        <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} aria-label="Colour" style={{ width: 44, height: 40, border: 0, background: 'none' }} />
      </div>
      <div key={replay} className="mini-qr" style={{ maxWidth: 280 }} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="demo-row">
        <button className="btn" onClick={() => setReplay(replay + 1)}>
          <Sparkles size={16} /> Replay
        </button>
        <button className="btn primary" onClick={() => saveBlob(new Blob([svg], { type: 'image/svg+xml' }), `animated-qr-${style}.svg`)}>
          <Download size={16} /> Download SVG
        </button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Works on websites, in email signatures that allow SVG, and in presentations. The finished code is always complete, so it scans at any moment after the first second.</p>
    </>
  );
}

export default function StudioPage() {
  return (
    <ExploreShell visual={<PedestalScene />}>
      <Feature n={1} title="Palette from your photo" tag="Brand colours" text="Upload your logo or a product photo. QRaftly finds its main colours with k-means clustering and picks the dot and background pair with enough contrast to scan, darkening or lightening them only as much as needed." points={['Runs entirely in your browser: the picture is never uploaded', 'Shows the contrast ratio of every pair', 'Click a swatch to try it yourself']}>
        <PaletteDemo />
      </Feature>
      <Feature n={2} title="Picture QR codes" tag="Artistic" text="Your photo, woven into the code. Scanners only look at the centre of each module, so QRaftly keeps those centres exact and lets the picture fill the rest. Every result is read back by our own camera decoder before you can download it." points={['Level H error correction for extra safety', 'A slider trades picture against scan reliability', 'Download is disabled until the code is proven to scan']}>
        <PictureQr />
      </Feature>
      <Feature n={3} title="Print size calculator" tag="Print" text="How big must a code be to scan from across the room? Give the distance and the content; QRaftly works out the module size, the minimum print size and the pixels you need at 300 dpi." points={['Rule of thumb: one tenth of the scanning distance, adjusted for the code’s size', 'Longer links need bigger codes; dynamic links stay short', 'Presets from business cards to billboards']}>
        <PrintSize />
      </Feature>
      <Feature n={4} title="Damage simulator" tag="Error correction" text="Scratch the code or put a sticker on it and watch Reed–Solomon error correction repair it, block by block, live. Then cover a corner square and see why finder patterns matter most." points={['Compare levels L, M, Q and H', 'Shows how much of each block’s repair budget is used', 'Decoded by the same engine as the door scanner']}>
        <DamageSim />
      </Feature>
      <Feature n={5} title="Animated SVG codes" tag="Motion" text="Codes that assemble themselves, breathe or catch the light: pure SVG with CSS animation, tiny files that stay sharp at any size and respect visitors who prefer reduced motion." points={['Three animation styles, any colour', 'Ends on the complete code, so it always scans', 'A few kilobytes, no video or GIF']}>
        <AnimatedSvg />
      </Feature>
    </ExploreShell>
  );
}
