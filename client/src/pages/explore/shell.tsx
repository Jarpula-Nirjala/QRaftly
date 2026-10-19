import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Home } from 'lucide-react';
import { EXPLORE } from '../../explore.ts';
import { Link, useLocation } from '../../router.tsx';
import { Footer } from '../../ui.tsx';
import { BackdropStage } from '../../visuals/backdrop.tsx';
import './explore.css';

/** The frame every feature page shares: a title band, page tabs, the five features, and previous/next. */
export function ExploreShell({ children, visual }: { children: ReactNode; visual?: ReactNode }) {
  const { path } = useLocation();
  const i = EXPLORE.findIndex((p) => p.to === path);
  const page = EXPLORE[i];
  const prev = i > 0 ? EXPLORE[i - 1] : null;
  const next = i < EXPLORE.length - 1 ? EXPLORE[i + 1] : null;
  const Icon = page.icon;
  return (
    <BackdropStage>
      <div className="wrap">
        <PageTabs />
        <header className="ex-head">
          <div>
            <span className="ex-kicker">
              <Icon size={18} /> Page {i + 1} of {EXPLORE.length}
            </span>
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
        <div className="ex-features">{children}</div>
        <nav className="ex-pager" aria-label="Pages">
          {prev ? (
            <Link to={prev.to} className="ex-pg">
              <ArrowLeft size={20} />
              <span>
                <small>Previous</small>
                {prev.title}
              </span>
            </Link>
          ) : (
            <Link to="/" className="ex-pg">
              <Home size={20} />
              <span>
                <small>Back to</small>Home
              </span>
            </Link>
          )}
          {next ? (
            <Link to={next.to} className="ex-pg next">
              <span>
                <small>Next</small>
                {next.title}
              </span>
              <ArrowRight size={20} />
            </Link>
          ) : (
            <Link to="/signup" className="ex-pg next">
              <span>
                <small>Ready?</small>Create your free account
              </span>
              <ArrowRight size={20} />
            </Link>
          )}
        </nav>
      </div>
      <Footer />
    </BackdropStage>
  );
}

/** Tabs across all pages: home plus the five feature pages. */
export function PageTabs() {
  const { path } = useLocation();
  return (
    <div className="ex-tabs" role="navigation" aria-label="Feature pages">
      <Link to="/" className={path === '/' ? 'on' : ''}>
        <Home size={16} /> Home
      </Link>
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
