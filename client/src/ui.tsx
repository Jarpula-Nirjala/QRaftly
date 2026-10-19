import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, CalendarCheck, Files, LayoutGrid, Loader2, LogOut, Menu, Moon, ScrollText, Sun, X } from 'lucide-react';
import { useAuth } from './auth.tsx';
import { Link, navigate, useLocation } from './router.tsx';

// ------------------------------------------------------------ brand

/**
 * The QRForge mark: a finder-pattern square with a doorway in its right wall, and one module stepping
 * through it from the physical code into the digital world. Flat, two colours, legible at 16 px.
 */
export const BRAND_SVG = (ink = '#0b1530', accent = '#2563eb') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M21 13V8H5v16h16v-5" fill="none" stroke="${ink}" stroke-width="4"/><rect x="9" y="13" width="6" height="6" fill="${ink}"/><rect x="24" y="13" width="6" height="6" fill="${accent}"/></svg>`;

export function BrandMark({ size = 30, mono = false }: { size?: number; mono?: boolean }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M21 13V8H5v16h16v-5" fill="none" stroke="var(--navy)" strokeWidth="4" />
      <rect x="9" y="13" width="6" height="6" fill="var(--navy)" />
      <rect x="24" y="13" width="6" height="6" fill={mono ? 'var(--navy)' : 'var(--accent)'} className="brand-step" />
    </svg>
  );
}

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="QRForge home">
      <BrandMark />
      <span>
        QR<b>Forge</b>
      </span>
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
          <span>© {new Date().getFullYear()} QRForge</span>
          <span>No IP addresses stored. No tracking cookies.</span>
        </div>
      </div>
    </footer>
  );
}
