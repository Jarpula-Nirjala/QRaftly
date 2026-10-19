/**
 * "Scan before you trust": a quick, offline look at what a QR code contains and whether it shows the usual
 * signs of a scam. It cannot prove a link is safe; it points out what deserves a second look.
 */

export type Level = 'ok' | 'info' | 'warn' | 'danger';

export interface Finding {
  level: Level;
  text: string;
}

export interface LinkReport {
  kind: 'web' | 'upi' | 'wifi' | 'phone' | 'email' | 'sms' | 'text' | 'other';
  verdict: 'safe-looking' | 'caution' | 'danger';
  /** What a person should see before opening it: the real host, payee, network… */
  summary: string;
  findings: Finding[];
}

const BRANDS = ['google', 'paypal', 'amazon', 'apple', 'microsoft', 'facebook', 'instagram', 'whatsapp', 'netflix', 'flipkart', 'paytm', 'phonepe', 'sbi', 'onlinesbi', 'hdfcbank', 'icicibank', 'axisbank', 'kotak', 'irctc', 'incometax', 'linkedin', 'github', 'outlook', 'yahoo', 'swiggy', 'zomato'];
const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rb.gy', 'ow.ly', 'shorturl.at', 'tiny.cc', 'buff.ly', 's.id', 'rebrand.ly'];
const RISKY_TLDS = ['zip', 'mov', 'xyz', 'top', 'click', 'country', 'gq', 'tk', 'ml', 'cf', 'ga', 'work', 'support', 'rest', 'loan'];

/** Levenshtein distance, capped (enough to spot "paypa1" and "arnazon"). */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Undoes common character swaps scammers use (0→o, 1→l, rn→m, vv→w). */
const unconfuse = (s: string) => s.replace(/0/g, 'o').replace(/1/g, 'l').replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/5/g, 's');

function verdictOf(f: Finding[]): LinkReport['verdict'] {
  if (f.some((x) => x.level === 'danger')) return 'danger';
  if (f.some((x) => x.level === 'warn')) return 'caution';
  return 'safe-looking';
}

