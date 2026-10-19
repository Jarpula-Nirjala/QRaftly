import { useState } from 'react';
import {
  ArrowRight, BadgeCheck, BarChart3, CalendarCheck, Check, Cpu, Files, HeartPulse, LockKeyhole, Paintbrush, Route, ShieldCheck, Sparkles, UserRound, Wifi,
} from 'lucide-react';
import { DEFAULT_DESIGN, type Design } from '../../../shared/qr/render.ts';
import { Link } from '../router.tsx';
import { DesignPanel, PayloadForm, payloadOf, QrPreview, TYPES, type StaticType } from '../studio.tsx';
import { Footer, useToast } from '../ui.tsx';

const FEATURES = [
  { icon: UserRound, title: 'Living profile cards', text: 'One code for your whole professional identity: a hosted page with your links and a one-tap "Save contact" button. Change jobs, keep the code.' },
  { icon: BarChart3, title: 'Editable links with analytics', text: 'Point a printed code somewhere new at any time. See scans by day and hour, unique visitors, countries, devices and languages, without storing IP addresses.' },
  { icon: Route, title: 'Context-aware rules', text: 'The same code opens the breakfast menu at 8 am and the dinner menu at 8 pm, sends iPhones to the App Store and Android phones to Google Play, or picks a page by language.' },
  { icon: Paintbrush, title: 'Design studio with a scan check', text: 'Colours, gradients, dot and corner styles, and your logo. Every design is decoded before you download it, with the logo treated as damage, so it is proven to scan.' },
  { icon: LockKeyhole, title: 'Secure and expiring codes', text: 'Protect a code with a PIN, set an expiry date, limit the number of scans or make it single-use. Two people scanning at once cannot both get through a single-use code.' },
  { icon: CalendarCheck, title: 'Event tickets and check-in', text: 'Signed tickets for every attendee, a phone scanner at the door that catches reused tickets instantly ("already used at 7:42 pm"), and a live headcount.' },
  { icon: HeartPulse, title: 'Medical emergency card', text: 'Blood group, allergies and an emergency contact are stored in the code itself, readable with no internet. Private details stay behind a PIN.' },
  { icon: Wifi, title: 'Wi-Fi, UPI and quick actions', text: 'Join Wi-Fi without typing, pay by UPI with the amount filled in, start a WhatsApp chat, send an SMS or email, add a calendar event or open a map pin.' },
  { icon: Files, title: 'Bulk generation', text: 'Upload a spreadsheet and get hundreds of codes as a ZIP of PNGs or a print-ready PDF sheet, made by a background job with live progress.' },
  { icon: BadgeCheck, title: 'Scan-to-verify certificates', text: 'Certificates carry a digital signature in their QR code. Scan to see "Valid", or "Tampered" if a single letter was changed. Revoke any time.' },
];

export function Landing() {
  const toast = useToast();
  const [type, setType] = useState<StaticType>('url');
  const [data, setData] = useState<Record<string, string | boolean>>(() => ({ ...TYPES[0].blank, url: 'https://example.com' }));
  const [design, setDesign] = useState<Design>({ ...DEFAULT_DESIGN, fg: '#4338ca', dots: 'rounded', eyes: 'rounded' });
  const [tab, setTab] = useState<'content' | 'design'>('content');
  const { text, error } = payloadOf(type, data);
  const pick = (t: StaticType) => {
    setType(t);
    setData({ ...TYPES.find((x) => x.type === t)!.blank });
  };
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <span className="eyebrow">
            <Cpu size={14} /> QR engine written from scratch
          </span>
          <h1>
            QR codes that keep working <em>after you print them</em>
          </h1>
          <p className="lead">Change where a code points without reprinting it, see who scans it, protect it with a PIN, check in event guests and issue certificates nobody can forge.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link to="#generator" className="btn primary lg">
              Make a free code <ArrowRight size={17} />
            </Link>
            <Link to="/signup" className="btn lg">
              Create an account
            </Link>
          </div>
          <p className="small muted" style={{ marginTop: 14 }}>No sign-up needed for static codes. Free, no watermark.</p>
        </div>
      </section>

      <section id="generator" className="section" style={{ paddingTop: 24 }}>
        <div className="wrap">
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
            <h2>Ten things a QR code should be able to do</h2>
            <p>Most generators stop at a picture. QRForge keeps your code useful for as long as it is on the wall, the menu or the badge.</p>
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
        <div className="wrap engine">
          <div>
            <span className="eyebrow">
              <Cpu size={14} /> Under the hood
            </span>
            <h2 style={{ fontSize: 'clamp(25px, 3.4vw, 34px)', fontWeight: 800, marginTop: 14 }}>No QR library. Every step is our own code.</h2>
            <p className="muted" style={{ fontSize: 16 }}>
              QRForge encodes, draws, checks and reads QR codes with its own implementation of the ISO/IEC 18004 standard, tested against independent decoders across all 40 versions and 4 error-correction levels.
            </p>
          </div>
          <ul>
            {[
              'Reed–Solomon error correction over GF(256), with a full decoder (Berlekamp–Massey, Chien search, Forney)',
              'Numeric, alphanumeric and UTF-8 byte modes, block interleaving, all 8 masks scored by the 4 penalty rules',
              'A scan check that decodes every design with the logo counted as damage before you download it',
              'A camera decoder for the check-in scanner: adaptive thresholding, finder-pattern search and perspective correction',
              'Ed25519 signatures for certificates and HMAC-signed tickets, so codes cannot be forged',
              'PNG, ZIP and PDF files written byte by byte',
            ].map((t) => (
              <li key={t}>
                <Check size={17} /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="privacy" className="section">
        <div className="wrap">
          <div className="steps">
            <div className="step">
              <h3>
                <ShieldCheck size={17} style={{ verticalAlign: -3, marginRight: 6 }} />
                Private by design
              </h3>
              <p>Scans are counted without storing IP addresses. Unique visitors use a daily keyed hash that cannot be reversed or linked across days.</p>
            </div>
            <div className="step">
              <h3>Link previews do not count</h3>
              <p>When someone pastes your link into WhatsApp or Slack, the preview bot is recognised and never uses up a single-use code.</p>
            </div>
            <div className="step">
              <h3>Your codes, your account</h3>
              <p>Download your scan history as CSV at any time. Delete a code or your whole account and everything goes with it.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 10 }}>
        <div className="wrap">
          <div className="cta">
            <h2>Print once. Update forever.</h2>
            <p>Dynamic codes, tickets, certificates and bulk printing are free with an account.</p>
            <Link to="/signup" className="btn lg">
              Create your account <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
