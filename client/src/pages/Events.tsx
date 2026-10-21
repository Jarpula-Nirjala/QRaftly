import { useEffect, useMemo, useRef, useState } from 'react';
import { IdCard, MonitorSmartphone } from 'lucide-react';
import { ArrowLeft, CalendarCheck, CheckCircle2, Copy, FileDown, FileUp, Keyboard, MapPin, Plus, RotateCcw, ScanLine, Search, Trash2, UserCheck, Users, XCircle } from 'lucide-react';
import { api, ApiError, errorText } from '../api.ts';
import { Camera } from '../camera.tsx';
import { Link, navigate } from '../router.tsx';
import { QrSvg } from '../studio.tsx';
import { Field, Loading, Spinner, fmtTime, useToast } from '../ui.tsx';

interface EventInfo {
  id: string;
  title: string;
  venue: string;
  startsAt: string;
  createdAt: number;
  total: number;
  checkedIn: number;
}
interface Ticket {
  id: string;
  name: string;
  email: string;
  createdAt: number;
  checkedInAt: number | null;
  checkedInBy: string | null;
  url: string;
}

const when = (s: string) => (s ? new Date(s).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Date not set');

export function EventsPage() {
  const toast = useToast();
  const [events, setEvents] = useState<EventInfo[] | null>(null);
  const [form, setForm] = useState({ title: '', venue: '', startsAt: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ events: EventInfo[] }>('/api/events').then((r) => setEvents(r.events));
  }, []);
  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ event: EventInfo }>('/api/events', { body: form });
      navigate(`/app/events/${r.event.id}`);
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>Events</h1>
            <p>Signed tickets for every guest, a door scanner on any phone, and a live headcount.</p>
          </div>
        </div>
        <div className="studio" style={{ gridTemplateColumns: 'minmax(0,1fr) 360px' }}>
          <div>
            {!events ? (
              <Loading />
            ) : events.length === 0 ? (
              <div className="card empty">
                <CalendarCheck size={46} />
                <h3>No events yet</h3>
                <p>Create one, add guests by name or from a spreadsheet, and send each guest their ticket link.</p>
              </div>
            ) : (
              <div className="stack">
                {events.map((e) => (
                  <Link key={e.id} to={`/app/events/${e.id}`} className="card" style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                    <div className="spread">
                      <div>
                        <h2 style={{ marginBottom: 4 }}>{e.title}</h2>
                        <div className="muted small row" style={{ gap: 12 }}>
                          <span>{when(e.startsAt)}</span>
                          {e.venue && (
                            <span className="row" style={{ gap: 4 }}>
                              <MapPin size={13} /> {e.venue}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="headcount" style={{ fontSize: 28 }}>
                          {e.checkedIn}
                          <span className="muted" style={{ fontSize: 16, fontWeight: 600 }}> / {e.total}</span>
                        </div>
                        <div className="muted small">checked in</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="card stack">
            <h2 style={{ margin: 0 }}>New event</h2>
            <Field label="Name">
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Tech Meetup, November" />
            </Field>
            <Field label="Venue">
              <input className="input" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Hall 2, Innovation Centre" />
            </Field>
            <Field label="Starts">
              <input className="input" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </Field>
            <button className="btn primary" onClick={create} disabled={busy || !form.title.trim()}>
              {busy ? <Spinner size={16} /> : <Plus size={16} />} Create event
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EventDetail({ id }: { id: string }) {
  const toast = useToast();
  const [ev, setEv] = useState<EventInfo | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [names, setNames] = useState('');
  const [q, setQ] = useState('');
  const [show, setShow] = useState<Ticket | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () =>
    api<{ event: EventInfo; tickets: Ticket[] }>(`/api/events/${id}`).then((r) => {
      setEv(r.event);
      setTickets(r.tickets);
    });
  useEffect(() => {
    void load();
  }, [id]);

  const add = async (body: unknown) => {
    setBusy(true);
    try {
      const r = await api<{ tickets: Ticket[] }>(`/api/events/${id}/tickets`, { body });
      toast(`${r.tickets.length} ticket${r.tickets.length === 1 ? '' : 's'} created.`);
      setNames('');
      await load();
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setBusy(false);
    }
  };
  const addNames = () =>
    add({
      attendees: names
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const m = /^(.*?)[,\t ]+([^\s,]+@[^\s,]+)$/.exec(l);
          return m ? { name: m[1].trim(), email: m[2] } : { name: l, email: '' };
        }),
    });
  const manual = async (t: Ticket, undo: boolean) => {
    try {
      await api(undo ? `/api/events/${id}/tickets/${t.id}/undo` : `/api/events/${id}/checkin`, { body: undo ? {} : { ticketId: t.id } });
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409)) toast(errorText(e), true);
    }
    await load();
  };
  const remove = async (t: Ticket) => {
    if (!confirm(`Cancel ${t.name}'s ticket? The code will stop working.`)) return;
    await api(`/api/events/${id}/tickets/${t.id}`, { method: 'DELETE' });
    await load();
  };
  const del = async () => {
    if (!ev || !confirm(`Delete “${ev.title}” and all its tickets?`)) return;
    await api(`/api/events/${id}`, { method: 'DELETE' });
    navigate('/app/events');
  };
  const shown = useMemo(() => tickets.filter((t) => !q || `${t.name} ${t.email}`.toLowerCase().includes(q.toLowerCase())), [tickets, q]);

  if (!ev) return <Loading />;
  return (
    <div className="page">
      <div className="wrap">
        <Link to="/app/events" className="small row" style={{ gap: 4, marginBottom: 12 }}>
          <ArrowLeft size={15} /> All events
        </Link>
        <div className="page-head">
          <div>
            <h1>{ev.title}</h1>
            <p>
              {when(ev.startsAt)}
              {ev.venue ? ` · ${ev.venue}` : ''}
            </p>
          </div>
          <div className="row">
            <Link to={`/app/events/${id}/scan`} className="btn primary">
              <ScanLine size={17} /> Open door scanner
            </Link>
            <a className="btn" href={`/api/events/${id}/tickets.csv`}>
              <FileDown size={16} /> Ticket links (CSV)
            </a>
            <a className="btn" href={`/api/events/${id}/badges.pdf`}>
              <IdCard size={16} /> Name badges (PDF)
            </a>
            <Link to={`/app/events/${id}/kiosk`} className="btn">
              <MonitorSmartphone size={16} /> Self check-in kiosk
            </Link>
            <button className="btn danger icon" aria-label="Delete event" title="Delete event" onClick={del}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        <div className="stats">
          <div className="stat">
            <div className="label">Checked in</div>
            <div className="value">{ev.checkedIn}</div>
            <div className="sub">of {ev.total} guests</div>
          </div>
          <div className="stat">
            <div className="label">Still to arrive</div>
            <div className="value">{ev.total - ev.checkedIn}</div>
            <div className="sub">{ev.total ? Math.round((ev.checkedIn / ev.total) * 100) : 0}% arrived</div>
          </div>
        </div>
        <div className="studio" style={{ gridTemplateColumns: 'minmax(0,1fr) 360px' }}>
          <div className="card">
            <div className="spread" style={{ marginBottom: 14 }}>
              <h2 style={{ margin: 0 }}>Guests</h2>
              <div style={{ position: 'relative', width: 'min(240px, 100%)' }}>
                <Search size={15} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--muted)' }} />
                <input className="input" style={{ paddingLeft: 32 }} placeholder="Find a guest" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a guest" />
              </div>
            </div>
            {tickets.length === 0 ? (
              <div className="empty" style={{ padding: 30 }}>
                <Users size={40} />
                <p>Add guests on the right. Each gets a signed ticket link to show at the door.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Guest</th>
                      <th>Status</th>
                      <th style={{ width: 1 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{t.name}</div>
                          {t.email && <div className="muted small">{t.email}</div>}
                        </td>
                        <td>
                          {t.checkedInAt ? (
                            <span className="badge good" title={t.checkedInBy ? `at ${t.checkedInBy}` : undefined}>
                              <CheckCircle2 size={12} /> {fmtTime(t.checkedInAt)}
                            </span>
                          ) : (
                            <span className="badge">Not yet</span>
                          )}
                        </td>
                        <td>
                          <div className="row" style={{ flexWrap: 'nowrap', gap: 2 }}>
                            <button className="btn ghost icon sm" title="Show ticket" aria-label={`Show ${t.name}'s ticket`} onClick={() => setShow(t)}>
                              <ScanLine size={15} />
                            </button>
                            <button className="btn ghost icon sm" title="Copy ticket link" aria-label="Copy ticket link" onClick={() => navigator.clipboard.writeText(t.url).then(() => toast('Ticket link copied.'))}>
                              <Copy size={15} />
                            </button>
                            {t.checkedInAt ? (
                              <button className="btn ghost icon sm" title="Undo check-in" aria-label="Undo check-in" onClick={() => manual(t, true)}>
                                <RotateCcw size={15} />
                              </button>
                            ) : (
                              <button className="btn ghost icon sm" title="Check in by hand" aria-label="Check in by hand" onClick={() => manual(t, false)}>
                                <UserCheck size={15} />
                              </button>
                            )}
                            <button className="btn ghost icon sm" title="Cancel ticket" aria-label="Cancel ticket" onClick={() => remove(t)}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="stack">
            {show && (
              <div className="card" style={{ textAlign: 'center' }}>
                <div className="spread">
                  <strong>{show.name}</strong>
                  <button className="btn ghost icon sm" aria-label="Close" onClick={() => setShow(null)}>
                    <XCircle size={16} />
                  </button>
                </div>
                <QrSvg text={show.url} className="thumb" design={{ margin: 2 }} />
                <a href={show.url} target="_blank" rel="noreferrer" className="small">
                  Open ticket page
                </a>
              </div>
            )}
            <div className="card stack">
              <h2 style={{ margin: 0 }}>Add guests</h2>
              <Field label="One per line" hint="Name, or name followed by email.">
                <textarea className="input" rows={5} value={names} onChange={(e) => setNames(e.target.value)} placeholder={'Asha Rao, asha@example.com\nRavi Kumar'} />
              </Field>
              <button className="btn primary" disabled={busy || !names.trim()} onClick={addNames}>
                {busy ? <Spinner size={16} /> : <Plus size={16} />} Create tickets
              </button>
              <hr className="divider" style={{ margin: '4px 0' }} />
              <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
                <FileUp size={16} /> Import a CSV
              </button>
              <p className="muted small" style={{ margin: 0 }}>Columns: <span className="mono">name</span> and optionally <span className="mono">email</span>. Up to 5,000 guests.</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) await add({ csv: await f.text() });
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type Flash = { kind: 'ok' | 'dup' | 'bad'; title: string; detail: string };

export function DoorScanner({ id }: { id: string }) {
  const [ev, setEv] = useState<EventInfo | null>(null);
  const [count, setCount] = useState<{ total: number; checkedIn: number } | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [gate, setGate] = useState(() => {
    try {
      return localStorage.getItem('qrf-gate') ?? '';
    } catch {
      return '';
    }
  });
  const [log, setLog] = useState<Array<Flash & { at: number }>>([]);
  const [code, setCode] = useState('');
  const flashTimer = useRef(0);

  useEffect(() => {
    api<{ event: EventInfo }>(`/api/events/${id}`).then((r) => setEv(r.event));
    // Live headcount: every door's check-ins arrive here as server-sent events.
    const es = new EventSource(`/api/events/${id}/live`);
    es.onmessage = (e) => setCount(JSON.parse(e.data));
    return () => es.close();
  }, [id]);

  const show = (f: Flash) => {
    setFlash(f);
    setLog((l) => [{ ...f, at: Date.now() }, ...l].slice(0, 12));
    clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 3500);
  };

  const check = async (text: string) => {
    try {
      const r = await api<{ ticket: Ticket; total: number; checkedIn: number }>(`/api/events/${id}/checkin`, { body: { code: text, gate } });
      setCount({ total: r.total, checkedIn: r.checkedIn });
      show({ kind: 'ok', title: `Welcome, ${r.ticket.name}`, detail: 'Ticket accepted.' });
    } catch (e) {
      const b = e instanceof ApiError ? (e.body as { status?: string; ticket?: Ticket }) : {};
      if (b.status === 'duplicate' && b.ticket) show({ kind: 'dup', title: 'Already used', detail: `${b.ticket.name} checked in at ${fmtTime(b.ticket.checkedInAt!)}${b.ticket.checkedInBy ? ` (${b.ticket.checkedInBy})` : ''}.` });
      else if (b.status === 'wrong-event') show({ kind: 'bad', title: 'Wrong event', detail: 'This ticket is for a different event.' });
      else if (b.status === 'cancelled') show({ kind: 'bad', title: 'Ticket cancelled', detail: 'This ticket was cancelled by the organiser.' });
      else show({ kind: 'bad', title: 'Not a valid ticket', detail: errorText(e) });
    }
  };

  return (
    <div className="page">
      <div className="wrap" style={{ maxWidth: 1000 }}>
        <Link to={`/app/events/${id}`} className="small row" style={{ gap: 4, marginBottom: 12 }}>
          <ArrowLeft size={15} /> {ev?.title ?? 'Event'}
        </Link>
        <div className="studio" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
          <div className="stack">
            <Camera onResult={check} />
            {flash && (
              <div className={`flash ${flash.kind}`} role="alert">
                {flash.kind === 'ok' ? <CheckCircle2 size={34} /> : <XCircle size={34} />}
                <div>
                  <h2>{flash.title}</h2>
                  <div>{flash.detail}</div>
                </div>
              </div>
            )}
            <form
              className="row"
              style={{ flexWrap: 'nowrap' }}
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) void check(code.trim());
                setCode('');
              }}
            >
              <Keyboard size={18} className="muted" />
              <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Or paste a ticket link" aria-label="Ticket link" />
              <button className="btn">Check</button>
            </form>
          </div>
          <div className="stack">
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="muted small" style={{ fontWeight: 600 }}>Inside now</div>
              <div className="headcount">{count?.checkedIn ?? '–'}</div>
              <div className="muted small">of {count?.total ?? '–'} guests · live from every door</div>
              {count && count.total > 0 && (
                <div className="progress" style={{ marginTop: 12 }}>
                  <span style={{ width: `${(count.checkedIn / count.total) * 100}%` }} />
                </div>
              )}
            </div>
            <div className="card">
              <Field label="This door" hint="Shown when a ticket is reused, so staff know where it was first scanned.">
                <input
                  className="input"
                  value={gate}
                  placeholder="Main entrance"
                  onChange={(e) => {
                    setGate(e.target.value);
                    try {
                      localStorage.setItem('qrf-gate', e.target.value);
                    } catch {
                      // not saved; fine for this visit
                    }
                  }}
                />
              </Field>
            </div>
            {log.length > 0 && (
              <div className="card">
                <h3>This scanner</h3>
                <div className="stack" style={{ gap: 8 }}>
                  {log.map((l) => (
                    <div key={l.at} className="row small" style={{ flexWrap: 'nowrap' }}>
                      <span className={`badge ${l.kind === 'ok' ? 'good' : l.kind === 'dup' ? 'warn' : 'bad'}`}>{fmtTime(l.at)}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

