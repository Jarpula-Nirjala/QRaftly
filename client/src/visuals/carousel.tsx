import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { EXPLORE } from '../explore.ts';
import { Link } from '../router.tsx';
import './carousel.css';

const DWELL = 2000;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The five feature pages as a looping carousel: one large card in the middle, the previous and next ones
 * smaller at each side. It moves on by itself every two seconds, rests while hovered or off-screen, and the
 * side cards (or the arrows and dots) bring a page to the middle.
 */
export function ExploreCarousel() {
  const n = EXPLORE.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (paused || !visible || document.hidden || reduced()) return;
    const t = setTimeout(() => setI((v) => (v + 1) % n), DWELL);
    return () => clearTimeout(t);
  }, [i, paused, visible, n]);

  const go = (d: number) => setI((v) => (v + d + n) % n);
  return (
    <div className="xc" ref={ref} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="xc-stage" aria-roledescription="carousel" aria-label="Feature pages">
        {EXPLORE.map((p, k) => {
          // Position relative to the middle card, wrapping round: -2 … 2.
          let rel = (k - i + n) % n;
          if (rel > n / 2) rel -= n;
          const Icon = p.icon;
          const active = rel === 0;
          return (
            <article
              key={p.to}
              className={`xc-card${active ? ' active' : ''}`}
              data-rel={rel}
              style={{ '--rel': rel, '--far': Math.min(1, Math.abs(rel)), '--depth': Math.abs(rel) } as CSSProperties}
              aria-hidden={!active}
              onClick={() => !active && setI(k)}
            >
              <div className="xc-photo">
                <img src={`/cards/${p.img}.jpg`} alt="" loading="lazy" decoding="async" draggable={false} />
                <span className="xc-badge">
                  <Icon size={15} /> Page {k + 1} of {n}
                </span>
              </div>
              <div className="xc-body">
                <h3>{p.title}</h3>
                <p>{p.blurb}</p>
                <p className="xc-more">{p.more}</p>
                <ul>
                  {p.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <Link to={p.to} className="btn primary" tabIndex={active ? 0 : -1}>
                  Open {p.label} <ArrowRight size={17} />
                </Link>
              </div>
              {active && visible && !paused && <span className="xc-timer" key={`t${i}`} />}
            </article>
          );
        })}
      </div>
      <div className="xc-nav">
        <button type="button" className="btn ghost icon" aria-label="Previous page" onClick={() => go(-1)}>
          <ChevronLeft size={22} />
        </button>
        {EXPLORE.map((p, k) => (
          <button key={p.to} type="button" className={`xc-dot${k === i ? ' on' : ''}`} aria-label={p.title} aria-current={k === i} onClick={() => setI(k)} />
        ))}
        <button type="button" className="btn ghost icon" aria-label="Next page" onClick={() => go(1)}>
          <ChevronRight size={22} />
        </button>
      </div>
    </div>
  );
}
