import { useEffect, useState } from 'react';
import { Award, BadgeCheck, Ban, Printer, RotateCcw, ShieldAlert, ShieldCheck, ShieldX, Trash2 } from 'lucide-react';
import { api, errorText } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { Camera } from '../camera.tsx';
import { Link } from '../router.tsx';
import { QrSvg } from '../studio.tsx';
import { Field, Loading, Spinner, fmtDate, useToast } from '../ui.tsx';

interface Cert {
  id: string;
  recipient: string;
  title: string;
  issuer: string;
  date: string;
  details?: string;
  revoked: boolean;
  createdAt: number;
  url: string;
}

const longDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

export function CertificateSheet({ c }: { c: Pick<Cert, 'recipient' | 'title' | 'issuer' | 'date' | 'details' | 'url'> }) {
  return (
    <div className="cert-sheet" style={{ background: '#fffdf7', color: '#1f2433', border: '10px double #b8963e', borderRadius: 6, padding: '34px 30px', textAlign: 'center', fontFamily: 'Georgia, "Times New Roman", serif', position: 'relative' }}>
      <Award size={40} color="#b8963e" />
      <div style={{ letterSpacing: '0.3em', fontSize: 12, textTransform: 'uppercase', marginTop: 6, color: '#7a6a3a' }}>Certificate</div>
      <div style={{ fontSize: 14, marginTop: 18, color: '#555' }}>This is to certify that</div>
      <div style={{ fontSize: 30, fontWeight: 700, margin: '6px 0 8px' }}>{c.recipient}</div>
      <div style={{ fontSize: 14, color: '#555' }}>has been awarded</div>
      <div style={{ fontSize: 20, fontWeight: 600, margin: '6px 0' }}>{c.title}</div>
      {c.details && <div style={{ fontSize: 13, color: '#555', maxWidth: 420, margin: '0 auto' }}>{c.details}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 26, gap: 16, textAlign: 'left' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, borderTop: '1px solid #b8963e', paddingTop: 6 }}>{c.issuer}</div>
          <div style={{ fontSize: 12, color: '#666' }}>{longDate(c.date)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <QrSvg text={c.url} ecl="L" design={{ margin: 1, fg: '#1f2433', bg: '#fffdf7' }} className="cert-qr" />
          <div style={{ fontSize: 10, color: '#666', marginTop: 2, fontFamily: 'Inter, sans-serif' }}>Scan to verify</div>
        </div>
      </div>
    </div>
  );
}

