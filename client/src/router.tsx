import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';

const listeners = new Set<() => void>();

/** Scrolls to the element with this id, waiting a few frames for a page that is still rendering. */
export function scrollToHash(id: string) {
  let tries = 0;
  const go = () => {
    const el = document.getElementById(decodeURIComponent(id));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (tries++ < 90) requestAnimationFrame(go);
  };
  requestAnimationFrame(go);
}

/** How many pages this tab has opened inside the app, so "Back" never leaves the site. */
let steps = 0;

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) history.replaceState(null, '', to);
  else {
    history.pushState(null, '', to);
    steps++;
  }
  listeners.forEach((l) => l());
  const hash = to.indexOf('#');
  if (hash >= 0) scrollToHash(to.slice(hash + 1));
  else window.scrollTo(0, 0);
}

/** Goes back one page inside the app, or to the home page when this is the first page opened. */
export function goBack() {
  if (steps > 0) {
    steps--;
    history.back();
  } else navigate('/', { replace: true });
}

window.addEventListener('popstate', () => listeners.forEach((l) => l()));

/** The current location; re-renders on navigation. */
export function useLocation() {
  const [loc, setLoc] = useState(() => ({ path: location.pathname, search: location.search }));
  useEffect(() => {
    const on = () => setLoc({ path: location.pathname, search: location.search });
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);
  return loc;
}

/** Matches "/app/qr/:id" against a path; returns the params or null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/');
  const s = path.replace(/\/+$/, '').split('/');
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) {
      if (!s[i]) return null;
      params[p[i].slice(1)] = decodeURIComponent(s[i]);
    } else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || rest.target) return;
    e.preventDefault();
    if (to.startsWith('#')) scrollToHash(to.slice(1));
    else navigate(to);
  };
  return <a href={to} onClick={go} {...rest} />;
}
