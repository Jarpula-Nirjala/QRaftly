import express, { type Request, type Response } from 'express';
import { buildPayload, medicalText, normaliseUrl, vcard, type ContactData, type MedicalData, type PayloadData, type QrType } from '../shared/payloads.ts';
import { encodeText } from '../shared/qr/encode.ts';
import { rasterize } from '../shared/qr/raster.ts';
import { DEFAULT_DESIGN, type Design } from '../shared/qr/render.ts';
import type { AppCtx } from './context.ts';
import { headerCountry, lookupCountry } from './geo.ts';
import { HttpError, clientIp, newId, newSlug, rateLimit, requireUser, str } from './http.ts';
import { encodePng } from './png.ts';
import { blockedReason, chooseTarget, localTime, parseVisitor, type Rule, type Security } from './scan.ts';
import { checkTag, hashSecret, tag, verifySecret } from './security.ts';

export type Kind = 'static' | 'dynamic' | 'profile' | 'medical';
const KINDS: Kind[] = ['static', 'dynamic', 'profile', 'medical'];
const TYPES: QrType[] = ['url', 'text', 'wifi', 'upi', 'whatsapp', 'sms', 'email', 'phone', 'event', 'geo', 'vcard', 'medical'];

interface Row {
  id: string;
  user_id: string;
  slug: string;
  kind: Kind;
  type: QrType;
  title: string;
  data: Record<string, unknown>;
  design: Partial<Design>;
  rules: Rule[];
  security: Security & { privatePinHash?: string | null };
  timezone: string;
  scan_count: number;
  active: boolean;
  created_at: number;
  updated_at: number;
}

// ------------------------------------------------------------- validation

const DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

function cleanDesign(raw: unknown): Partial<Design> {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Partial<Design> = {};
  for (const k of ['fg', 'bg', 'fg2', 'eyeColor'] as const) if (typeof d[k] === 'string' && COLOR.test(d[k] as string)) out[k] = d[k] as string;
  if (['square', 'rounded', 'dots', 'classy', 'fluid'].includes(d.dots as string)) out.dots = d.dots as Design['dots'];
  if (['square', 'rounded', 'circle', 'leaf'].includes(d.eyes as string)) out.eyes = d.eyes as Design['eyes'];
  if (typeof d.margin === 'number') out.margin = Math.max(0, Math.min(10, Math.round(d.margin)));
  if (typeof d.logoScale === 'number') out.logoScale = Math.max(0.1, Math.min(0.3, d.logoScale));
  if (typeof d.logo === 'string' && d.logo.length < 300_000 && DATA_URL.test(d.logo)) out.logo = d.logo;
  if (typeof d.transparent === 'boolean') out.transparent = d.transparent;
  return out;
}

function cleanRules(raw: unknown): Rule[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).map((x, i) => {
    const r = (x ?? {}) as Record<string, unknown>;
    let target: string;
    try {
      target = normaliseUrl(str(r.target, 2000));
    } catch {
      throw new HttpError(400, `Rule ${i + 1}: enter a valid link.`);
    }
    const hm = (v: unknown) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined);
    const rule: Rule = { target, label: str(r.label, 60) || undefined };
    if (Array.isArray(r.days)) rule.days = [...new Set(r.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))];
    if (hm(r.from) && hm(r.to)) [rule.from, rule.to] = [hm(r.from), hm(r.to)];
    if (Array.isArray(r.os)) rule.os = r.os.filter((o): o is NonNullable<Rule['os']>[number] => ['ios', 'android', 'windows', 'mac', 'linux'].includes(o as string));
    if (Array.isArray(r.lang)) rule.lang = r.lang.filter((l): l is string => typeof l === 'string' && /^[a-z]{2,3}$/.test(l)).slice(0, 10);
    if (!rule.days?.length && !rule.from && !rule.os?.length && !rule.lang?.length) throw new HttpError(400, `Rule ${i + 1}: choose at least one condition (time, day, phone type or language).`);
    return rule;
  });
}

