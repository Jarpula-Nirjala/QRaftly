import type { ReactNode } from 'react';
import { EXPLORE } from '../../explore.ts';
import { Link, useLocation } from '../../router.tsx';
import { Footer } from '../../ui.tsx';
import { BackdropStage } from '../../visuals/backdrop.tsx';
import './explore.css';

/** The frame every feature page shares: page tabs, a title band and the five features. */
export function ExploreShell({ children, visual }: { children: ReactNode; visual?: ReactNode }) {
  const { path } = useLocation();
  const i = EXPLORE.findIndex((p) => p.to === path);
  const page = EXPLORE[i];
  return (
    <BackdropStage>
      <div className="top-veil">
      <div className="wrap">
        <PageTabs />
        <header className="ex-head">
          <div>
            <h1>{page.title}</h1>
            <p className="lead">{page.blurb}</p>
            <ol className="ex-toc">
              {page.features.map((f, n) => (
                <li key={f}>
                  <a href={`#f${n + 1}`}>
                    <b>{n + 1}</b> {f}
                  </a>
                </li>
              ))}
            </ol>
          </div>
          {visual && <div className="ex-visual">{visual}</div>}
        </header>
      </div>
      </div>
      <div className="wrap">
        <div className="ex-features">{children}</div>
      </div>
      <Footer />
    </BackdropStage>
  );
}

/** Tabs across the five feature pages (Home is in the header). */
export function PageTabs() {
  const { path } = useLocation();
  return (
    <div className="ex-tabs" role="navigation" aria-label="Feature pages">
      {EXPLORE.map(({ to, label, icon: Icon }) => (
        <Link key={to} to={to} className={path === to ? 'on' : ''}>
          <Icon size={16} /> {label}
        </Link>
      ))}
    </div>
  );
}

/** One feature on a page: a numbered heading, what it does, and a working demo. */
export function Feature({ n, title, tag, children, text, points }: { n: number; title: string; tag?: string; text: string; points?: string[]; children: ReactNode }) {
  return (
    <section id={`f${n}`} className="ex-feature">
      <div className="ex-copy">
        <span className="ex-num">{String(n).padStart(2, '0')}</span>
        {tag && <span className="ex-tag">{tag}</span>}
        <h2>{title}</h2>
        <p>{text}</p>
        {points && (
          <ul>
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="ex-demo card">{children}</div>
    </section>
  );
}
