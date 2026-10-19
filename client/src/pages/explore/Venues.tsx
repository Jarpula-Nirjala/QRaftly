import { useMemo, useState } from 'react';
import { Printer, Star } from 'lucide-react';
import { buildPayload } from '../../../../shared/payloads.ts';
import { useAuth } from '../../auth.tsx';
import { Link } from '../../router.tsx';
import { QrSvg } from '../../studio.tsx';
import { Field, Segmented } from '../../ui.tsx';
import { TicketScene } from '../../visuals/mockups.tsx';
import { ExploreShell, Feature } from './shell.tsx';

/** "Open it in your account", or sign up first. */
function AppLink({ to, children }: { to: string; children: string }) {
  const { user } = useAuth();
  return (
    <Link to={user ? to : `/signup?next=${encodeURIComponent(to)}`} className="btn primary">
      {children}
    </Link>
  );
}

// ------------------------------------------------------------ 11. feedback

function FeedbackDemo() {
  const [stars, setStars] = useState(0);
  const [sent, setSent] = useState<number[]>([5, 4, 5, 3, 5, 4]);
  const avg = sent.reduce((a, b) => a + b, 0) / sent.length;
  return (
    <>
      <div className="grid-2">
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div className="small muted">What a guest sees after scanning</div>
          <h3 style={{ margin: '8px 0' }}>How was your dinner?</h3>
          <div className="demo-row" style={{ justifyContent: 'center' }} role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} className="btn ghost icon" aria-label={`${s} stars`} aria-checked={stars === s} role="radio" onClick={() => setStars(s)}>
                <Star size={26} fill={s <= stars ? 'var(--gold)' : 'none'} color="var(--gold)" />
              </button>
            ))}
          </div>
          <button
            className="btn primary sm"
            disabled={!stars}
            onClick={() => {
              setSent([...sent, stars]);
              setStars(0);
            }}
          >
            Send
          </button>
        </div>
        <div>
          <div className="small muted">What you see</div>
          <div className="big-number" style={{ fontSize: 56 }}>{avg.toFixed(1)}</div>
          <div className="small">average of {sent.length} ratings</div>
          <div className="hbars" style={{ marginTop: 10 }}>
            {[5, 4, 3, 2, 1].map((s) => (
              <div key={s} className="hbar">
                <span className="name">{s} ★</span>
                <div className="track">
                  <div className="fill" style={{ width: `${(sent.filter((x) => x === s).length / sent.length) * 100}%` }} />
                </div>
                <span className="n">{sent.filter((x) => x === s).length}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div>
        <AppLink to="/app/feedback">Create a feedback form</AppLink>
      </div>
    </>
  );
}

// ------------------------------------------------------------ 12. queue

function QueueDemo() {
  const [last, setLast] = useState(17);
  const [serving, setServing] = useState(14);
  const [mine, setMine] = useState<number | null>(null);
  return (
    <>
      <div className="grid-2">
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div className="small muted">Customer’s phone</div>
          {mine ? (
            <>
              <div className="small">Your number</div>
              <div className="big-number">{mine}</div>
              <div className={`verdict-chip ${serving >= mine ? 'ok' : 'warn'}`}>{serving >= mine ? 'It’s your turn: please come to the counter' : `${mine - serving - 1} ahead of you`}</div>
            </>
          ) : (
            <button
              className="btn primary"
              style={{ marginTop: 18 }}
              onClick={() => {
                setLast(last + 1);
                setMine(last + 1);
              }}
            >
              Take a number
            </button>
          )}
        </div>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div className="small muted">Counter screen</div>
          <div className="small">Now serving</div>
          <div className="big-number">{serving}</div>
          <div className="small muted">{Math.max(0, last - serving)} waiting</div>
          <button className="btn sm" style={{ marginTop: 8 }} disabled={serving >= last} onClick={() => setServing(serving + 1)}>
            Call next
          </button>
        </div>
      </div>
      <div>
        <AppLink to="/app/queues">Start a queue</AppLink>
      </div>
    </>
  );
}

// ------------------------------------------------------------ 13. Wi-Fi poster

function WifiPoster() {
  const [venue, setVenue] = useState('Café Saffron');
  const [ssid, setSsid] = useState('Saffron-Guest');
  const [password, setPassword] = useState('chai4everyone');
  const [security, setSecurity] = useState<'WPA' | 'nopass'>('WPA');
  const payload = useMemo(() => {
    try {
      return buildPayload({ type: 'wifi', ssid, password, security });
    } catch {
      return null;
    }
  }, [ssid, password, security]);
  const print = () => {
    document.body.classList.add('printing-poster');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-poster'), 500);
  };
  return (
    <>
      <div className="grid-2">
        <Field label="Venue name">
          <input className="input" value={venue} onChange={(e) => setVenue(e.target.value)} />
        </Field>
        <Field label="Network name">
          <input className="input" value={ssid} onChange={(e) => setSsid(e.target.value)} />
        </Field>
        {security === 'WPA' && (
          <Field label="Password">
            <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
        <div style={{ alignSelf: 'end' }}>
          <Segmented label="Security" value={security} onChange={setSecurity} options={[{ value: 'WPA', label: 'Password' }, { value: 'nopass', label: 'Open' }]} />
        </div>
      </div>
      <div className="poster">
        <span className="ps">Welcome to</span>
        <h3>{venue || 'Our place'}</h3>
        <div className="small" style={{ color: '#6b5a3a' }}>Free Wi-Fi: point your camera at the code</div>
        {payload && <QrSvg text={payload} className="pq" design={{ fg: '#14243a', margin: 2, dots: 'rounded', eyes: 'rounded' }} />}
        <div className="pw">
          Network <b>{ssid}</b>
          {security === 'WPA' && (
            <>
              <br />
              Password <b>{password}</b>
            </>
          )}
        </div>
      </div>
      <div>
        <button className="btn primary" onClick={print} disabled={!payload}>
          <Printer size={16} /> Print poster (A5)
        </button>
      </div>
    </>
  );
}

// ------------------------------------------------------------ 14. badges & 15. kiosk

function BadgeDemo() {
  const [name, setName] = useState('Asha Rao');
  return (
    <>
      <Field label="Guest name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="card" style={{ maxWidth: 360, padding: 0, overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg, #14243a, #2b3d5c)', color: '#fff', padding: '12px 18px', fontWeight: 700, letterSpacing: '0.08em', fontSize: 14 }}>TECH MEETUP · HALL 2</div>
        <div style={{ padding: 18, display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div className="small muted">Hello, my name is</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>{name || 'Guest'}</div>
          </div>
          <QrSvg text={`${location.origin}/t/sample-ticket`} className="mini-qr" design={{ margin: 1, fg: '#14243a' }} />
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>In your account: open an event and choose <b>Name badges (PDF)</b>. You get an A4 PDF, 8 badges per page, each with that guest’s signed ticket, so the badge doubles as the entry pass.</p>
      <div>
        <AppLink to="/app/events">Open your events</AppLink>
      </div>
    </>
  );
}

function KioskDemo() {
  return (
    <>
      <div className="card" style={{ background: '#0c0b09', color: '#faf7f0', textAlign: 'center', padding: 26, borderColor: '#2a2520' }}>
        <div style={{ fontFamily: 'var(--font-script)', fontSize: 28, color: '#d4af65' }}>Welcome to Launch Night</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 700, margin: '10px 0' }}>Hold your ticket up to the camera</div>
        <div style={{ opacity: 0.75 }}>Checked in so far: 128 of 200</div>
      </div>
      <ul className="small" style={{ margin: 0, paddingLeft: 20, color: 'var(--ink-2)' }}>
        <li>Full-screen, front camera, big friendly messages</li>
        <li>Resets itself a few seconds after each guest</li>
        <li>A reused ticket shows when it was first used, so staff can help</li>
      </ul>
      <div>
        <AppLink to="/app/events">Start a kiosk from an event</AppLink>
      </div>
    </>
  );
}

export default function VenuesPage() {
  return (
    <ExploreShell visual={<TicketScene />}>
      <Feature n={11} title="Feedback forms" tag="Hospitality" text="Put a code on every table, room or product. Guests rate from one to five stars and can leave a comment, with no app and no sign-in. You see the average, the spread and the latest comments." points={['Public form, rate-limited against spam', 'Average, distribution and recent comments', 'One code per form; print as many as you like']}>
        <FeedbackDemo />
      </Feature>
      <Feature n={12} title="Queue tickets" tag="Counters" text="Customers scan to take a number and watch their place in line on their phone, so they can wait anywhere. Staff press one button to call the next person." points={['Numbers handed out atomically: no duplicates', 'Two staff pressing “Next” together call two different people', 'Live position, refreshed every few seconds']}>
        <QueueDemo />
      </Feature>
      <Feature n={13} title="Wi-Fi posters" tag="Print" text="A ready-to-print A5 poster: your venue’s name, a scan-to-join code and the password in plain text for people without a camera app." points={['Prints on its own, without the rest of the page', 'Works for open and password networks', 'Made in your browser; your password is not sent anywhere']}>
        <WifiPoster />
      </Feature>
      <Feature n={14} title="Name-badge sheets" tag="Events" text="Print name badges for the whole guest list in one go. Each badge carries the guest’s signed ticket code, so the badge they wear is also their pass at the door." points={['A4 PDF, 8 badges per page, drawn as vectors', 'Event name and venue on every badge', 'Written by QRaftly’s own PDF writer']}>
        <BadgeDemo />
      </Feature>
      <Feature n={15} title="Self check-in kiosk" tag="Events" text="Turn a tablet at the entrance into a self check-in point. Guests hold up their ticket; the kiosk welcomes them by name and updates the live headcount every door sees." points={['Uses the same race-safe check-in as the staff scanner', 'Reads codes with our own camera decoder', 'Works on any tablet or laptop with a camera']}>
        <KioskDemo />
      </Feature>
    </ExploreShell>
  );
}
