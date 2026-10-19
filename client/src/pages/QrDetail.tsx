import { useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, Copy, ExternalLink, FileDown, FlaskConical, Pencil, Power, Trash2 } from 'lucide-react';
import { AnomalyList, CalendarHeatmap, findAnomalies, type DayCount } from '../insights.tsx';
import { api, errorText } from '../api.ts';
import { BarList, ColumnChart } from '../charts.tsx';
import { Link, navigate } from '../router.tsx';
import { KIND_LABEL, type Qr, type Stats } from '../types.ts';
import { Loading, Segmented, fmtDateTime, useToast } from '../ui.tsx';
import { Editor } from './Editor.tsx';

const OUTCOME: Record<string, string> = { ok: 'Opened', bot: 'Link preview', denied: 'Wrong PIN', 'blocked-expired': 'Expired', 'blocked-limit': 'Limit reached', 'blocked-off': 'Switched off' };

export function QrDetail({ id }: { id: string }) {
  const toast = useToast();
  const [qr, setQr] = useState<Qr | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'stats' | 'simulate' | 'edit'>(() => (location.hash === '#edit' ? 'edit' : 'stats'));
  useEffect(() => {
    api<{ qr: Qr }>(`/api/qrs/${id}`)
      .then((r) => {
        setQr(r.qr);
        if (r.qr.kind === 'static') setTab('edit');
      })
      .catch((e) => setError(errorText(e)));
  }, [id]);

  if (error) return <div className="page wrap"><div className="note bad">{error}</div></div>;
  if (!qr) return <Loading />;

  const toggle = async () => {
    try {
      const r = await api<{ qr: Qr }>(`/api/qrs/${qr.id}`, { method: 'PATCH', body: { active: !qr.active } });
      setQr(r.qr);
      toast(r.qr.active ? 'The code is on again.' : 'Switched off. Scans now show a “not available” page.');
    } catch (e) {
      toast(errorText(e), true);
    }
  };
  const remove = async () => {
    if (!confirm(`Delete “${qr.title}”? Printed copies will stop working.`)) return;
    await api(`/api/qrs/${qr.id}`, { method: 'DELETE' });
    toast('Deleted.');
    navigate('/app');
  };

  return (
    <div className="page">
      <div className="wrap">
        <Link to="/app" className="small row" style={{ gap: 4, marginBottom: 12 }}>
          <ArrowLeft size={15} /> All codes
        </Link>
        <div className="page-head">
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <h1>{qr.title}</h1>
              <span className="badge accent">{KIND_LABEL[qr.kind]}</span>
              {!qr.active && <span className="badge bad">Off</span>}
            </div>
            {qr.shortUrl && (
              <p className="row" style={{ gap: 6 }}>
                <span className="mono">{qr.shortUrl}</span>
                <button className="btn ghost icon sm" aria-label="Copy link" onClick={() => navigator.clipboard.writeText(qr.shortUrl!).then(() => toast('Link copied.'))}>
                  <Copy size={14} />
                </button>
                <a className="btn ghost icon sm" href={qr.shortUrl} target="_blank" rel="noreferrer" aria-label="Open link">
                  <ExternalLink size={14} />
                </a>
              </p>
            )}
          </div>
          <div className="row">
            {qr.kind !== 'static' && (
              <button className="btn" onClick={toggle}>
                <Power size={16} /> {qr.active ? 'Switch off' : 'Switch on'}
              </button>
            )}
            <button className="btn danger" onClick={remove}>
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </div>
        {qr.kind !== 'static' && (
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'stats'} onClick={() => setTab('stats')}>
              <BarChart3 size={15} /> Analytics
            </button>
            {qr.kind === 'dynamic' && (
              <button role="tab" aria-selected={tab === 'simulate'} onClick={() => setTab('simulate')}>
                <FlaskConical size={15} /> Simulate
              </button>
            )}
            <button role="tab" aria-selected={tab === 'edit'} onClick={() => setTab('edit')}>
              <Pencil size={15} /> Edit &amp; design
            </button>
          </div>
        )}
        {tab === 'stats' ? <Analytics qr={qr} /> : tab === 'simulate' ? <Simulate qr={qr} /> : <Editor existing={qr} onSaved={setQr} />}
      </div>
    </div>
  );
}