const s = (o: Record<string, unknown>, k: string, max = 200) => str(o[k], max).trim() || undefined;

function cleanContact(o: Record<string, unknown>): ContactData {
  return { firstName: s(o, 'firstName', 80) ?? '', lastName: s(o, 'lastName', 80), org: s(o, 'org', 120), title: s(o, 'title', 120), phone: s(o, 'phone', 40), email: s(o, 'email', 200), website: s(o, 'website', 300), address: s(o, 'address', 300), note: s(o, 'note', 500) };
}
function cleanMedical(o: Record<string, unknown>): MedicalData {
  return { name: s(o, 'name', 80) ?? '', bloodGroup: s(o, 'bloodGroup', 10), allergies: s(o, 'allergies', 300), conditions: s(o, 'conditions', 300), medicines: s(o, 'medicines', 300), contactName: s(o, 'contactName', 80), contactPhone: s(o, 'contactPhone', 40) };
}

/** Validated data for each kind of code (throws a 400 with a readable message). */
function cleanData(kind: Kind, type: QrType, raw: unknown): Record<string, unknown> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  try {
    if (kind === 'dynamic') return { url: normaliseUrl(str(o.url, 2000)) };
    if (kind === 'profile') {
      const c = cleanContact(o);
      vcard(c); // validates
      const links = Array.isArray(o.links)
        ? o.links.slice(0, 8).map((l) => {
            const x = (l ?? {}) as Record<string, unknown>;
            return { label: str(x.label, 40).trim() || 'Link', url: normaliseUrl(str(x.url, 500)) };
          })
        : [];
      const avatar = typeof o.avatar === 'string' && o.avatar.length < 250_000 && DATA_URL.test(o.avatar) ? o.avatar : undefined;
      return { ...c, bio: s(o, 'bio', 500), links, avatar, accent: typeof o.accent === 'string' && COLOR.test(o.accent) ? o.accent : '#1f3a68' };
    }
    if (kind === 'medical') {
      const pub = cleanMedical((o.public ?? {}) as Record<string, unknown>);
      medicalText(pub);
      const p = (o.private ?? {}) as Record<string, unknown>;
      return { public: pub, private: { notes: s(p, 'notes', 2000), doctor: s(p, 'doctor', 200), insurance: s(p, 'insurance', 200), address: s(p, 'address', 300) } };
    }
    if (!TYPES.includes(type)) throw new Error('Unknown QR type.');
    const clean: Record<string, unknown> = { type };
    for (const [k, v] of Object.entries(o)) if (k !== 'type' && (typeof v === 'string' || typeof v === 'boolean')) clean[k] = typeof v === 'string' ? v.slice(0, 2000) : v;
    buildPayload(clean as unknown as PayloadData);
    return clean;
  } catch (e) {
    throw new HttpError(400, e instanceof HttpError ? e.message : (e as Error).message);
  }
}

// ------------------------------------------------------------- shaping

/** What the QR code itself contains. */
export function contentOf(row: Pick<Row, 'kind' | 'slug' | 'data' | 'type'>, publicUrl: string): string {
  const short = `${publicUrl}/r/${row.slug}`;
  if (row.kind === 'static') return buildPayload(row.data as unknown as PayloadData);
  if (row.kind === 'medical') return medicalText((row.data.public ?? {}) as MedicalData, short);
  return short;
}

function toApi(row: Row, publicUrl: string) {
  const { pinHash, privatePinHash, ...sec } = row.security;
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    type: row.type,
    title: row.title,
    data: row.data,
    design: { ...DEFAULT_DESIGN, ...row.design },
    rules: row.rules,
    security: { ...sec, hasPin: !!pinHash, hasPrivatePin: !!privatePinHash },
    timezone: row.timezone,
    scanCount: row.scan_count,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    content: contentOf(row, publicUrl),
    shortUrl: row.kind === 'static' ? null : `${publicUrl}/r/${row.slug}`,
  };
}

function validTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

// ------------------------------------------------------------- routes

