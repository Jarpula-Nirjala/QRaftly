import { createContext, useCallback, useContext, useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertCircle, CalendarCheck, Files, LayoutGrid, Loader2, LogOut, Menu, Moon, ScrollText, Sun, X } from 'lucide-react';
import { useAuth } from './auth.tsx';
import { Link, navigate, useLocation } from './router.tsx';

// ------------------------------------------------------------ brand

/*
 * The QRaftly mark: two interlocking rounded squares that weave over and under each other, the front one in
 * gold that turns to black and back, with a small "q" where they overlap. Drawn as vectors so it stays sharp
 * at any size; its colours come from CSS variables, so in dark mode the black parts turn bright ivory.
 */
const FRONT = 'M24 38h24a12 12 0 0 1 12 12v24a12 12 0 0 1-12 12H24a12 12 0 0 1-12-12V50a12 12 0 0 1 12-12z';
const BACK = 'M52 10h24a12 12 0 0 1 12 12v24a12 12 0 0 1-12 12H52a12 12 0 0 1-12-12V22a12 12 0 0 1 12-12z';
const Q = 'M48.5 43.5h4a3.5 3.5 0 0 1 3.5 3.5v4a3.5 3.5 0 0 1-3.5 3.5h-4a3.5 3.5 0 0 1-3.5-3.5v-4a3.5 3.5 0 0 1 3.5-3.5zM56 49v11';
/** Where the back square's lower edge passes over the front square's right edge. */
const OVER = 'M50 58h22';

/** The mark as a standalone SVG string (light colours), for the favicon and for logos placed inside codes. */
export const BRAND_SVG = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="f" gradientUnits="userSpaceOnUse" x1="12" y1="38" x2="60" y2="86"><stop offset="0" stop-color="#f6dc9a"/><stop offset=".3" stop-color="#d4af65"/><stop offset=".46" stop-color="#15120f"/><stop offset=".62" stop-color="#15120f"/><stop offset=".8" stop-color="#a8782f"/><stop offset="1" stop-color="#f6dc9a"/></linearGradient><linearGradient id="b" gradientUnits="userSpaceOnUse" x1="40" y1="10" x2="88" y2="58"><stop offset="0" stop-color="#7a6440"/><stop offset=".4" stop-color="#3a3127"/><stop offset=".7" stop-color="#17130f"/><stop offset="1" stop-color="#7a6440"/></linearGradient></defs><path d="${BACK}" fill="none" stroke="url(#b)" stroke-width="10"/><path d="${FRONT}" fill="none" stroke="url(#f)" stroke-width="10"/><path d="${OVER}" stroke="#fff" stroke-width="16"/><path d="${OVER}" stroke="url(#b)" stroke-width="10"/><path d="${Q}" fill="none" stroke="#d4af65" stroke-width="4.5" stroke-linecap="round"/></svg>`;

export function BrandMark({ size = 34, gap = 'var(--bg)' }: { size?: number; gap?: string }) {
  const id = useId().replace(/:/g, '');
  const stop = (offset: number, v: string) => <stop offset={offset} style={{ stopColor: `var(${v})` }} />;
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}f`} gradientUnits="userSpaceOnUse" x1="12" y1="38" x2="60" y2="86">
          {stop(0, '--logo-g1')}
          {stop(0.3, '--logo-g2')}
          {stop(0.46, '--logo-k')}
          {stop(0.62, '--logo-k')}
          {stop(0.8, '--logo-g3')}
          {stop(1, '--logo-g1')}
        </linearGradient>
        <linearGradient id={`${id}b`} gradientUnits="userSpaceOnUse" x1="40" y1="10" x2="88" y2="58">
          {stop(0, '--logo-b2')}
          {stop(0.4, '--logo-b1')}
          {stop(0.7, '--logo-b3')}
          {stop(1, '--logo-b2')}
        </linearGradient>
      </defs>
      <path className="ring back" d={BACK} fill="none" stroke={`url(#${id}b)`} strokeWidth="10" pathLength={100} />
      <path className="ring front" d={FRONT} fill="none" stroke={`url(#${id}f)`} strokeWidth="10" pathLength={100} />
      {/* The weave: a gap in the background colour, then the back square crossing over. */}
      <path d={OVER} stroke={gap} strokeWidth="16" />
      <path d={OVER} stroke={`url(#${id}b)`} strokeWidth="10" />
      <path className="q" d={Q} fill="none" stroke="var(--logo-g2)" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

