import express from 'express';
import type { AppCtx } from './context.ts';
import { HttpError, newId, rateLimit, requireUser, str } from './http.ts';
import { signBytes, verifyBytes } from './security.ts';

/** What a certificate states. The QR code carries all of it, signed, so it can be checked even offline. */
export interface CertData {
  v: 1;
  id: string;
  recipient: string;
  title: string;
  issuer: string;
  /** YYYY-MM-DD */
  date: string;
  details?: string;
}

interface CertRow {
  id: string;
  user_id: string;
  data: CertData;
  signature: string;
  revoked: boolean;
  created_at: number;
}

/** JSON with keys in a fixed order, so the same certificate always produces the same signed bytes. */
export function canonical(d: CertData): string {
  const keys = Object.keys(d).sort() as Array<keyof CertData>;
  return JSON.stringify(Object.fromEntries(keys.filter((k) => d[k] !== undefined && d[k] !== '').map((k) => [k, d[k]])));
}

export function cleanCert(b: Record<string, unknown>, id: string): CertData {
  const recipient = str(b.recipient, 120).trim();
  const title = str(b.title, 160).trim();
  const issuer = str(b.issuer, 120).trim();
  const date = str(b.date, 10).trim() || new Date().toISOString().slice(0, 10);
  if (!recipient) throw new HttpError(400, 'Enter who the certificate is for.');
  if (!title) throw new HttpError(400, 'Enter what the certificate is for.');
  if (!issuer) throw new HttpError(400, 'Enter who is issuing it.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new HttpError(400, 'Enter the date as YYYY-MM-DD.');
  const details = str(b.details, 300).trim() || undefined;
  return { v: 1, id, recipient, title, issuer, date, details };
}

/** Issues one certificate inside an existing transaction or connection. */
export async function issueCert(ctx: AppCtx, q: AppCtx['db']['query'], userId: string, input: Record<string, unknown>) {
  const data = cleanCert(input, newId(9));
  const signature = signBytes(ctx.keys, canonical(data));
  await q('insert into certificates (id, user_id, data, signature, created_at) values ($1, $2, $3, $4, $5)', [data.id, userId, JSON.stringify(data), signature, Date.now()]);
  return { data, signature, url: certUrl(ctx, data, signature) };
}

/** The verification link inside the QR: /v/<certificate as base64url JSON>.<Ed25519 signature>. */
export const certUrl = (ctx: AppCtx, data: CertData, signature: string) => `${ctx.publicUrl}/v/${Buffer.from(canonical(data)).toString('base64url')}.${signature}`;

export type Verdict =
  | { status: 'valid'; data: CertData; issuedAt: number }
  | { status: 'revoked'; data: CertData }
  | { status: 'tampered'; data: CertData | null }
  | { status: 'invalid' };

/**
 * Checks a scanned code. The signature is checked over the canonical form of the data, so editing any field
 * (or the encoded text) makes it "tampered"; a good signature on a withdrawn or deleted certificate is "revoked".
 */
export async function verifyCode(ctx: AppCtx, code: string): Promise<Verdict> {
  const m = /([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{86})\s*$/.exec(code.trim());
  if (!m) return { status: 'invalid' };
  let data: CertData;
  try {
    data = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
    if (!data || typeof data !== 'object' || data.v !== 1 || typeof data.id !== 'string') return { status: 'invalid' };
  } catch {
    return { status: 'invalid' };
  }
  if (!verifyBytes(ctx.keys, canonical(data), m[2])) return { status: 'tampered', data };
  const [row] = await ctx.db.query<CertRow>('select * from certificates where id = $1', [data.id]);
  if (!row || row.revoked || row.signature !== m[2]) return { status: 'revoked', data };
  return { status: 'valid', data, issuedAt: row.created_at };
}

export function mount(app: express.Express, ctx: AppCtx) {
  const { db } = ctx;
  const json = express.json({ limit: '50kb' });
  const certApi = (r: CertRow) => ({ ...r.data, revoked: r.revoked, createdAt: r.created_at, url: certUrl(ctx, r.data, r.signature) });

  app.get('/api/certs', async (_req, res) => {
    const user = requireUser(res);
    const rows = await db.query<CertRow>('select * from certificates where user_id = $1 order by created_at desc limit 1000', [user.id]);
    res.json({ certs: rows.map(certApi) });
  });

  app.post('/api/certs', json, rateLimit(200, 10 * 60_000), async (req, res) => {
    const user = requireUser(res);
    const { data } = await issueCert(ctx, db.query, user.id, req.body ?? {});
    const [row] = await db.query<CertRow>('select * from certificates where id = $1', [data.id]);
    res.status(201).json({ cert: certApi(row) });
  });

  for (const [action, revoked] of [['revoke', true], ['restore', false]] as const) {
    app.post(`/api/certs/:id/${action}`, async (req, res) => {
      const user = requireUser(res);
      const [row] = await db.query<CertRow>('update certificates set revoked = $3 where id = $1 and user_id = $2 returning *', [req.params.id, user.id, revoked]);
      if (!row) throw new HttpError(404, 'Certificate not found.');
      res.json({ cert: certApi(row) });
    });
  }

  app.delete('/api/certs/:id', async (req, res) => {
    const user = requireUser(res);
    await db.query('delete from certificates where id = $1 and user_id = $2', [req.params.id, user.id]);
    res.json({ ok: true });
  });

  /** Public: anyone can check a certificate (the verify page, or a scanned link pasted in). */
  app.post('/api/verify', json, rateLimit(120, 60_000), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await verifyCode(ctx, str(req.body?.code, 4000)));
  });

  /** The public key, so a certificate can be checked without trusting this server's answer. */
  app.get('/api/certs/public-key', (_req, res) => {
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.send(ctx.keys.publicPem);
  });
}