export function checkLink(raw: string): LinkReport {
  const text = raw.trim();
  const f: Finding[] = [];
  if (/^upi:\/\//i.test(text)) {
    let q: URLSearchParams;
    try {
      q = new URL(text.replace(/^upi:\/\//i, 'https://upi/')).searchParams;
    } catch {
      return { kind: 'upi', verdict: 'danger', summary: 'A broken UPI link', findings: [{ level: 'danger', text: 'The UPI link is malformed.' }] };
    }
    const pa = q.get('pa') ?? '';
    const pn = q.get('pn') ?? '';
    const am = q.get('am');
    f.push({ level: 'info', text: `Pays ${pn || 'an unnamed payee'} at ${pa || 'no UPI ID'}${am ? `, ₹${am}` : ', amount typed by you'}.` });
    if (!/^[\w.-]{2,}@[a-z][a-z0-9.-]+$/i.test(pa)) f.push({ level: 'danger', text: 'The UPI ID does not look valid.' });
    if (/collect|request|mode=0?2|refund|cashback|prize|kyc/i.test(text)) f.push({ level: 'danger', text: 'Words like “refund”, “cashback” or “KYC” in a payment code are a classic scam: scanning to pay never gives you money.' });
    if (am && Number(am) > 10000) f.push({ level: 'warn', text: `A large fixed amount (₹${am}). Check it with the person before you pay.` });
    f.push({ level: 'info', text: 'Remember: you only ever need to scan a QR code to send money, never to receive it.' });
    return { kind: 'upi', verdict: verdictOf(f), summary: `UPI payment to ${pn || pa}`, findings: f };
  }
  if (/^WIFI:/i.test(text)) {
    const ssid = /S:((?:\\.|[^;])*)/.exec(text)?.[1]?.replace(/\\(.)/g, '$1') ?? '';
    const sec = /T:([^;]*)/.exec(text)?.[1] ?? 'nopass';
    f.push({ level: 'info', text: `Joins the Wi-Fi network “${ssid}”.` });
    if (/^nopass$/i.test(sec) || !sec) f.push({ level: 'warn', text: 'An open network with no password: avoid banking or logins while connected.' });
    return { kind: 'wifi', verdict: verdictOf(f), summary: `Wi-Fi network “${ssid}”`, findings: f };
  }
  if (/^(tel|sms|smsto|mailto):/i.test(text)) {
    const kind = /^tel/i.test(text) ? 'phone' : /^mailto/i.test(text) ? 'email' : 'sms';
    f.push({ level: 'info', text: `Starts ${kind === 'phone' ? 'a call to' : kind === 'email' ? 'an email to' : 'a text message to'} ${text.split(':')[1]?.split(/[?:]/)[0] ?? ''}.` });
    if (kind === 'sms' && /^smsto?:\+?\d{4,6}:/i.test(text)) f.push({ level: 'warn', text: 'A short number: texts to it may be charged at premium rates.' });
    return { kind, verdict: verdictOf(f), summary: text.split('?')[0], findings: f };
  }
  if (/^(javascript|data|vbscript|file):/i.test(text)) {
    return { kind: 'other', verdict: 'danger', summary: 'A script or file link', findings: [{ level: 'danger', text: 'This runs code or opens a file instead of a web page. Do not open it.' }] };
  }
  const looksWeb = /^https?:\/\//i.test(text) || /^[\w-]+(\.[\w-]+)+([/?#:]|$)/.test(text);
  if (!looksWeb) return { kind: 'text', verdict: 'safe-looking', summary: 'Plain text', findings: [{ level: 'ok', text: 'Just text: nothing opens when you scan it.' }] };

  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { kind: 'web', verdict: 'danger', summary: 'A broken link', findings: [{ level: 'danger', text: 'The link is malformed.' }] };
  }
  const host = u.hostname.toLowerCase();
  const labels = host.split('.');
  const tld = labels.at(-1) ?? '';
  const registrable = labels.slice(-2).join('.');
  const name = labels.length >= 2 ? labels[labels.length - 2] : host;

  if (u.protocol === 'http:') f.push({ level: 'warn', text: 'Not encrypted (http): anyone on the network could read or change what you send.' });
  else f.push({ level: 'ok', text: 'Encrypted connection (https).' });
  if (u.username || u.password || /@/.test(text.split('?')[0].replace(/^https?:\/\//i, '').split('/')[0])) f.push({ level: 'danger', text: `The part before “@” is a disguise: this really opens ${host}.` });
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) f.push({ level: 'danger', text: 'Opens a bare IP address instead of a named website, typical of phishing kits.' });
  if (host.split('.').some((l) => l.startsWith('xn--'))) f.push({ level: 'danger', text: 'Uses look-alike international letters (punycode) that can imitate a familiar name.' });
  if (/[^\x00-\x7f]/.test(text.split('/')[2] ?? '')) f.push({ level: 'danger', text: 'The website name mixes alphabets, which can imitate a familiar name.' });
  if (SHORTENERS.includes(registrable) || SHORTENERS.includes(host)) f.push({ level: 'warn', text: `A link shortener (${host}) hides the real destination. Prefer codes that show where they go.` });
  if (RISKY_TLDS.includes(tld)) f.push({ level: 'warn', text: `The “.${tld}” ending is cheap and often used for throwaway scam sites.` });
  if (labels.length > 4) f.push({ level: 'warn', text: `Many subdomains (${host}): a familiar name early in a long address can be a disguise.` });
  if (u.port && !['80', '443'].includes(u.port)) f.push({ level: 'warn', text: `An unusual port (${u.port}).` });
  if (/[?&](url|redirect|redirect_uri|next|to|dest|continue)=https?/i.test(u.search)) f.push({ level: 'warn', text: 'Passes you on to another website (an open redirect), a way to borrow a trusted name.' });
  if (text.length > 220) f.push({ level: 'info', text: 'A very long link; long links often hide tracking or a disguised destination.' });
  // Brand look-alikes: a famous name inside a different domain, or a near-miss spelling.
  // Every word of the address is compared, because scams hide the brand in a subdomain ("paypa1.com.evil.xyz").
  const words = labels.slice(0, -1).flatMap((l) => l.split('-')).filter((w) => w.length >= 3);
  for (const b of BRANDS) {
    if (name === b) continue;
    const fake = words.find((w) => {
      const plain = unconfuse(w);
      return plain === b || (b.length >= 5 && distance(plain, b) === 1);
    });
    if (fake) {
      f.push({ level: 'danger', text: `“${fake}” imitates “${b}”, but the website is really ${registrable}.` });
      break;
    }
    if (host.includes(b) && !host.endsWith(`.${b}.com`) && !registrable.startsWith(`${b}.`)) {
      f.push({ level: 'warn', text: `Mentions “${b}”, but the website is ${registrable}, not ${b}'s own domain.` });
      break;
    }
  }
  if (/\b(login|verify|kyc|update|secure|account|wallet|refund|prize|bonus|free-?gift)\b/i.test(u.pathname + u.search) && f.some((x) => x.level !== 'ok')) f.push({ level: 'warn', text: 'Asks you to log in, verify or claim something. Go to the website yourself instead.' });
  return { kind: 'web', verdict: verdictOf(f), summary: `Opens ${host}`, findings: f };
}
