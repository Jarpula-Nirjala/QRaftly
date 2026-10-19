import { useMemo, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { chooseTarget, pickSplit, type Rule, type Visitor } from '../../../../server/scan.ts';
import { Link } from '../../router.tsx';
import { QrPreview } from '../../studio.tsx';
import { DEFAULT_DESIGN } from '../../../../shared/qr/render.ts';
import { AnomalyList, CalendarHeatmap, findAnomalies, sampleYear } from '../../insights.tsx';
import { Field, Segmented, useToast } from '../../ui.tsx';
import { DashboardScene } from '../../visuals/mockups.tsx';
import { ExploreShell, Feature } from './shell.tsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ------------------------------------------------------------ 6. A/B split

function SplitDemo() {
  const [arms, setArms] = useState([
    { url: 'https://example.com/menu-photos', weight: 50 },
    { url: 'https://example.com/menu-text', weight: 50 },
  ]);
  // Uses the exact function the server runs on every scan, for 2,000 imaginary visitors.
  const shares = useMemo(() => {
    const counts = arms.map(() => 0);
    for (let i = 0; i < 2000; i++) counts[pickSplit(arms, `visitor-${i}`).arm]++;
    return counts;
  }, [arms]);
  const set = (i: number, patch: Partial<(typeof arms)[number]>) => setArms(arms.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <>
      {arms.map((a, i) => (
        <div key={i} className="demo-row" style={{ flexWrap: 'nowrap' }}>
          <b style={{ width: 22 }}>{String.fromCharCode(65 + i)}</b>
          <input className="input" value={a.url} onChange={(e) => set(i, { url: e.target.value })} aria-label={`Variant ${String.fromCharCode(65 + i)} link`} />
          <input type="range" min={1} max={100} value={a.weight} onChange={(e) => set(i, { weight: Number(e.target.value) })} aria-label="Weight" style={{ maxWidth: 120 }} />
          <span className="small" style={{ width: 34 }}>{a.weight}</span>
          {arms.length > 2 && (
            <button className="btn ghost icon sm" aria-label="Remove variant" onClick={() => setArms(arms.filter((_, j) => j !== i))}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
      {arms.length < 5 && (
        <div>
          <button className="btn sm" onClick={() => setArms([...arms, { url: 'https://example.com/variant', weight: 25 }])}>
            <Plus size={15} /> Add variant
          </button>
        </div>
      )}
      <div className="field">2,000 simulated visitors</div>
      <div className="hbars">
        {arms.map((a, i) => (
          <div key={i} className="hbar">
            <span className="name">Variant {String.fromCharCode(65 + i)}</span>
            <div className="track">
              <div className="fill" style={{ width: `${(shares[i] / 2000) * 100}%` }} />
            </div>
            <span className="n">{((shares[i] / 2000) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        The same person sees the same variant all day. Set it up on any dynamic code under <b>Content → A/B test</b>; scan counts per variant appear in its analytics.
      </p>
    </>
  );
}

// ------------------------------------------------------------ 7. country targeting & 9. simulator

const SAMPLE_RULES: Rule[] = [
  { label: 'Breakfast menu', days: [1, 2, 3, 4, 5], from: '07:00', to: '11:00', target: 'https://example.com/breakfast' },
  { label: 'UAE store', country: ['AE'], target: 'https://example.ae/store' },
  { label: 'UK store', country: ['GB'], target: 'https://example.co.uk/store' },
  { label: 'App Store', os: ['ios'], target: 'https://apps.apple.com/app/example' },
  { label: 'Hindi page', lang: ['hi'], target: 'https://example.com/hi' },
];

function simulate(v: Partial<Visitor> & { day: number; time: string }) {
  // Build a moment on the chosen weekday and time in the visitor's own clock.
  const d = new Date();
  d.setDate(d.getDate() + ((v.day - d.getDay() + 7) % 7));
  const [h, m] = v.time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  const visitor: Visitor = { device: 'mobile', os: v.os ?? 'android', browser: 'other', lang: v.lang ?? 'en', country: v.country };
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const r = chooseTarget('https://example.com/menu', SAMPLE_RULES, visitor, d.getTime(), tz);
  return { ...r, label: r.rule >= 0 ? SAMPLE_RULES[r.rule].label! : 'Main link' };
}

function CountryDemo() {
  const [country, setCountry] = useState('AE');
  const r = simulate({ country, day: 6, time: '15:00', os: 'android', lang: 'en' });
  const countries: Array<[string, string]> = [['IN', 'India'], ['AE', 'United Arab Emirates'], ['GB', 'United Kingdom'], ['US', 'United States'], ['SG', 'Singapore']];
  return (
    <>
      <Segmented label="Scanned from" value={country} onChange={setCountry} options={countries.map(([c, n]) => ({ value: c, label: <span title={n}>{c}</span> }))} />
      <dl className="kv">
        <dt>Rule that wins</dt>
        <dd>{r.label}</dd>
        <dt>Opens</dt>
        <dd className="mono">{r.target}</dd>
      </dl>
      <p className="small muted" style={{ margin: 0 }}>Countries come from the network, not from GPS, and are used only for the decision and the anonymous count. Add a country rule on any dynamic code under <b>Rules</b>.</p>
    </>
  );
}

function SimulatorDemo() {
  const [day, setDay] = useState(new Date().getDay());
  const [time, setTime] = useState('08:30');
  const [os, setOs] = useState<Visitor['os']>('android');
  const [lang, setLang] = useState('en');
  const [country, setCountry] = useState('IN');
  const r = simulate({ day, time, os, lang, country });
  return (
    <>
      <div className="grid-2">
        <Field label="Day">
          <select className="input" value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Time">
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Phone">
          <select className="input" value={os} onChange={(e) => setOs(e.target.value as Visitor['os'])}>
            <option value="android">Android</option>
            <option value="ios">iPhone</option>
            <option value="windows">Windows</option>
            <option value="mac">Mac</option>
          </select>
        </Field>
        <Field label="Language">
          <select className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="ta">Tamil</option>
            <option value="ar">Arabic</option>
          </select>
        </Field>
        <Field label="Country">
          <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
            {['IN', 'AE', 'GB', 'US'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="note good">
        <span>
          <b>{r.label}</b> wins → <span className="mono">{r.target}</span>
        </span>
      </div>
      <ol className="small" style={{ margin: 0, paddingLeft: 22, color: 'var(--ink-2)' }}>
        {SAMPLE_RULES.map((s, i) => (
          <li key={s.label} style={{ fontWeight: i === r.rule ? 700 : 400, color: i === r.rule ? 'var(--ink)' : undefined }}>
            {s.label}: {[s.days && `${s.days.map((d) => DAYS[d]).join(', ')}`, s.from && `${s.from}–${s.to}`, s.country && `from ${s.country.join(', ')}`, s.os && `on ${s.os.join(', ')}`, s.lang && `language ${s.lang.join(', ')}`].filter(Boolean).join(' · ')}
          </li>
        ))}
      </ol>
      <p className="small muted" style={{ margin: 0 }}>The same engine runs on your real codes: open a dynamic code and choose the <b>Simulate</b> tab.</p>
    </>
  );
}

// ------------------------------------------------------------ 8. UTM builder

function UtmBuilder() {
  const toast = useToast();
  const [base, setBase] = useState('https://example.com/offer');
  const [p, setP] = useState({ utm_source: 'poster', utm_medium: 'qr', utm_campaign: 'diwali-sale', utm_term: '', utm_content: 'shop-window' });
  const url = useMemo(() => {
    try {
      const u = new URL(/^https?:\/\//.test(base) ? base : `https://${base}`);
      for (const [k, v] of Object.entries(p)) if (v.trim()) u.searchParams.set(k, v.trim().toLowerCase().replace(/\s+/g, '-'));
      return u.toString();
    } catch {
      return null;
    }
  }, [base, p]);
  const f = (k: keyof typeof p, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input className="input" value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} />
    </Field>
  );
  return (
    <>
      <Field label="Your page">
        <input className="input" value={base} onChange={(e) => setBase(e.target.value)} />
      </Field>
      <div className="grid-2">
        {f('utm_source', 'Source', 'Where the code is: poster, menu, flyer')}
        {f('utm_medium', 'Medium', 'Usually “qr”')}
        {f('utm_campaign', 'Campaign')}
        {f('utm_content', 'Content', 'Which version or placement')}
      </div>
      {url && (
        <div className="code-block" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>
          {url}
        </div>
      )}
      <div className="demo-row">
        <button className="btn" disabled={!url} onClick={() => url && navigator.clipboard.writeText(url).then(() => toast('Tagged link copied.'))}>
          <Copy size={16} /> Copy link
        </button>
        <Link to="/signup" className="btn ghost">
          Make it a dynamic code
        </Link>
      </div>
      <QrPreview text={url} design={{ ...DEFAULT_DESIGN, fg: '#14243a' }} name="utm-qr" />
    </>
  );
}

// ------------------------------------------------------------ 10. heatmap

function HeatmapDemo() {
  const year = useMemo(() => sampleYear(), []);
  return (
    <>
      <CalendarHeatmap days={year} caption="Scans per day over a year (illustrative)" />
      <div className="field">What the alerts would say</div>
      <AnomalyList items={findAnomalies(year)} />
      <p className="small muted" style={{ margin: 0 }}>Illustrative data. Your own codes show their real year under <b>Analytics</b>, with these alerts.</p>
    </>
  );
}

export default function GrowthPage() {
  return (
    <ExploreShell visual={<DashboardScene />}>
      <Feature n={6} title="A/B split testing" tag="Experiments" text="Print one code and test two or more pages behind it. Each visitor is assigned a variant by a keyed hash of their anonymous daily id, so the split follows your weights and nobody flips between versions mid-visit." points={['Up to 5 variants with any weights', 'Rules still win first; the split covers everyone else', 'Per-variant scan counts in analytics']}>
        <SplitDemo />
      </Feature>
      <Feature n={7} title="Country targeting" tag="Rules" text="Send scans from the UAE to your Dubai store and from the UK to your London one, from the same printed code. Ideal for packaging and travel brochures that cross borders." points={['Combine with day, time, phone and language', 'Country is looked up once and cached', 'No GPS, no location permission prompt']}>
        <CountryDemo />
      </Feature>
      <Feature n={8} title="UTM campaign builder" tag="Marketing" text="Tag every printed code so Google Analytics knows which poster, menu or flyer brought each visitor. Build the link, copy it, and get a scan-checked code for it straight away." points={['Standard utm_source, medium, campaign and content', 'Cleans spaces and capitals for consistent reports', 'Works without an account']}>
        <UtmBuilder />
      </Feature>
      <Feature n={9} title="Scan simulator" tag="Testing" text="Before you print, check what a scan will do on a Monday breakfast from an iPhone in Dubai. The simulator runs the very same routing code as the server, rule by rule." points={['Pick the day, time, phone, language and country', 'Shows which rule wins, and why', 'On your codes it never counts as a scan']}>
        <SimulatorDemo />
      </Feature>
      <Feature n={10} title="Year-long scan heatmap" tag="Analytics" text="A calendar of a whole year of scans shows your seasons at a glance: weekends, festivals, the week a sign went missing. Unusual days are flagged automatically." points={['One square per day, darker for busier days', 'Spikes and drops flagged with a robust statistical test', 'Hover any day for its count']}>
        <HeatmapDemo />
      </Feature>
    </ExploreShell>
  );
}
