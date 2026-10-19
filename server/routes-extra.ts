import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { normaliseUrl } from '../shared/payloads.ts';
import { encodeText } from '../shared/qr/encode.ts';
import { rasterize } from '../shared/qr/raster.ts';
import { DEFAULT_DESIGN, toSvg, type Design } from '../shared/qr/render.ts';
import type { Ecl } from '../shared/qr/tables.ts';
import type { AppCtx } from './context.ts';
import { HttpError, newId, newSlug, rateLimit, requireUser, str } from './http.ts';
import { encodePng } from './png.ts';
import { checkTag, sha256, tag } from './security.ts';

/**
 * Venue and trust features: feedback forms, queue tickets, view-once secret notes, and API keys with a small
 * public API for making codes from other programs.
 */
export function mount(app: express.Express, ctx: AppCtx) {
  const { db } = ctx;
  const json = express.json({ limit: '32kb' });
  const ownRow = async <T,>(res: Response, table: 'forms' | 'queues', id: string): Promise<T> => {
    const user = requireUser(res);
    const [row] = await db.query<T>(`select * from ${table} where id = $1 and user_id = $2`, [id, user.id]);
    if (!row) throw new HttpError(404, 'Not found.');
    return row;
  };

  // ---------------------------------------------------------- feedback forms

  interface FormRow {
    id: string;
    user_id: string;
    title: string;
    question: string;
    created_at: number;
  }
  const formApi = (f: FormRow) => ({ id: f.id, title: f.title, question: f.question, createdAt: f.created_at, url: `${ctx.publicUrl}/f/${f.id}` });

  app.get('/api/forms', async (_req, res) => {
    const user = requireUser(res);
    const rows = await db.query<FormRow & { n: string; avg: string | null }>(
      'select f.*, count(r.id) as n, avg(r.rating) as avg from forms f left join responses r on r.form_id = f.id where f.user_id = $1 group by f.id order by f.created_at desc',
      [user.id],
    );
    res.json({ forms: rows.map((f) => ({ ...formApi(f), responses: Number(f.n), average: f.avg === null ? null : Number(Number(f.avg).toFixed(2)) })) });
  });

  app.post('/api/forms', json, async (req, res) => {
    const user = requireUser(res);
    const title = str(req.body?.title, 100).trim();
    if (!title) throw new HttpError(400, 'Give the form a name, like "Table feedback".');
    const question = str(req.body?.question, 200).trim() || 'How was your visit?';
    const [f] = await db.query<FormRow>('insert into forms (id, user_id, title, question, created_at) values ($1, $2, $3, $4, $5) returning *', [newSlug(8), user.id, title, question, Date.now()]);
    res.status(201).json({ form: formApi(f) });
  });

  app.get('/api/forms/:id', async (req, res) => {
    const f = await ownRow<FormRow>(res, 'forms', String(req.params.id));
    const rows = await db.query<{ rating: number; comment: string; at: number }>('select rating, comment, at from responses where form_id = $1 order by at desc limit 500', [f.id]);
    const dist = [1, 2, 3, 4, 5].map((s) => rows.filter((r) => r.rating === s).length);
    const avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : null;
    res.json({ form: formApi(f), total: rows.length, average: avg === null ? null : Number(avg.toFixed(2)), distribution: dist, recent: rows.slice(0, 50) });
  });

  app.delete('/api/forms/:id', async (req, res) => {
    const f = await ownRow<FormRow>(res, 'forms', String(req.params.id));
    await db.query('delete from forms where id = $1', [f.id]);
    res.json({ ok: true });
  });

  app.get('/api/f/:id', async (req, res) => {
    const [f] = await db.query<FormRow>('select * from forms where id = $1', [String(req.params.id)]);
    if (!f) throw new HttpError(404, 'This feedback form does not exist.');
    res.json({ title: f.title, question: f.question });
  });

  app.post('/api/f/:id', json, rateLimit(20, 10 * 60_000), async (req, res) => {
    const [f] = await db.query<FormRow>('select * from forms where id = $1', [String(req.params.id)]);
    if (!f) throw new HttpError(404, 'This feedback form does not exist.');
    const rating = Math.round(Number(req.body?.rating));
    if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Choose from one to five stars.');
    await db.query('insert into responses (form_id, rating, comment, at) values ($1, $2, $3, $4)', [f.id, rating, str(req.body?.comment, 500).trim(), Date.now()]);
    res.status(201).json({ ok: true });
  });

  // ---------------------------------------------------------- queue tickets

  interface QueueRow {
    id: string;
    user_id: string;
    title: string;
    last_number: number;
    serving: number;
    created_at: number;
  }
  const waiting = async (q: QueueRow) => Number((await db.query<{ n: string }>('select count(*) as n from queue_entries where queue_id = $1 and number > $2', [q.id, q.serving]))[0].n);
  const queueApi = async (q: QueueRow) => ({ id: q.id, title: q.title, serving: q.serving, lastNumber: q.last_number, waiting: await waiting(q), url: `${ctx.publicUrl}/q/${q.id}` });

  app.get('/api/queues', async (_req, res) => {
    const user = requireUser(res);
    const rows = await db.query<QueueRow>('select * from queues where user_id = $1 order by created_at desc', [user.id]);
    res.json({ queues: await Promise.all(rows.map(queueApi)) });
  });

  app.post('/api/queues', json, async (req, res) => {
    const user = requireUser(res);
    const title = str(req.body?.title, 100).trim();
    if (!title) throw new HttpError(400, 'Give the queue a name, like "Pharmacy counter".');
    const [q] = await db.query<QueueRow>('insert into queues (id, user_id, title, created_at) values ($1, $2, $3, $4) returning *', [newSlug(8), user.id, title, Date.now()]);
    res.status(201).json({ queue: await queueApi(q) });
  });

  app.get('/api/queues/:id', async (req, res) => {
    const q = await ownRow<QueueRow>(res, 'queues', String(req.params.id));
    const entries = await db.query<{ number: number; name: string; created_at: number }>('select number, name, created_at from queue_entries where queue_id = $1 and number > $2 order by number limit 200', [q.id, q.serving]);
    res.json({ queue: await queueApi(q), entries: entries.map((e) => ({ number: e.number, name: e.name, joinedAt: e.created_at })) });
  });

  /** Calls the next person. One UPDATE, so two staff pressing "Next" at once call two different people. */
  app.post('/api/queues/:id/next', async (req, res) => {
    const q = await ownRow<QueueRow>(res, 'queues', String(req.params.id));
    const [next] = await db.query<QueueRow>('update queues set serving = serving + 1 where id = $1 and serving < last_number returning *', [q.id]);
    if (!next) throw new HttpError(409, 'Nobody is waiting.');
    await db.query('update queue_entries set called_at = $3 where queue_id = $1 and number = $2', [q.id, next.serving, Date.now()]);
    res.json({ queue: await queueApi(next) });
  });

  app.post('/api/queues/:id/reset', async (req, res) => {
    const q = await ownRow<QueueRow>(res, 'queues', String(req.params.id));
    await db.tx(async (t) => {
      await t('delete from queue_entries where queue_id = $1', [q.id]);
      await t('update queues set serving = 0, last_number = 0 where id = $1', [q.id]);
    });
    res.json({ ok: true });
  });

  app.delete('/api/queues/:id', async (req, res) => {
    const q = await ownRow<QueueRow>(res, 'queues', String(req.params.id));
    await db.query('delete from queues where id = $1', [q.id]);
    res.json({ ok: true });
  });

  app.get('/api/q/:id', async (req, res) => {
    const [q] = await db.query<QueueRow>('select * from queues where id = $1', [String(req.params.id)]);
    if (!q) throw new HttpError(404, 'This queue does not exist.');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ title: q.title, serving: q.serving, waiting: await waiting(q) });
  });

  /** Takes a number. The counter increments atomically, so no two people get the same number. */
  app.post('/api/q/:id/join', json, rateLimit(10, 10 * 60_000), async (req, res) => {
    const [q] = await db.query<QueueRow>('update queues set last_number = last_number + 1 where id = $1 returning *', [String(req.params.id)]);
    if (!q) throw new HttpError(404, 'This queue does not exist.');
    const id = newId(9);
    await db.query('insert into queue_entries (id, queue_id, number, name, created_at) values ($1, $2, $3, $4, $5)', [id, q.id, q.last_number, str(req.body?.name, 60).trim(), Date.now()]);
    res.status(201).json({ number: q.last_number, token: `${id}.${tag(ctx.keys, 'queue', id)}` });
  });

  app.get('/api/q/:id/me/:token', async (req, res) => {
    const [eid, t] = String(req.params.token).split('.');
    if (!eid || !t || !checkTag(ctx.keys, 'queue', eid, t)) throw new HttpError(404, 'This queue ticket is not valid.');
    const [e] = await db.query<{ number: number; serving: number; title: string }>('select e.number, q.serving, q.title from queue_entries e join queues q on q.id = e.queue_id where e.id = $1 and q.id = $2', [eid, String(req.params.id)]);
    if (!e) throw new HttpError(404, 'This queue ticket has been cleared.');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ title: e.title, number: e.number, serving: e.serving, ahead: Math.max(0, e.number - e.serving - 1), called: e.serving >= e.number });
  });

  // ---------------------------------------------------------- view-once notes

  /**
   * The browser encrypts the note (AES-GCM) with a key that stays in the link's #fragment, which browsers never
   * send to servers. The server stores only ciphertext, hands it out once and deletes it in the same statement.
   */
  const B64 = /^[A-Za-z0-9_-]+$/;
  app.post('/api/notes', json, rateLimit(10, 10 * 60_000), async (req, res) => {
    const ciphertext = str(req.body?.ciphertext, 12_000);
    const iv = str(req.body?.iv, 40);
    if (!B64.test(ciphertext) || !B64.test(iv) || ciphertext.length < 16) throw new HttpError(400, 'That note could not be stored.');
    const hours = Math.max(1, Math.min(168, Math.round(Number(req.body?.hours) || 24)));
    const id = newId(12);
    const now = Date.now();
    await db.query('delete from notes where expires_at < $1', [now]);
    await db.query('insert into notes (id, ciphertext, iv, created_at, expires_at) values ($1, $2, $3, $4, $5)', [id, ciphertext, iv, now, now + hours * 3_600_000]);
    res.status(201).json({ id, expiresAt: now + hours * 3_600_000 });
  });

  app.get('/api/notes/:id', async (req, res) => {
    const [n] = await db.query<{ expires_at: number }>('select expires_at from notes where id = $1 and expires_at > $2', [String(req.params.id), Date.now()]);
    res.setHeader('Cache-Control', 'no-store');
    if (!n) throw new HttpError(404, 'This note has already been read, or it has expired.');
    res.json({ expiresAt: n.expires_at });
  });

  app.post('/api/notes/:id/open', rateLimit(30, 10 * 60_000), async (req, res) => {
    const [n] = await db.query<{ ciphertext: string; iv: string }>('delete from notes where id = $1 and expires_at > $2 returning ciphertext, iv', [String(req.params.id), Date.now()]);
    res.setHeader('Cache-Control', 'no-store');
    if (!n) throw new HttpError(404, 'This note has already been read, or it has expired.');
    res.json(n);
  });

  // ---------------------------------------------------------- API keys and the public API

  app.get('/api/keys', async (_req, res) => {
    const user = requireUser(res);
    const rows = await db.query<{ id: string; label: string; prefix: string; created_at: number; last_used_at: number | null }>('select id, label, prefix, created_at, last_used_at from api_keys where user_id = $1 order by created_at desc', [user.id]);
    res.json({ keys: rows.map((k) => ({ id: k.id, label: k.label, prefix: k.prefix, createdAt: k.created_at, lastUsedAt: k.last_used_at })) });
  });

  /** A new key is shown once; only its SHA-256 hash is kept. */
  app.post('/api/keys', json, async (req, res) => {
    const user = requireUser(res);
    const [{ n }] = await db.query<{ n: string }>('select count(*) as n from api_keys where user_id = $1', [user.id]);
    if (Number(n) >= 5) throw new HttpError(400, 'You can have up to 5 keys. Delete one first.');
    const raw = `qrft_${crypto.randomBytes(24).toString('base64url')}`;
    const id = newId();
    await db.query('insert into api_keys (id, user_id, label, prefix, key_hash, created_at) values ($1, $2, $3, $4, $5, $6)', [id, user.id, str(req.body?.label, 60).trim() || 'API key', raw.slice(0, 9), sha256(raw), Date.now()]);
    res.status(201).json({ id, key: raw });
  });

  app.delete('/api/keys/:id', async (req, res) => {
    const user = requireUser(res);
    await db.query('delete from api_keys where id = $1 and user_id = $2', [String(req.params.id), user.id]);
    res.json({ ok: true });
  });

  const perKey = new Map<string, { n: number; reset: number }>();
  async function keyUser(req: Request): Promise<string> {
    const m = /^Bearer\s+(qrft_[A-Za-z0-9_-]{20,})$/.exec(String(req.headers.authorization ?? ''));
    if (!m) throw new HttpError(401, 'Send your API key as "Authorization: Bearer qrft_…".');
    const [k] = await db.query<{ id: string; user_id: string }>('update api_keys set last_used_at = $2 where key_hash = $1 returning id, user_id', [sha256(m[1]), Date.now()]);
    if (!k) throw new HttpError(401, 'That API key is not valid.');
    const now = Date.now();
    const slot = perKey.get(k.id);
    if (!slot || slot.reset < now) perKey.set(k.id, { n: 1, reset: now + 60_000 });
    else if (++slot.n > 120) throw new HttpError(429, 'Up to 120 requests a minute per key.');
    return k.user_id;
  }

  /** POST /api/v1/qr — a QR code as SVG or PNG, drawn by the same engine as the site. */
  app.post('/api/v1/qr', json, async (req, res) => {
    await keyUser(req);
    const b = req.body ?? {};
    const text = str(b.text, 2900);
    if (!text) throw new HttpError(400, 'Send "text": what the code should contain.');
    const ecl = (['L', 'M', 'Q', 'H'].includes(b.ecl) ? b.ecl : 'M') as Ecl;
    const d = (b.design ?? {}) as Record<string, unknown>;
    const hex = (v: unknown, f: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : f);
    const design: Partial<Design> = {
      fg: hex(d.fg, '#111111'),
      bg: hex(d.bg, '#ffffff'),
      dots: ['square', 'rounded', 'dots', 'classy', 'fluid'].includes(d.dots as string) ? (d.dots as Design['dots']) : 'square',
      eyes: ['square', 'rounded', 'circle', 'leaf'].includes(d.eyes as string) ? (d.eyes as Design['eyes']) : 'square',
      margin: 4,
    };
    let qr;
    try {
      qr = encodeText(text, { ecl });
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    if (b.format === 'png') {
      const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      const img = rasterize(qr.modules, Math.max(2, Math.min(30, Math.round(Number(b.scale) || 10))), 4, rgb(design.fg!), rgb(design.bg!));
      res.setHeader('Content-Type', 'image/png');
      return res.send(encodePng(img.width, img.height, img.rgba));
    }
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(toSvg(qr, { ...DEFAULT_DESIGN, ...design }));
  });

  /** POST /api/v1/links — a new dynamic code in the key owner's account; returns its short link. */
  app.post('/api/v1/links', json, async (req, res) => {
    const userId = await keyUser(req);
    let url: string;
    try {
      url = normaliseUrl(str(req.body?.url, 2000));
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const title = str(req.body?.title, 120).trim() || new URL(url).hostname;
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      const slug = newSlug();
      const ok = await db.query<{ id: string }>("insert into qrcodes (id, user_id, slug, kind, type, title, data, timezone, created_at, updated_at) values ($1, $2, $3, 'dynamic', 'url', $4, $5, 'UTC', $6, $6) on conflict (slug) do nothing returning id", [newId(), userId, slug, title, JSON.stringify({ url }), now]);
      if (ok.length) return res.status(201).json({ id: ok[0].id, shortUrl: `${ctx.publicUrl}/r/${slug}`, url });
    }
    throw new HttpError(500, 'Could not create a short link; try again.');
  });
}
