import { useEffect, useMemo, useState } from 'react';
import { LockKeyhole, Plus, QrCode, Search, Timer } from 'lucide-react';
import { api, errorText } from '../api.ts';
import { Link } from '../router.tsx';
import { QrSvg } from '../studio.tsx';
import { KIND_LABEL, type Kind, type Qr } from '../types.ts';
import { Loading, Segmented, fmtDate } from '../ui.tsx';

export function Dashboard() {
  const [qrs, setQrs] = useState<Qr[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | Kind>('all');
  useEffect(() => {
    api<{ qrs: Qr[] }>('/api/qrs')
      .then((r) => setQrs(r.qrs))
      .catch((e) => setError(errorText(e)));
  }, []);
  const shown = useMemo(() => (qrs ?? []).filter((x) => (kind === 'all' || x.kind === kind) && (!q || `${x.title} ${x.content}`.toLowerCase().includes(q.toLowerCase()))), [qrs, q, kind]);
  const totalScans = (qrs ?? []).reduce((s, x) => s + x.scanCount, 0);

  return (
    <div className="page">
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>Your codes</h1>
            <p>{qrs ? `${qrs.length} code${qrs.length === 1 ? '' : 's'} · ${totalScans.toLocaleString()} scans counted` : ' '}</p>
          </div>
          <Link to="/app/new" className="btn primary">
            <Plus size={17} /> New code
          </Link>
        </div>
        {error && <div className="note bad">{error}</div>}
        {!qrs && !error && <Loading />}
        {qrs && qrs.length === 0 && (
          <div className="card empty">
            <QrCode size={48} />
            <h3>No codes yet</h3>
            <p>Make a dynamic link you can edit after printing, a Wi-Fi code, a profile card or an emergency card.</p>
            <Link to="/app/new" className="btn primary">
              <Plus size={17} /> Create your first code
            </Link>
          </div>
        )}
        {qrs && qrs.length > 0 && (
          <>
            <div className="spread" style={{ marginBottom: 16 }}>
              <Segmented label="Filter by kind" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, ...(['dynamic', 'static', 'profile', 'medical'] as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))]} />
              <div style={{ position: 'relative', width: 'min(280px, 100%)' }}>
                <Search size={16} style={{ position: 'absolute', left: 11, top: 12, color: 'var(--muted)' }} />
                <input className="input" style={{ paddingLeft: 34 }} placeholder="Search codes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search codes" />
              </div>
            </div>
            <div className="qr-list">
              {shown.map((x) => (
                <Link key={x.id} to={`/app/qr/${x.id}`} className="qr-item">
                  <QrSvg className="thumb" text={x.content} design={{ ...x.design, logo: null, margin: 1 }} />
                  <div style={{ minWidth: 0 }}>
                    <h3>{x.title}</h3>
                    <div className="meta">{x.kind === 'dynamic' ? String(x.data.url) : x.kind === 'static' ? x.content : x.shortUrl}</div>
                    <div className="row" style={{ gap: 6, marginTop: 8 }}>
                      <span className={`badge${x.kind === 'static' ? '' : ' accent'}`}>{KIND_LABEL[x.kind]}</span>
                      {x.kind !== 'static' && <span className="badge">{x.scanCount.toLocaleString()} scans</span>}
                      {!x.active && <span className="badge bad">Off</span>}
                      {x.security.hasPin && (
                        <span className="badge" title="PIN protected">
                          <LockKeyhole size={12} />
                        </span>
                      )}
                      {(x.security.expiresAt || x.security.maxScans) && (
                        <span className="badge" title="Expires or limited">
                          <Timer size={12} />
                        </span>
                      )}
                    </div>
                    <div className="meta" style={{ marginTop: 6 }}>Updated {fmtDate(x.updatedAt)}</div>
                  </div>
                </Link>
              ))}
            </div>
            {shown.length === 0 && <p className="muted">No codes match.</p>}
          </>
        )}
      </div>
    </div>
  );
}
