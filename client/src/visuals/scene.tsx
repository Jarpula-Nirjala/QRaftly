import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import './visuals.css';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Runs `draw(t)` on a canvas at up to `fps`, sized to its element at device resolution. It pauses while the
 * canvas is off-screen or the tab is hidden, and draws a single still frame when motion is reduced.
 */
export function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void, fps = 30) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let w = 0;
    let h = 0;
    let visible = true;
    let raf = 0;
    let last = 0;
    const start = performance.now();
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reducedMotion()) drawRef.current(ctx, w, h, 0);
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || now - last < 1000 / fps) return;
      last = now;
      drawRef.current(ctx, w, h, (now - start) / 1000);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    resize();
    if (!reducedMotion()) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [fps]);
  return ref;
}

/** A small deterministic hash, so decorative patterns stay the same between frames. */
const hash = (x: number, y: number) => {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

// ------------------------------------------------------------ backgrounds

/** Soft daylight drifting across a white studio, frosted glass panes and a faint pearl grid. */
export function Daylight() {
  return (
    <div className="v-daylight" aria-hidden="true">
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
      <div className="grid" />
      <div className="pane p1" />
      <div className="pane p2" />
    </div>
  );
}

/** Tiny square data fragments drifting along curved paths, faint on the left where the headline sits. */
export function Particles() {
  const parts = useRef<Array<{ x: number; y: number; s: number; v: number; a: number; ph: number; amp: number; c: number }>>([]);
  const ref = useCanvas((ctx, w, h, t) => {
    const want = Math.min(70, Math.round((w * h) / 16000));
    while (parts.current.length < want) {
      const i = parts.current.length;
      parts.current.push({ x: hash(i, 1) * w, y: hash(i, 2) * h, s: 2 + hash(i, 3) * 3.5, v: 6 + hash(i, 4) * 14, a: 0.12 + hash(i, 5) * 0.28, ph: hash(i, 6) * 6.28, amp: 8 + hash(i, 7) * 26, c: hash(i, 8) });
    }
    ctx.clearRect(0, 0, w, h);
    for (const p of parts.current.slice(0, want)) {
      const x = (p.x + t * p.v) % (w + 40) - 20;
      const y = p.y + Math.sin(x / 140 + p.ph) * p.amp;
      const fade = Math.max(0, Math.min(1, (x / w) * 1.8 - 0.35)); // keep the copy side clear
      if (fade <= 0) continue;
      ctx.fillStyle = p.c < 0.6 ? `rgba(176, 138, 62, ${p.a * fade})` : `rgba(212, 175, 101, ${p.a * fade})`;
      ctx.fillRect(x, y, p.s, p.s);
    }
  }, 30);
  return <canvas ref={ref} className="v-particles" aria-hidden="true" />;
}

// ------------------------------------------------------------ glass objects

export function GlassCube({ size, glow = false, style, className = '', duration = 28, delay = 0 }: { size: number | string; glow?: boolean; style?: CSSProperties; className?: string; duration?: number; delay?: number }) {
  return (
    <div className={`v-cube-wrap ${className}`} style={style} aria-hidden="true">
      {/* The light sits outside the spinning cube, so it always faces the viewer instead of turning edge-on. */}
      {glow && <div className="core" style={{ '--s': typeof size === 'number' ? `${size}px` : size } as CSSProperties} />}
      <div className="v-cube" style={{ '--s': typeof size === 'number' ? `${size}px` : size, animationDuration: `${duration}s`, animationDelay: `${-delay}s` } as CSSProperties}>
        {['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].map((f) => (
          <div key={f} className={`face ${f}`} />
        ))}
      </div>
    </div>
  );
}

/** A band of precision glass cubes floating at different depths around its content. */
export function FloatingBand({ children }: { children: ReactNode }) {
  const cubes: Array<[string, CSSProperties, number, boolean]> = [
    ['74px', { left: '5%', top: '14%' }, 30, true],
    ['40px', { left: '16%', bottom: '12%' }, 24, false],
    ['28px', { left: '30%', top: '8%' }, 20, false],
    ['92px', { right: '6%', top: '22%' }, 36, true],
    ['46px', { right: '20%', bottom: '10%' }, 26, false],
    ['24px', { right: '31%', top: '10%' }, 18, false],
  ];
  return (
    <div className="v-float-band">
      {cubes.map(([s, pos, d, glow], i) => (
        <GlassCube key={i} size={s} style={pos} duration={d} delay={i * 5} glow={glow} className={i % 3 === 2 ? 'far' : ''} />
      ))}
      <div className="inner">{children}</div>
    </div>
  );
}

/** The call to action at the end of an infinite corridor of white portals. */
export function Tunnel({ children }: { children: ReactNode }) {
  return (
    <div className="v-tunnel">
      <div className="floor" />
      <div className="glow" />
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="v-portal" style={{ animationDelay: `${-i * 2}s`, '--k': (0.12 + i * 0.22).toFixed(2) } as CSSProperties} />
      ))}
      <div className="cta-card">{children}</div>
    </div>
  );
}

/** A precision glass prism with a blue light inside, standing on a pearl studio floor. */
export function GlassPrism({ caption }: { caption?: string }) {
  return (
    <div className="v-stage square v-prism v-grain">
      <GlassCube size="40cqw" glow duration={40} />
      <div className="v-contact-shadow" />
      {caption && <span className="v-caption">{caption}</span>}
    </div>
  );
}
