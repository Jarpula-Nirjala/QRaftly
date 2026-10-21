import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const SESSION_COOKIE = 'qrf_session';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function currentUser(res: Response): SessionUser | null {
  return (res.locals.user as SessionUser | null) ?? null;
}

export function requireUser(res: Response): SessionUser {
  const u = currentUser(res);
  if (!u) throw new HttpError(401, 'Please sign in.');
  return u;
}

/** A string from untrusted input, trimmed to `max` characters ('' when not a string). */
export const str = (x: unknown, max: number): string => (typeof x === 'string' ? x.slice(0, max) : '');

export const newId = (bytes = 12) => crypto.randomBytes(bytes).toString('base64url');

/** Short codes for /r/… links: no look-alike characters (0/O, 1/l/I). */
export function newSlug(length = 7): string {
  const alphabet = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(length);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

/**
 * The client's IP, for rate limits, visitor counts and the country lookup. It must not come from a header the
 * client controls: the first X-Forwarded-For entry is whatever the client sent, which let anyone dodge the
 * PIN-guessing limit. On Render, traffic arrives through Cloudflare, which sets CF-Connecting-IP to the real
 * address and overwrites any value the client sent; elsewhere Express's req.ip honours exactly the one proxy
 * hop set with 'trust proxy'.
 */
export function clientIp(req: Request, onRender = Boolean(process.env.RENDER)): string {
  const cf = req.headers['cf-connecting-ip'];
  if (onRender && typeof cf === 'string' && cf.trim()) return cf.trim();
  return req.ip || req.socket.remoteAddress || '';
}

/** A fixed-window rate limit per IP and route. */
export function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = `${clientIp(req)}|${req.baseUrl}${req.route?.path ?? req.path}`;
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) {
      h = { count: 0, reset: now + windowMs };
      hits.set(key, h);
      if (hits.size > 50_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    }
    if (++h.count > max) return next(new HttpError(429, 'Too many requests. Please wait a moment.'));
    next();
  };
}