/** "QRaftly", one span per letter so each can animate on its own. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`logo-word ${className}`} aria-label="QRaftly">
      {[...'QRaftly'].map((ch, i) => (
        <span key={i} className={i === 0 ? 'l q' : 'l'} style={{ '--i': i } as CSSProperties} aria-hidden="true">
          {ch}
        </span>
      ))}
    </span>
  );
}

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="QRaftly home">
      <BrandMark />
      <Wordmark />
    </Link>
  );
}

// ------------------------------------------------------------ toasts

interface Toast {
  id: number;
  text: string;
  bad?: boolean;
}
const ToastCtx = createContext<(text: string, bad?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, bad?: boolean) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-2), { id, text, bad }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), bad ? 5000 : 2800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-box" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`toast${t.bad ? ' bad' : ''}`}>
            {t.bad && <AlertCircle size={17} />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ------------------------------------------------------------ bits

export const Spinner = ({ size = 18 }: { size?: number }) => <Loader2 size={size} className="spin" aria-label="Loading" />;

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="center-load">
      <div className="row brand-loading" role="status">
        <BrandMark size={28} /> {label}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      {label}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function ColorInput({ value, onChange, label }: { value: string; onChange(v: string): void; label: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="color">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <input
        type="text"
        value={text}
        aria-label={`${label} hex`}
        onChange={(e) => {
          setText(e.target.value);
          if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase());
        }}
      />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: NoInfer<T>; label: ReactNode }>; onChange(v: NoInfer<T>): void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try {
      localStorage.setItem('qrf-theme', next ? 'dark' : 'light');
    } catch {
      // private mode: the choice lasts for this visit
    }
  };
  return { dark, toggle };
}

export const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const fmtDateTime = (ms: number) => `${fmtDate(ms)}, ${fmtTime(ms)}`;

// ------------------------------------------------------------ chrome

const APP_NAV = [
  { to: '/app', label: 'Codes', icon: LayoutGrid },
  { to: '/app/events', label: 'Events', icon: CalendarCheck },
  { to: '/app/certificates', label: 'Certificates', icon: ScrollText },
  { to: '/app/bulk', label: 'Bulk', icon: Files },
];

export function Header() {
  const { user, signOut } = useAuth();
  const { path } = useLocation();
  const { dark, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const on = (to: string) => (to === '/app' ? path === '/app' || path.startsWith('/app/qr') || path.startsWith('/app/new') : path.startsWith(to));
  return (
    <header className="header">
      <div className="wrap">
        <Brand />
        <nav className={`nav${open ? ' open' : ''}`} aria-label="Main">
          {user ? (
            APP_NAV.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className={on(to) ? 'on' : ''}>
                <Icon size={16} /> {label}
              </Link>
            ))
          ) : (
            <>
              <Link to="/#generator">Generator</Link>
              <Link to="/#features">Features</Link>
              <Link to="/#engine">How it works</Link>
              <Link to="/verify">Verify a certificate</Link>
            </>
          )}
        </nav>
        <div className="header-end">
          <button className="btn ghost icon" onClick={toggle} aria-label={dark ? 'Use light theme' : 'Use dark theme'} title={dark ? 'Light theme' : 'Dark theme'}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {user ? (
            <>
              <span className="muted small hide-sm">{user.name}</span>
              <button
                className="btn ghost icon"
                title="Sign out"
                aria-label="Sign out"
                onClick={async () => {
                  await signOut();
                  navigate('/');
                }}
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <>
              <Link to="/signin" className="btn ghost hide-sm">
                Sign in
              </Link>
              <Link to="/signup" className="btn primary">
                Get started
              </Link>
            </>
          )}
          <button className="btn ghost icon menu-btn" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
            {open ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <Brand />
            <p className="muted small" style={{ marginTop: 12, maxWidth: 340 }}>
              QR codes that keep working after you print them. Every code is drawn by a QR engine written from scratch, from Reed–Solomon error correction to the camera decoder.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><Link to="/#generator">Free generator</Link></li>
              <li><Link to="/#features">Features</Link></li>
              <li><Link to="/signup">Create an account</Link></li>
            </ul>
          </div>
          <div>
            <h4>Use cases</h4>
            <ul>
              <li><Link to="/signup">Event check-in</Link></li>
              <li><Link to="/signup">Restaurant menus</Link></li>
              <li><Link to="/verify">Certificate checks</Link></li>
            </ul>
          </div>
          <div>
            <h4>Trust</h4>
            <ul>
              <li><Link to="/#engine">How it works</Link></li>
              <li><a href="/api/certs/public-key">Signing public key</a></li>
              <li><Link to="/#privacy">Privacy</Link></li>
            </ul>
          </div>
        </div>
        <div className="footer-base">
          <span>© {new Date().getFullYear()} QRaftly</span>
          <span>No IP addresses stored. No tracking cookies.</span>
        </div>
      </div>
    </footer>
  );
}
