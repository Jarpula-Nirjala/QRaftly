import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { RibbonBackdrop } from './hero.tsx';
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
 * The dark theme's one background: blackest brown at the top and the bottom of the page, warming gently to a
 * deep brown around the middle, over the white-gold-black wave artwork with orange and gold light and gold dust.
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

/**
 * The light theme's one background: the corridor of light, shaded with navy, light blue and a touch of gold, a
 * faint pattern and a little frosted glass, with the gold ribbons over it at the top that fade as you scroll.
 */
function Corridor() {
  return (
    <div className="co only-light">
      <div className="co-img" />
      <div className="co-door" />
      <div className="co-tint" />
      <div className="co-pattern" />
      <div className="co-pane p1" />
      <div className="co-pane p2" />
      <div className="co-sheen" />
      <div className="co-veil" />
      <div className="co-ribbons">
        <RibbonBackdrop />
      </div>
    </div>
  );
}

/**
 * One fixed background behind everything inside, for both themes. Two scroll values drive it:
 *   --top: 0 → 1 over the first screen (the hero's ribbons fade as you leave it);
 *   --sp:  0 at the top and the bottom of the page, rising gently to 1 at the middle (the dark theme's warmth).
 */
export function BackdropStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const p = Math.min(1, Math.max(0, window.scrollY / max));
      // A smooth hill: no warmth at either end, the most in the middle, with no sudden step anywhere.
      const warm = Math.sin(Math.PI * p) ** 2;
      ref.current?.style.setProperty('--sp', warm.toFixed(3));
      ref.current?.style.setProperty('--top', Math.min(1, window.scrollY / window.innerHeight).toFixed(3));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    // The page grows as lazy content appears; re-measure once it has settled.
    const t = setTimeout(update, 1500);
    return () => {
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, []);
  return (
    <div ref={ref} className="bg-stage" style={{ '--sp': 0, '--top': 0 } as CSSProperties}>
      <div className="bg-layer" aria-hidden="true">
        <Corridor />
        <GoldWaves />
      </div>
      {children}
    </div>
  );
}
