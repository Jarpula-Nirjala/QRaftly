import { useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Contact, Download, ImagePlus, IndianRupee, Link2, LocateFixed, Mail, MapPin, MessageCircle, MessageSquareText, Phone, Trash2, Type, Wifi, XCircle } from 'lucide-react';
import { buildPayload, type PayloadData, type QrType } from '../../shared/payloads.ts';
import { checkReadability } from '../../shared/qr/check.ts';
import { encodeText } from '../../shared/qr/encode.ts';
import { DEFAULT_DESIGN, toSvg, type Design, type DotStyle, type EyeStyle } from '../../shared/qr/render.ts';
import { fileName, saveBlob } from './api.ts';
import { ColorInput, Field, Segmented } from './ui.tsx';

export type StaticType = Exclude<QrType, 'medical'>;
type Data = Record<string, string | boolean>;

export const TYPES: Array<{ type: StaticType; label: string; icon: typeof Link2; blank: Data }> = [
  { type: 'url', label: 'Link', icon: Link2, blank: { url: '' } },
  { type: 'text', label: 'Text', icon: Type, blank: { text: '' } },
  { type: 'wifi', label: 'Wi-Fi', icon: Wifi, blank: { ssid: '', password: '', security: 'WPA', hidden: false } },
  { type: 'upi', label: 'UPI pay', icon: IndianRupee, blank: { vpa: '', name: '', amount: '', note: '' } },
  { type: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, blank: { phone: '', message: '' } },
  { type: 'sms', label: 'SMS', icon: MessageSquareText, blank: { phone: '', message: '' } },
  { type: 'email', label: 'Email', icon: Mail, blank: { to: '', subject: '', body: '' } },
  { type: 'phone', label: 'Call', icon: Phone, blank: { phone: '' } },
  { type: 'event', label: 'Calendar', icon: CalendarDays, blank: { title: '', start: '', end: '', location: '', description: '' } },
  { type: 'geo', label: 'Location', icon: MapPin, blank: { lat: '', lng: '', label: '' } },
  { type: 'vcard', label: 'Contact', icon: Contact, blank: { firstName: '', lastName: '', org: '', title: '', phone: '', email: '', website: '', address: '', note: '' } },
];

/** The QR text for some form data, or the reason it cannot be made yet. */
export function payloadOf(type: StaticType, data: Data): { text: string | null; error: string | null } {
  try {
    return { text: buildPayload({ ...data, type } as unknown as PayloadData), error: null };
  } catch (e) {
    return { text: null, error: (e as Error).message };
  }
}

// ------------------------------------------------------------ payload forms