export function qrRoutes(ctx: AppCtx) {
  const r = express.Router();
  const { db } = ctx;
  const json = express.json({ limit: '1mb' });

  const own = async (res: Response, id: string): Promise<Row> => {
    const user = requireUser(res);
    const [row] = await db.query<Row>('select * from qrcodes where id = $1 and user_id = $2', [id, user.id]);
    if (!row) throw new HttpError(404, 'QR code not found.');
    return row;
  };

  async function applySecurity(current: Row['security'], raw: unknown): Promise<Row['security']> {
    const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const next: Row['security'] = { ...current };
    if (typeof b.pin === 'string' && b.pin) {
      if (!/^\d{4,8}$/.test(b.pin)) throw new HttpError(400, 'Use a PIN of 4 to 8 digits.');
      next.pinHash = await hashSecret(b.pin);
    }
    if (b.removePin === true) next.pinHash = null;
    if (typeof b.privatePin === 'string' && b.privatePin) {
      if (!/^\d{4,8}$/.test(b.privatePin)) throw new HttpError(400, 'Use a PIN of 4 to 8 digits for the private details.');
      next.privatePinHash = await hashSecret(b.privatePin);
    }
    if ('expiresAt' in b) next.expiresAt = typeof b.expiresAt === 'number' && b.expiresAt > 0 ? b.expiresAt : null;
    if ('maxScans' in b) next.maxScans = typeof b.maxScans === 'number' && b.maxScans >= 1 ? Math.min(1_000_000, Math.floor(b.maxScans)) : null;
    return next;
  }

  r.get('/api/qrs', async (_req, res) => {
    const user = requireUser(res);
    const rows = await db.query<Row>('select * from qrcodes where user_id = $1 order by updated_at desc limit 500', [user.id]);
    res.json({ qrs: rows.map((row) => toApi(row, ctx.publicUrl)) });
  });

  r.post('/api/qrs', json, rateLimit(120, 10 * 60_000), async (req, res) => {
    const user = requireUser(res);
    const kind = KINDS.includes(req.body?.kind) ? (req.body.kind as Kind) : 'static';
    const type = (kind === 'dynamic' ? 'url' : kind === 'profile' ? 'vcard' : kind === 'medical' ? 'medical' : req.body?.type) as QrType;
    const data = cleanData(kind, type, req.body?.data);
    const title = str(req.body?.title, 120).trim() || defaultTitle(kind, type, data);
    const security = await applySecurity({}, req.body?.security);
    if (kind === 'medical' && !security.privatePinHash && (data.private as Record<string, unknown>)?.notes) throw new HttpError(400, 'Set a PIN to protect the private medical details.');
    const now = Date.now();
    const id = newId();
    let slug = newSlug();
    for (let i = 0; i < 5 && (await db.query('select 1 from qrcodes where slug = $1', [slug])).length; i++) slug = newSlug();
    const [row] = await db.query<Row>(
      `insert into qrcodes (id, user_id, slug, kind, type, title, data, design, rules, security, timezone, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12) returning *`,
      [id, user.id, slug, kind, type, title, JSON.stringify(data), JSON.stringify(cleanDesign(req.body?.design)), JSON.stringify(kind === 'dynamic' ? cleanRules(req.body?.rules) : []), JSON.stringify(security), validTimezone(str(req.body?.timezone, 60) || 'UTC'), now],
    );
    res.status(201).json({ qr: toApi(row, ctx.publicUrl) });
  });

  r.get('/api/qrs/:id', async (req, res) => res.json({ qr: toApi(await own(res, req.params.id), ctx.publicUrl) }));

  r.patch('/api/qrs/:id', json, async (req, res) => {
    const row = await own(res, req.params.id);
    const b = req.body ?? {};
    const data = 'data' in b ? cleanData(row.kind, row.type, b.data) : row.data;
    const [next] = await db.query<Row>(
      `update qrcodes set title = $2, data = $3, design = $4, rules = $5, security = $6, active = $7, timezone = $8, updated_at = $9 where id = $1 returning *`,
      [
        row.id,
        str(b.title, 120).trim() || row.title,
        JSON.stringify(data),
        JSON.stringify('design' in b ? cleanDesign(b.design) : row.design),
        JSON.stringify(row.kind === 'dynamic' && 'rules' in b ? cleanRules(b.rules) : row.rules),
        JSON.stringify(await applySecurity(row.security, b.security)),
        typeof b.active === 'boolean' ? b.active : row.active,
        'timezone' in b ? validTimezone(str(b.timezone, 60)) : row.timezone,
        Date.now(),
      ],
    );
    res.json({ qr: toApi(next, ctx.publicUrl) });
  });

  r.delete('/api/qrs/:id', async (req, res) => {
    const row = await own(res, req.params.id);
    await db.query('delete from qrcodes where id = $1', [row.id]);
    res.json({ ok: true });
  });

  /** A PNG of the code drawn by our own encoder and PNG writer (colours from the design; logos are added in the browser). */
  r.get('/api/qrs/:id/png', async (req, res) => {
    const row = await own(res, req.params.id);
    const design = { ...DEFAULT_DESIGN, ...row.design };
    const qr = encodeText(contentOf(row, ctx.publicUrl), { ecl: design.logo ? 'H' : 'M' });
    const scale = Math.max(2, Math.min(40, Number(req.query.scale) || 12));
    const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const img = rasterize(qr.modules, scale, design.margin, hex(design.fg), hex(design.bg));
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${row.title.replace(/[^\w.-]+/g, '-').slice(0, 60) || 'qr'}.png"`);
    res.send(encodePng(img.width, img.height, img.rgba));
  });

  r.get('/api/qrs/:id/stats', async (req, res) => {
    const row = await own(res, req.params.id);
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
    const since = Date.now() - days * 86_400_000;
    const scans = await db.query<{ at: number; visitor: string; device: string; os: string; browser: string; lang: string; country: string; outcome: string; target: string }>(
      'select at, visitor, device, os, browser, lang, country, outcome, target from scans where qr_id = $1 and at >= $2 order by at desc limit 50000',
      [row.id, since],
    );
    res.json(aggregate(scans, days, row.timezone));
  });

  r.get('/api/qrs/:id/scans.csv', async (req, res) => {
    const row = await own(res, req.params.id);
    const scans = await db.query<Record<string, string | number>>('select at, device, os, browser, lang, country, outcome, target from scans where qr_id = $1 order by at desc limit 100000', [row.id]);
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ['time,device,os,browser,language,country,outcome,destination', ...scans.map((x) => [new Date(Number(x.at)).toISOString(), x.device, x.os, x.browser, x.lang, x.country, x.outcome, x.target].map(cell).join(','))];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="scans-${row.slug}.csv"`);
    res.send(lines.join('\n'));
  });

  // ---------------------------------------------------------- scanning

  /** Records a scan without slowing the redirect: the country is looked up afterwards. */
  function recordScan(row: Row, req: Request, outcome: string, target = '') {
    const v = parseVisitor(req.headers['user-agent'], req.headers['accept-language']);
    const ip = clientIp(req);
    const day = new Date().toISOString().slice(0, 10);
    const visitor = tag(ctx.keys, 'visitor', `${ip}|${req.headers['user-agent'] ?? ''}|${day}`);
    const country = headerCountry(req);
    void (async () => {
      const c = country || (ctx.geo ? await lookupCountry(ip) : '');
      await db.query('insert into scans (qr_id, at, visitor, device, os, browser, lang, country, outcome, target) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [
        row.id,
        Date.now(),
        visitor,
        v.device,
        v.os,
        v.browser,
        v.lang,
        c,
        outcome,
        target.slice(0, 500),
      ]);
    })().catch(() => {});
    return v;
  }

  /** Where a successful scan goes. */
  const destination = (row: Row, v: ReturnType<typeof parseVisitor>) =>
    row.kind === 'dynamic' ? chooseTarget(String(row.data.url), row.rules, v, Date.now(), row.timezone).target : `/${row.kind === 'profile' ? 'p' : 'm'}/${row.slug}`;

  /** Counts a scan, refusing it once the scan limit is reached (one SQL statement, so two scans at once cannot both pass). */
  const consume = async (row: Row) =>
    (await db.query('update qrcodes set scan_count = scan_count + 1 where id = $1 and active and ($2::int is null or scan_count < $2::int) returning scan_count', [row.id, row.security.maxScans ?? null])).length > 0;

  const unlockToken = (slug: string) => {
    const exp = Date.now() + 30 * 60_000;
    return `${exp}.${tag(ctx.keys, 'unlock', `${slug}:${exp}`)}`;
  };
  const validUnlock = (slug: string, token: string) => {
    const [exp, t] = token.split('.');
    return Number(exp) > Date.now() && !!t && checkTag(ctx.keys, 'unlock', `${slug}:${exp}`, t);
  };

  r.get('/r/:slug', async (req, res) => {
    const [row] = await db.query<Row>('select * from qrcodes where slug = $1', [req.params.slug]);
    if (!row || row.kind === 'static') return res.redirect(302, '/x/missing');
    res.setHeader('Cache-Control', 'no-store');
    const blocked = blockedReason(row.active, row.security, row.scan_count, Date.now());
    if (blocked) {
      recordScan(row, req, `blocked-${blocked}`);
      return res.redirect(302, `/x/${blocked}`);
    }
    if (row.security.pinHash) return res.redirect(302, `/g/${row.slug}`);
    const v = parseVisitor(req.headers['user-agent'], req.headers['accept-language']);
    // Link previews (WhatsApp, Slack…) must not use up a limited code.
    if (v.device === 'bot') {
      if (row.security.maxScans) return res.redirect(302, `/g/${row.slug}`);
      const target = destination(row, v);
      recordScan(row, req, 'bot', target);
      return res.redirect(302, target);
    }
    if (!(await consume(row))) {
      recordScan(row, req, 'blocked-limit');
      return res.redirect(302, '/x/limit');
    }
    const target = destination(row, v);
    recordScan(row, req, 'ok', target);
    res.redirect(302, target);
  });

  /** What the gate page shows before someone enters a PIN or confirms a single-use scan. */
  r.get('/api/r/:slug', async (req, res) => {
    const [row] = await db.query<Row>('select * from qrcodes where slug = $1', [req.params.slug]);
    if (!row || row.kind === 'static') throw new HttpError(404, 'This QR code does not exist.');
    const blocked = blockedReason(row.active, row.security, row.scan_count, Date.now());
    res.json({ title: row.title, kind: row.kind, needsPin: !!row.security.pinHash, blocked, scansLeft: row.security.maxScans ? Math.max(0, row.security.maxScans - row.scan_count) : null });
  });

  r.post('/api/r/:slug/unlock', express.json(), rateLimit(10, 10 * 60_000), async (req, res) => {
    const [row] = await db.query<Row>('select * from qrcodes where slug = $1', [req.params.slug]);
    if (!row || row.kind === 'static') throw new HttpError(404, 'This QR code does not exist.');
    const blocked = blockedReason(row.active, row.security, row.scan_count, Date.now());
    if (blocked) throw new HttpError(410, blocked === 'expired' ? 'This QR code has expired.' : blocked === 'limit' ? 'This QR code has already been used.' : 'This QR code has been switched off.');
    if (row.security.pinHash && !(await verifySecret(str(req.body?.pin, 20), row.security.pinHash))) {
      recordScan(row, req, 'denied');
      throw new HttpError(403, 'That PIN is not right.');
    }
    if (!(await consume(row))) throw new HttpError(410, 'This QR code has already been used.');
    const v = recordScan(row, req, 'ok');
    const target = destination(row, v);
    res.json({ target: row.kind === 'dynamic' ? target : `${target}?k=${unlockToken(row.slug)}` });
  });

  // ---------------------------------------------------------- hosted pages

  const publicRow = async (req: Request): Promise<Row> => {
    const [row] = await db.query<Row>('select * from qrcodes where slug = $1', [req.params.slug]);
    if (!row || (row.kind !== 'profile' && row.kind !== 'medical')) throw new HttpError(404, 'This page does not exist.');
    if (!row.active || (row.security.expiresAt && Date.now() > row.security.expiresAt)) throw new HttpError(410, 'This page is no longer available.');
    if (row.security.pinHash && !validUnlock(row.slug, str(req.query.k, 200))) throw new HttpError(403, 'Scan the QR code and enter its PIN to open this page.');
    return row;
  };

  r.get('/api/public/:slug', async (req, res) => {
    const row = await publicRow(req);
    const data = row.kind === 'medical' ? { public: row.data.public, hasPrivate: !!row.security.privatePinHash } : row.data;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ kind: row.kind, title: row.title, data, design: { ...DEFAULT_DESIGN, ...row.design } });
  });

  r.get('/api/public/:slug/vcard', async (req, res) => {
    const row = await publicRow(req);
    if (row.kind !== 'profile') throw new HttpError(404, 'No contact card here.');
    const c = row.data as unknown as ContactData;
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${[c.firstName, c.lastName].filter(Boolean).join('-').replace(/[^\w-]+/g, '') || 'contact'}.vcf"`);
    res.send(vcard(c));
  });

  r.post('/api/public/:slug/private', express.json(), rateLimit(10, 10 * 60_000), async (req, res) => {
    const row = await publicRow(req);
    if (row.kind !== 'medical' || !row.security.privatePinHash) throw new HttpError(404, 'No private details here.');
    if (!(await verifySecret(str(req.body?.pin, 20), row.security.privatePinHash))) throw new HttpError(403, 'That PIN is not right.');
    res.json({ private: row.data.private });
  });

  return r;
}

