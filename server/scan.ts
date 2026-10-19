/** What QRaftly learns from a scan, and how it decides where a dynamic code sends someone. */

export interface Visitor {
  device: 'mobile' | 'tablet' | 'desktop' | 'bot';
  os: 'ios' | 'android' | 'windows' | 'mac' | 'linux' | 'other';
  browser: 'chrome' | 'safari' | 'firefox' | 'edge' | 'samsung' | 'other';
  /** Primary language, two letters (en, hi, te…). */
  lang: string;
}

export function parseVisitor(userAgent = '', acceptLanguage = ''): Visitor {
  const ua = userAgent.toLowerCase();
  const os: Visitor['os'] = /iphone|ipad|ipod/.test(ua) ? 'ios' : /android/.test(ua) ? 'android' : /windows/.test(ua) ? 'windows' : /mac os x|macintosh/.test(ua) ? 'mac' : /linux|cros/.test(ua) ? 'linux' : 'other';
  const bot = /bot|crawl|spider|preview|slurp|facebookexternalhit|whatsapp\/|curl|wget|python-requests|headless/.test(ua);
  const tablet = /ipad|tablet/.test(ua) || (os === 'android' && !/mobile/.test(ua));
  const device: Visitor['device'] = bot ? 'bot' : tablet ? 'tablet' : /mobi|iphone|ipod|android/.test(ua) ? 'mobile' : 'desktop';
  const browser: Visitor['browser'] = /edg\//.test(ua) ? 'edge' : /samsungbrowser/.test(ua) ? 'samsung' : /firefox|fxios/.test(ua) ? 'firefox' : /chrome|crios/.test(ua) ? 'chrome' : /safari/.test(ua) ? 'safari' : 'other';
  const lang = (/^\s*([a-z]{2,3})/i.exec(acceptLanguage)?.[1] ?? '').toLowerCase();
  return { device, os, browser, lang };
}

export interface Rule {
  label?: string;
  /** Days of the week, 0 = Sunday. */
  days?: number[];
  /** Local time window "HH:MM"–"HH:MM" in the owner's timezone; may wrap past midnight. */
  from?: string;
  to?: string;
  os?: Visitor['os'][];
  lang?: string[];
  target: string;
}

/** The weekday and minutes since midnight at `at` in `timeZone`. */
export function localTime(at: number, timeZone: string): { day: number; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const toMinutes = (hm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

export function ruleMatches(rule: Rule, v: Visitor, at: number, timeZone: string): boolean {
  if (rule.os?.length && !rule.os.includes(v.os)) return false;
  if (rule.lang?.length && !rule.lang.includes(v.lang)) return false;
  if (rule.days?.length || rule.from || rule.to) {
    const t = localTime(at, timeZone);
    if (rule.days?.length && !rule.days.includes(t.day)) return false;
    if (rule.from && rule.to) {
      const a = toMinutes(rule.from);
      const b = toMinutes(rule.to);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      const inside = a <= b ? t.minutes >= a && t.minutes < b : t.minutes >= a || t.minutes < b; // wraps midnight
      if (!inside) return false;
    }
  }
  return true;
}

/** The destination for this visitor: the first matching rule, else the default. */
export function chooseTarget(defaultTarget: string, rules: Rule[], v: Visitor, at: number, timeZone: string): { target: string; rule: number } {
  for (let i = 0; i < rules.length; i++) if (ruleMatches(rules[i], v, at, timeZone)) return { target: rules[i].target, rule: i };
  return { target: defaultTarget, rule: -1 };
}

export interface Security {
  pinHash?: string | null;
  /** Epoch ms after which the code stops working. */
  expiresAt?: number | null;
  /** Stop after this many successful scans (1 = single use). */
  maxScans?: number | null;
}

export type Blocked = 'off' | 'expired' | 'limit';

export function blockedReason(active: boolean, sec: Security, scansSoFar: number, now: number): Blocked | null {
  if (!active) return 'off';
  if (sec.expiresAt && now > sec.expiresAt) return 'expired';
  if (sec.maxScans && scansSoFar >= sec.maxScans) return 'limit';
  return null;
}
