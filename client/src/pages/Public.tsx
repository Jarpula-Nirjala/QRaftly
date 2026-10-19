import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { CalendarClock, CheckCircle2, Clock, Download, ExternalLink, Globe, HeartPulse, LockKeyhole, Mail, MapPin, Phone, PowerOff, SearchX, ShieldCheck, Timer, UserPlus } from 'lucide-react';
import { api, ApiError, errorText, fileName, saveBlob } from '../api.ts';
import { Link } from '../router.tsx';
import { QrSvg, svgToPng } from '../studio.tsx';
import { BrandMark, Spinner, fmtDateTime } from '../ui.tsx';
import { toSvg } from '../../../shared/qr/render.ts';
import { encodeText } from '../../../shared/qr/encode.ts';

const key = () => new URLSearchParams(location.search).get('k') ?? '';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="public">
      <div style={{ width: '100%', display: 'grid', justifyItems: 'center', gap: 18 }}>
        {children}
        <Link to="/" className="small muted row" style={{ gap: 6 }}>
          <BrandMark size={18} /> Made with QRaftly
        </Link>
      </div>
    </div>
  );
}

function Problem({ icon: Icon, title, text }: { icon: typeof SearchX; title: string; text: string }) {
  return (
    <Shell>
      <div className="sheet" style={{ padding: 32, textAlign: 'center' }}>
        <Icon size={44} style={{ color: 'var(--muted)' }} />
        <h1 style={{ fontSize: 22, marginTop: 12 }}>{title}</h1>
        <p className="muted" style={{ margin: 0 }}>{text}</p>
      </div>
    </Shell>
  );
}

function usePublic<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    api<T>(url)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e : new ApiError(0, errorText(e))));
  }, [url]);
  return { data, error };
}

// ------------------------------------------------------------ profile

interface ProfileData {
  firstName: string;
  lastName?: string;
  title?: string;
  org?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  bio?: string;
  avatar?: string;
  accent?: string;
  links?: Array<{ label: string; url: string }>;
}

