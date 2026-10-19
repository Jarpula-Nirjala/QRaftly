import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, FileUp, Loader2, Trash2, XCircle } from 'lucide-react';
import type { QrType } from '../../../shared/payloads.ts';
import { api, errorText, saveBlob } from '../api.ts';
import { TYPES } from '../studio.tsx';
import { ColorInput, Field, Segmented, Spinner, fmtDateTime, useToast } from '../ui.tsx';

interface Job {
  id: string;
  kind: 'codes' | 'certificates';
  format: 'zip' | 'pdf';
  title: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  total: number;
  made: number;
  errors: Array<{ row: number; error: string }>;
  errorCount: number;
  error: string | null;
  download: string | null;
  createdAt: number;
}

/** A starter spreadsheet for each kind of job. */
const SAMPLES: Partial<Record<QrType | 'dynamic' | 'certificates', string>> = {
  dynamic: 'label,url\nTable 1,https://example.com/menu?table=1\nTable 2,https://example.com/menu?table=2\n',
  certificates: 'name,course,date,details\nAsha Rao,Python for Data Science,2026-10-01,Grade A\nRavi Kumar,SQL Fundamentals,2026-10-01,\n',
  url: 'label,url\nHome,https://example.com\nShop,https://example.com/shop\n',
  text: 'label,text\nNote 1,Hello there\n',
  wifi: 'label,ssid,password,security\nRoom 101,Hotel-101,secret-101,WPA\nLobby,Hotel-Guest,,nopass\n',
  upi: 'label,vpa,name,amount,note\nInvoice 1042,shop@okbank,Asha Stores,499,Invoice 1042\n',
  whatsapp: 'label,phone,message\nSales,919876543210,Hi! I have a question\n',
  sms: 'label,phone,message\nSupport,+919876543210,HELP\n',
  email: 'label,to,subject,body\nSupport,help@example.com,Order question,\n',
  phone: 'label,phone\nReception,+918012345678\n',
  event: 'label,title,start,end,location\nLaunch,Product launch,2026-11-20T18:30,2026-11-20T21:00,Hall 2\n',
  geo: 'label,lat,lng\nOffice,12.9716,77.5946\n',
  vcard: 'firstName,lastName,org,title,phone,email\nAsha,Rao,QRForge,Engineer,+919876543210,asha@example.com\n',
};