export function PayloadForm({ type, data, onChange }: { type: StaticType; data: Data; onChange(d: Data): void }) {
  const set = (k: string) => (e: { target: { value: string } }) => onChange({ ...data, [k]: e.target.value });
  const v = (k: string) => String(data[k] ?? '');
  const input = (k: string, label: string, props: Record<string, unknown> = {}, hint?: string) => (
    <Field label={label} hint={hint}>
      <input className="input" value={v(k)} onChange={set(k)} {...props} />
    </Field>
  );
  const area = (k: string, label: string, placeholder = '') => (
    <Field label={label}>
      <textarea className="input" value={v(k)} onChange={set(k)} placeholder={placeholder} />
    </Field>
  );
  switch (type) {
    case 'url':
      return input('url', 'Website or link', { placeholder: 'https://example.com', inputMode: 'url' });
    case 'text':
      return area('text', 'Text', 'Anything up to a few hundred words');
    case 'wifi':
      return (
        <div className="stack">
          <div className="grid-2">
            {input('ssid', 'Network name (SSID)', { placeholder: 'Home-WiFi' })}
            {data.security !== 'nopass' && input('password', 'Password', { placeholder: '••••••••' })}
          </div>
          <div className="spread">
            <Segmented label="Security" value={String(data.security ?? 'WPA') as 'WPA' | 'WEP' | 'nopass'} onChange={(s) => onChange({ ...data, security: s })} options={[{ value: 'WPA', label: 'WPA/WPA2/WPA3' }, { value: 'WEP', label: 'WEP' }, { value: 'nopass', label: 'Open' }]} />
            <label className="check">
              <input type="checkbox" checked={!!data.hidden} onChange={(e) => onChange({ ...data, hidden: e.target.checked })} /> Hidden network
            </label>
          </div>
          <p className="muted small" style={{ margin: 0 }}>Guests point their camera at the code and join without typing the password.</p>
        </div>
      );
    case 'upi':
      return (
        <div className="stack">
          <div className="grid-2">
            {input('vpa', 'UPI ID', { placeholder: 'yourname@okbank' })}
            {input('name', 'Payee name', { placeholder: 'Asha Stores' })}
            {input('amount', 'Amount (₹)', { placeholder: 'Leave empty to let them type it', inputMode: 'decimal' }, 'Fixed amounts suit bills and fees.')}
            {input('note', 'Note', { placeholder: 'Invoice 1042' })}
          </div>
          <p className="muted small" style={{ margin: 0 }}>Works with every UPI app: GPay, PhonePe, Paytm, BHIM and bank apps.</p>
        </div>
      );
    case 'whatsapp':
    case 'sms':
      return (
        <div className="stack">
          {input('phone', 'Phone number', { placeholder: type === 'whatsapp' ? '919876543210' : '+91 98765 43210', inputMode: 'tel' }, type === 'whatsapp' ? 'With the country code, no spaces or +.' : undefined)}
          {area('message', 'Message (filled in for them)', 'Hi! I would like to book a table.')}
        </div>
      );
    case 'email':
      return (
        <div className="stack">
          {input('to', 'Send to', { placeholder: 'hello@example.com', inputMode: 'email' })}
          {input('subject', 'Subject')}
          {area('body', 'Message')}
        </div>
      );
    case 'phone':
      return input('phone', 'Phone number', { placeholder: '+91 98765 43210', inputMode: 'tel' });
    case 'event':
      return (
        <div className="stack">
          {input('title', 'Event name', { placeholder: 'Product launch' })}
          <div className="grid-2">
            {input('start', 'Starts', { type: 'datetime-local' })}
            {input('end', 'Ends', { type: 'datetime-local' })}
          </div>
          {input('location', 'Where')}
          {area('description', 'Details')}
        </div>
      );
    case 'geo':
      return (
        <div className="stack">
          <div className="grid-2">
            {input('lat', 'Latitude', { placeholder: '12.9716', inputMode: 'decimal' })}
            {input('lng', 'Longitude', { placeholder: '77.5946', inputMode: 'decimal' })}
          </div>
          <div>
            <button
              type="button"
              className="btn sm"
              onClick={() =>
                navigator.geolocation?.getCurrentPosition((p) => onChange({ ...data, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }))
              }
            >
              <LocateFixed size={15} /> Use my location
            </button>
          </div>
        </div>
      );
    case 'vcard':
      return <ContactFields data={data} onChange={onChange} />;
  }
}

export function ContactFields({ data, onChange }: { data: Data; onChange(d: Data): void }) {
  const f = (k: string, label: string, props: Record<string, unknown> = {}) => (
    <Field label={label}>
      <input className="input" value={String(data[k] ?? '')} onChange={(e) => onChange({ ...data, [k]: e.target.value })} {...props} />
    </Field>
  );
  return (
    <div className="grid-2">
      {f('firstName', 'First name')}
      {f('lastName', 'Last name')}
      {f('title', 'Job title')}
      {f('org', 'Company')}
      {f('phone', 'Phone', { inputMode: 'tel' })}
      {f('email', 'Email', { inputMode: 'email' })}
      {f('website', 'Website', { inputMode: 'url' })}
      {f('address', 'Address')}
    </div>
  );
}

// ------------------------------------------------------------ design

const SAMPLE = encodeText('QRaftly', { ecl: 'L' });
const COLORS = ['#111111', '#14243A', '#4338ca', '#7c3aed', '#be185d', '#b91c1c', '#c2410c', '#15803d', '#0f766e', '#334155'];
const DOTS: Array<{ v: DotStyle; label: string }> = [
  { v: 'square', label: 'Square' },
  { v: 'rounded', label: 'Rounded' },
  { v: 'dots', label: 'Dots' },
  { v: 'classy', label: 'Classy' },
  { v: 'fluid', label: 'Fluid' },
];
const EYES: Array<{ v: EyeStyle; label: string }> = [
  { v: 'square', label: 'Square' },
  { v: 'rounded', label: 'Rounded' },
  { v: 'circle', label: 'Circle' },
  { v: 'leaf', label: 'Leaf' },
];

/** Logos are scaled to at most 256 px and stored as PNG, which keeps the saved design small. */
function readLogo(file: File): Promise<string> {
  return new Promise((ok, fail) => {
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) return fail(new Error('Choose a PNG, JPG, WebP, GIF or SVG image.'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, 256 / Math.max(img.naturalWidth || 256, img.naturalHeight || 256));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round((img.naturalWidth || 256) * s));
      c.height = Math.max(1, Math.round((img.naturalHeight || 256) * s));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/png'));
    };
    img.onerror = () => fail(new Error('That image could not be opened.'));
    img.src = url;
  });
}

