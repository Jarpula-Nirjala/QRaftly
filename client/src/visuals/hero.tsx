import { useMemo, type CSSProperties } from 'react';
import { QrSvg } from '../studio.tsx';
import { useCanvas } from './scene.tsx';
import './hero.css';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const siteUrl = () => (typeof location === 'undefined' ? 'https://qraftly.app' : location.origin);

// ------------------------------------------------------------ the name, letter by letter

/**
 * "QRaftly" set large. Each letter turns up out of the page in sequence, a band of gold light then sweeps
 * across the word, the letters drift gently, and each one lifts when the pointer touches it.
 */
export function AnimatedName() {
  return (
    <span className="hero-name" aria-label="QRaftly">
      {[...'QRaftly'].map((ch, i) => (
        <span key={i} className="float" style={{ '--i': i } as CSSProperties} aria-hidden="true">
          <span className={i === 0 ? 'ch q' : 'ch'}>{ch}</span>
        </span>
      ))}
      <svg className="name-swash" viewBox="0 0 600 40" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="swash" x1="0" x2="1">
            <stop offset="0" stopColor="var(--gold)" stopOpacity="0" />
            <stop offset="0.2" stopColor="var(--gold)" />
            <stop offset="0.8" stopColor="var(--gold-2)" />
            <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M8 28 C 140 6, 300 38, 440 16 S 580 14, 594 22" fill="none" stroke="url(#swash)" strokeWidth="2.4" strokeLinecap="round" pathLength={100} />
        <circle className="spark" r="3.2" fill="#fff6dc">
          {!reduced() && <animateMotion dur="5s" begin="2.4s" repeatCount="indefinite" path="M8 28 C 140 6, 300 38, 440 16 S 580 14, 594 22" />}
        </circle>
      </svg>
    </span>
  );
}

// ------------------------------------------------------------ light: glass and gold ribbons

/** A thin lens between two curves: a ribbon of glass or gold seen edge-on, bowing by `bend`. */
function lens(x0: number, y0: number, x1: number, y1: number, bend: number, thick: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const c = (t: number, b: number) => `${(x0 + dx * t + nx * b).toFixed(1)} ${(y0 + dy * t + ny * b).toFixed(1)}`;
  const b2 = bend - thick;
  return `M${x0} ${y0} C${c(0.3, bend)} ${c(0.7, bend * 0.92)} ${x1} ${y1} C${c(0.7, b2 * 0.92)} ${c(0.3, b2)} ${x0} ${y0}Z`;
}

const GLASS: Array<[number, number, number, number, number, number]> = [
  [180, 1010, 1780, 90, -270, 74],
  [430, 1040, 1720, -80, -190, 48],
  [720, 990, 1680, 250, -130, 120],
  [120, 780, 1700, 400, -95, 30],
  [900, 1060, 1640, 40, -60, 26],
];
const GOLD: Array<[number, number, number, number, number, number]> = [
  [160, 930, 1760, 40, -315, 10],
  [520, 1030, 1640, -30, -168, 7],
  [300, 840, 1710, 330, -66, 5],
];

export function RibbonBackdrop({ className = '' }: { className?: string }) {
  const motion = !reduced();
  const glass = useMemo(() => GLASS.map((g) => lens(...g)), []);
  const gold = useMemo(() => GOLD.map((g) => lens(...g)), []);
  return (
    <div className={`ribbons ${className}`} aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="rbGlass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="0.45" stopColor="#eef1f5" stopOpacity="0.55" />
            <stop offset="0.7" stopColor="#ffffff" stopOpacity="0.25" />
            <stop offset="1" stopColor="#dfe4eb" stopOpacity="0.7" />
          </linearGradient>
          <linearGradient id="rbGold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#9c6f2c" />
            <stop offset="0.16" stopColor="#f7e2b0" />
            <stop offset="0.33" stopColor="#c99a4a" />
            <stop offset="0.5" stopColor="#fff4d6" />
            <stop offset="0.67" stopColor="#b8893e" />
            <stop offset="0.84" stopColor="#f1d391" />
            <stop offset="1" stopColor="#a77a33" />
          </linearGradient>
          {/* A narrow band of light travelling along the gold. */}
          <linearGradient id="rbShine" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="420" y2="-240">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            {motion && <animateTransform attributeName="gradientTransform" type="translate" values="-500 600; 2100 -300" dur="7s" repeatCount="indefinite" />}
          </linearGradient>
          <filter id="rbShadow" x="-10%" y="-10%" width="120%" height="140%">
            <feDropShadow dx="0" dy="22" stdDeviation="20" floodColor="#14243a" floodOpacity="0.09" />
          </filter>
          <filter id="rbSoft">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>
        <rect width="1600" height="900" fill="#f6f7f9" />
        {glass.map((d, i) => (
          <g key={`g${i}`} className={`rib r${i}`} filter="url(#rbShadow)">
            <path d={d} fill="url(#rbGlass)" stroke="#ffffff" strokeOpacity="0.95" strokeWidth="1.4" />
            <path d={d} fill="none" stroke="#c9d1dd" strokeOpacity="0.35" strokeWidth="0.6" filter="url(#rbSoft)" />
          </g>
        ))}
        {gold.map((d, i) => (
          <g key={`a${i}`} className={`rib a${i}`}>
            <path d={d} fill="url(#rbGold)" />
            <path d={d} fill="url(#rbShine)" style={{ mixBlendMode: 'screen' }} />
          </g>
        ))}
      </svg>
      <div className="ribbons-wash" />
    </div>
  );
}

// ------------------------------------------------------------ dark: glowing cube lamps on stone

interface LampSpec {
  left: string;
  bottom: string;
  size: string;
  metal: 'navy' | 'copper' | 'steel';
  pedestal: { left: string; width: string; top: string };
}

const LAMPS: LampSpec[] = [
  { left: '24%', bottom: '45%', size: '13.5cqw', metal: 'navy', pedestal: { left: '16.5%', width: '28cqw', top: '55%' } },
  { left: '47.5%', bottom: '41%', size: '13.5cqw', metal: 'copper', pedestal: { left: '40%', width: '29cqw', top: '59%' } },
  { left: '71%', bottom: '39%', size: '13.5cqw', metal: 'steel', pedestal: { left: '63.5%', width: '30cqw', top: '61%' } },
];

function Lamp({ spec, i }: { spec: LampSpec; i: number }) {
  return (
    <div className="lamp-unit" style={{ left: spec.left, bottom: spec.bottom, '--s': spec.size, '--d': `${i * -2.1}s` } as CSSProperties}>
      <div className="halo" />
      <div className="lamp3d">
        <div className="cube">
          <div className="face front">
            <div className="ring">
              <QrSvg text={siteUrl()} className="lamp-qr" design={{ fg: '#3a2c1c', margin: 0, transparent: true }} />
            </div>
            <span className="tap">TAP OR SCAN FOR MENU</span>
          </div>
          <div className="face right" />
          <div className="face top">
            <i />
            <i />
          </div>
          <div className={`bface front ${spec.metal}`}>
            <b />
          </div>
          <div className={`bface right ${spec.metal}`} />
        </div>
      </div>
    </div>
  );
}

/** Warm dust drifting up through the lamp light. */
function Dust() {
  const ref = useCanvas((ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const seed = (i * 2654435761) >>> 0;
      const r = (k: number) => (((seed >>> k) & 1023) / 1023);
      const x = (r(0) * w + Math.sin(t * 0.2 + i) * 18) % w;
      const y = h - (((r(10) * h + t * (6 + r(20) * 10)) % (h * 1.1)));
      const a = 0.06 + r(5) * 0.22;
      const s = 0.8 + r(15) * 1.8;
      ctx.fillStyle = `rgba(255, 226, 180, ${a})`;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 30);
  return <canvas ref={ref} className="dust" aria-hidden="true" />;
}

export function LampScene({ className = '' }: { className?: string }) {
  return (
    <div className={`lamps ${className}`} aria-label="Three glowing QR code lamps on stone pedestals">
      <div className="beam b1" />
      <div className="beam b2" />
      {LAMPS.map((l, i) => (
        <div key={`p${i}`} className="pedestal" style={{ left: l.pedestal.left, width: l.pedestal.width, top: l.pedestal.top }}>
          <div className="ptop">
            <div className="pool" />
          </div>
          <div className="pbody" />
        </div>
      ))}
      {LAMPS.map((l, i) => (
        <Lamp key={`l${i}`} spec={l} i={i} />
      ))}
      <Dust />
      <div className="lamps-vignette" />
    </div>
  );
}