export function BulkPage() {
  const toast = useToast();
  const [kind, setKind] = useState<'codes' | 'certificates'>('codes');
  const [mode, setMode] = useState<'static' | 'dynamic'>('dynamic');
  const [type, setType] = useState<QrType>('url');
  const [format, setFormat] = useState<'zip' | 'pdf'>('pdf');
  const [title, setTitle] = useState('');
  const [color, setColor] = useState('#111111');
  const [csv, setCsv] = useState('');
  const [fileLabel, setFileLabel] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sampleKey = kind === 'certificates' ? 'certificates' : mode === 'dynamic' ? 'dynamic' : type;

  const load = () => api<{ jobs: Job[] }>('/api/bulk').then((r) => setJobs(r.jobs));
  useEffect(() => {
    void load();
  }, []);
  // Poll while anything is still running.
  const active = jobs.some((j) => j.status === 'queued' || j.status === 'running');
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => void load(), 1000);
    return () => clearInterval(t);
  }, [active]);

  const start = async () => {
    setBusy(true);
    try {
      await api('/api/bulk', { body: { kind, mode, type, format, title, color, csv } });
      toast('Job started. You can leave this page; it keeps running.');
      await load();
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setBusy(false);
    }
  };
  const download = async (j: Job) => {
    const res = await fetch(j.download!);
    if (!res.ok) return toast('That download has expired.', true);
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `qr-codes.${j.format}`;
    saveBlob(await res.blob(), name);
  };

  return (
    <div className="page">
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>Bulk generation</h1>
            <p>Upload a spreadsheet, get up to 1,000 codes as a print-ready PDF sheet or a ZIP of PNG images.</p>
          </div>
        </div>
        <div className="studio" style={{ gridTemplateColumns: 'minmax(0,1fr) 400px' }}>
          <div className="card stack">
            <Segmented label="What to make" value={kind} onChange={setKind} options={[{ value: 'codes', label: 'QR codes' }, { value: 'certificates', label: 'Signed certificates' }]} />
            {kind === 'codes' && (
              <>
                <Segmented label="Code kind" value={mode} onChange={setMode} options={[{ value: 'dynamic', label: 'Dynamic links (editable, tracked)' }, { value: 'static', label: 'Static content' }]} />
                {mode === 'static' && (
                  <div className="types" role="group" aria-label="Type">
                    {TYPES.map(({ type: t, label, icon: Icon }) => (
                      <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>
                        <Icon size={18} />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="grid-2">
              <Field label={kind === 'certificates' ? 'Issued by' : 'Sheet title'} hint={kind === 'certificates' ? 'Used when the CSV has no "issuer" column.' : 'Printed at the top of each PDF page.'}>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'certificates' ? 'QRForge Academy' : 'Cafe tables'} />
              </Field>
              <Field label="Colour">
                <ColorInput label="Code colour" value={color} onChange={setColor} />
              </Field>
            </div>
            <div>
              <div className="field" style={{ marginBottom: 8 }}>Download as</div>
              <Segmented label="Format" value={format} onChange={setFormat} options={[{ value: 'pdf', label: 'PDF sheet (A4, 12 per page)' }, { value: 'zip', label: 'ZIP of PNGs' }]} />
            </div>
            <hr className="divider" style={{ margin: '4px 0' }} />
            <div className="spread">
              <strong>Your spreadsheet</strong>
              <button type="button" className="btn sm ghost" onClick={() => saveBlob(new Blob([SAMPLES[sampleKey] ?? ''], { type: 'text/csv' }), `sample-${sampleKey}.csv`)}>
                <FileSpreadsheet size={15} /> Sample CSV
              </button>
            </div>
            <div className="drop" role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}>
              <FileUp size={22} />
              <span>{fileLabel || 'Choose a CSV file (save from Excel or Google Sheets as CSV)'}</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                setCsv(await f.text());
                setFileLabel(`${f.name} · ${(f.size / 1024).toFixed(1)} KB`);
              }}
            />
            <Field label="…or paste it here">
              <textarea className="input mono" rows={6} value={csv} onChange={(e) => (setCsv(e.target.value), setFileLabel(''))} placeholder={SAMPLES[sampleKey]} />
            </Field>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn primary lg" onClick={start} disabled={busy || !csv.trim()}>
                {busy && <Spinner size={16} />} Generate
              </button>
            </div>
          </div>
          <div className="card">
            <h2>Jobs</h2>
            {jobs.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>Jobs run in the background and are kept for 7 days.</p>
            ) : (
              <div className="stack">
                {jobs.map((j) => (
                  <div key={j.id} className="rule" style={{ gap: 8 }}>
                    <div className="spread">
                      <strong className="small">{j.title || (j.kind === 'certificates' ? 'Certificates' : 'QR codes')} · {j.format.toUpperCase()}</strong>
                      {j.status === 'done' ? (
                        <span className="badge good">
                          <CheckCircle2 size={12} /> Ready
                        </span>
                      ) : j.status === 'failed' ? (
                        <span className="badge bad">
                          <XCircle size={12} /> Failed
                        </span>
                      ) : (
                        <span className="badge accent">
                          <Loader2 size={12} className="spin" /> {j.status === 'queued' ? 'Waiting' : 'Working'}
                        </span>
                      )}
                    </div>
                    <div className="progress" aria-label={`${j.progress} of ${j.total} rows`}>
                      <span style={{ width: `${(j.progress / Math.max(1, j.total)) * 100}%` }} />
                    </div>
                    <div className="muted small">
                      {j.made.toLocaleString()} made · {j.progress}/{j.total} rows · {fmtDateTime(j.createdAt)}
                    </div>
                    {j.error && <div className="small" style={{ color: 'var(--bad)' }}>{j.error}</div>}
                    {j.errorCount > 0 && (
                      <details className="small">
                        <summary style={{ cursor: 'pointer', color: 'var(--warn)' }}>{j.errorCount} row{j.errorCount === 1 ? '' : 's'} skipped</summary>
                        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                          {j.errors.map((e) => (
                            <li key={e.row}>
                              Row {e.row}: {e.error}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <div className="row">
                      {j.download && (
                        <button className="btn sm primary" onClick={() => download(j)}>
                          <Download size={14} /> Download
                        </button>
                      )}
                      <button
                        className="btn sm ghost"
                        onClick={async () => {
                          await api(`/api/bulk/${j.id}`, { method: 'DELETE' });
                          await load();
                        }}
                      >
                        <Trash2 size={14} /> {j.status === 'running' || j.status === 'queued' ? 'Cancel' : 'Remove'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
