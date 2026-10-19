import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import type { AppCtx } from './context.ts';
import { HttpError, SESSION_COOKIE, currentUser, newId, rateLimit, readCookie, requireUser, str } from './http.ts';
import { hashSecret, sha256, verifySecret } from './security.ts';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

export function sessionCookie(req: Request, res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: SESSION_TTL_MS, path: '/' });
}

/** Resolves the signed-in user for every request and keeps an active session alive (its 30 days restart daily). */
export function sessionMiddleware(ctx: AppCtx) {
  return async (req: Request, res: Response, next: express.NextFunction) => {
    try {
      res.locals.user = null;
      const token = readCookie(req.headers.cookie, SESSION_COOKIE);
      if (token) {
        const now = Date.now();
        const [row] = await ctx.db.query<{ id: string; email: string; name: string; expires_at: number }>(
          'select u.id, u.email, u.name, s.expires_at from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > $2',
          [sha256(token), now],
        );
        if (row) {
          res.locals.user = { id: row.id, email: row.email, name: row.name };
          if (row.expires_at - now < SESSION_TTL_MS - RENEW_AFTER_MS) {
            await ctx.db.query('update sessions set expires_at = $2 where token_hash = $1', [sha256(token), now + SESSION_TTL_MS]);
            sessionCookie(req, res, token);
          }
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function authRoutes(ctx: AppCtx) {
  const r = express.Router();
  const limiter = rateLimit(20, 10 * 60_000);

  const startSession = async (req: Request, res: Response, userId: string) => {
    const token = crypto.randomBytes(32).toString('base64url');
    await ctx.db.query('insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)', [sha256(token), userId, Date.now() + SESSION_TTL_MS]);
    sessionCookie(req, res, token);
  };

  r.post('/signup', limiter, async (req, res) => {
    const name = str(req.body?.name, 80).trim();
    const email = str(req.body?.email, 200).trim().toLowerCase();
    const password = str(req.body?.password, 200);
    if (!name) throw new HttpError(400, 'Enter your name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (password.length < 8) throw new HttpError(400, 'Use at least 8 characters for your password.');
    const [exists] = await ctx.db.query('select 1 from users where email = $1', [email]);
    if (exists) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
    const id = newId();
    await ctx.db.query('insert into users (id, email, name, password_hash, created_at) values ($1, $2, $3, $4, $5)', [id, email, name, await hashSecret(password), Date.now()]);
    await startSession(req, res, id);
    res.json({ user: { id, email, name } });
  });

  r.post('/signin', limiter, async (req, res) => {
    const email = str(req.body?.email, 200).trim().toLowerCase();
    const password = str(req.body?.password, 200);
    const [u] = await ctx.db.query<{ id: string; email: string; name: string; password_hash: string }>('select id, email, name, password_hash from users where email = $1', [email]);
    if (!u || !(await verifySecret(password, u.password_hash))) throw new HttpError(401, 'Email or password is incorrect.');
    await startSession(req, res, u.id);
    res.json({ user: { id: u.id, email: u.email, name: u.name } });
  });

  r.post('/signout', async (req, res) => {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (token) await ctx.db.query('delete from sessions where token_hash = $1', [sha256(token)]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  r.get('/me', (_req, res) => res.json({ user: currentUser(res) }));

  r.delete('/me', async (_req, res) => {
    const user = requireUser(res);
    await ctx.db.query('delete from users where id = $1', [user.id]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  return r;
}