export function ProfilePage({ slug }: { slug: string }) {
  const k = key();
  const { data, error } = usePublic<{ data: ProfileData }>(`/api/public/${encodeURIComponent(slug)}${k ? `?k=${encodeURIComponent(k)}` : ''}`);
  if (error) return <Problem icon={error.status === 403 ? LockKeyhole : SearchX} title={error.status === 403 ? 'Protected page' : 'Page not available'} text={error.message} />;
  if (!data) return <Shell><Spinner /></Shell>;
  const p = data.data;
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
  const accent = p.accent ?? '#B08A3E';
  return (
    <Shell>
      <div className="sheet">
        <div className="band" style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 55%, #D4AF65))` }} />
        <div className="body">
          {p.avatar ? <img className="avatar" src={p.avatar} alt="" /> : <div className="avatar">{p.firstName?.[0]}</div>}
          <h1 style={{ fontSize: 26, margin: '12px 0 2px' }}>{name}</h1>
          {(p.title || p.org) && <div className="muted">{[p.title, p.org].filter(Boolean).join(' · ')}</div>}
          {p.bio && <p style={{ marginTop: 14, color: 'var(--ink-2)' }}>{p.bio}</p>}
          <a className="btn primary lg" style={{ width: '100%', marginTop: 16, background: accent, borderColor: accent }} href={`/api/public/${encodeURIComponent(slug)}/vcard${k ? `?k=${encodeURIComponent(k)}` : ''}`}>
            <UserPlus size={18} /> Save contact
          </a>
          <div className="links">
            {p.phone && (
              <a href={`tel:${p.phone}`}>
                <Phone size={18} /> {p.phone}
              </a>
            )}
            {p.email && (
              <a href={`mailto:${p.email}`}>
                <Mail size={18} /> {p.email}
              </a>
            )}
            {p.website && (
              <a href={/^https?:/.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer">
                <Globe size={18} /> {p.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            {p.address && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}`} target="_blank" rel="noreferrer">
                <MapPin size={18} /> {p.address}
              </a>
            )}
            {(p.links ?? []).map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                <ExternalLink size={18} /> {l.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------ medical

interface Med {
  name: string;
  bloodGroup?: string;
  allergies?: string;
  conditions?: string;
  medicines?: string;
  contactName?: string;
  contactPhone?: string;
}

export function MedicalPage({ slug }: { slug: string }) {
  const k = key();
  const { data, error } = usePublic<{ data: { public: Med; hasPrivate: boolean } }>(`/api/public/${encodeURIComponent(slug)}${k ? `?k=${encodeURIComponent(k)}` : ''}`);
  const [pin, setPin] = useState('');
  const [priv, setPriv] = useState<Record<string, string> | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (error) return <Problem icon={SearchX} title="Card not available" text={error.message} />;
  if (!data) return <Shell><Spinner /></Shell>;
  const m = data.data.public;
  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      setPriv((await api<{ private: Record<string, string> }>(`/api/public/${encodeURIComponent(slug)}/private${k ? `?k=${encodeURIComponent(k)}` : ''}`, { body: { pin } })).private);
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  };
  const rows: Array<[string, string | undefined]> = [
    ['Blood group', m.bloodGroup],
    ['Allergies', m.allergies],
    ['Conditions', m.conditions],
    ['Medicines', m.medicines],
  ];
  return (
    <Shell>
      <div className="sheet">
        <div className="med-head">
          <div className="row" style={{ gap: 8, fontWeight: 700, letterSpacing: '0.06em', fontSize: 13 }}>
            <HeartPulse size={18} /> EMERGENCY MEDICAL INFORMATION
          </div>
          <h1 style={{ fontSize: 26, margin: '8px 0 0' }}>{m.name}</h1>
        </div>
        <div className="body" style={{ paddingTop: 20 }}>
          <dl className="med-grid" style={{ margin: 0 }}>
            {rows
              .filter(([, v]) => v)
              .map(([label, v]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
          {m.contactPhone && (
            <a className="btn primary lg" style={{ width: '100%', marginTop: 16, background: '#b42318', borderColor: '#b42318', color: '#fff' }} href={`tel:${m.contactPhone}`}>
              <Phone size={18} /> Call {m.contactName || 'emergency contact'}
            </a>
          )}
          {data.data.hasPrivate && !priv && (
            <form onSubmit={unlock} className="stack" style={{ marginTop: 20, gap: 10 }}>
              <div className="small muted row" style={{ gap: 6 }}>
                <LockKeyhole size={14} /> Doctors and family can open the full record with the PIN.
              </div>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="PIN" aria-label="PIN" />
                <button className="btn" disabled={busy || pin.length < 4}>
                  {busy ? <Spinner size={16} /> : 'Open'}
                </button>
              </div>
              {err && <div className="small" style={{ color: 'var(--bad)' }}>{err}</div>}
            </form>
          )}
          {priv && (
            <dl className="med-grid" style={{ margin: '16px 0 0' }}>
              {[
                ['Doctor', priv.doctor],
                ['Insurance', priv.insurance],
                ['Address', priv.address],
                ['Notes', priv.notes],
              ]
                .filter(([, v]) => v)
                .map(([label, v]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd style={{ whiteSpace: 'pre-wrap' }}>{v}</dd>
                  </div>
                ))}
            </dl>
          )}
        </div>
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------ gate & blocked

export function GatePage({ slug }: { slug: string }) {
  const { data, error } = usePublic<{ title: string; kind: string; needsPin: boolean; blocked: string | null; scansLeft: number | null; preview: string | null }>(`/api/r/${encodeURIComponent(slug)}`);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (error) return <Problem icon={SearchX} title="Code not found" text={error.message} />;
  if (!data) return <Shell><Spinner /></Shell>;
  if (data.blocked) return <BlockedPage reason={data.blocked} />;
  const go = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await api<{ target: string }>(`/api/r/${encodeURIComponent(slug)}/unlock`, { body: { pin } });
      location.replace(r.target);
    } catch (e2) {
      setErr(errorText(e2));
      setBusy(false);
    }
  };
  return (
    <Shell>
      <form className="sheet stack" style={{ padding: 28, textAlign: 'center' }} onSubmit={go}>
        {data.needsPin ? <LockKeyhole size={40} style={{ margin: '0 auto', color: 'var(--accent)' }} /> : <ShieldCheck size={40} style={{ margin: '0 auto', color: 'var(--accent)' }} />}
        <h1 style={{ fontSize: 22, margin: 0 }}>{data.title}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {data.needsPin ? 'Enter the PIN to open this code.' : data.preview ? 'This code opens:' : data.scansLeft === 1 ? 'This code works once. Open it now?' : `This code can be opened ${data.scansLeft} more times.`}
        </p>
        {data.preview && (
          <div className="mono" style={{ fontSize: 17, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', wordBreak: 'break-all' }}>
            {data.preview}
          </div>
        )}
        {data.needsPin && <input className="input" style={{ textAlign: 'center', fontSize: 22, letterSpacing: '0.3em' }} inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} aria-label="PIN" />}
        {err && <div className="note bad">{err}</div>}
        <button className="btn primary lg" disabled={busy || (data.needsPin && pin.length < 4)}>
          {busy && <Spinner size={16} />} {data.needsPin ? 'Unlock' : 'Open'}
        </button>
      </form>
    </Shell>
  );
}

export function BlockedPage({ reason }: { reason: string }) {
  if (reason === 'expired') return <Problem icon={Timer} title="This code has expired" text="The owner set it to stop working after a date. Ask them for a new one." />;
  if (reason === 'limit') return <Problem icon={CheckCircle2} title="Already used" text="This code could only be opened a limited number of times, and it has been." />;
  if (reason === 'off') return <Problem icon={PowerOff} title="Switched off" text="The owner has turned this code off for now." />;
  return <Problem icon={SearchX} title="Code not found" text="This QR code does not exist, or it was deleted." />;
}

// ------------------------------------------------------------ ticket

export function TicketPage({ token }: { token: string }) {
  const { data, error } = usePublic<{ name: string; event: { title: string; venue: string; startsAt: string }; checkedInAt: number | null; code: string }>(`/api/tickets/${encodeURIComponent(token)}`);
  if (error) return <Problem icon={SearchX} title="Ticket not valid" text={error.message} />;
  if (!data) return <Shell><Spinner /></Shell>;
  const save = async () => saveBlob(await svgToPng(toSvg(encodeText(data.code, { ecl: 'M' }), { margin: 4 }), 900), `${fileName(`ticket-${data.event.title}-${data.name}`)}.png`);
  return (
    <Shell>
      <div className="ticket">
        <div className="top">
          <div className="small" style={{ opacity: 0.85, fontWeight: 600, letterSpacing: '0.05em' }}>ADMIT ONE</div>
          <h1 style={{ fontSize: 24, margin: '6px 0 10px' }}>{data.event.title}</h1>
          <div className="row small" style={{ gap: 14, opacity: 0.95 }}>
            {data.event.startsAt && (
              <span className="row" style={{ gap: 5 }}>
                <CalendarClock size={15} /> {new Date(data.event.startsAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
            {data.event.venue && (
              <span className="row" style={{ gap: 5 }}>
                <MapPin size={15} /> {data.event.venue}
              </span>
            )}
          </div>
        </div>
        <div style={{ padding: '18px 24px 6px' }}>
          <div className="muted small" style={{ fontWeight: 600 }}>Guest</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{data.name}</div>
        </div>
        <div className="perf" />
        <div className="qr-box">
          <QrSvg text={data.code} design={{ margin: 2 }} className="ticket-qr" />
          {data.checkedInAt ? (
            <span className="badge good" style={{ marginTop: 10 }}>
              <CheckCircle2 size={13} /> Checked in {fmtDateTime(data.checkedInAt)}
            </span>
          ) : (
            <span className="muted small row" style={{ gap: 6, marginTop: 10 }}>
              <Clock size={14} /> Show this at the door. Turn your screen brightness up.
            </span>
          )}
          <button className="btn sm" style={{ marginTop: 12 }} onClick={save}>
            <Download size={14} /> Save ticket image
          </button>
        </div>
      </div>
    </Shell>
  );
}
