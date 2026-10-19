import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, EyeOff, Lock, Star } from 'lucide-react';
import { api, errorText } from '../api.ts';
import { openNote } from '../crypto.ts';
import { Link } from '../router.tsx';
import { BrandMark, Spinner } from '../ui.tsx';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="public">
      <div style={{ width: '100%', display: 'grid', justifyItems: 'center', gap: 18 }}>
        <div className="sheet" style={{ padding: 28 }}>{children}</div>
        <Link to="/" className="small muted row" style={{ gap: 6 }}>
          <BrandMark size={20} /> Made with QRaftly
        </Link>
      </div>
    </div>
  );
}

/** /f/:id — a guest rates their visit. */
export function FeedbackPublic({ id }: { id: string }) {
  const [form, setForm] = useState<{ title: string; question: string } | null>(null);
  const [error, setError] = useState('');
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ title: string; question: string }>(`/api/f/${id}`)
      .then(setForm)
      .catch((e) => setError(errorText(e)));
  }, [id]);
  if (error) return <Shell><p>{error}</p></Shell>;
  if (!form) return <Shell><Spinner /></Shell>;
  if (sent)
    return (
      <Shell>
        <div style={{ textAlign: 'center' }}>
          <CheckCircle2 size={56} color="var(--good)" />
          <h1 style={{ fontSize: 30 }}>Thank you!</h1>
          <p className="muted">Your rating has been sent.</p>
        </div>
      </Shell>
    );
  return (
    <Shell>
      <form
        className="stack"
        style={{ textAlign: 'center' }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(`/api/f/${id}`, { body: { rating: stars, comment } });
            setSent(true);
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="muted">{form.title}</div>
        <h1 style={{ fontSize: 32, margin: 0 }}>{form.question}</h1>
        <div className="row" style={{ justifyContent: 'center' }} role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} type="button" className="btn ghost icon lg" style={{ width: 56, height: 56 }} aria-label={`${s} star${s > 1 ? 's' : ''}`} role="radio" aria-checked={stars === s} onClick={() => setStars(s)}>
              <Star size={36} fill={s <= stars ? 'var(--gold)' : 'none'} color="var(--gold)" />
            </button>
          ))}
        </div>
        <textarea className="input" rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything to add? (optional)" />
        <button className="btn primary lg" disabled={!stars || busy}>
          {busy && <Spinner size={16} />} Send
        </button>
      </form>
    </Shell>
  );
}

/** /q/:id — take a number and watch your place in line. */
export function QueuePublic({ id }: { id: string }) {
  const key = `qrf-queue-${id}`;
  const [info, setInfo] = useState<{ title: string; serving: number; waiting: number } | null>(null);
  const [me, setMe] = useState<{ number: number; serving: number; ahead: number; called: boolean } | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  });
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const load = async () => {
      try {
        if (token) setMe(await api(`/api/q/${id}/me/${token}`));
        else setInfo(await api(`/api/q/${id}`));
      } catch (e) {
        if (token) {
          setToken(null);
          try {
            localStorage.removeItem(key);
          } catch {
            // fine
          }
        } else setError(errorText(e));
      }
    };
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [id, token]);
  useEffect(() => {
    if (me?.called) navigator.vibrate?.([200, 100, 200]);
  }, [me?.called]);
  if (error) return <Shell><p>{error}</p></Shell>;
  if (token && me)
    return (
      <Shell>
        <div style={{ textAlign: 'center' }}>
          <div className="muted">Your number</div>
          <div className="big-number" style={{ fontSize: 110 }}>{me.number}</div>
          {me.called ? <div className="verdict-chip ok" style={{ fontSize: 20 }}>It’s your turn. Please come to the counter.</div> : <div className="verdict-chip warn" style={{ fontSize: 20 }}>{me.ahead === 0 ? 'You are next' : `${me.ahead} ahead of you`}</div>}
          <p className="muted small" style={{ marginTop: 14 }}>Now serving {me.serving || '–'}. This page updates by itself; keep it open.</p>
        </div>
      </Shell>
    );
  if (!info) return <Shell><Spinner /></Shell>;
  return (
    <Shell>
      <form
        className="stack"
        style={{ textAlign: 'center' }}
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await api<{ token: string }>(`/api/q/${id}/join`, { body: { name } });
            try {
              localStorage.setItem(key, r.token);
            } catch {
              // the ticket lasts for this page only
            }
            setToken(r.token);
          } catch (err) {
            setError(errorText(err));
          }
        }}
      >
        <h1 style={{ fontSize: 32, margin: 0 }}>{info.title}</h1>
        <p className="muted" style={{ margin: 0 }}>
          Now serving {info.serving || '–'} · {info.waiting} waiting
        </p>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name (optional)" maxLength={60} />
        <button className="btn primary lg">Take a number</button>
      </form>
    </Shell>
  );
}

/** /n/:id#key — a view-once note, decrypted here with the key from the link. */
export function NotePublic({ id }: { id: string }) {
  const key = location.hash.slice(1);
  const [state, setState] = useState<'checking' | 'ready' | 'gone' | 'open'>('checking');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/api/notes/${id}`)
      .then(() => setState('ready'))
      .catch(() => setState('gone'));
  }, [id]);
  const reveal = async () => {
    try {
      const r = await api<{ ciphertext: string; iv: string }>(`/api/notes/${id}/open`, { body: {} });
      setText(await openNote(r.ciphertext, r.iv, key));
      setState('open');
      history.replaceState(null, '', location.pathname); // drop the key from the address bar
    } catch (e) {
      setError(key ? errorText(e) : 'This link is missing its key (the part after “#”).');
      setState('gone');
    }
  };
  return (
    <Shell>
      <div style={{ textAlign: 'center' }} className="stack">
        {state === 'checking' && <Spinner />}
        {state === 'ready' && (
          <>
            <Lock size={46} color="var(--gold)" style={{ margin: '0 auto' }} />
            <h1 style={{ fontSize: 30, margin: 0 }}>Someone sent you a secret note</h1>
            <p className="muted" style={{ margin: 0 }}>It can be read once. After you open it, it is deleted for good.</p>
            <button className="btn primary lg" onClick={reveal}>
              Reveal the note
            </button>
          </>
        )}
        {state === 'open' && (
          <>
            <EyeOff size={40} color="var(--gold)" style={{ margin: '0 auto' }} />
            <div className="code-block" style={{ whiteSpace: 'pre-wrap', textAlign: 'left', fontSize: 18 }}>{text}</div>
            <p className="muted small" style={{ margin: 0 }}>This note has now been deleted from the server. Copy it somewhere safe if you need it.</p>
          </>
        )}
        {state === 'gone' && (
          <>
            <EyeOff size={46} color="var(--muted)" style={{ margin: '0 auto' }} />
            <h1 style={{ fontSize: 28, margin: 0 }}>This note is gone</h1>
            <p className="muted" style={{ margin: 0 }}>{error || 'It has already been read, or it expired.'}</p>
          </>
        )}
      </div>
    </Shell>
  );
}
