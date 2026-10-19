import { useEffect, useMemo, useRef, useState } from 'react';
import { Gauge, ImageUp, KeyRound, Play } from 'lucide-react';
import { quadToQuad, scanImage, type Detected } from '../../../../shared/qr/detect.ts';
import { encodeText } from '../../../../shared/qr/encode.ts';
import { explain } from '../../../../shared/qr/explain.ts';
import { rasterize } from '../../../../shared/qr/raster.ts';
import type { Ecl } from '../../../../shared/qr/tables.ts';
import { useAuth } from '../../auth.tsx';
import { Link } from '../../router.tsx';
import { Field, Segmented } from '../../ui.tsx';
import { EncoderScene } from '../../visuals/mockups.tsx';
import { ExploreShell, Feature } from './shell.tsx';

const hex2 = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();

/** A module matrix as a small SVG, with function patterns and format areas tinted when `tint` is set. */
function matrixSvg(m: boolean[][], isFunction?: boolean[][], tint = false): string {
  const n = m.length;
  let d = '';
  let f = '';
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!m[y][x]) continue;
      const r = `M${x} ${y}h1v1h-1z`;
      if (tint && isFunction?.[y][x]) f += r;
      else d += r;
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#14243a"/><path d="${f}" fill="#b08a3e"/></svg>`;
}

function readFile(file: File): Promise<Detected | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => {
      for (const side of [1000, 1600, 640]) {
        const s = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * s);
        c.height = Math.round(img.naturalHeight * s);
        const g = c.getContext('2d', { willReadFrequently: true })!;
        g.drawImage(img, 0, 0, c.width, c.height);
        const got = scanImage(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
        if (got) return ok(got);
      }
      ok(null);
    };
    img.onerror = () => ok(null);
    img.src = URL.createObjectURL(file);
  });
}

// ------------------------------------------------------------ 21. X-ray