export function CertificatesPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [certs, setCerts] = useState<Cert[] | null>(null);
  const [form, setForm] = useState({ recipient: '', title: '', issuer: user?.name ?? '', date: new Date().toISOString().slice(0, 10), details: '' });
  const [sel, setSel] = useState<Cert | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<{ certs: Cert[] }>('/api/certs').then((r) => setCerts(r.certs));
  useEffect(() => {
    void load();
  }, []);
  const issue = async () => {
    setBusy(true);
    try {
      const r = await api<{ cert: Cert }>('/api/certs', { body: form });
      setSel(r.cert);
      setForm({ ...form, recipient: '', details: '' });
      toast('Certificate issued and signed.');
      await load();
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setBusy(false);
    }
  };
  const act = async (c: Cert, action: 'revoke' | 'restore' | 'delete') => {
    if (action === 'delete' && !confirm(`Delete ${c.recipient}'s certificate? Scans will show it as revoked.`)) return;
    if (action === 'delete') await api(`/api/certs/${c.id}`, { method: 'DELETE' });
    else await api(`/api/certs/${c.id}/${action}`, { body: {} });
    if (sel?.id === c.id) setSel(action === 'delete' ? null : { ...c, revoked: action === 'revoke' });
    await load();
  };
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="page">
      <div className="wrap">
        <div className="page-head no-print">
          <div>
            <h1>Certificates</h1>
            <p>Each certificate carries a digital signature in its QR code. Anyone can scan it to check it is genuine.</p>
          </div>
          <Link to="/verify" className="btn">
            <BadgeCheck size={16} /> Verify page
          </Link>
        </div>
        <div className="studio" style={{ gridTemplateColumns: 'minmax(0,1fr) 380px' }}>
          <div className="stack">
            {sel && (
              <div className="card">
                <div className="spread no-print" style={{ marginBottom: 14 }}>
                  <div className="row">
                    <h2 style={{ margin: 0 }}>{sel.recipient}</h2>
                    {sel.revoked && <span className="badge bad">Revoked</span>}
                  </div>
                  <button className="btn sm" onClick={() => print()}>
                    <Printer size={15} /> Print
                  </button>
                </div>
                <CertificateSheet c={sel} />
              </div>
            )}
            <div className="card no-print">
              <h2>Issued</h2>
              {!certs ? (
                <Loading />
              ) : certs.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>No certificates yet. Issue one, or make hundreds at once from a spreadsheet on the <Link to="/app/bulk">Bulk</Link> page.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Recipient</th>
                        <th>For</th>
                        <th>Date</th>
                        <th style={{ width: 1 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {certs.map((c) => (
                        <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setSel(c)}>
                          <td>
                            <b>{c.recipient}</b> {c.revoked && <span className="badge bad">Revoked</span>}
                          </td>
                          <td>{c.title}</td>
                          <td className="muted">{fmtDate(new Date(`${c.date}T12:00:00`).getTime())}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="row" style={{ flexWrap: 'nowrap', gap: 2 }}>
                              {c.revoked ? (
                                <button className="btn ghost icon sm" title="Restore" aria-label="Restore" onClick={() => act(c, 'restore')}>
                                  <RotateCcw size={15} />
                                </button>
                              ) : (
                                <button className="btn ghost icon sm" title="Revoke" aria-label="Revoke" onClick={() => act(c, 'revoke')}>
                                  <Ban size={15} />
                                </button>
                              )}
                              <button className="btn ghost icon sm" title="Delete" aria-label="Delete" onClick={() => act(c, 'delete')}>
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
          </div>
          <div className="card stack no-print">
            <h2 style={{ margin: 0 }}>Issue a certificate</h2>
            <Field label="Awarded to">
              <input className="input" value={form.recipient} onChange={set('recipient')} placeholder="Asha Rao" />
            </Field>
            <Field label="For">
              <input className="input" value={form.title} onChange={set('title')} placeholder="Full-stack web development" />
            </Field>
            <Field label="Issued by">
              <input className="input" value={form.issuer} onChange={set('issuer')} placeholder="Your organisation" />
            </Field>
            <Field label="Date">
              <input className="input" type="date" value={form.date} onChange={set('date')} />
            </Field>
            <Field label="Details (optional)">
              <input className="input" value={form.details} onChange={set('details')} placeholder="Grade A, 120 hours" />
            </Field>
            <button className="btn primary" onClick={issue} disabled={busy}>
              {busy ? <Spinner size={16} /> : <ShieldCheck size={16} />} Issue and sign
            </button>
            <p className="muted small" style={{ margin: 0 }}>Signed with Ed25519. Changing even one letter of a printed certificate makes the check fail.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ verify (public)

interface CertData {
  v: 1;
  id: string;
  recipient: string;
  title: string;
  issuer: string;
  date: string;
  details?: string;
}
type Verdict = { status: 'valid'; data: CertData; issuedAt: number } | { status: 'revoked'; data: CertData } | { status: 'tampered'; data: CertData | null } | { status: 'invalid' };

const b64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const VERDICT = {
  valid: { icon: ShieldCheck, title: 'Genuine certificate', text: 'The signature matches and the issuer has not withdrawn it.' },
  revoked: { icon: ShieldAlert, title: 'Revoked', text: 'This certificate was genuine, but the issuer has withdrawn it.' },
  tampered: { icon: ShieldX, title: 'Tampered', text: 'The details do not match the signature. Someone has changed this certificate.' },
  invalid: { icon: ShieldX, title: 'Not a QRForge certificate', text: 'This code does not contain a certificate we can check.' },
};

export function VerifyPage({ initial }: { initial?: string }) {
  const [code, setCode] = useState(initial ?? '');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [forge, setForge] = useState<CertData | null>(null);
  const [error, setError] = useState('');
  const check = async (c: string) => {
    setBusy(true);
    setError('');
    try {
      setVerdict(await api<Verdict>('/api/verify', { body: { code: c } }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (initial) void check(initial);
  }, [initial]);
  const sig = /\.([A-Za-z0-9_-]{86})\s*$/.exec(code)?.[1];
  const V = verdict ? VERDICT[verdict.status] : null;
  const data = verdict && 'data' in verdict ? verdict.data : null;

  return (
    <div className="page">
      <div className="wrap" style={{ maxWidth: 900 }}>
        <div className="page-head">
          <div>
            <h1>Verify a certificate</h1>
            <p>Scan the QR code on a certificate, upload a photo of it, or paste its link.</p>
          </div>
        </div>
        <div className="studio" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
          <div className="stack">
            {!initial && (
              <Camera
                onResult={(t) => {
                  setCode(t);
                  setForge(null);
                  void check(t);
                }}
              />
            )}
            <form
              className="row"
              style={{ flexWrap: 'nowrap' }}
              onSubmit={(e) => {
                e.preventDefault();
                setForge(null);
                void check(code);
              }}
            >
              <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="https://…/v/…" aria-label="Certificate link" />
              <button className="btn primary" disabled={busy || !code.trim()}>
                {busy ? <Spinner size={16} /> : 'Check'}
              </button>
            </form>
            {error && <div className="note bad">{error}</div>}
          </div>
          <div className="stack">
            {verdict && V && (
              <div className={`verdict ${verdict.status}`} role="status">
                <V.icon size={40} />
                <div>
                  <h2>{V.title}</h2>
                  <div className="small">{V.text}</div>
                </div>
              </div>
            )}
            {data && (
              <div className="card">
                <dl className="med-grid" style={{ margin: 0 }}>
                  <div>
                    <dt>Awarded to</dt>
                    <dd>{data.recipient}</dd>
                  </div>
                  <div>
                    <dt>For</dt>
                    <dd>{data.title}</dd>
                  </div>
                  <div>
                    <dt>Issued by</dt>
                    <dd>{data.issuer}</dd>
                  </div>
                  <div>
                    <dt>Date</dt>
                    <dd>{longDate(data.date)}</dd>
                  </div>
                  {data.details && (
                    <div>
                      <dt>Details</dt>
                      <dd>{data.details}</dd>
                    </div>
                  )}
                </dl>
                {verdict?.status === 'valid' && sig && !forge && (
                  <button className="btn sm" style={{ marginTop: 14 }} onClick={() => setForge({ ...data })}>
                    Try to forge it
                  </button>
                )}
              </div>
            )}
            {forge && sig && (
              <div className="card stack">
                <div>
                  <h3 style={{ marginBottom: 4 }}>Change a detail and check again</h3>
                  <p className="muted small" style={{ margin: 0 }}>This keeps the original signature, exactly as a forger copying the QR code would.</p>
                </div>
                <div className="cert-fields">
                  {(['recipient', 'title', 'issuer', 'date'] as const).map((k) => (
                    <label key={k}>
                      {k === 'recipient' ? 'Awarded to' : k === 'title' ? 'For' : k === 'issuer' ? 'Issued by' : 'Date'}
                      <input className="input" value={forge[k]} onChange={(e) => setForge({ ...forge, [k]: e.target.value })} />
                    </label>
                  ))}
                </div>
                <button className="btn" onClick={() => check(`${b64url(JSON.stringify(forge))}.${sig}`)}>
                  Check the edited certificate
                </button>
              </div>
            )}
            {!verdict && (
              <div className="card">
                <h3>How this works</h3>
                <p className="muted small">The QR code holds the certificate details and an Ed25519 signature made with the issuer's private key. This page checks the signature with the matching <a href="/api/certs/public-key">public key</a>, then asks the issuer whether the certificate has been revoked.</p>
                <p className="muted small" style={{ margin: 0 }}>Because the details are signed, nobody can change a name, grade or date without the check failing.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
