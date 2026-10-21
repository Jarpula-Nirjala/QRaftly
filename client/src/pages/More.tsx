import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, KeyRound, Plus, RotateCcw, Star, Trash2, XCircle } from 'lucide-react';
import { api, ApiError, errorText } from '../api.ts';
import { Camera } from '../camera.tsx';
import { Link, navigate } from '../router.tsx';
import { QrSvg } from '../studio.tsx';
import { Field, Loading, Spinner, fmtDateTime, useToast } from '../ui.tsx';

// ------------------------------------------------------------ feedback forms

interface Form {
  id: string;
  title: string;
  question: string;
  url: string;
  responses?: number;
  average?: number | null;
}

export function FeedbackList() {
  const toast = useToast();
  const [forms, setForms] = useState<Form[] | null>(null);
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('How was your visit?');
  const load = () => api<{ forms: Form[] }>('/api/forms').then((r) => setForms(r.forms));
  useEffect(() => {
    void load();
  }, []);
  const create = async () => {
    try {
      const r = await api<{ form: Form }>('/api/forms', { body: { title, question } });
      navigate(`/app/feedback/${r.form.id}`);
    } catch (e) {
      toast(errorText(e), true);
    }
  };
  return (
    <div className="page">
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>Feedback forms</h1>
            <p>A code on every table or room; guests rate from one to five stars.</p>
          </div>
        </div>
        <div className="studio" style={{ gridTemplateColumns: 'minmax(0,1fr) 380px' }}>
          <div className="stack">
            {!forms ? (
              <Loading />
            ) : forms.length === 0 ? (
              <div className="card empty">
                <Star size={44} />
                <h3>No forms yet</h3>
                <p>Create one on the right, then print its code.</p>
              </div>
            ) : (
              forms.map((f) => (
                <Link key={f.id} to={`/app/feedback/${f.id}`} className="card" style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                  <div className="spread">
                    <div>
                      <h2 style={{ margin: 0 }}>{f.title}</h2>
                      <div className="muted">{f.question}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="headcount" style={{ fontSize: 34 }}>{f.average ?? '–'}</div>
                      <div className="muted small">{f.responses} ratings</div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
          <div className="card stack">
            <h2 style={{ margin: 0 }}>New form</h2>
            <Field label="Name (only you see this)">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Table feedback" />
            </Field>
            <Field label="Question guests see">
              <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} />
            </Field>
            <button className="btn primary" disabled={!title.trim()} onClick={create}>
              <Plus size={16} /> Create form
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeedbackDetail({ id }: { id: string }) {
  const toast = useToast();
  const [d, setD] = useState<{ form: Form; total: number; average: number | null; distribution: number[]; recent: Array<{ rating: number; comment: string; at: number }> } | null>(null);
  useEffect(() => {
    api<NonNullable<typeof d>>(`/api/forms/${id}`).then(setD);
  }, [id]);
  if (!d) return <Loading />;
  const max = Math.max(1, ...d.distribution);
  return (
    <div className="page">
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>{d.form.title}</h1>
            <p>{d.form.question}</p>
          </div>
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm('Delete this form and all its ratings?')) return;
              await api(`/api/forms/${id}`, { method: 'DELETE' });
              navigate('/app/feedback');
            }}
          >
            <Trash2 size={16} /> Delete
          </button>
        </div>
        <div className="studio" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px' }}>
          <div className="stack">
            <div className="stats">
              <div className="stat">
                <div className="label">Average</div>
                <div className="value">{d.average ?? '–'}</div>
                <div className="sub">out of 5</div>
              </div>
              <div className="stat">
                <div className="label">Ratings</div>
                <div className="value">{d.total}</div>
              </div>
            </div>
            <div className="card">
              <h2>Spread</h2>
              <div className="hbars">
                {[5, 4, 3, 2, 1].map((s) => (
                  <div key={s} className="hbar">
                    <span className="name">{s} ★</span>
                    <div className="track">
                      <div className="fill" style={{ width: `${(d.distribution[s - 1] / max) * 100}%` }} />
                    </div>
                    <span className="n">{d.distribution[s - 1]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <h2>Latest comments</h2>
              {d.recent.filter((r) => r.comment).length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>No comments yet.</p>
              ) : (
                <div className="stack" style={{ gap: 10 }}>
                  {d.recent
                    .filter((r) => r.comment)
                    .map((r, i) => (
                      <div key={i} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
                        <b style={{ color: 'var(--gold-deep)' }}>{'★'.repeat(r.rating)}</b> <span className="muted small">{fmtDateTime(r.at)}</span>
                        <div>{r.comment}</div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <h3>Print this code</h3>
            <QrSvg text={d.form.url} className="mini-qr" design={{ margin: 2, fg: '#14243a' }} />
            <div className="small mono" style={{ margin: '8px 0' }}>{d.form.url}</div>
            <button className="btn sm" onClick={() => navigator.clipboard.writeText(d.form.url).then(() => toast('Link copied.'))}>
              <Copy size={14} /> Copy link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ queues

interface Queue {
  id: string;
  title: string;
  serving: number;
  lastNumber: number;
  waiting: number;
  url: string;
}

export function QueueList() {
  const toast = useToast();
  const [queues, setQueues] = useState<Queue[] | null>(null);
  const [title, setTitle] = useState('');
  useEffect(() => {
    api<{ queues: Queue[] }>('/api/queues').then((r) => setQueues(r.queues));
  }, []);
  const create = async () => {
    try {
      const r = await api<{ queue: Queue }>('/api/queues', { body: { title } });
      navigate(`/app/queues/${r.queue.id}`);
    } catch (e) {
      toast(errorText(e), true);
    }
  };
  return (
    <div className="page">
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>Queue tickets</h1>
            <p>Customers scan to take a number and wait anywhere; you call them from here.</p>
          </div>
        </div>
        <div className="studio" style={{ gridTemplateColumns: 'minmax(0,1fr) 380px' }}>
          <div className="stack">
            {!queues ? (
              <Loading />
            ) : queues.length === 0 ? (
              <div className="card empty">
                <h3>No queues yet</h3>
                <p>Create one for each counter or desk.</p>
              </div>
            ) : (
              queues.map((q) => (
                <Link key={q.id} to={`/app/queues/${q.id}`} className="card" style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                  <div className="spread">
                    <h2 style={{ margin: 0 }}>{q.title}</h2>
                    <span className="muted">
                      Serving <b style={{ color: 'var(--ink)' }}>{q.serving}</b> · {q.waiting} waiting
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
          <div className="card stack">
            <h2 style={{ margin: 0 }}>New queue</h2>
            <Field label="Name">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pharmacy counter" />
            </Field>
            <button className="btn primary" disabled={!title.trim()} onClick={create}>
              <Plus size={16} /> Create queue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function QueueDesk({ id }: { id: string }) {
  const toast = useToast();
  const [d, setD] = useState<{ queue: Queue; entries: Array<{ number: number; name: string; joinedAt: number }> } | null>(null);
  const load = () => api<NonNullable<typeof d>>(`/api/queues/${id}`).then(setD);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [id]);
  if (!d) return <Loading />;
  const next = async () => {
    try {
      await api(`/api/queues/${id}/next`, { body: {} });
      await load();
    } catch (e) {
      toast(errorText(e), true);
    }
  };
  return (
    <div className="page">
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>{d.queue.title}</h1>
            <p>{d.queue.waiting} waiting · {d.queue.lastNumber} numbers handed out</p>
          </div>
          <div className="row">
            <button
              className="btn"
              onClick={async () => {
                if (!confirm('Start again from number 1? Everyone waiting is cleared.')) return;
                await api(`/api/queues/${id}/reset`, { body: {} });
                await load();
              }}
            >
              <RotateCcw size={16} /> Start again
            </button>
            <button
              className="btn danger icon"
              aria-label="Delete queue"
              onClick={async () => {
                if (!confirm('Delete this queue?')) return;
                await api(`/api/queues/${id}`, { method: 'DELETE' });
                navigate('/app/queues');
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        <div className="studio" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px' }}>
          <div className="stack">
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="muted">Now serving</div>
              <div className="big-number" style={{ fontSize: 120 }}>{d.queue.serving || '–'}</div>
              <button className="btn primary lg" disabled={!d.queue.waiting} onClick={next}>
                Call next {d.entries[0] ? `(${d.entries[0].number}${d.entries[0].name ? `, ${d.entries[0].name}` : ''})` : ''}
              </button>
            </div>
            <div className="card">
              <h2>Waiting</h2>
              {d.entries.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>Nobody is waiting.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <tbody>
                      {d.entries.map((e) => (
                        <tr key={e.number}>
                          <td style={{ width: 80 }}>
                            <b>{e.number}</b>
                          </td>
                          <td>{e.name || <span className="muted">No name</span>}</td>
                          <td className="muted small">{fmtDateTime(e.joinedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <h3>Customers scan this</h3>
            <QrSvg text={d.queue.url} className="mini-qr" design={{ margin: 2, fg: '#14243a' }} />
            <div className="small mono" style={{ margin: '8px 0' }}>{d.queue.url}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ API keys

export function KeysPage() {
  const toast = useToast();
  const [keys, setKeys] = useState<Array<{ id: string; label: string; prefix: string; createdAt: number; lastUsedAt: number | null }> | null>(null);
  const [label, setLabel] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const load = () => api<{ keys: NonNullable<typeof keys> }>('/api/keys').then((r) => setKeys(r.keys));
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="page">
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>API keys</h1>
            <p>
              Make codes and dynamic links from your own apps. See the examples in <Link to="/engine#f24">the Engine Room</Link>.
            </p>
          </div>
        </div>
        {fresh && (
          <div className="note good" style={{ marginBottom: 16 }}>
            <KeyRound size={18} />
            <span>
              Your new key (shown only once): <span className="mono">{fresh}</span>{' '}
              <button className="btn sm" onClick={() => navigator.clipboard.writeText(fresh).then(() => toast('Key copied.'))}>
                <Copy size={14} /> Copy
              </button>
            </span>
          </div>
        )}
        <div className="studio" style={{ gridTemplateColumns: 'minmax(0,1fr) 360px' }}>
          <div className="card">
            {!keys ? (
              <Loading />
            ) : keys.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No keys yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Key</th>
                      <th>Last used</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => (
                      <tr key={k.id}>
                        <td>{k.label}</td>
                        <td className="mono">{k.prefix}…</td>
                        <td className="muted">{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : 'Never'}</td>
                        <td>
                          <button
                            className="btn ghost icon sm"
                            aria-label="Delete key"
                            onClick={async () => {
                              if (!confirm('Delete this key? Apps using it stop working.')) return;
                              await api(`/api/keys/${k.id}`, { method: 'DELETE' });
                              await load();
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card stack">
            <h2 style={{ margin: 0 }}>New key</h2>
            <Field label="What it is for">
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Shop website" />
            </Field>
            <button
              className="btn primary"
              onClick={async () => {
                try {
                  const r = await api<{ key: string }>('/api/keys', { body: { label } });
                  setFresh(r.key);
                  setLabel('');
                  await load();
                } catch (e) {
                  toast(errorText(e), true);
                }
              }}
            >
              <Plus size={16} /> Create key
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ self check-in kiosk

export function Kiosk({ id }: { id: string }) {
  const [ev, setEv] = useState<{ title: string; total: number; checkedIn: number } | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; title: string; detail: string } | null>(null);
  const timer = useRef(0);
  useEffect(() => {
    api<{ event: { title: string; total: number; checkedIn: number } }>(`/api/events/${id}`).then((r) => setEv(r.event));
  }, [id]);
  const check = async (code: string) => {
    if (flash) return;
    try {
      const r = await api<{ ticket: { name: string }; total: number; checkedIn: number }>(`/api/events/${id}/checkin`, { body: { code, gate: 'Kiosk' } });
      setEv((e) => (e ? { ...e, total: r.total, checkedIn: r.checkedIn } : e));
      setFlash({ ok: true, title: `Welcome, ${r.ticket.name}!`, detail: 'You are checked in. Enjoy the event.' });
    } catch (e) {
      const b = e instanceof ApiError ? (e.body as { status?: string }) : {};
      setFlash({ ok: false, title: b.status === 'duplicate' ? 'This ticket was already used' : b.status === 'cancelled' ? 'This ticket was cancelled' : 'We could not read that ticket', detail: 'Please see a member of staff.' });
    }
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(null), 4000);
  };
  return (
    <div className="kiosk">
      <div className="wrap" style={{ maxWidth: 900 }}>
        <div className="kiosk-head">
          <div className="script" style={{ fontSize: 34 }}>Welcome</div>
          <h1>{ev?.title ?? 'Self check-in'}</h1>
          <p>Hold your ticket up to the camera</p>
        </div>
        {flash ? (
          <div className={`flash ${flash.ok ? 'ok' : 'bad'}`} style={{ minHeight: 300, justifyContent: 'center', flexDirection: 'column', textAlign: 'center' }}>
            {flash.ok ? <CheckCircle2 size={72} /> : <XCircle size={72} />}
            <h2 style={{ fontSize: 40 }}>{flash.title}</h2>
            <div style={{ fontSize: 22 }}>{flash.detail}</div>
          </div>
        ) : (
          <Camera onResult={check} repeatMs={5000} />
        )}
        <p className="muted" style={{ textAlign: 'center', fontSize: 20 }}>
          {ev ? `${ev.checkedIn} of ${ev.total} guests checked in` : <Spinner />}
        </p>
      </div>
    </div>
  );
}
