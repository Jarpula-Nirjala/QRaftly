import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import type { AppCtx } from './context.ts';
import { HttpError, SESSION_COOKIE, currentUser, newId, rateLimit, readCookie, requireUser, str } from './http.ts';
import { mailEnabled, sendMail } from './mail.ts';
import { googleAuthorizeUrl, googleEnabled, googleProfile } from './oauth.ts';
import { hashSecret, sha256, verifySecret } from './security.ts';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const STATE_COOKIE = 'qrf_oauth';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const safeNext = (x: unknown) => (typeof x === 'string' && x.startsWith('/') && !x.startsWith('//') ? x : '/app');
function newPassword(x: unknown): string {
  const password = str(x, 200);
  if (password.length < 8) throw new HttpError(400, 'Use at least 8 characters for your password.');
  return password;
}

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

  r.get('/providers', (_req, res) => res.json({ google: googleEnabled(), email: mailEnabled() }));

  r.post('/signup', limiter, async (req, res) => {
    const name = str(req.body?.name, 80).trim();
    const email = str(req.body?.email, 200).trim().toLowerCase();
    if (!name) throw new HttpError(400, 'Enter your name.');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    const password = newPassword(req.body?.password);
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
    if (u && !u.password_hash) throw new HttpError(401, 'This account signs in with Google. Choose Continue with Google, or use Forgot password to set a password.');
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

  // ------------------------------------------------------------ account settings

  type AccountRow = { id: string; email: string; name: string; password_hash: string; google_sub: string | null };
  const account = async (id: string) => {
    const [u] = await ctx.db.query<AccountRow>('select id, email, name, password_hash, google_sub from users where id = $1', [id]);
    if (!u) throw new HttpError(401, 'Please sign in.');
    return u;
  };
  const accountApi = (u: AccountRow) => ({ user: { id: u.id, email: u.email, name: u.name }, hasPassword: Boolean(u.password_hash), google: Boolean(u.google_sub) });
  /** Changing the email or password needs the current password, when the account has one. */
  const confirmPassword = async (u: AccountRow, given: unknown) => {
    if (u.password_hash && !(await verifySecret(str(given, 200), u.password_hash))) throw new HttpError(403, 'Your current password is not correct.');
  };

  r.get('/account', async (_req, res) => res.json(accountApi(await account(requireUser(res).id))));

  r.patch('/account', limiter, async (req, res) => {
    const u = await account(requireUser(res).id);
    const body = req.body ?? {};
    if (body.name !== undefined) {
      const name = str(body.name, 80).trim();
      if (!name) throw new HttpError(400, 'Enter your name.');
      await ctx.db.query('update users set name = $1 where id = $2', [name, u.id]);
    }
    if (body.email !== undefined) {
      const email = str(body.email, 200).trim().toLowerCase();
      if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
      if (email !== u.email) {
        await confirmPassword(u, body.currentPassword);
        const [taken] = await ctx.db.query('select 1 from users where email = $1 and id <> $2', [email, u.id]);
        if (taken) throw new HttpError(409, 'Another account already uses this email.');
        await ctx.db.query('update users set email = $1 where id = $2', [email, u.id]);
      }
    }
    if (body.password !== undefined) {
      const password = newPassword(body.password);
      await confirmPassword(u, body.currentPassword);
      await ctx.db.query('update users set password_hash = $1 where id = $2', [await hashSecret(password), u.id]);
      // Every other device is signed out; this one stays signed in.
      const token = readCookie(req.headers.cookie, SESSION_COOKIE) ?? '';
      await ctx.db.query('delete from sessions where user_id = $1 and token_hash <> $2', [u.id, sha256(token)]);
    }
    res.json(accountApi(await account(u.id)));
  });

  // ------------------------------------------------------------ forgotten password

  r.post('/forgot', limiter, async (req, res) => {
    const email = str(req.body?.email, 200).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    const [u] = await ctx.db.query<{ id: string; name: string; email: string }>('select id, name, email from users where email = $1', [email]);
    if (u) {
      const token = crypto.randomBytes(32).toString('base64url');
      await ctx.db.query('insert into password_resets (token_hash, user_id, expires_at) values ($1, $2, $3)', [sha256(token), u.id, Date.now() + RESET_TTL_MS]);
      const link = `${ctx.publicUrl}/reset?token=${token}`;
      await sendMail(u.email, 'Reset your QRaftly password', `Hi ${u.name},\n\nUse this link within one hour to choose a new password:\n${link}\n\nIf you did not ask for this, you can ignore this email.\n\n— QRaftly`).catch((err) => console.error(err));
    }
    // The same answer either way, so the form cannot be used to find out who has an account.
    res.json({ ok: true, delivery: mailEnabled() ? 'email' : 'log' });
  });

  r.post('/reset', limiter, async (req, res) => {
    const password = newPassword(req.body?.password);
    const [row] = await ctx.db.query<{ user_id: string }>('update password_resets set used = true where token_hash = $1 and used = false and expires_at > $2 returning user_id', [sha256(str(req.body?.token, 100)), Date.now()]);
    if (!row) throw new HttpError(400, 'This reset link is invalid or has expired. Ask for a new one.');
    await ctx.db.query('update users set password_hash = $1 where id = $2', [await hashSecret(password), row.user_id]);
    // A reset signs out every device (someone else may know the old password), then signs this one in.
    await ctx.db.query('delete from sessions where user_id = $1', [row.user_id]);
    await ctx.db.query('delete from password_resets where user_id = $1', [row.user_id]);
    await startSession(req, res, row.user_id);
    const u = await account(row.user_id);
    res.json({ user: { id: u.id, email: u.email, name: u.name } });
  });

  // ------------------------------------------------------------ Continue with Google

  const redirectUri = () => `${ctx.publicUrl}/api/auth/oauth/google/callback`;

  r.get('/oauth/google', (req, res) => {
    if (!googleEnabled()) return res.redirect(`/signin?error=${encodeURIComponent('Google sign-in is not switched on for this site yet.')}`);
    const state = crypto.randomBytes(16).toString('base64url');
    res.cookie(STATE_COOKIE, `${state}|${safeNext(req.query.next)}`, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 10 * 60_000, path: '/' });
    res.redirect(googleAuthorizeUrl(redirectUri(), state));
  });

  r.get('/oauth/google/callback', async (req, res) => {
    const fail = (msg: string) => res.redirect(`/signin?error=${encodeURIComponent(msg)}`);
    const [state, next] = (readCookie(req.headers.cookie, STATE_COOKIE) ?? '').split('|');
    res.clearCookie(STATE_COOKIE, { path: '/' });
    try {
      if (!googleEnabled()) return fail('Google sign-in is not switched on for this site yet.');
      if (req.query.error === 'access_denied') return fail('Google sign-in was cancelled.');
      if (!state || state !== req.query.state || typeof req.query.code !== 'string') return fail('Sign-in was cancelled or expired. Please try again.');
      const g = await googleProfile(req.query.code, redirectUri());
      // The Google account itself, else an account with the same (Google-verified) email, else a new account.
      let [u] = await ctx.db.query<{ id: string }>('select id from users where google_sub = $1', [g.sub]);
      if (!u) [u] = await ctx.db.query<{ id: string }>('update users set google_sub = $1 where email = $2 returning id', [g.sub, g.email]);
      if (!u) {
        u = { id: newId() };
        await ctx.db.query("insert into users (id, email, name, password_hash, google_sub, created_at) values ($1, $2, $3, '', $4, $5)", [u.id, g.email, g.name.slice(0, 80), g.sub, Date.now()]);
      }
      await startSession(req, res, u.id);
      res.redirect(safeNext(next));
    } catch (err) {
      console.error('google sign-in failed:', err);
      fail(err instanceof Error ? err.message : 'Google sign-in failed.');
    }
  });

  return r;
}
