import { useState, type ReactNode } from 'react';
import {
  ArrowRight, BadgeCheck, BarChart3, CalendarCheck, Check, Cpu, Files, Globe2, HeartPulse, LockKeyhole, Package, Paintbrush, Route, ShieldCheck, Sparkles, UserRound, Wifi,
} from 'lucide-react';
import { DEFAULT_DESIGN, type Design } from '../../../shared/qr/render.ts';
import { Link } from '../router.tsx';
import { DesignPanel, PayloadForm, payloadOf, QrPreview, TYPES, type StaticType } from '../studio.tsx';
import { Footer, useToast } from '../ui.tsx';
import { DashboardScene, EncoderScene, GlobeScene, PackagingScene, PedestalScene, ProfileScene, SheetsScene, ShieldScene, TicketScene } from '../visuals/mockups.tsx';
import { Daylight, FloatingBand, GlassPrism, HeroScanner, ModuleField, Particles, Tunnel } from '../visuals/scene.tsx';

const FEATURES = [
  { icon: UserRound, title: 'Living profile cards', text: 'A hosted page with your links and a one-tap "Save contact". Change jobs, keep the code.' },
  { icon: BarChart3, title: 'Editable links with analytics', text: 'Point a printed code somewhere new. Scans by day, hour, device, country and language.' },
  { icon: Route, title: 'Context-aware rules', text: 'Breakfast menu at 8 am, dinner at 8 pm; App Store for iPhones, Google Play for Android.' },
  { icon: Paintbrush, title: 'Design studio with a scan check', text: 'Colours, styles and your logo, decoded before download with the logo treated as damage.' },
  { icon: LockKeyhole, title: 'Secure and expiring codes', text: 'PIN, expiry date, scan limits and single use, safe even when two people scan at once.' },
  { icon: CalendarCheck, title: 'Event tickets and check-in', text: 'Signed tickets, a phone scanner that catches reused tickets, and a live headcount.' },
  { icon: HeartPulse, title: 'Medical emergency card', text: 'Blood group, allergies and a contact readable offline; private details behind a PIN.' },
  { icon: Wifi, title: 'Wi-Fi, UPI and quick actions', text: 'Join Wi-Fi, pay by UPI, WhatsApp, SMS, email, calendar events and map pins.' },
  { icon: Files, title: 'Bulk generation', text: 'A spreadsheet in, hundreds of codes out as PNGs or a print-ready PDF, with live progress.' },
  { icon: BadgeCheck, title: 'Scan-to-verify certificates', text: 'Signed certificates that show "Valid", or "Tampered" if a single letter changed.' },
];

function Show({ kicker, icon: Icon, title, text, points, visual, flip }: { kicker: string; icon: typeof Cpu; title: string; text: string; points: string[]; visual: ReactNode; flip?: boolean }) {
  return (
    <div className={`v-show${flip ? ' flip' : ''}`}>
      <div>
        <span className="kicker">
          <Icon size={15} /> {kicker}
        </span>
        <h3>{title}</h3>
        <p>{text}</p>
        <ul>
          {points.map((p) => (
            <li key={p}>
              <Check size={17} /> {p}
            </li>
          ))}
        </ul>
      </div>
      {visual}
    </div>
  );
}

