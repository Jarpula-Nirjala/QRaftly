import { useMemo, useRef, useState } from 'react';
import { BarChart3, HeartPulse, ImagePlus, Link2, LockKeyhole, Plus, QrCode, Route, Save, Trash2, UserRound } from 'lucide-react';
import { medicalText, type MedicalData } from '../../../shared/payloads.ts';
import { DEFAULT_DESIGN, type Design } from '../../../shared/qr/render.ts';
import { api, errorText } from '../api.ts';
import { navigate } from '../router.tsx';
import { ContactFields, DesignPanel, PayloadForm, payloadOf, QrPreview, TYPES, type StaticType } from '../studio.tsx';
import type { Kind, Qr, Rule } from '../types.ts';
import { ColorInput, Field, Segmented, Spinner, useToast } from '../ui.tsx';

const KINDS: Array<{ kind: Kind; icon: typeof QrCode; title: string; text: string }> = [
  { kind: 'dynamic', icon: BarChart3, title: 'Dynamic link', text: 'Change the destination any time, see scan analytics, add rules and security.' },
  { kind: 'static', icon: QrCode, title: 'Static code', text: 'Wi-Fi, UPI, contact, calendar and more, stored in the code itself. Works offline forever.' },
  { kind: 'profile', icon: UserRound, title: 'Profile card', text: 'A hosted page with your photo, links and a "Save contact" button. Edit it without reprinting.' },
  { kind: 'medical', icon: HeartPulse, title: 'Medical card', text: 'Emergency essentials readable offline; private details behind a PIN.' },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const OSES = [
  { v: 'ios', label: 'iPhone / iPad' },
  { v: 'android', label: 'Android' },
  { v: 'windows', label: 'Windows' },
  { v: 'mac', label: 'Mac' },
  { v: 'linux', label: 'Linux' },
] as const;
const BLOOD = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

type Data = Record<string, any>;

function blankData(kind: Kind): Data {
  if (kind === 'dynamic') return { url: '' };
  if (kind === 'profile') return { firstName: '', lastName: '', title: '', org: '', phone: '', email: '', website: '', bio: '', links: [], accent: '#4338ca' };
  if (kind === 'medical') return { public: { name: '', bloodGroup: '', allergies: '', conditions: '', medicines: '', contactName: '', contactPhone: '' }, private: { notes: '', doctor: '', insurance: '', address: '' } };
  return { ...TYPES[0].blank };
}

const toLocalInput = (ms?: number | null) => {
  if (!ms) return '';
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function readAvatar(file: File): Promise<string> {
  return new Promise((ok, fail) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      c.getContext('2d')!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => fail(new Error('That image could not be opened.'));
    img.src = url;
  });
}

export function Editor({ existing, onSaved }: { existing?: Qr; onSaved?(q: Qr): void }) {
  const toast = useToast();
  const [kind, setKind] = useState<Kind>(existing?.kind ?? (new URLSearchParams(location.search).get('kind') as Kind) ?? 'dynamic');
  const [type, setType] = useState<StaticType>((existing?.type as StaticType) ?? 'url');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [data, setData] = useState<Data>(() => (existing ? structuredClone(existing.data) : blankData(kind)));
  const [design, setDesign] = useState<Design>(existing ? { ...DEFAULT_DESIGN, ...existing.design } : { ...DEFAULT_DESIGN });
  const [rules, setRules] = useState<Rule[]>(existing?.rules ?? []);
  const [pin, setPin] = useState('');
  const [removePin, setRemovePin] = useState(false);
  const [privatePin, setPrivatePin] = useState('');
  const [expires, setExpires] = useState(toLocalInput(existing?.security.expiresAt));
  const [limit, setLimit] = useState<'none' | 'once' | 'n'>(existing?.security.maxScans === 1 ? 'once' : existing?.security.maxScans ? 'n' : 'none');
  const [maxScans, setMaxScans] = useState(String(existing?.security.maxScans ?? 100));
  const [tab, setTab] = useState<'content' | 'design' | 'rules' | 'security'>('content');
  const [busy, setBusy] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);

  const chooseKind = (k: Kind) => {
    setKind(k);
    setData(blankData(k));
    setTab('content');
  };

  // What the printed code will contain (hosted kinds use the short link, known exactly after saving).
  const short = existing?.shortUrl ?? `${location.origin}/r/xxxxxxx`;
  const preview = useMemo(() => {
    if (kind === 'static') return payloadOf(type, data);
    if (kind === 'medical') {
      try {
        return { text: medicalText(data.public as MedicalData, short), error: null };
      } catch (e) {
        return { text: null, error: (e as Error).message };
      }
    }
    if (kind === 'dynamic' && !String(data.url ?? '').trim()) return { text: null, error: 'Enter the link the code should open.' };
    if (kind === 'profile' && !String(data.firstName ?? '').trim()) return { text: null, error: 'Enter your first name.' };
    return { text: short, error: null };
  }, [kind, type, data, short]);

  const save = async () => {
    setBusy(true);
    try {
      const security: Record<string, unknown> = {
        expiresAt: expires ? new Date(expires).getTime() : null,
        maxScans: limit === 'once' ? 1 : limit === 'n' ? Number(maxScans) || null : null,
      };
      if (pin) security.pin = pin;
      if (removePin) security.removePin = true;
      if (privatePin) security.privatePin = privatePin;
      const body = { kind, type, title, data: kind === 'static' ? { ...data, type } : data, design, rules, security, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      const r = existing ? await api<{ qr: Qr }>(`/api/qrs/${existing.id}`, { method: 'PATCH', body }) : await api<{ qr: Qr }>('/api/qrs', { body });
      toast(existing ? 'Saved.' : 'Your code is ready.');
      setPin('');
      setPrivatePin('');
      setRemovePin(false);
      if (onSaved) onSaved(r.qr);
      else navigate(`/app/qr/${r.qr.id}`);
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setBusy(false);
    }
  };

  const hosted = kind !== 'static';
  const tabs = [
    { id: 'content', label: 'Content', icon: Link2 },
    { id: 'design', label: 'Design', icon: QrCode },
    ...(kind === 'dynamic' ? [{ id: 'rules', label: `Rules${rules.length ? ` (${rules.length})` : ''}`, icon: Route }] : []),
    ...(hosted ? [{ id: 'security', label: 'Security', icon: LockKeyhole }] : []),
  ] as const;

  const pub = (data.public ?? {}) as Record<string, string>;
  const priv = (data.private ?? {}) as Record<string, string>;
  const setPub = (k: string, v: string) => setData({ ...data, public: { ...pub, [k]: v } });
  const setPriv = (k: string, v: string) => setData({ ...data, private: { ...priv, [k]: v } });

  return (
    <div className="stack" style={{ gap: 20 }}>
      {!existing && (
        <div className="kind-pick" role="group" aria-label="Kind of code">
          {KINDS.map(({ kind: k, icon: Icon, title: t, text }) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => chooseKind(k)}>
              <strong>
                <Icon size={18} /> {t}
              </strong>
              <span>{text}</span>
            </button>
          ))}
        </div>
      )}
      <div className="studio">
        <div className="card">
          <Field label="Name (only you see this)">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'dynamic' ? 'Cafe menu' : kind === 'profile' ? 'My business card' : kind === 'medical' ? 'Emergency card' : 'Guest Wi-Fi'} />
          </Field>
          <div className="tabs" role="tablist" style={{ marginTop: 18 }}>
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id as typeof tab)}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          {tab === 'content' && kind === 'static' && (
            <div className="stack">
              {!existing && (
                <div className="types" role="group" aria-label="QR type">
                  {TYPES.map(({ type: t, label, icon: Icon }) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={type === t}
                      onClick={() => {
                        setType(t);
                        setData({ ...TYPES.find((x) => x.type === t)!.blank });
                      }}
                    >
                      <Icon size={20} />
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <PayloadForm type={type} data={data} onChange={setData} />
              <p className="muted small" style={{ margin: 0 }}>Static codes hold their content inside the pattern: they cannot be changed or tracked after printing.</p>
            </div>
          )}

          {tab === 'content' && kind === 'dynamic' && (
            <div className="stack">
              <Field label="Where the code goes" hint="You can change this any time; the printed code stays the same.">
                <input className="input" value={data.url ?? ''} onChange={(e) => setData({ ...data, url: e.target.value })} placeholder="https://example.com/menu" inputMode="url" autoFocus />
              </Field>
            </div>
          )}

          {tab === 'content' && kind === 'profile' && (
            <div className="stack">
              <div className="row">
                <div className="avatar" style={{ marginTop: 0, width: 72, height: 72, fontSize: 26, border: 0 }}>
                  {data.avatar ? <img src={data.avatar} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} /> : (data.firstName?.[0] ?? '?')}
                </div>
                <button type="button" className="btn sm" onClick={() => avatarRef.current?.click()}>
                  <ImagePlus size={15} /> {data.avatar ? 'Change photo' : 'Add photo'}
                </button>
                {data.avatar && (
                  <button type="button" className="btn sm ghost" onClick={() => setData({ ...data, avatar: undefined })}>
                    Remove
                  </button>
                )}
                <input
                  ref={avatarRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setData({ ...data, avatar: await readAvatar(f).catch((err) => (toast(err.message, true), data.avatar)) });
                  }}
                />
                <div style={{ marginLeft: 'auto' }}>
                  <ColorInput label="Page colour" value={data.accent ?? '#4338ca'} onChange={(accent) => setData({ ...data, accent })} />
                </div>
              </div>
              <ContactFields data={data} onChange={setData} />
              <Field label="About you">
                <textarea className="input" value={data.bio ?? ''} onChange={(e) => setData({ ...data, bio: e.target.value })} placeholder="Full-stack engineer. I build things for the web." />
              </Field>
              <div>
                <div className="field" style={{ marginBottom: 8 }}>Links</div>
                <div className="stack" style={{ gap: 8 }}>
                  {(data.links ?? []).map((l: { label: string; url: string }, i: number) => (
                    <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
                      <input className="input" style={{ maxWidth: 160 }} value={l.label} placeholder="LinkedIn" aria-label="Link name" onChange={(e) => setData({ ...data, links: data.links.map((x: object, j: number) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                      <input className="input" value={l.url} placeholder="https://linkedin.com/in/you" aria-label="Link address" onChange={(e) => setData({ ...data, links: data.links.map((x: object, j: number) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                      <button type="button" className="btn ghost icon" aria-label="Remove link" onClick={() => setData({ ...data, links: data.links.filter((_: unknown, j: number) => j !== i) })}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {(data.links ?? []).length < 8 && (
                    <div>
                      <button type="button" className="btn sm" onClick={() => setData({ ...data, links: [...(data.links ?? []), { label: '', url: '' }] })}>
                        <Plus size={15} /> Add link
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'content' && kind === 'medical' && (
            <div className="stack">
              <div className="note warn">
                <HeartPulse size={17} />
                <span>These essentials are written into the code itself, so first responders can read them with any phone camera, even with no signal.</span>
              </div>
              <div className="grid-2">
                <Field label="Full name">
                  <input className="input" value={pub.name ?? ''} onChange={(e) => setPub('name', e.target.value)} />
                </Field>
                <Field label="Blood group">
                  <select className="input" value={pub.bloodGroup ?? ''} onChange={(e) => setPub('bloodGroup', e.target.value)}>
                    {BLOOD.map((b) => (
                      <option key={b} value={b}>
                        {b || 'Not set'}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Allergies">
                  <input className="input" value={pub.allergies ?? ''} onChange={(e) => setPub('allergies', e.target.value)} placeholder="Penicillin, peanuts" />
                </Field>
                <Field label="Conditions">
                  <input className="input" value={pub.conditions ?? ''} onChange={(e) => setPub('conditions', e.target.value)} placeholder="Type 1 diabetes" />
                </Field>
                <Field label="Medicines">
                  <input className="input" value={pub.medicines ?? ''} onChange={(e) => setPub('medicines', e.target.value)} />
                </Field>
                <Field label="Emergency contact">
                  <input className="input" value={pub.contactName ?? ''} onChange={(e) => setPub('contactName', e.target.value)} placeholder="Name and relation" />
                </Field>
                <Field label="Contact phone">
                  <input className="input" value={pub.contactPhone ?? ''} onChange={(e) => setPub('contactPhone', e.target.value)} inputMode="tel" />
                </Field>
              </div>
              <hr className="divider" />
              <h3 style={{ margin: 0, fontSize: 15 }}>Private details (online, PIN required)</h3>
              <div className="grid-2">
                <Field label="Doctor">
                  <input className="input" value={priv.doctor ?? ''} onChange={(e) => setPriv('doctor', e.target.value)} />
                </Field>
                <Field label="Insurance">
                  <input className="input" value={priv.insurance ?? ''} onChange={(e) => setPriv('insurance', e.target.value)} />
                </Field>
                <Field label="Home address">
                  <input className="input" value={priv.address ?? ''} onChange={(e) => setPriv('address', e.target.value)} />
                </Field>
                <Field label={existing?.security.hasPrivatePin ? 'New PIN for private details' : 'PIN for private details'} hint={existing?.security.hasPrivatePin ? 'A PIN is set. Leave empty to keep it.' : '4 to 8 digits. Share it with family and your doctor.'}>
                  <input className="input" value={privatePin} onChange={(e) => setPrivatePin(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoComplete="off" />
                </Field>
              </div>
              <Field label="Medical notes">
                <textarea className="input" value={priv.notes ?? ''} onChange={(e) => setPriv('notes', e.target.value)} placeholder="History, implants, what to do in an emergency" />
              </Field>
            </div>
          )}

          {tab === 'design' && <DesignPanel design={design} onChange={setDesign} onError={(m) => toast(m, true)} />}

          {tab === 'rules' && <RulesEditor rules={rules} onChange={setRules} />}

          {tab === 'security' && (
            <div className="stack">
              <Field label={existing?.security.hasPin && !removePin ? 'Change the PIN' : 'PIN to open'} hint={existing?.security.hasPin && !removePin ? 'This code asks for a PIN. Leave empty to keep it.' : 'Optional. 4 to 8 digits; people enter it after scanning.'}>
                <input className="input" style={{ maxWidth: 220 }} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoComplete="off" />
              </Field>
              {existing?.security.hasPin && (
                <label className="check">
                  <input type="checkbox" checked={removePin} onChange={(e) => setRemovePin(e.target.checked)} /> Remove the PIN
                </label>
              )}
              <Field label="Stops working after" hint="Optional. Scans after this show a friendly “expired” page.">
                <input className="input" style={{ maxWidth: 260 }} type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
              </Field>
              <div>
                <div className="field" style={{ marginBottom: 8 }}>Scan limit</div>
                <Segmented label="Scan limit" value={limit} onChange={setLimit} options={[{ value: 'none', label: 'Unlimited' }, { value: 'once', label: 'Single use' }, { value: 'n', label: 'Limited' }]} />
                {limit === 'n' && (
                  <div style={{ marginTop: 10, maxWidth: 200 }}>
                    <Field label="Number of scans">
                      <input className="input" value={maxScans} onChange={(e) => setMaxScans(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
                    </Field>
                  </div>
                )}
                {limit !== 'none' && <p className="muted small" style={{ margin: '8px 0 0' }}>Link previews in chat apps never use up a scan. Scanners see a confirm page first.</p>}
              </div>
            </div>
          )}

          <hr className="divider" style={{ margin: '22px 0 16px' }} />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn primary lg" onClick={save} disabled={busy}>
              {busy ? <Spinner size={16} /> : <Save size={17} />} {existing ? 'Save changes' : 'Create code'}
            </button>
          </div>
        </div>
        <QrPreview text={preview.text} design={design} name={title || kind} placeholder={preview.error ?? undefined} />
      </div>
    </div>
  );
}

function RulesEditor({ rules, onChange }: { rules: Rule[]; onChange(r: Rule[]): void }) {
  const set = (i: number, patch: Partial<Rule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        The first rule that matches the scan decides where it goes; otherwise the code opens its main link. Times are in your timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
      </p>
      {rules.map((r, i) => (
        // Keyed by count too: deleting a rule remounts the rest, so uncontrolled inputs show the right values.
        <div key={`${i}-${rules.length}`} className="rule">
          <div className="spread">
            <strong className="small">Rule {i + 1}</strong>
            <button type="button" className="btn ghost icon sm" aria-label={`Delete rule ${i + 1}`} onClick={() => onChange(rules.filter((_, j) => j !== i))}>
              <Trash2 size={15} />
            </button>
          </div>
          <div className="grid-2">
            <Field label="Name">
              <input className="input" value={r.label ?? ''} onChange={(e) => set(i, { label: e.target.value })} placeholder="Breakfast menu" />
            </Field>
            <Field label="Then open">
              <input className="input" value={r.target} onChange={(e) => set(i, { target: e.target.value })} placeholder="https://example.com/breakfast" inputMode="url" />
            </Field>
          </div>
          <div>
            <div className="field" style={{ marginBottom: 6 }}>On these days</div>
            <div className="days">
              {DAYS.map((d, n) => (
                <button key={d} type="button" aria-pressed={r.days?.includes(n) ?? false} onClick={() => set(i, { days: r.days?.includes(n) ? r.days.filter((x) => x !== n) : [...(r.days ?? []), n] })}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="grid-2">
            <Field label="From">
              <input className="input" type="time" value={r.from ?? ''} onChange={(e) => set(i, { from: e.target.value || undefined })} />
            </Field>
            <Field label="Until" hint="Overnight works too, e.g. 22:00 to 02:00.">
              <input className="input" type="time" value={r.to ?? ''} onChange={(e) => set(i, { to: e.target.value || undefined })} />
            </Field>
          </div>
          <div>
            <div className="field" style={{ marginBottom: 6 }}>On these devices</div>
            <div className="row" style={{ gap: 14 }}>
              {OSES.map((o) => (
                <label key={o.v} className="check">
                  <input type="checkbox" checked={r.os?.includes(o.v) ?? false} onChange={(e) => set(i, { os: e.target.checked ? [...(r.os ?? []), o.v] : (r.os ?? []).filter((x) => x !== o.v) })} />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
          <Field label="Phone language" hint="Language codes, comma separated: hi, ta, en">
            {/* Uncontrolled, so typing "hi, " keeps the comma while the list is parsed. */}
            <input className="input" defaultValue={(r.lang ?? []).join(', ')} onChange={(e) => set(i, { lang: e.target.value.toLowerCase().split(/[,\s]+/).filter(Boolean) })} />
          </Field>
        </div>
      ))}
      {rules.length < 10 && (
        <div>
          <button type="button" className="btn" onClick={() => onChange([...rules, { target: '', days: [], os: [], lang: [] }])}>
            <Plus size={16} /> Add a rule
          </button>
        </div>
      )}
    </div>
  );
}