function Xray() {
  const [got, setGot] = useState<Detected | null | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  const sample = () => {
    const qr = encodeText(`${location.origin}/r/xray-demo`, { ecl: 'Q' });
    const img = rasterize(qr.modules, 8, 4);
    setGot(scanImage(img.rgba, img.width, img.height));
  };
  useEffect(sample, []);
  // Re-encoding the text with the same version, level and mask rebuilds the symbol that was read.
  const re = useMemo(() => {
    if (!got) return null;
    try {
      return encodeText(got.text, { ecl: got.ecl, boostEcl: false, minVersion: got.version, maxVersion: got.version, mask: got.mask });
    } catch {
      return null;
    }
  }, [got]);
  return (
    <>
      <div className="demo-row">
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <ImageUp size={16} /> X-ray a photo of any QR code
        </button>
        <button className="btn ghost" onClick={sample}>
          Sample code
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && setGot(await readFile(e.target.files[0]))} />
      </div>
      {got === null && <div className="note bad">No QR code found in that picture. Try a sharper, closer photo.</div>}
      {got && (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          {re && <div className="mini-qr" dangerouslySetInnerHTML={{ __html: matrixSvg(re.modules, re.isFunction, true) }} />}
          <dl className="kv">
            <dt>Contains</dt>
            <dd className="mono">{got.text}</dd>
            <dt>Version</dt>
            <dd>
              {got.version} ({17 + got.version * 4}×{17 + got.version * 4})
            </dd>
            <dt>Error correction</dt>
            <dd>Level {got.ecl} (recovers about {{ L: 7, M: 15, Q: 25, H: 30 }[got.ecl]}% damage)</dd>
            <dt>Mask</dt>
            <dd>Pattern {got.mask}</dd>
            <dt>Blocks</dt>
            <dd>{got.correctedPerBlock.length}</dd>
            <dt>Repaired</dt>
            <dd>
              {got.correctedPerBlock.reduce((a, b) => a + b, 0)} codewords (up to {got.correctablePerBlock} per block)
            </dd>
            <dt>Gold</dt>
            <dd>Finder, timing and alignment patterns, format and version areas</dd>
          </dl>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------ 22. step by step & 23. masks

function Steps({ text, ecl }: { text: string; ecl: Ecl }) {
  const e = useMemo(() => {
    try {
      return explain(text || ' ', ecl);
    } catch {
      return null;
    }
  }, [text, ecl]);
  const ref = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(0);
  // Fill the zigzag in placement order, so the path of the data through the symbol is visible.
  useEffect(() => {
    if (!e) return;
    const c = ref.current!;
    const n = e.size;
    const u = Math.floor(300 / (n + 4));
    c.width = c.height = (n + 4) * u;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        if (e.isFunction[y][x]) {
          g.fillStyle = e.modules[y][x] ? '#b08a3e' : '#f3e6c6';
          g.fillRect((x + 2) * u, (y + 2) * u, u, u);
        }
    let i = 0;
    const per = Math.max(4, Math.ceil(e.order.length / 90));
    const id = setInterval(() => {
      for (let k = 0; k < per && i < e.order.length; k++, i++) {
        const [x, y] = e.order[i];
        g.fillStyle = e.modules[y][x] ? '#14243a' : '#e8ecf3';
        g.fillRect((x + 2) * u, (y + 2) * u, u, u);
      }
      if (i >= e.order.length) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [e, playing]);
  if (!e) return <div className="note bad">That text is too long for one QR code.</div>;
  const shown = e.dataBits.slice(0, 160);
  return (
    <div className="stack">
      <div>
        <div className="field">1. Mode and length</div>
        <p className="small" style={{ margin: '4px 0' }}>
          {e.mode} mode, {e.header.count} {e.mode === 'byte' ? 'bytes' : 'characters'} → version {e.version}, level {e.ecl}
        </p>
        <div className="bits">
          <span className="m">{e.header.modeBits}</span> <span className="c">{e.header.countBits}</span> {shown}
          {e.dataBits.length > 160 ? '…' : ''}
        </div>
        <div className="small muted">Orange: mode indicator · gold: character count · then the data bits</div>
      </div>
      <div>
        <div className="field">2. Codewords and Reed–Solomon error correction</div>
        {e.blocks.slice(0, 2).map((b, i) => (
          <div key={i} className="cw" style={{ marginTop: 6 }}>
            <b className="small" style={{ width: '100%' }}>
              Block {i + 1}: {b.data.length} data + {b.ecc.length} correction
            </b>
            {b.data.map((v, k) => (
              <span key={`d${k}`}>{hex2(v)}</span>
            ))}
            {b.ecc.map((v, k) => (
              <span key={`e${k}`} className="e">
                {hex2(v)}
              </span>
            ))}
          </div>
        ))}
        {e.blocks.length > 2 && <div className="small muted">…and {e.blocks.length - 2} more blocks, interleaved into {e.interleaved.length} codewords.</div>}
      </div>
      <div>
        <div className="spread">
          <div className="field">3. Placement: the zigzag, two columns at a time, from the bottom right</div>
          <button className="btn sm" onClick={() => setPlaying(playing + 1)}>
            <Play size={14} /> Replay
          </button>
        </div>
        <canvas ref={ref} className="demo-canvas" style={{ maxWidth: 300, marginTop: 8 }} aria-label="Data being placed into the symbol" />
      </div>
    </div>
  );
}

function StepByStep() {
  const [text, setText] = useState('HELLO QRAFTLY');
  const [ecl, setEcl] = useState<Ecl>('M');
  return (
    <>
      <Field label="Type anything">
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} />
      </Field>
      <Segmented label="Error correction" value={ecl} onChange={setEcl} options={(['L', 'M', 'Q', 'H'] as Ecl[]).map((v) => ({ value: v, label: `Level ${v}` }))} />
      <Steps text={text} ecl={ecl} />
    </>
  );
}

function MaskBoard() {
  const [text, setText] = useState('https://qraftly.app');
  const e = useMemo(() => {
    try {
      return explain(text || ' ', 'M');
    } catch {
      return null;
    }
  }, [text]);
  return (
    <>
      <Field label="Text">
        <input className="input" value={text} onChange={(e2) => setText(e2.target.value)} maxLength={200} />
      </Field>
      {e && (
        <div className="mask-grid">
          {e.masks.map((m) => (
            <figure key={m.mask} className={m.mask === e.chosen ? 'best' : ''}>
              <div dangerouslySetInnerHTML={{ __html: matrixSvg(m.modules) }} />
              <figcaption>
                <b>Mask {m.mask}</b> · {m.total}
                {m.mask === e.chosen ? ' ★' : ''}
                <br />
                <span className="muted">
                  runs {m.parts[0]} · blocks {m.parts[1]} · finder-like {m.parts[2]} · balance {m.parts[3]}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <p className="small muted" style={{ margin: 0 }}>Lower is better. The four rules penalise long runs, 2×2 blocks, patterns that look like finder squares and an uneven dark-to-light balance; the encoder keeps the mask with the lowest total (★).</p>
    </>
  );
}

// ------------------------------------------------------------ 24. API & 25. benchmark

function ApiDocs() {
  const { user } = useAuth();
  const origin = location.origin;
  return (
    <>
      <div className="code-block">{`# A QR code as PNG
curl -X POST ${origin}/api/v1/qr \\
  -H "Authorization: Bearer qrft_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"https://example.com","format":"png","design":{"fg":"#14243a"}}' \\
  -o code.png

# A new dynamic (editable, tracked) link
curl -X POST ${origin}/api/v1/links \\
  -H "Authorization: Bearer qrft_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/menu","title":"Menu"}'
# → {"shortUrl":"${origin}/r/Ab3dE7k", ...}`}</div>
      <ul className="small" style={{ margin: 0, paddingLeft: 20, color: 'var(--ink-2)' }}>
        <li>
          <b>format</b>: "svg" (default) or "png"; <b>ecl</b>: L, M, Q or H; <b>design</b>: fg, bg, dots, eyes
        </li>
        <li>Up to 120 requests a minute per key; up to 5 keys per account</li>
        <li>Keys are shown once and stored only as a SHA-256 hash</li>
      </ul>
      <div>
        <Link to={user ? '/app/keys' : '/signup?next=%2Fapp%2Fkeys'} className="btn primary">
          <KeyRound size={16} /> {user ? 'Manage your API keys' : 'Sign up to get a key'}
        </Link>
      </div>
    </>
  );
}

/** Makes one synthetic camera frame: the code projected at an angle onto a textured desk, with noise. */
function frame(text: string, seed: number, w = 480, h = 360) {
  let s = seed;
  const R = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const qr = encodeText(text, { ecl: 'M' });
  const n = qr.size + 8;
  const half = 80 + R() * 70;
  const a = R() * Math.PI * 2;
  const quad = [[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([sx, sy]) => {
    const k = 1 + (R() - 0.5) * 0.25;
    return [w / 2 + half * k * (sx * Math.cos(a) - sy * Math.sin(a)), h / 2 + half * k * (sx * Math.sin(a) + sy * Math.cos(a))];
  });
  const map = quadToQuad(quad, [0, 0, n, 0, n, n, 0, n]);
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = map(x + 0.5, y + 0.5);
      const mx = Math.floor(p.x) - 4;
      const my = Math.floor(p.y) - 4;
      const out = p.x < 0 || p.y < 0 || p.x >= n || p.y >= n;
      let v = out ? 120 + 50 * Math.sin(x / 23) : mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.modules[my][mx] ? 35 : 220;
      v += (R() - 0.5) * 30;
      const i = (y * w + x) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
  return rgba;
}

function Benchmark() {
  const [res, setRes] = useState<{ done: number; ok: number; times: number[] } | null>(null);
  const [running, setRunning] = useState(false);
  const total = 30;
  const run = () => {
    setRunning(true);
    const times: number[] = [];
    let ok = 0;
    let i = 0;
    const text = `${location.origin}/benchmark`;
    const step = () => {
      const img = frame(text, 1000 + i * 77);
      const t0 = performance.now();
      const got = scanImage(img, 480, 360);
      times.push(performance.now() - t0);
      if (got?.text === text) ok++;
      i++;
      setRes({ done: i, ok, times: [...times] });
      if (i < total) setTimeout(step, 0);
      else setRunning(false);
    };
    setTimeout(step, 0);
  };
  const sorted = res ? [...res.times].sort((a, b) => a - b) : [];
  const avg = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
  return (
    <>
      <button className="btn primary" disabled={running} onClick={run}>
        <Gauge size={16} /> {running ? 'Running…' : 'Run the benchmark on this device'}
      </button>
      {res && (
        <>
          <div className="progress">
            <span style={{ width: `${(res.done / total) * 100}%` }} />
          </div>
          <div className="stats">
            <div className="stat">
              <div className="label">Frames read</div>
              <div className="value">
                {res.ok}/{res.done}
              </div>
            </div>
            <div className="stat">
              <div className="label">Average</div>
              <div className="value">{avg.toFixed(1)} ms</div>
            </div>
            <div className="stat">
              <div className="label">Slowest 10%</div>
              <div className="value">{(sorted[Math.floor(sorted.length * 0.9)] ?? 0).toFixed(1)} ms</div>
            </div>
            <div className="stat">
              <div className="label">Frames a second</div>
              <div className="value">{avg ? Math.floor(1000 / avg) : 0}</div>
            </div>
          </div>
        </>
      )}
      <p className="small muted" style={{ margin: 0 }}>30 synthetic 480×360 camera frames: random angle, tilt and noise. Only decoding is timed, on your device’s main thread.</p>
    </>
  );
}

export default function EnginePage() {
  return (
    <ExploreShell visual={<EncoderScene />}>
      <Feature n={21} title="QR X-ray inspector" tag="Diagnostics" text="Upload a photo of any QR code, from any generator, and see inside it: its version and size, error-correction level, mask, how many codewords had to be repaired, and a map of its function patterns." points={['Read by QRaftly’s own camera decoder', 'Re-encoded with the same settings to rebuild the exact symbol', 'Useful for checking printed codes that scan badly']}>
        <Xray />
      </Feature>
      <Feature n={22} title="Step-by-step encoder" tag="Education" text="Watch your text become a QR code: the mode and length bits, the data codewords, the Reed–Solomon error-correction codewords, and the zigzag that places every bit into the symbol." points={['Every value comes from the real encoder', 'Compare how levels L to H change the blocks', 'An animated placement path']}>
        <StepByStep />
      </Feature>
      <Feature n={23} title="Mask scoreboard" tag="Education" text="Every QR code is drawn eight ways, each with a different mask pattern. The scoreboard shows all eight with the four penalty scores the standard defines, and which one wins." points={['The four ISO/IEC 18004 penalty rules, scored separately', 'The winning mask matches what the encoder picks', 'Change the text and watch the winner change']}>
        <MaskBoard />
      </Feature>
      <Feature n={24} title="Developer API & keys" tag="Developers" text="Make QR codes and dynamic links from your own apps and scripts with a simple JSON API. Create keys in your account; each key can make SVG or PNG codes and new tracked links." points={['POST /api/v1/qr for SVG or PNG', 'POST /api/v1/links for editable, tracked short links', 'Per-key rate limits and last-used times']}>
        <ApiDocs />
      </Feature>
      <Feature n={25} title="In-browser benchmark" tag="Performance" text="How fast is the camera decoder on your phone or laptop? Run it on 30 tricky synthetic frames right here and get the read rate and timing, the same measurement the project reports." points={['Same decoder as the door scanner', 'Runs locally; nothing is uploaded', 'Compare devices: phones, tablets, laptops']}>
        <Benchmark />
      </Feature>
    </ExploreShell>
  );
}
