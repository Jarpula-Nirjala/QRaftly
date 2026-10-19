import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
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
 * The dark theme's one background, for the whole page: near-black at the top that warms into espresso and
 * brown as you scroll, with the white-gold-black wave artwork, orange and gold light, gold strands and dust.
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
      <Glitter />
    </div>
  );
}

/** Your corridor of light, drifting slowly towards its glowing doorway (light theme). */
function Corridor() {
  return (
    <div className="co only-light">
      <div className="co-img" />
      <div className="co-door" />
      <div className="co-sheen" />
      <div className="co-veil" />
    </div>
  );
}

/**
 * One fixed background behind everything inside. In dark mode it also tracks how far the page has scrolled
 * (--sp, 0 at the top to 1 a screen and a half down), which warms it from black to brown.
 */
export function BackdropStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const sp = Math.min(1, window.scrollY / (window.innerHeight * 1.5));
      ref.current?.style.setProperty('--sp', sp.toFixed(3));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div ref={ref} className="bg-stage" style={{ '--sp': 0 } as CSSProperties}>
      <div className="bg-layer" aria-hidden="true">
        <Corridor />
        <GoldWaves />
      </div>
      {children}
    </div>
  );
}
