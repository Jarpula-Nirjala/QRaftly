import { useMemo, useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Copy, Info, Lock, ShieldCheck, ShieldX } from 'lucide-react';
import { checkLink, type Level } from '../../../../shared/linkcheck.ts';
import { api, errorText } from '../../api.ts';
import { ColumnChart } from '../../charts.tsx';
import { PhotoButton } from '../../camera.tsx';
import { canonical, sealNote, verifyEd25519, fromB64 } from '../../crypto.ts';
import { AnomalyList, findAnomalies, sampleYear } from '../../insights.tsx';
import { QrSvg } from '../../studio.tsx';
import { Field, Spinner, useToast } from '../../ui.tsx';
import { ShieldScene } from '../../visuals/mockups.tsx';
import { ExploreShell, Feature } from './shell.tsx';

const ICON: Record<Level, typeof Info> = { ok: CheckCircle2, info: Info, warn: AlertTriangle, danger: AlertOctagon };
const COLOR: Record<Level, string> = { ok: 'var(--good)', info: 'var(--muted)', warn: 'var(--warn)', danger: 'var(--bad)' };

// ------------------------------------------------------------ 16. link safety

function LinkChecker() {
  const [text, setText] = useState('https://secure-paypa1.com.account-verify.xyz/login?next=https://paypal.com');
  const r = useMemo(() => (text.trim() ? checkLink(text) : null), [text]);
  return (
    <>
      <Field label="Paste what a QR code contains, or read it from a photo">
        <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div className="demo-row">
        <PhotoButton label="Read a code from a photo" onResult={setText} />
        {['https://www.google.com/maps', 'upi://pay?pa=refund.desk@ybl&pn=Refund%20Desk&am=4999&tn=cashback', 'WIFI:T:nopass;S:Free Airport WiFi;;'].map((s) => (
          <button key={s} className="btn ghost sm" onClick={() => setText(s)}>
            {s.startsWith('upi') ? 'UPI example' : s.startsWith('WIFI') ? 'Wi-Fi example' : 'A safe link'}
          </button>
        ))}
      </div>
      {r && (
        <>
          <div className={`verdict ${r.verdict === 'danger' ? 'tampered' : r.verdict === 'caution' ? 'revoked' : 'valid'}`}>
            {r.verdict === 'danger' ? <ShieldX size={34} /> : r.verdict === 'caution' ? <AlertTriangle size={34} /> : <ShieldCheck size={34} />}
            <div>
              <h2>{r.verdict === 'danger' ? 'Do not open' : r.verdict === 'caution' ? 'Be careful' : 'Looks ordinary'}</h2>
              <div>{r.summary}</div>
            </div>
          </div>
          <ul className="risk-list">
            {r.findings.map((f) => {
              const I = ICON[f.level];
              return (
                <li key={f.text}>
                  <I size={18} color={COLOR[f.level]} /> {f.text}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------ 17. offline certificate check

function OfflineVerify() {
  const [code, setCode] = useState('');
  const [state, setState] = useState<{ ok: boolean; data?: Record<string, unknown>; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const m = /([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{86})\s*$/.exec(code.trim());
      if (!m) throw new Error('That is not a QRaftly certificate link.');
      const data = JSON.parse(new TextDecoder().decode(fromB64(m[1]))) as Record<string, unknown>;
      // The public key is fetched once and kept, so later checks need no network at all.
      let pem = '';
      try {
        pem = localStorage.getItem('qrf-pubkey') ?? '';
      } catch {
        // storage unavailable: fetch every time
      }
      if (!pem) {
        pem = await (await fetch('/api/certs/public-key')).text();
        try {
          localStorage.setItem('qrf-pubkey', pem);
        } catch {
          // fine
        }
      }
      const ok = await verifyEd25519(pem, canonical(data), m[2]);
      setState({ ok, data, msg: ok ? 'Signature verified on this device with the issuer’s public key. No server was asked.' : 'The details do not match the signature: this certificate has been changed.' });
    } catch (e) {
      const err = e as Error;
      setState({ ok: false, msg: err.name === 'NotSupportedError' ? 'This browser cannot check Ed25519 signatures yet; use the online check on the Verify page.' : errorText(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Field label="Certificate link (from its QR code)">
        <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="https://…/v/eyJ…" />
      </Field>
      <div className="demo-row">
        <button className="btn primary" disabled={busy || !code.trim()} onClick={run}>
          {busy ? <Spinner size={16} /> : <Lock size={16} />} Check on this device
        </button>
        <PhotoButton label="From a photo" onResult={setCode} />
      </div>
      {state && (
        <div className={`note ${state.ok ? 'good' : 'bad'}`}>
          <span>
            <b>{state.ok ? 'Genuine.' : 'Not verified.'}</b> {state.msg}
            {state.data && state.ok && (
              <>
                {' '}
                Awarded to <b>{String(state.data.recipient)}</b> for <b>{String(state.data.title)}</b> by {String(state.data.issuer)}.
              </>
            )}
          </span>
        </div>
      )}
      <p className="small muted" style={{ margin: 0 }}>Revocation needs the issuer’s records, so it is checked online on the Verify page; the signature itself never does.</p>
    </>
  );
}

// ------------------------------------------------------------ 18. view-once notes

function SecretNote() {
  const toast = useToast();
  const [text, setText] = useState('');
  const [hours, setHours] = useState(24);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const sealed = await sealNote(text);
      const r = await api<{ id: string }>('/api/notes', { body: { ciphertext: sealed.ciphertext, iv: sealed.iv, hours } });
      setLink(`${location.origin}/n/${r.id}#${sealed.key}`);
      setText('');
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Field label="Your secret (a password, a door code, an address)">
        <textarea className="input" rows={3} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Locker 14 code: 7392" />
      </Field>
      <div className="demo-row">
        <select className="input" style={{ maxWidth: 200 }} value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="Expires after">
          <option value={1}>Expires in 1 hour</option>
          <option value={24}>Expires in 1 day</option>
          <option value={168}>Expires in 7 days</option>
        </select>
        <button className="btn primary" disabled={busy || !text.trim()} onClick={make}>
          {busy ? <Spinner size={16} /> : <Lock size={16} />} Seal it
        </button>
      </div>
      {link && (
        <div className="grid-2" style={{ alignItems: 'center' }}>
          <QrSvg text={link} className="mini-qr" design={{ margin: 2, fg: '#14243a' }} />
          <div className="stack" style={{ gap: 8 }}>
            <span className="small mono">{link}</span>
            <button className="btn sm" onClick={() => navigator.clipboard.writeText(link).then(() => toast('Link copied. It works once.'))}>
              <Copy size={14} /> Copy link
            </button>
            <span className="small muted">Opens once, then the note is deleted. The key after “#” never reaches our server.</span>
          </div>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------ 19. destination preview & 20. alerts

function PreviewDemo() {
  return (
    <>
      <div className="card" style={{ maxWidth: 380, textAlign: 'center' }}>
        <ShieldCheck size={36} color="var(--gold)" />
        <h3 style={{ margin: '8px 0 4px' }}>Café Saffron menu</h3>
        <p className="small muted" style={{ margin: 0 }}>This code opens</p>
        <div className="mono" style={{ fontSize: 16, margin: '6px 0 12px' }}>https://saffron.example/menu</div>
        <button className="btn primary">Open</button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Turn it on for any dynamic code under <b>Security → Show the destination first</b>. If someone pastes a fake sticker over your code, people see a different address and stop.</p>
    </>
  );
}

function AlertsDemo() {
  const year = useMemo(() => sampleYear(), []);
  const recent = year.slice(-75);
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return (
    <>
      <ColumnChart caption="Scans per day, last 75 days (illustrative)" height={170} data={recent.map((d) => ({ label: fmt(d.day), title: fmt(d.day), n: d.n }))} />
      <AnomalyList items={findAnomalies(year).filter((a) => recent.some((r) => r.day === a.day))} />
      <p className="small muted" style={{ margin: 0 }}>Illustrative data. Each of your dynamic codes shows its own alerts under Analytics.</p>
    </>
  );
}

export default function TrustPage() {
  return (
    <ExploreShell visual={<ShieldScene />}>
      <Feature n={16} title="Link safety checker" tag="Anti-scam" text="Before you open a code, see what it really does. QRaftly reads the code, then checks the link for the tricks scammers rely on, and explains each warning in plain words." points={['Look-alike brand names, punycode and “@” disguises', 'Link shorteners, bare IP addresses, risky domain endings and open redirects', 'UPI codes: payee and amount shown, “refund” scams called out']}>
        <LinkChecker />
      </Feature>
      <Feature n={17} title="Offline certificate check" tag="Ed25519" text="Verify a QRaftly certificate entirely on your own device: the browser checks the issuer’s Ed25519 signature with WebCrypto, so the answer does not depend on trusting our server." points={['The public key is fetched once, then cached', 'Any edited letter makes the check fail', 'Revocation is still checked online when you are connected']}>
        <OfflineVerify />
      </Feature>
      <Feature n={18} title="View-once secret notes" tag="End-to-end" text="Share a password or a door code as a QR code that works exactly once. The note is encrypted in your browser with AES-256-GCM; the key lives only in the link, after the “#”, which browsers never send to servers." points={['The server stores ciphertext only', 'Deleted the moment it is opened, in the same database statement', 'Expires unread after 1 hour to 7 days']}>
        <SecretNote />
      </Feature>
      <Feature n={19} title="Destination preview" tag="Anti-swap" text="Fake stickers pasted over real codes are a growing scam. With preview on, a scan first shows the exact address it will open and your code’s name, and opens it only when the person agrees." points={['One switch per dynamic code', 'Works with rules and A/B tests: shows each person their own destination', 'Previews are not counted as scans']}>
        <PreviewDemo />
      </Feature>
      <Feature n={20} title="Unusual-activity alerts" tag="Monitoring" text="A sudden spike can mean your code was copied onto a fake poster or shared online; a sudden drop can mean the sign was damaged. QRaftly flags both automatically from your scan history." points={['Robust median-based test, not easily fooled by weekends', 'Explains what each kind of change usually means', 'Shown on every dynamic code’s analytics']}>
        <AlertsDemo />
      </Feature>
    </ExploreShell>
  );
}
