import { ArrowRight, BarChart3, Box, CheckCircle2, Circle, Crown, Database, Eye, FileCheck2, Link2, Lock, QrCode, Settings, ShieldCheck, SlidersHorizontal, XCircle, Zap } from 'lucide-react';
import { Link } from '../router.tsx';
import './why.css';

type Mark = 'yes' | 'no' | 'part';
const Tick = ({ m }: { m: Mark }) =>
  m === 'yes' ? <CheckCircle2 className="wy-yes" size={19} aria-label="Yes" /> : m === 'no' ? <XCircle className="wy-no" size={19} aria-label="No" /> : <Circle className="wy-part" size={19} aria-label="Partly" />;

const PLANS: Array<{ name: string; sub: string; icon: typeof Box; rows: Array<[string, Mark]>; foot: string; best?: boolean }> = [
  {
    name: 'Typical Free Generator',
    sub: 'Good for one-time, basic use.',
    icon: Box,
    rows: [['Change destination after printing', 'no'], ['Scan check before download', 'no'], ['Analytics tracking', 'no'], ['Rules by time, location, language', 'no'], ['A/B testing', 'no'], ['Signed tickets / certificates', 'no'], ['Price', 'no']],
    foot: 'Free',
  },
  {
    name: 'Typical Paid Platform',
    sub: 'More features, but still limited.',
    icon: Database,
    rows: [['Change destination after printing', 'yes'], ['Scan check before download', 'yes'], ['Analytics tracking', 'yes'], ['Rules by time, location, language', 'yes'], ['A/B testing', 'yes'], ['Signed tickets / certificates', 'no'], ['Price', 'no']],
    foot: 'Monthly fee',
  },
  {
    name: 'QRaftly',
    sub: 'More control. More possibilities.',
    icon: Crown,
    best: true,
    rows: [['Change destination after printing', 'yes'], ['Scan check before download', 'yes'], ['Analytics without storing IPs', 'yes'], ['Rules by time, location, language', 'yes'], ['A/B tests on one printed code', 'yes'], ['Signed event tickets & certificates', 'yes'], ['Link safety check before opening', 'yes']],
    foot: 'Free to use',
  },
];

const BENEFITS: Array<{ icon: typeof Box; title: string; text: string; win: string }> = [
  { icon: Link2, title: 'Change destination anytime', text: 'No need to reprint. Update the link even after printing.', win: 'Save time and cost' },
  { icon: Eye, title: 'Validate before download', text: 'Check if your QR design scans correctly.', win: 'No broken QR codes' },
  { icon: BarChart3, title: 'Privacy-first analytics', text: 'Get useful insights without storing IP addresses.', win: 'Your users’ privacy is protected' },
  { icon: SlidersHorizontal, title: 'Smart rules', text: 'Show different content by time, location, language or device.', win: 'One QR, endless possibilities' },
  { icon: ShieldCheck, title: 'Secure and reliable', text: 'Link safety check before opening a code.', win: 'Safer for everyone' },
  { icon: FileCheck2, title: 'Signed tickets & certificates', text: 'Create tamper-proof event tickets, passes or certificates.', win: 'Trusted and verifiable' },
];

const STEPS: Array<{ icon: typeof Box; title: string; text: string; tag: string; good: boolean }> = [
  { icon: QrCode, title: 'Static QR', text: 'Most free tools just generate a picture that always points to the same link.', tag: 'Fixed forever', good: false },
  { icon: Link2, title: 'Dynamic QR', text: 'Paid platforms let you change the link, but advanced features are limited.', tag: 'Limited flexibility', good: false },
  { icon: Settings, title: 'Validated QR', text: 'QRaftly checks your design before download so you don’t end up with a broken code.', tag: 'Scan-ready design', good: true },
  { icon: ShieldCheck, title: 'Secure QR', text: 'Add rules, analytics, signed tickets and more — all in one place, for free.', tag: 'Built for real use', good: true },
];

const TABLE: Array<[string, Mark, Mark, Mark]> = [
  ['Change destination after printing', 'no', 'yes', 'yes'],
  ['Scan check before download', 'no', 'yes', 'yes'],
  ['Analytics (no IPs)', 'no', 'yes', 'yes'],
  ['Rules (time, location, language, device)', 'no', 'yes', 'yes'],
  ['A/B testing', 'no', 'part', 'yes'],
  ['Signed tickets & certificates', 'no', 'part', 'yes'],
  ['Link safety check', 'no', 'yes', 'yes'],
  ['Step-by-step inspection', 'no', 'yes', 'yes'],
];

