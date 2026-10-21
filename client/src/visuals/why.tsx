import { ArrowRight, BarChart3, CheckCircle2, Eye, FileCheck2, Link2, QrCode, Settings, ShieldCheck, SlidersHorizontal, XCircle } from 'lucide-react';
import { useAuth } from '../auth.tsx';
import { Link } from '../router.tsx';
import './why.css';

type Mark = 'yes' | 'no' | 'part';
const MARK_TEXT: Record<Mark, string> = { yes: 'Yes', no: 'No', part: 'Partly' };

const BENEFITS: Array<{ icon: typeof Eye; title: string; text: string; win: string }> = [
  { icon: Link2, title: 'Change destination anytime', text: 'No need to reprint. Update the link even after printing.', win: 'Save time and cost' },
  { icon: Eye, title: 'Validate before download', text: 'Check if your QR design scans correctly.', win: 'No broken QR codes' },
  { icon: BarChart3, title: 'Privacy-first analytics', text: 'Get useful insights without storing IP addresses.', win: 'Your users’ privacy is protected' },
  { icon: SlidersHorizontal, title: 'Smart rules', text: 'Show different content by time, location, language or device.', win: 'One QR, endless possibilities' },
  { icon: ShieldCheck, title: 'Secure and reliable', text: 'Link safety check before opening a code.', win: 'Safer for everyone' },
  { icon: FileCheck2, title: 'Signed tickets & certificates', text: 'Create tamper-proof event tickets, passes or certificates.', win: 'Trusted and verifiable' },
];

const STEPS: Array<{ icon: typeof Eye; title: string; text: string; tag: string; good: boolean }> = [
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

/** "Why QRaftly", in three parts: the benefits, the evolution of a code, and the comparison table. */
export function WhySection() {
  const { user } = useAuth();
  return (
    <div className="wy">
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

      {/* 4. The comparison, as the designed picture; the button in it is a real link laid over it. */}
      <div className="wy-compare">
        <img src="/bg/why-compare.jpg" width={1672} height={941} loading="lazy" decoding="async" alt="More control. More possibilities. Still free. QRaftly compared with a free generator and a paid platform." />
        <Link to={user ? '/app' : '/signup'} className="wy-compare-cta" aria-label={user ? 'Go to your codes' : 'Get started for free'} title={user ? 'Go to your codes' : 'Get started for free'} />
        <table className="sr-only">
          <caption>Features compared</caption>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Free generator</th>
              <th>Paid platform</th>
              <th>QRaftly</th>
            </tr>
          </thead>
          <tbody>
            {TABLE.map(([f, ...marks]) => (
              <tr key={f}>
                <td>{f}</td>
                {marks.map((m, i) => (
                  <td key={i}>{MARK_TEXT[m]}</td>
                ))}
              </tr>
            ))}
            <tr>
              <td>Price</td>
              <td>Free</td>
              <td>Monthly fee</td>
              <td>Free</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="wy-note">“Typical” describes common products in general, not any one company; features vary by plan.</p>
    </div>
  );
}
