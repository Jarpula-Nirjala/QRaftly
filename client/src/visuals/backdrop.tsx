import type { CSSProperties, ReactNode } from 'react';
import { useCanvas } from './scene.tsx';
import './backdrop.css';

/** Gold dust twinkling over the artwork (dark theme). */
function Glitter() {
  const ref = useCanvas((ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const seed = Math.imul(i + 1, 2654435761) >>> 0;
      const r = (k: number) => ((seed >>> k) & 1023) / 1023;
      const x = (r(0) * w + t * (4 + r(3) * 8)) % w;
      const y = (r(10) * h - t * (2 + r(7) * 5) + h * 2) % h;
      const twinkle = 0.5 + 0.5 * Math.sin(t * (1.2 + r(13) * 2.4) + i);
      const a = (0.12 + r(5) * 0.5) * twinkle;
      const s = 0.6 + r(17) * 1.6;
      ctx.fillStyle = `rgba(246, 214, 150, ${a})`;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
      if (s > 1.7 && twinkle > 0.9) {
        // A brief four-point sparkle on the brightest grains.
        ctx.strokeStyle = `rgba(255, 240, 210, ${a * 0.8})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(x - s * 3, y);
        ctx.lineTo(x + s * 3, y);
        ctx.moveTo(x, y - s * 3);
        ctx.lineTo(x, y + s * 3);
        ctx.stroke();
      }
    }
  }, 30);
  return <canvas ref={ref} className="gw-glitter" />;
}

/**
 * The dark theme's one background: blackest brown from top to bottom over the white-gold-black wave artwork,
 * with faint gold light, floating QR objects and gold dust.
 */
function GoldWaves() {
  return (
    <div className="gw only-dark">
      <div className="gw-img" />
      <div className="gw-veil black" />
      <div className="gw-veil warm" />
      <div className="gw-glow g1" />
      <div className="gw-glow g2" />
      <div className="gw-glow g3" />
      <svg className="gw-strands" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="gwStrand" x1="0" x2="1">
            <stop offset="0" stopColor="#f6dc9a" stopOpacity="0" />
            <stop offset="0.5" stopColor="#f6dc9a" stopOpacity="0.9" />
            <stop offset="1" stopColor="#d4af65" stopOpacity="0" />
          </linearGradient>
        </defs>
        {['M-50 620 C 300 520, 600 760, 900 600 S 1400 380, 1700 460', 'M-50 700 C 260 600, 640 820, 960 660 S 1420 470, 1700 540', 'M-50 240 C 280 330, 560 120, 880 230 S 1380 420, 1700 300', 'M-50 300 C 300 380, 600 180, 900 290 S 1400 470, 1700 360'].map((d, i) => (
          <path key={i} d={d} className={`s s${i}`} />
        ))}
      </svg>
      <div className="gw-sheen" />
      <FloatingQr />
      <Glitter />
    </div>
  );
}

/** Specks of light drifting slowly through the corridor, towards the viewer (light theme). */
function LightMotes() {
  const ref = useCanvas((ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.58;
    for (let i = 0; i < 70; i++) {
      const seed = Math.imul(i + 7, 2654435761) >>> 0;
      const r = (k: number) => ((seed >>> k) & 1023) / 1023;
      // Each mote travels outwards from the doorway on its own line, growing as it nears the viewer.
      const life = (t * (0.025 + r(3) * 0.035) + r(9)) % 1;
      const a = r(0) * Math.PI * 2;
      const d = life * life * Math.hypot(w, h) * 0.55;
      const x = cx + Math.cos(a) * d * 1.3;
      const y = cy + Math.sin(a) * d * 0.8;
      const s = 0.6 + life * 2.6;
      const alpha = Math.sin(Math.PI * life) * (0.25 + r(5) * 0.45);
      ctx.fillStyle = r(13) < 0.35 ? `rgba(150, 205, 255, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 30);
  return <canvas ref={ref} className="co-motes" />;
}

/**
 * The light theme's one background: your corridor photograph, sharp, with soft rays from the doorway, drifting
 * specks of light and a slow push towards the light, shaded with a little navy and light blue.
 */
function Corridor() {
  return (
    <div className="co only-light">
      <div className="co-img" />
      <div className="co-rays" />
      <div className="co-door" />
      <div className="co-tint" />
      <div className="co-sheen" />
      <div className="co-veil" />
      <LightMotes />
    </div>
  );
}

/** A small QR-like pattern for a cube face: finder corners and random modules (decorative, not scannable). */
function faceSvg(seed: number): string {
  let v = seed * 9301 + 49297;
  const rnd = () => ((v = (v * 9301 + 49297) % 233280) / 233280);
  const n = 11;
  let d = '';
  let glow = '';
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const corner = (x < 3 && y < 3) || (x > 7 && y < 3) || (x < 3 && y > 7);
      const ring = corner && (x % 8 === 0 || x % 8 === 2 || y % 8 === 0 || y % 8 === 2 || (x % 8 === 1 && y % 8 === 1));
      if (corner ? ring : rnd() < 0.46) {
        if (!corner && rnd() < 0.06) glow += `M${x + 0.12} ${y + 0.12}h0.76v0.76h-0.76z`;
        else d += `M${x + 0.12} ${y + 0.12}h0.76v0.76h-0.76z`;
      }
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"><path d="${d}" fill="#d9dde3"/><path d="${glow}" fill="#3b82f6"/></svg>`;
}

// Cubes and tiles keep to the side margins, so they never sit behind text; only tiny sparks drift in the middle.
const OBJECTS: Array<{ x: number; y: number; s: number; d: number; z: number; kind: 'cube' | 'tile' | 'spark' }> = [
  { x: 1.5, y: 16, s: 52, d: 34, z: 1, kind: 'cube' },
  { x: 91, y: 10, s: 66, d: 40, z: 1, kind: 'cube' },
  { x: 93, y: 58, s: 46, d: 30, z: 0, kind: 'cube' },
  { x: 2, y: 70, s: 58, d: 38, z: 1, kind: 'cube' },
  { x: 88, y: 84, s: 38, d: 28, z: 0, kind: 'cube' },
  { x: 4, y: 44, s: 30, d: 26, z: 0, kind: 'tile' },
  { x: 95, y: 34, s: 32, d: 32, z: 1, kind: 'tile' },
  { x: 3, y: 92, s: 28, d: 30, z: 0, kind: 'tile' },
  { x: 90, y: 72, s: 26, d: 27, z: 0, kind: 'tile' },
  { x: 22, y: 6, s: 7, d: 18, z: 1, kind: 'spark' },
  { x: 52, y: 30, s: 6, d: 16, z: 0, kind: 'spark' },
  { x: 80, y: 22, s: 8, d: 20, z: 1, kind: 'spark' },
  { x: 38, y: 64, s: 6, d: 17, z: 0, kind: 'spark' },
  { x: 70, y: 90, s: 8, d: 22, z: 1, kind: 'spark' },
  { x: 14, y: 52, s: 7, d: 19, z: 0, kind: 'spark' },
  { x: 62, y: 48, s: 5, d: 15, z: 0, kind: 'spark' },
];

/** Small glossy QR cubes, flat QR tiles and glowing blue modules drifting through the dark (inspired by a QR landscape). */
function FloatingQr() {
  return (
    <div className="fq">
      {OBJECTS.map((o, i) => (
        <div key={i} className={`fq-o ${o.kind}${o.z ? '' : ' far'}`} style={{ left: `${o.x}%`, top: `${o.y}%`, '--s': `${o.s}px`, '--d': `${o.d}s`, '--delay': `${-i * 3.7}s` } as CSSProperties}>
          {o.kind === 'cube' ? (
            <div className="fq-cube">
              {['f', 'b', 'l', 'r', 't', 'u'].map((f, k) => (
                <div key={f} className={`fq-face ${f}`} dangerouslySetInnerHTML={{ __html: k < 2 || k === 4 ? faceSvg(i * 7 + k + 1) : '' }} />
              ))}
            </div>
          ) : o.kind === 'tile' ? (
            <div className="fq-tile" dangerouslySetInnerHTML={{ __html: faceSvg(i * 13 + 5) }} />
          ) : (
            <div className="fq-spark" />
          )}
        </div>
      ))}
    </div>
  );
}

/** One fixed background behind everything inside, for both themes. */
export function BackdropStage({ children }: { children: ReactNode }) {
  return (
    <div className="bg-stage">
      <div className="bg-layer" aria-hidden="true">
        <Corridor />
        <GoldWaves />
      </div>
      {children}
    </div>
  );
}