/** "Why QRaftly", in four parts: the comparison cards, the benefits, the evolution of a code, and the table. */
export function WhySection() {
  return (
    <div className="wy">
      {/* 1. Three plans side by side */}
      <div className="wy-panel">
        <div className="wy-head">
          <span className="wy-kicker">Why QRaftly</span>
          <h2>
            Not just a QR generator,
            <br />
            built for real-world use.
          </h2>
          <p>Compare the usual QR tools with paid platforms and see what makes QRaftly truly different.</p>
        </div>
        <div className="wy-plans">
          {PLANS.map(({ name, sub, icon: Icon, rows, foot, best }) => (
            <div key={name} className={`wy-plan${best ? ' best' : ''}`}>
              <div className="wy-plan-head">
                <span className="wy-plan-ic">
                  <Icon size={26} />
                </span>
                <div>
                  <h3>{name}</h3>
                  <span>{sub}</span>
                </div>
              </div>
              <ul>
                {rows.map(([t, m]) => (
                  <li key={t}>
                    <Tick m={m} /> {t}
                  </li>
                ))}
              </ul>
              {best ? (
                <Link to="/signup" className="wy-cta">
                  {foot}
                </Link>
              ) : (
                <div className="wy-foot">{foot}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 2. Benefits */}
      <div className="wy-panel wy-split">
        <div className="wy-intro">
          <span className="wy-kicker">Why QRaftly</span>
          <h2>Built for more than just a scan.</h2>
          <p>QRaftly goes beyond simple QR generation. It gives you control, safety and flexibility that usual tools don’t offer.</p>
          <Link to="/#how" className="wy-btn">
            See how it works <ArrowRight size={17} />
          </Link>
          <svg className="wy-swirl" viewBox="0 0 400 140" aria-hidden="true">
            <path d="M-10 120 C 90 40, 200 150, 410 30" />
            <path d="M-10 132 C 110 60, 220 160, 410 48" />
          </svg>
        </div>
        <div className="wy-benefits">
          {BENEFITS.map(({ icon: Icon, title, text, win }) => (
            <div key={title} className="wy-benefit">
              <span className="wy-b-ic">
                <Icon size={24} />
              </span>
              <div>
                <h4>{title}</h4>
                <p>{text}</p>
              </div>
              <div className="wy-win">
                <CheckCircle2 size={20} /> {win}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. From a simple code to a smarter one */}
      <div className="wy-panel">
        <div className="wy-head">
          <span className="wy-kicker">Why QRaftly</span>
          <h2>From a simple code to a smarter experience.</h2>
          <p>QRaftly adds layers of intelligence, control and security that usual QR tools don’t provide.</p>
        </div>
        <ol className="wy-steps">
          {STEPS.map(({ icon: Icon, title, text, tag, good }, k) => (
            <li key={title} className={good && k === STEPS.length - 1 ? 'last' : ''}>
              <span className="wy-s-ic">
                <Icon size={34} />
              </span>
              <b className="wy-s-n">{String(k + 1).padStart(2, '0')}</b>
              <h4>{title}</h4>
              <p>{text}</p>
              <span className={`wy-tag${good ? ' good' : ''}`}>
                {good ? <CheckCircle2 size={18} /> : <XCircle size={18} />} {tag}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* 4. The table, on navy */}
      <div className="wy-panel wy-navy">
        <div className="wy-intro">
          <span className="wy-kicker">Why QRaftly</span>
          <h2>
            More control.
            <br />
            More possibilities.
            <br />
            Still free.
          </h2>
          <p>Everything you need from a modern QR tool — without the usual limitations.</p>
          <ul className="wy-points">
            <li>
              <span>
                <Zap size={20} />
              </span>
              <div>
                <b>Dynamic &amp; editable</b>
                Change your link anytime, even after printing.
              </div>
            </li>
            <li>
              <span>
                <Lock size={20} />
              </span>
              <div>
                <b>Private &amp; secure</b>
                No IP storage. Link safety checks.
              </div>
            </li>
            <li>
              <span>
                <BarChart3 size={20} />
              </span>
              <div>
                <b>Advanced features</b>
                Rules, analytics, A/B tests, signed tickets and more.
              </div>
            </li>
          </ul>
          <Link to="/signup" className="wy-gold">
            Get started for free <ArrowRight size={18} />
          </Link>
        </div>
        <div className="wy-table">
          <table>
            <thead>
              <tr>
                <th>Features</th>
                <th>
                  Free
                  <br />
                  Generator
                </th>
                <th>
                  Paid
                  <br />
                  Platform
                </th>
                <th className="ours">
                  <Crown size={20} />
                  <br />
                  QRaftly
                </th>
              </tr>
            </thead>
            <tbody>
              {TABLE.map(([f, a, b, c]) => (
                <tr key={f}>
                  <td>{f}</td>
                  <td>
                    <Tick m={a} />
                  </td>
                  <td>
                    <Tick m={b} />
                  </td>
                  <td className="ours">
                    <Tick m={c} />
                  </td>
                </tr>
              ))}
              <tr className="price">
                <td>Price</td>
                <td>Free</td>
                <td>Monthly fee</td>
                <td className="ours">Free</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p className="wy-note">“Typical” describes common products in general, not any one company; features vary by plan.</p>
    </div>
  );
}
