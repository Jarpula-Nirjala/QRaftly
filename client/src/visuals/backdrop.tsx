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
      const a = (0.15 + r(5) * 0.55) * twinkle;
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

/** Your white, gold and black waves, darkened for the dark theme and brought to life. */
function GoldWaves() {
  return (
    <div className="gw only-dark">
      <div className="gw-img" />
      <div className="gw-veil" />
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
      <Glitter />
    </div>
  );
}

/** The bright corridor: white arches receding to a glowing doorway, glass walls with blue light, a glossy floor. */
function Corridor() {
  return (
    <div className="co only-light">
      <div className="co-ceil" />
      <div className="co-floor">
        <div className="co-lines" />
      </div>
      <div className="co-end" />
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="co-frame" style={{ animationDelay: `${-i * 2.8}s`, '--k': (0.08 + i * 0.16).toFixed(2) } as CSSProperties} />
      ))}
      <div className="co-wall left" />
      <div className="co-wall right" />
      <div className="co-seam left" />
      <div className="co-seam right" />
      <div className="co-veil" />
    </div>
  );
}

/**
 * Everything inside scrolls over one fixed background: the corridor in light mode, the gold waves in dark mode.
 * The layer is sticky to the viewport but only within this block, so the hero above keeps its own scene.
 */
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