export function Landing() {
  const toast = useToast();
  const [type, setType] = useState<StaticType>('url');
  const [data, setData] = useState<Record<string, string | boolean>>(() => ({ ...TYPES[0].blank, url: 'https://example.com' }));
  const [design, setDesign] = useState<Design>({ ...DEFAULT_DESIGN, fg: '#0b1530', dots: 'rounded', eyes: 'rounded' });
  const [tab, setTab] = useState<'content' | 'design'>('content');
  const { text, error } = payloadOf(type, data);
  const pick = (t: StaticType) => {
    setType(t);
    setData({ ...TYPES.find((x) => x.type === t)!.blank });
  };
  return (
    <>
      <section className="v-hero">
        <Daylight />
        <Particles />
        <div className="wrap v-hero-grid">
          <div className="v-hero-copy">
            <span className="eyebrow">
              <Cpu size={14} /> QR engine written from scratch
            </span>
            <h1>
              QR codes that keep working <em>after you print them</em>
            </h1>
            <p className="lead">Change where a code points without reprinting it, see who scans it, protect it with a PIN, check in event guests and issue certificates nobody can forge.</p>
            <div className="row">
              <Link to="#generator" className="btn primary lg">
                Make a free code <ArrowRight size={17} />
              </Link>
              <Link to="/signup" className="btn lg">
                Create an account
              </Link>
            </div>
            <div className="v-proof">
              <span>
                <b>160 / 160</b>versions × levels verified
              </span>
              <span>
                <b>0</b>QR libraries
              </span>
              <span>
                <b>Free</b>no watermark
              </span>
            </div>
          </div>
          <HeroScanner />
        </div>
      </section>

      <section id="generator" className="section" style={{ paddingTop: 0 }}>
        <ModuleField />
        <div className="wrap" style={{ position: 'relative' }}>
          <div className="section-title">
            <h2>Make a code in seconds</h2>
            <p>No sign-up for static codes. Every design is decoded before you download it.</p>
          </div>
          <div className="studio">
            <div className="card">
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'content'} onClick={() => setTab('content')}>
                  1. Content
                </button>
                <button role="tab" aria-selected={tab === 'design'} onClick={() => setTab('design')}>
                  2. Design
                </button>
              </div>
              {tab === 'content' ? (
                <div className="stack">
                  <div className="types" role="group" aria-label="QR type">
                    {TYPES.map(({ type: t, label, icon: Icon }) => (
                      <button key={t} type="button" aria-pressed={type === t} onClick={() => pick(t)}>
                        <Icon size={20} />
                        {label}
                      </button>
                    ))}
                  </div>
                  <hr className="divider" style={{ margin: '4px 0' }} />
                  <PayloadForm type={type} data={data} onChange={setData} />
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn" onClick={() => setTab('design')}>
                      Next: design <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <DesignPanel design={design} onChange={setDesign} onError={(m) => toast(m, true)} />
              )}
              <div className="note" style={{ marginTop: 18 }}>
                <Sparkles size={17} />
                <span>
                  Want to change the link after printing, see scan statistics or add a PIN? <Link to="/signup">Create a free account</Link> and make it a dynamic code.
                </span>
              </div>
            </div>
            <QrPreview text={text} design={design} name={type === 'url' ? 'qr-link' : `qr-${type}`} placeholder={error ?? undefined} />
          </div>
        </div>
      </section>

      <section id="features" className="section">
        <div className="wrap">
          <div className="section-title">
            <h2>A code is the start, not the end</h2>
            <p>Most generators stop at a picture. QRForge keeps your code useful for as long as it is on the wall, the menu, the badge or the box.</p>
          </div>
          <Show
            kicker="Smart profile"
            icon={UserRound}
            title="One card that never goes out of date"
            text="Print the code on your business card once. It opens a hosted profile with your photo, links and a one-tap “Save contact”, and you can change any of it later."
            points={['A vCard download that phones add straight to contacts', 'Up to 8 links, a short bio and your own colour', 'Optional PIN for a private profile']}
            visual={<ProfileScene />}
          />
          <Show
            flip
            kicker="Dynamic links"
            icon={BarChart3}
            title="See every scan, change every destination"
            text="Dynamic codes point to a short link you control. Swap the destination after printing, switch the code off, and watch scans arrive by day and hour, in your own timezone."
            points={['Unique visitors without storing IP addresses', 'Phones, browsers, countries and languages', 'Export the scan history as CSV']}
            visual={<DashboardScene />}
          />
          <Show
            kicker="Context-aware rules"
            icon={Globe2}
            title="The right page for every scan"
            text="Rules pick the destination at the moment of the scan: the time of day, the day of the week, the phone's operating system or its language. The first rule that matches wins."
            points={['Breakfast and dinner menus from one code', 'App Store for iPhones, Google Play for Android', 'A Hindi page for phones set to Hindi']}
            visual={<GlobeScene />}
          />
          <Show
            flip
            kicker="Design studio"
            icon={Paintbrush}
            title="On brand, and proven to scan"
            text="Five dot styles, four corner styles, gradients and your logo. Before you download, we decode the design ourselves with every module under the logo counted as misread."
            points={['Shows how much error correction the logo uses', 'Warns about low contrast and light-on-dark colours', 'PNG up to 2048 px, or vector SVG']}
            visual={<PedestalScene />}
          />
          <Show
            kicker="Secure codes"
            icon={ShieldCheck}
            title="Codes that know when to say no"
            text="Protect a code with a PIN, let it expire on a date, cap the number of scans or make it single-use. The scan limit is enforced in one database statement, so a single-use code really opens once."
            points={['Chat-app link previews never use up a scan', 'Expired codes show a friendly page, not an error', 'Every refused scan is counted in your analytics']}
            visual={<ShieldScene />}
          />
          <Show
            flip
            kicker="Event tickets"
            icon={CalendarCheck}
            title="A door scanner on any phone"
            text="Each guest gets a signed ticket that cannot be guessed or copied into a new one. Staff scan at the door with a phone camera; a reused ticket shows when and where it was first used."
            points={['“Already used at 7:42 pm, North gate”', 'Live headcount across every door', 'Import guests from a spreadsheet']}
            visual={<TicketScene />}
          />
          <Show
            kicker="Bulk generation"
            icon={Files}
            title="Hundreds of codes from one spreadsheet"
            text="Upload a CSV and a background job makes up to 1,000 codes, as a ZIP of PNG images or a print-ready A4 PDF with labels. Each code can be a dynamic link with its own analytics."
            points={['Live progress; leave the page and come back', 'Bad rows are listed, not silently dropped', 'Certificates in bulk, each one signed']}
            visual={<SheetsScene />}
          />
          <Show
            flip
            kicker="Products and packaging"
            icon={Package}
            title="Labels that stay useful on the shelf"
            text="Put a dynamic code on a box, a pouch or a bottle and update the page behind it: instructions, offers or a recall notice, without changing the packaging."
            points={['Vector PDF labels stay sharp at any size', 'Wi-Fi, UPI and contact codes for counters and shops', 'Medical cards readable with no signal']}
            visual={<PackagingScene />}
          />
        </div>
      </section>

      <section className="section" style={{ paddingTop: 10 }}>
        <div className="wrap">
          <div className="section-title">
            <h2>Everything in one place</h2>
          </div>
          <div className="features">
            {FEATURES.map(({ icon: Icon, title, text: t }) => (
              <article key={title} className="feature">
                <div className="ic">
                  <Icon size={21} />
                </div>
                <h3>{title}</h3>
                <p>{t}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="engine" className="section">
        <div className="wrap">
          <div className="v-show">
            <div>
              <span className="kicker">
                <Cpu size={15} /> Under the hood
              </span>
              <h3>No QR library. Every layer is our own code.</h3>
              <p>QRForge encodes, draws, checks and reads QR codes with its own implementation of the ISO/IEC 18004 standard, tested against independent decoders across all 40 versions and 4 error-correction levels.</p>
              <ul>
                {[
                  'Reed–Solomon error correction over GF(256), with a full decoder',
                  'Numeric, alphanumeric and UTF-8 modes; all 8 masks scored by the 4 penalty rules',
                  'A camera decoder for the door scanner: thresholding, finder search, perspective correction',
                  'Ed25519-signed certificates and HMAC-signed tickets',
                  'PNG, ZIP and PDF files written byte by byte',
                ].map((t) => (
                  <li key={t}>
                    <Check size={17} /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <EncoderScene />
          </div>
          <div style={{ marginTop: 40 }}>
            <FloatingBand>
              <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>Measured, not promised</h2>
              <p className="muted" style={{ margin: '8px 0 0' }}>From the project's own test suite and benchmark.</p>
              <div className="v-stats">
                <div>
                  <b>160/160</b>
                  <span>version × level combinations decoded by an independent reader</span>
                </div>
                <div>
                  <b>89%</b>
                  <span>of hard synthetic camera frames read (jsQR: 44%)</span>
                </div>
                <div>
                  <b>~15 ms</b>
                  <span>to decode a 640×480 camera frame</span>
                </div>
                <div>
                  <b>55</b>
                  <span>automated tests, plus a browser test with a fake camera</span>
                </div>
              </div>
            </FloatingBand>
          </div>
        </div>
      </section>

      <section id="privacy" className="section">
        <div className="wrap">
          <div className="v-show flip">
            <div>
              <span className="kicker">
                <ShieldCheck size={15} /> Privacy
              </span>
              <h3>Analytics without surveillance</h3>
              <p>Scans are counted without storing IP addresses. Unique visitors use a daily keyed hash that cannot be reversed or linked across days.</p>
              <ul>
                <li>
                  <Check size={17} /> No tracking cookies for people who scan your codes
                </li>
                <li>
                  <Check size={17} /> Download your scan history as CSV at any time
                </li>
                <li>
                  <Check size={17} /> Delete a code or your account and its data goes with it
                </li>
              </ul>
            </div>
            <GlassPrism />
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 10 }}>
        <div className="wrap">
          <Tunnel>
            <h2>Print once. Update forever.</h2>
            <p>Dynamic codes, tickets, certificates and bulk printing are free with an account.</p>
            <Link to="/signup" className="btn primary lg">
              Create your account <ArrowRight size={17} />
            </Link>
          </Tunnel>
        </div>
      </section>
      <Footer />
    </>
  );
}