export function DesignPanel({ design, onChange, onError }: { design: Design; onChange(d: Design): void; onError?(msg: string): void }) {
  const set = (patch: Partial<Design>) => onChange({ ...design, ...patch });
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const takeFile = async (f?: File) => {
    if (!f) return;
    try {
      set({ logo: await readLogo(f) });
    } catch (e) {
      onError?.((e as Error).message);
    }
  };
  return (
    <div className="stack">
      <div>
        <div className="field" style={{ marginBottom: 8 }}>Colour</div>
        <div className="swatches" role="group" aria-label="Colour presets">
          {COLORS.map((c) => (
            <button key={c} type="button" style={{ background: c }} aria-label={c} aria-pressed={design.fg === c} onClick={() => set({ fg: c })} />
          ))}
        </div>
      </div>
      <div className="grid-2">
        <Field label="Dots">
          <ColorInput label="Dot colour" value={design.fg} onChange={(fg) => set({ fg })} />
        </Field>
        <Field label="Background">
          <ColorInput label="Background colour" value={design.bg} onChange={(bg) => set({ bg })} />
        </Field>
        <Field label="Gradient to">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            {design.fg2 ? <ColorInput label="Gradient colour" value={design.fg2} onChange={(fg2) => set({ fg2 })} /> : <button type="button" className="btn sm" onClick={() => set({ fg2: '#D4AF65' })}>Add gradient</button>}
            {design.fg2 && (
              <button type="button" className="btn ghost icon sm" aria-label="Remove gradient" onClick={() => set({ fg2: null })}>
                <XCircle size={16} />
              </button>
            )}
          </div>
        </Field>
        <Field label="Eyes">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            {design.eyeColor ? <ColorInput label="Eye colour" value={design.eyeColor} onChange={(eyeColor) => set({ eyeColor })} /> : <button type="button" className="btn sm" onClick={() => set({ eyeColor: '#B08A3E' })}>Own colour</button>}
            {design.eyeColor && (
              <button type="button" className="btn ghost icon sm" aria-label="Same colour as dots" onClick={() => set({ eyeColor: null })}>
                <XCircle size={16} />
              </button>
            )}
          </div>
        </Field>
      </div>
      <div>
        <div className="field" style={{ marginBottom: 8 }}>Dot style</div>
        <div className="style-picks" role="group" aria-label="Dot style">
          {DOTS.map((d) => (
            <button key={d.v} type="button" aria-pressed={design.dots === d.v} onClick={() => set({ dots: d.v })}>
              <span dangerouslySetInnerHTML={{ __html: toSvg(SAMPLE, { dots: d.v, eyes: design.eyes, margin: 0, fg: 'currentColor', bg: 'transparent', transparent: true }) }} style={{ width: 34, height: 34, display: 'block' }} />
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="field" style={{ marginBottom: 8 }}>Corner style</div>
        <div className="style-picks four" role="group" aria-label="Corner style">
          {EYES.map((d) => (
            <button key={d.v} type="button" aria-pressed={design.eyes === d.v} onClick={() => set({ eyes: d.v })}>
              <span dangerouslySetInnerHTML={{ __html: toSvg(SAMPLE, { dots: design.dots, eyes: d.v, margin: 0, fg: 'currentColor', transparent: true }) }} style={{ width: 34, height: 34, display: 'block' }} />
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="field" style={{ marginBottom: 8 }}>Logo</div>
        <div
          className={`drop${over ? ' over' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void takeFile(e.dataTransfer.files[0]);
          }}
        >
          {design.logo ? <img src={design.logo} alt="" /> : <ImagePlus size={22} />}
          <span style={{ flex: 1 }}>{design.logo ? 'Change logo' : 'Add a logo: drop an image or click'}</span>
          {design.logo && (
            <button
              type="button"
              className="btn ghost icon sm"
              aria-label="Remove logo"
              onClick={(e) => {
                e.stopPropagation();
                set({ logo: null });
              }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void takeFile(e.target.files?.[0])} />
        {design.logo && (
          <Field label={`Logo size: ${Math.round(design.logoScale * 100)}%`}>
            <input type="range" min={0.1} max={0.3} step={0.01} value={design.logoScale} onChange={(e) => set({ logoScale: Number(e.target.value) })} />
          </Field>
        )}
      </div>
      <div className="grid-2">
        <Field label={`Quiet zone: ${design.margin} modules`} hint="Scanners need 4 for best results.">
          <input type="range" min={0} max={8} step={1} value={design.margin} onChange={(e) => set({ margin: Number(e.target.value) })} />
        </Field>
        <label className="check" style={{ alignSelf: 'center' }}>
          <input type="checkbox" checked={!!design.transparent} onChange={(e) => set({ transparent: e.target.checked })} /> Transparent background
        </label>
      </div>
      <div>
        <button type="button" className="btn sm ghost" onClick={() => onChange({ ...DEFAULT_DESIGN })}>
          Reset design
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ preview & export

/** Draws an SVG string into a PNG of `px` × `px`. */
export function svgToPng(svg: string, px: number): Promise<Blob> {
  return new Promise((ok, fail) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = px;
      c.height = px;
      c.getContext('2d')!.drawImage(img, 0, 0, px, px);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? ok(b) : fail(new Error('Could not make the PNG.'))), 'image/png');
    };
    img.onerror = () => fail(new Error('Could not draw the code.'));
    img.src = url;
  });
}

export function useQr(text: string | null, design: Design) {
  return useMemo(() => {
    if (!text) return null;
    try {
      const check = checkReadability(text, design);
      return { check, svg: toSvg(check.qr, design) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [text, design]);
}

export function QrSvg({ text, design, className, ecl }: { text: string; design?: Partial<Design>; className?: string; ecl?: 'L' | 'M' }) {
  const svg = useMemo(() => {
    try {
      return toSvg(encodeText(text, { ecl: design?.logo ? 'H' : (ecl ?? 'M') }), design);
    } catch {
      return '';
    }
  }, [text, design, ecl]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function QrPreview({ text, design, name, placeholder, extra }: { text: string | null; design: Design; name: string; placeholder?: string; extra?: ReactNode }) {
  const out = useQr(text, design);
  const [busy, setBusy] = useState(false);
  const png = async (px: number) => {
    if (!out || !('svg' in out)) return;
    setBusy(true);
    try {
      saveBlob(await svgToPng(out.svg!, px), `${fileName(name)}.png`);
    } finally {
      setBusy(false);
    }
  };
  const check = out && 'check' in out ? out.check : null;
  const budget = check ? Math.round(check.budgetUsed * 100) : 0;
  return (
    <div className="preview-col">
      <div className="preview">
        {out && 'svg' in out ? (
          <div className="qr" dangerouslySetInnerHTML={{ __html: out.svg! }} role="img" aria-label="QR code preview" />
        ) : (
          <div className="qr" style={{ display: 'grid', placeItems: 'center', textAlign: 'center', gap: 10 }}>
            <div className="qr-placeholder" aria-hidden="true" />
            <p className="small" style={{ margin: 0, color: '#e8dfcf' }}>{out && 'error' in out ? out.error : (placeholder ?? 'Fill in the form to see your code.')}</p>
          </div>
        )}
      </div>
      {check && (
        <div className="card" style={{ padding: 16 }}>
          <div className="spread" style={{ marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>Scan check</strong>
            {check.ok ? (
              <span className="badge good">
                <CheckCircle2 size={13} /> Safe to print
              </span>
            ) : (
              <span className="badge bad">
                <AlertTriangle size={13} /> Needs a fix
              </span>
            )}
          </div>
          {design.logo && (
            <div style={{ marginBottom: 10 }}>
              <div className="spread small muted" style={{ marginBottom: 5 }}>
                <span>Error-correction used by the logo</span>
                <b style={{ color: 'var(--ink)' }}>{budget}%</b>
              </div>
              <div className={`meter${budget > 100 ? ' bad' : budget > 75 ? ' warn' : ''}`}>
                <span style={{ width: `${Math.min(100, budget)}%` }} />
              </div>
            </div>
          )}
          <div className="small muted">
            Version {check.qr.version} · {check.qr.size}×{check.qr.size} · level {check.qr.ecl} · contrast {check.contrast.toFixed(1)}:1
          </div>
          {check.issues.length > 0 && (
            <ul className="small" style={{ margin: '10px 0 0', paddingLeft: 18, color: 'var(--bad)' }}>
              {check.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
          {check.ok && <p className="small muted" style={{ margin: '8px 0 0' }}>We decoded this design ourselves, treating every module under the logo as misread.</p>}
        </div>
      )}
      {out && 'svg' in out && (
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={() => png(1024)}>
            <Download size={16} /> PNG
          </button>
          <button className="btn" disabled={busy} onClick={() => png(2048)}>
            Print PNG
          </button>
          <button className="btn" onClick={() => saveBlob(new Blob([out.svg!], { type: 'image/svg+xml' }), `${fileName(name)}.svg`)}>
            SVG
          </button>
          {extra}
        </div>
      )}
    </div>
  );
}