function Analytics({ qr }: { qr: Qr }) {
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    setS(null);
    api<Stats>(`/api/qrs/${qr.id}/stats?days=${days}`).then(setS);
  }, [qr.id, days]);
  const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return (
    <div>
      <div className="spread" style={{ marginBottom: 16 }}>
        <Segmented label="Period" value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
        <a className="btn sm" href={`/api/qrs/${qr.id}/scans.csv`}>
          <FileDown size={15} /> Export CSV
        </a>
      </div>
      {!s ? (
        <Loading label="Counting scans…" />
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <div className="label">Scans</div>
              <div className="value">{s.total.toLocaleString()}</div>
              <div className="sub">last {days} days</div>
            </div>
            <div className="stat">
              <div className="label">Unique visitors</div>
              <div className="value">{s.unique.toLocaleString()}</div>
              <div className="sub">counted per day</div>
            </div>
            <div className="stat">
              <div className="label">Blocked</div>
              <div className="value">{s.blocked.toLocaleString()}</div>
              <div className="sub">expired, limit or wrong PIN</div>
            </div>
            <div className="stat">
              <div className="label">Link previews</div>
              <div className="value">{s.bots.toLocaleString()}</div>
              <div className="sub">chat apps, not counted</div>
            </div>
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <h2>Scans per day</h2>
              <span className="muted small">{qr.timezone}</span>
            </div>
            <ColumnChart caption={`Scans per day over the last ${days} days`} data={s.byDay.map((d) => ({ label: fmtDay(d.day), title: fmtDay(d.day), n: d.n }))} />
          </div>
          <div className="charts">
            <div className="card">
              <div className="card-head">
                <h2>Time of day</h2>
              </div>
              <ColumnChart caption="Scans by hour of day" height={180} labelAll data={s.byHour.map((n, h) => ({ label: h % 6 === 0 ? `${h}:00` : '', title: `${h}:00–${h}:59`, n }))} />
            </div>
            <div className="card">
              <div className="card-head">
                <h2>Phones and computers</h2>
              </div>
              <BarList items={s.os} />
            </div>
            <div className="card">
              <div className="card-head">
                <h2>Countries</h2>
              </div>
              <BarList items={s.country} />
            </div>
            <div className="card">
              <div className="card-head">
                <h2>Browsers</h2>
              </div>
              <BarList items={s.browser} />
            </div>
            <div className="card">
              <div className="card-head">
                <h2>Languages</h2>
              </div>
              <BarList items={s.lang} />
            </div>
            {qr.kind === 'dynamic' && (
              <div className="card">
                <div className="card-head">
                  <h2>Destinations</h2>
                  <span className="muted small">which rule won</span>
                </div>
                <BarList items={s.targets.map((t) => ({ ...t, name: t.name.replace(/^https?:\/\/(www\.)?/, '') }))} />
              </div>
            )}
          </div>
          <YearView qr={qr} />
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <h2>Latest scans</h2>
            </div>
            {s.recent.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>No scans yet. Point a phone camera at the code to try it.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Result</th>
                      <th>Device</th>
                      <th>Browser</th>
                      <th>Country</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.recent.map((r, i) => (
                      <tr key={i}>
                        <td>{fmtDateTime(r.at)}</td>
                        <td>
                          <span className={`badge${r.outcome === 'ok' ? ' good' : r.outcome === 'bot' ? '' : ' warn'}`}>{OUTCOME[r.outcome] ?? r.outcome}</span>
                        </td>
                        <td>
                          {r.os} · {r.device}
                        </td>
                        <td>{r.browser}</td>
                        <td>{r.country || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** A year of scans as a calendar, and the days that stood out. */
function YearView({ qr }: { qr: Qr }) {
  const [days, setDays] = useState<DayCount[] | null>(null);
  useEffect(() => {
    api<Stats>(`/api/qrs/${qr.id}/stats?days=365`).then((s) => setDays(s.byDay));
  }, [qr.id]);
  if (!days) return null;
  return (
    <div className="charts" style={{ marginTop: 16 }}>
      <div className="card">
        <div className="card-head">
          <h2>The last year</h2>
        </div>
        <CalendarHeatmap days={days} caption="Scans per day over the last year" />
      </div>
      <div className="card">
        <div className="card-head">
          <h2>Unusual activity</h2>
        </div>
        <AnomalyList items={findAnomalies(days)} />
      </div>
    </div>
  );
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Runs this code's real routing for a made-up visitor; nothing is counted. */
function Simulate({ qr }: { qr: Qr }) {
  const [os, setOs] = useState('android');
  const [lang, setLang] = useState('en');
  const [country, setCountry] = useState('IN');
  const [when, setWhen] = useState(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [r, setR] = useState<{ target: string; label: string; localDay: number; localMinutes: number } | null>(null);
  useEffect(() => {
    api<NonNullable<typeof r>>(`/api/qrs/${qr.id}/simulate`, { body: { os, lang, country, at: new Date(when).getTime(), visitor: `${os}|${lang}|${country}` } }).then(setR).catch(() => setR(null));
  }, [qr.id, os, lang, country, when]);
  return (
    <div className="studio" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
      <div className="card stack">
        <h2 style={{ margin: 0 }}>A scan…</h2>
        <label className="field">
          At this moment (your time)
          <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <label className="field">
          From this phone
          <select className="input" value={os} onChange={(e) => setOs(e.target.value)}>
            <option value="android">Android</option>
            <option value="ios">iPhone</option>
            <option value="windows">Windows</option>
            <option value="mac">Mac</option>
            <option value="linux">Linux</option>
          </select>
        </label>
        <label className="field">
          Language (two letters)
          <input className="input" value={lang} maxLength={3} onChange={(e) => setLang(e.target.value.toLowerCase())} />
        </label>
        <label className="field">
          Country (two letters)
          <input className="input" value={country} maxLength={2} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
        </label>
      </div>
      <div className="card stack">
        <h2 style={{ margin: 0 }}>…would open</h2>
        {r ? (
          <>
            <div className="note good">
              <span>
                <b>{r.label}</b>
              </span>
            </div>
            <a className="mono" href={r.target} target="_blank" rel="noreferrer">
              {r.target}
            </a>
            <p className="small muted" style={{ margin: 0 }}>
              In the code’s timezone ({qr.timezone}) that is {WEEKDAYS[r.localDay]}, {String(Math.floor(r.localMinutes / 60)).padStart(2, '0')}:{String(r.localMinutes % 60).padStart(2, '0')}. Simulations are never counted as scans.
            </p>
          </>
        ) : (
          <Loading />
        )}
      </div>
    </div>
  );
}
