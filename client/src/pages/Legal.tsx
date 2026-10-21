import type { ReactNode } from 'react';
import { Link } from '../router.tsx';

const CONTACT = 'nirjala8462@gmail.com';
const UPDATED = '21 October 2026';

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="page">
      <article className="wrap legal">
        <h1>{title}</h1>
        <p className="muted">Last updated {UPDATED}</p>
        {children}
        <h2>Contact</h2>
        <p>
          Questions or requests: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </article>
    </div>
  );
}

/** The privacy policy (also the link given on Google's sign-in consent screen). */
export function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>QRaftly makes QR codes, dynamic links, event tickets and signed certificates. This page explains what it stores, why, and how to remove it.</p>

      <h2>Your account</h2>
      <ul>
        <li>Your name and email address, so you can sign in and receive password reset links.</li>
        <li>Your password, stored only as a salted scrypt hash. Nobody, including QRaftly, can read it.</li>
        <li>
          If you choose <b>Continue with Google</b>: Google shares your name, email address and a Google account id. QRaftly asks only for the basic <i>openid</i>, <i>email</i> and <i>profile</i> permissions. It cannot see your Gmail, Drive, contacts or anything else in your Google account, and it does not keep any Google access token after you sign in.
        </li>
        <li>A sign-in cookie that keeps you signed in for 30 days on that device.</li>
      </ul>

      <h2>What you create</h2>
      <p>The codes, links, events, tickets, certificates, forms and queues you make are stored so they keep working. They are yours: only you can see or change them while signed in.</p>

      <h2>People who scan your codes</h2>
      <ul>
        <li>For a dynamic code, each scan records the time, device type, operating system, browser, language, an approximate country and which link was used.</li>
        <li>IP addresses are not stored. The country is looked up from the address at the moment of the scan and the address is then discarded.</li>
        <li>Unique visitors are counted with a keyed hash that changes every day, so a visitor cannot be followed across days.</li>
        <li>No tracking cookies are set for people who scan codes.</li>
      </ul>

      <h2>What QRaftly never does</h2>
      <ul>
        <li>It does not sell or share your data, and shows no advertising.</li>
        <li>It uses no third-party analytics or trackers.</li>
      </ul>

      <h2>Services used</h2>
      <p>The site runs on Render and stores data in a Postgres database. Google handles Continue with Google. If password reset emails are switched on, they are sent through Resend.</p>

      <h2>Deleting your data</h2>
      <p>
        Delete a code and its scan history goes with it. Delete your account from <Link to="/app/account">Your account</Link> and everything in it is removed straight away. You can also download a code’s scan history as CSV at any time.
      </p>
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage title="Terms of use">
      <p>QRaftly is a free portfolio project, offered as it is. By using it you agree to these terms.</p>
      <h2>Fair use</h2>
      <ul>
        <li>Do not use QRaftly for phishing, malware, scams, spam or anything illegal. Codes and links used this way may be switched off without notice.</li>
        <li>You are responsible for what your codes point to and for the details you put on tickets and certificates.</li>
      </ul>
      <h2>No guarantee</h2>
      <p>QRaftly is provided without warranty. The service may change or stop, so keep your own copy of anything important, such as scan history exports and certificate files.</p>
      <h2>Payments</h2>
      <p>UPI codes only open your payment app with the details filled in. QRaftly never handles money; your bank and UPI app process every payment.</p>
      <p>
        See also the <Link to="/privacy">privacy policy</Link>.
      </p>
    </LegalPage>
  );
}