function defaultTitle(kind: Kind, type: QrType, data: Record<string, unknown>): string {
  if (kind === 'profile') return `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim() || 'Profile';
  if (kind === 'medical') return `Emergency card: ${(data.public as MedicalData)?.name ?? ''}`.trim();
  if (kind === 'dynamic') return new URL(String(data.url)).hostname;
  const names: Record<QrType, string> = { url: 'Link', text: 'Text', wifi: 'Wi-Fi', upi: 'UPI payment', whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', phone: 'Phone', event: 'Event', geo: 'Location', vcard: 'Contact', medical: 'Emergency card' };
  return names[type];
}

/** Totals and breakdowns for the analytics page; times are bucketed in the owner's timezone. */
export function aggregate(scans: Array<{ at: number; visitor: string; device: string; os: string; browser: string; lang: string; country: string; outcome: string; target: string }>, days: number, tz: string) {
  const ok = scans.filter((x) => x.outcome === 'ok');
  const count = (key: keyof (typeof scans)[number]) => {
    const m = new Map<string, number>();
    for (const x of ok) m.set(String(x[key]) || 'unknown', (m.get(String(x[key]) || 'unknown') ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
  };
  const dayKey = (at: number) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  const byDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) byDay.set(dayKey(Date.now() - i * 86_400_000), 0);
  const byHour = new Array<number>(24).fill(0);
  for (const x of ok) {
    const k = dayKey(x.at);
    if (byDay.has(k)) byDay.set(k, (byDay.get(k) ?? 0) + 1);
    byHour[Math.floor(localTime(x.at, tz).minutes / 60)]++;
  }
  const blocked = scans.filter((x) => x.outcome.startsWith('blocked') || x.outcome === 'denied').length;
  return {
    total: ok.length,
    unique: new Set(ok.map((x) => x.visitor)).size,
    blocked,
    bots: scans.filter((x) => x.outcome === 'bot').length,
    byDay: [...byDay].map(([day, n]) => ({ day, n })),
    byHour,
    os: count('os'),
    device: count('device'),
    browser: count('browser'),
    country: count('country'),
    lang: count('lang'),
    targets: count('target'),
    recent: scans.slice(0, 25).map((x) => ({ at: x.at, device: x.device, os: x.os, browser: x.browser, country: x.country, outcome: x.outcome })),
  };
}
