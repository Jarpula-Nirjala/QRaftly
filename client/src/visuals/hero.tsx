import type { CSSProperties } from 'react';
import { QrSvg } from '../studio.tsx';
import { useCanvas } from './scene.tsx';
import './hero.css';

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
    </span>
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

// ------------------------------------------------------------ light: the floating QR

/** Your floating-QR picture: it drifts gently up and down while a soft light passes across it. */
export function HeroWave({ className = '' }: { className?: string }) {
  return (
    <div className={`hw ${className}`} role="img" aria-label="A glossy QR code made of glass cubes, floating over a pedestal">
      <div className="hw-glow" />
      <div className="hw-img" />
      <div className="hw-glint" />
      {Array.from({ length: 10 }, (_, k) => (
        <span key={k} className="hw-spark" style={{ '--k': k } as CSSProperties} />
      ))}
    </div>
  );
}
