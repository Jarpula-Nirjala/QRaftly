import type { Request } from 'express';

/**
 * The visitor's country for analytics. A CDN header is used when present; otherwise a free lookup service
 * (ip-api.com) is asked, after the visitor has already been redirected, with results cached. Only the
 * two-letter country is kept, never the IP address.
 */
const cache = new Map<string, { country: string; at: number }>();

const isPrivate = (ip: string) => !ip || /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd|fe80|::ffff:(127|10|192\.168)\.)/i.test(ip);

export function headerCountry(req: Request): string {
  const h = String(req.headers['cf-ipcountry'] ?? req.headers['x-vercel-ip-country'] ?? req.headers['x-country'] ?? '').toUpperCase();
  return /^[A-Z]{2}$/.test(h) && h !== 'XX' ? h : '';
}

export async function lookupCountry(ip: string): Promise<string> {
  const clean = ip.replace(/^::ffff:/, '');
  if (isPrivate(ip) || isPrivate(clean)) return '';
  const hit = cache.get(clean);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.country;
  try {
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(clean)}?fields=status,countryCode`, { signal: AbortSignal.timeout(2000) });
    const j = (await res.json()) as { status?: string; countryCode?: string };
    const country = j.status === 'success' && /^[A-Z]{2}$/.test(j.countryCode ?? '') ? j.countryCode! : '';
    cache.set(clean, { country, at: Date.now() });
    if (cache.size > 20_000) cache.clear();
    return country;
  } catch {
    return '';
  }
}
