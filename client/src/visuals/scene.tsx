import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { QrSvg } from '../studio.tsx';
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

/**
 * The "QR universe": a landscape of square modules receding to the horizon, gliding slowly towards the
 * viewer, with a few modules lit electric blue. Random, so it is decorative and never scannable.
 */
export function ModuleField() {
  const ref = useCanvas((ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    // A ground plane of square modules, seen from just above; rows are one module deep.
    const dark = document.documentElement.dataset.theme === 'dark';
    const horizon = h * 0.02;
    const f = h * 0.62;
    const cell = 0.2;
    const near = 0.75;
    const rows = 46;
    const travel = t * 0.12;
    const base = Math.floor(travel / cell);
    const frac = travel / cell - base;
    const y = (z: number) => horizon + f / z;
    for (let zi = rows; zi >= 0; zi--) {
      const z0 = near + (zi - frac) * cell; // near edge of the row
      if (z0 <= 0.2) continue;
      const z1 = z0 + cell * 0.82; // far edge
      const top = y(z1);
      const bottom = y(z0);
      if (top > h) continue;
      const zid = zi + base;
      const px = (cell * f) / z0;
      const span = Math.min(110, Math.ceil(((w / 2) * z0) / (cell * f)) + 1);
      const fog = Math.min(1, 0.25 + 0.9 / z0);
      for (let X = -span; X <= span; X++) {
        const r = hash(X, zid);
        if (r < 0.5) continue;
        const x0 = w / 2 + (X - 0.41) * px;
        const wpx = px * 0.82;
        if (r > 0.985) {
          const pulse = 0.55 + 0.45 * Math.sin(t * 1.4 + X * 0.7 + zid);
          const c = r > 0.993 ? '212, 175, 101' : '176, 138, 62';
          ctx.fillStyle = `rgba(${c}, ${0.16 * pulse * fog})`; // soft halo
          ctx.fillRect(x0 - wpx * 0.3, top - (bottom - top) * 0.3, wpx * 1.6, (bottom - top) * 1.6);
          ctx.fillStyle = `rgba(${c}, ${(0.6 + 0.35 * pulse) * fog})`;
        } else ctx.fillStyle = `rgba(${dark ? '232, 223, 207' : '71, 85, 105'}, ${(0.12 + 0.26 * (r - 0.5) * 2) * fog})`;
        ctx.fillRect(x0, top, wpx, Math.max(0.6, bottom - top));
      }
    }
  }, 24);
  return (
    <div className="v-universe" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
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

/** The hero object: a frosted glass scanner holding a real code (it opens this site) under a scanning beam. */
export function HeroScanner() {
  const url = typeof location === 'undefined' ? 'https://qraftly.app' : location.origin;
  return (
    <div className="v-scene" aria-label="A QR code being scanned">
      <svg className="v-trails" viewBox="0 0 100 92" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="trail" x1="0" x2="1">
            <stop offset="0" stopColor="#D4AF65" stopOpacity="0" />
            <stop offset="0.5" stopColor="#D4AF65" stopOpacity="0.9" />
            <stop offset="1" stopColor="#B08A3E" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M-10 70 C 20 60, 40 88, 70 70 S 110 40, 120 46" stroke="url(#trail)" strokeWidth="0.5" />
        <path d="M-10 30 C 15 20, 35 40, 60 26 S 100 8, 120 16" stroke="url(#trail)" strokeWidth="0.35" />
        <path d="M-10 86 C 30 76, 60 96, 90 82 S 115 70, 125 74" stroke="url(#trail)" strokeWidth="0.3" />
      </svg>
      <GlassCube size="13cqw" glow className="far" style={{ left: '2%', top: '58%' }} duration={34} />
      <GlassCube size="8cqw" style={{ right: '4%', top: '6%' }} duration={26} delay={9} />
      <GlassCube size="6cqw" style={{ right: '10%', bottom: '8%' }} duration={22} delay={4} />
      <div className="v-panel">
        <div className="v-plate">
          <QrSvg text={url} className="v-qr" design={{ fg: '#14243A', dots: 'rounded', eyes: 'rounded', margin: 2 }} />
          <div className="v-beam" />
        </div>
        <div className="v-status">
          <span>
            <span className="dot" />
            Scanned · opened in 0.3 s
          </span>
          <span className="chip">Dynamic</span>
        </div>
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
