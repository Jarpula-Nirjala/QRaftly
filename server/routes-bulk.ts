import express from 'express';
import { buildPayload, normaliseUrl, type PayloadData, type QrType } from '../shared/payloads.ts';
import { encodeText } from '../shared/qr/encode.ts';
import { rasterize } from '../shared/qr/raster.ts';
import type { AppCtx } from './context.ts';
import { csvObjects } from './csv.ts';
import type { Db } from './db.ts';
import { HttpError, newId, newSlug, rateLimit, requireUser, str } from './http.ts';
import { makeQrSheet } from './pdf.ts';
import { encodePng } from './png.ts';
import { issueCert } from './routes-certs.ts';
import { makeZip } from './zip.ts';

type JobKind = 'codes' | 'certificates';
type Format = 'zip' | 'pdf';

interface JobInput {
  kind: JobKind;
  format: Format;
  /** codes: "static" makes plain codes; "dynamic" creates editable, tracked codes in the account. */
  mode: 'static' | 'dynamic';
  type: QrType;
  labelColumn: string;
  title: string;
  color: string;
  rows: Record<string, string>[];
}

interface Item {
  label: string;
  content: string;
}

interface Report {
  items?: Item[];
  errors?: Array<{ row: number; error: string }>;
}

interface JobRow {
  id: string;
  user_id: string;
  kind: JobKind;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  total: number;
  input: JobInput;
  report: Report;
  result_file: string | null;
  error: string | null;
  attempts: number;
  created_at: number;
  updated_at: number;
}

const MAX_ROWS = 1000;
const BATCH = 25;
/** A running job that has not reported progress for this long was interrupted (e.g. the server restarted). */
const STALE_MS = 2 * 60_000;
const MAX_ATTEMPTS = 3;
const KEEP_MS = 7 * 86_400_000;
const STATIC_TYPES: QrType[] = ['url', 'text', 'wifi', 'upi', 'whatsapp', 'sms', 'email', 'phone', 'event', 'geo', 'vcard'];

/** The payload fields each CSV header may name; headers match ignoring case, spaces, "-" and "_". */
const FIELDS = ['url', 'text', 'ssid', 'password', 'security', 'hidden', 'vpa', 'name', 'amount', 'note', 'phone', 'message', 'to', 'subject', 'body', 'title', 'start', 'end', 'location', 'description', 'lat', 'lng', 'label', 'firstName', 'lastName', 'org', 'email', 'website', 'address'];
const key = (h: string) => h.toLowerCase().replace(/[\s_-]+/g, '');
const FIELD_BY_KEY = new Map(FIELDS.map((f) => [key(f), f]));

/** Turns one CSV row into payload data for `type`. */
export function rowPayload(type: QrType, row: Record<string, string>): PayloadData {
  const d: Record<string, unknown> = { type };
  for (const [h, v] of Object.entries(row)) {
    const f = FIELD_BY_KEY.get(key(h));
    if (f && v) d[f] = v;
  }
  if (type === 'wifi') {
    const sec = String(d.security ?? '').toUpperCase();
    d.security = sec === 'WEP' ? 'WEP' : sec === 'NOPASS' || sec === 'NONE' || !d.password ? 'nopass' : 'WPA';
    d.hidden = /^(true|yes|1)$/i.test(String(d.hidden ?? ''));
  }
  if (type === 'vcard' && !d.firstName && d.name) d.firstName = d.name;
  return d as unknown as PayloadData;
}

const labelOf = (input: JobInput, row: Record<string, string>, n: number) =>
  (input.labelColumn && row[input.labelColumn]) || row.label || row.name || row.recipient || row.title || Object.values(row).find(Boolean) || `Row ${n}`;

export function mount(app: express.Express, ctx: AppCtx): () => void {
  const { db } = ctx;

  // ---------------------------------------------------------- worker

  /** One row of work. Runs inside the batch's transaction, so a crash never leaves half a batch behind. */
  async function work(job: JobRow, q: Db['query'], row: Record<string, string>, n: number): Promise<Item> {
    const input = job.input;
    const label = labelOf(input, row, n).slice(0, 120);
    if (input.kind === 'certificates') {
      const cert = await issueCert(ctx, q, job.user_id, { recipient: row.recipient ?? row.name, title: row.title ?? row.course ?? row.award, issuer: row.issuer ?? input.title, date: row.date, details: row.details });
      return { label: cert.data.recipient, content: cert.url };
    }
    if (input.mode === 'dynamic') {
      const url = normaliseUrl(row.url ?? '');
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        const slug = newSlug();
        const ok = await q("insert into qrcodes (id, user_id, slug, kind, type, title, data, timezone, created_at, updated_at) values ($1, $2, $3, 'dynamic', 'url', $4, $5, 'UTC', $6, $6) on conflict (slug) do nothing returning id", [newId(), job.user_id, slug, label, JSON.stringify({ url }), now]);
        if (ok.length) return { label, content: `${ctx.publicUrl}/r/${slug}` };
      }
      throw new Error('Could not create a short link; try again.');
    }
    return { label, content: buildPayload(rowPayload(input.type, row)) };
  }

  /** Builds the download from the finished items. */
  function render(input: JobInput, report: Report): { name: string; mime: string; data: Buffer } {
    const items = report.items ?? [];
    const errors = report.errors ?? [];
    const base = (input.title || (input.kind === 'certificates' ? 'certificates' : 'qr-codes')).replace(/[^\w-]+/g, '-').slice(0, 50) || 'qr-codes';
    if (input.format === 'pdf') {
      const cells = items.map((it) => ({ modules: encodeText(it.content, { ecl: 'M' }).modules, label: it.label, sublabel: it.content.length > 60 ? `${it.content.slice(0, 57)}...` : it.content }));
      return { name: `${base}.pdf`, mime: 'application/pdf', data: makeQrSheet(cells, { color: input.color, title: input.title || undefined }) };
    }
    const rgb = [1, 3, 5].map((i) => parseInt(input.color.slice(i, i + 2), 16));
    const used = new Set<string>();
    const cell = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const files = items.map((it, i) => {
      let name = `${String(i + 1).padStart(4, '0')}-${it.label.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'code'}.png`;
      while (used.has(name)) name = name.replace(/\.png$/, '-x.png');
      used.add(name);
      const img = rasterize(encodeText(it.content, { ecl: 'M' }).modules, 10, 4, rgb, [255, 255, 255]);
      return { name, data: encodePng(img.width, img.height, img.rgba), label: it.label, content: it.content };
    });
    const manifest = ['file,label,content', ...files.map((f) => [f.name, f.label, f.content].map(cell).join(','))].join('\n');
    const out = files.map(({ name, data }) => ({ name, data: new Uint8Array(data) }));
    out.push({ name: 'manifest.csv', data: new Uint8Array(Buffer.from(manifest)) });
    if (errors.length) out.push({ name: 'skipped-rows.csv', data: new Uint8Array(Buffer.from(['row,problem', ...errors.map((e) => `${e.row},${cell(e.error)}`)].join('\n'))) });
    return { name: `${base}.zip`, mime: 'application/zip', data: makeZip(out) };
  }

  /** Takes the oldest waiting job; SKIP LOCKED lets several workers share the queue without taking the same job. */
  const claim = () =>
    db.tx(async (q) => {
      const now = Date.now();
      await q("update jobs set status = 'failed', error = 'The job was interrupted too many times.', updated_at = $1 where status = 'running' and updated_at < $2 and attempts >= $3", [now, now - STALE_MS, MAX_ATTEMPTS]);
      const [j] = await q<{ id: string }>("select id from jobs where status = 'queued' or (status = 'running' and updated_at < $1) order by created_at limit 1 for update skip locked", [now - STALE_MS]);
      if (!j) return null;
      return (await q<JobRow>("update jobs set status = 'running', attempts = attempts + 1, updated_at = $2 where id = $1 returning *", [j.id, now]))[0];
    });

  class Cancelled extends Error {}

  async function run(job: JobRow) {
    const report: Report = { items: job.report.items ?? [], errors: job.report.errors ?? [] };
    let done = job.progress; // resume after an interruption
    while (done < job.total) {
      const batch = job.input.rows.slice(done, done + BATCH);
      await db.tx(async (q) => {
        const items: Item[] = [];
        const errors: Report['errors'] = [];
        for (const [i, row] of batch.entries()) {
          const n = done + i + 2; // spreadsheet row number (row 1 is the header)
          try {
            await q('savepoint row');
            items.push(await work(job, q, row, n));
            await q('release savepoint row');
          } catch (e) {
            await q('rollback to savepoint row');
            errors.push({ row: n, error: e instanceof Error ? e.message : String(e) });
          }
        }
        const next: Report = { items: [...report.items!, ...items], errors: [...report.errors!, ...errors] };
        const ok = await q("update jobs set progress = $2, report = $3, updated_at = $4 where id = $1 and status = 'running' returning id", [job.id, done + batch.length, JSON.stringify(next), Date.now()]);
        if (!ok.length) throw new Cancelled();
        Object.assign(report, next);
      });
      done += batch.length;
      await new Promise((r) => setImmediate(r)); // let requests through between batches
    }
    if (!report.items!.length) {
      await db.query("update jobs set status = 'failed', error = $2, updated_at = $3 where id = $1", [job.id, `No codes could be made. First problem: row ${report.errors![0]?.row}: ${report.errors![0]?.error}`, Date.now()]);
      return;
    }
    const file = render(job.input, report);
    const fileId = newId();
    await db.tx(async (q) => {
      await q('insert into files (id, user_id, name, mime, data, created_at) values ($1, $2, $3, $4, $5, $6)', [fileId, job.user_id, file.name, file.mime, file.data, Date.now()]);
      const ok = await q("update jobs set status = 'done', result_file = $2, updated_at = $3 where id = $1 and status = 'running' returning id", [job.id, fileId, Date.now()]);
      if (!ok.length) throw new Cancelled();
    });
  }

  let busy = false;
  let stopped = false;
  let lastSweep = 0;
  async function kick() {
    if (busy || stopped) return;
    busy = true;
    try {
      if (Date.now() - lastSweep > 3_600_000) {
        lastSweep = Date.now();
        const old = Date.now() - KEEP_MS;
        await db.query('delete from files where created_at < $1', [old]);
        await db.query("delete from jobs where updated_at < $1 and status in ('done', 'failed')", [old]);
      }
      for (let job = await claim(); job && !stopped; job = await claim()) {
        try {
          await run(job);
        } catch (e) {
          if (e instanceof Cancelled || stopped) continue;
          console.error('bulk job failed', job.id, e);
          await db.query("update jobs set status = case when attempts >= $3 then 'failed' else 'queued' end, error = $2, updated_at = $4 where id = $1", [job.id, 'Something went wrong while making the codes.', MAX_ATTEMPTS, Date.now()]);
        }
      }
    } catch (e) {
      if (!stopped) console.error('bulk worker', e);
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(() => void kick(), 10_000);
  timer.unref();
  setTimeout(() => void kick(), 1000).unref(); // pick up jobs left from before a restart

  // ---------------------------------------------------------- routes

  const jobApi = (j: JobRow) => ({
    id: j.id,
    kind: j.kind,
    format: j.input.format,
    title: j.input.title,
    status: j.status,
    progress: j.progress,
    total: j.total,
    made: j.report.items?.length ?? 0,
    errors: (j.report.errors ?? []).slice(0, 50),
    errorCount: j.report.errors?.length ?? 0,
    error: j.error,
    download: j.result_file ? `/api/bulk/${j.id}/download` : null,
    createdAt: j.created_at,
    updatedAt: j.updated_at,
  });

  app.post('/api/bulk', express.json({ limit: '3mb' }), rateLimit(20, 10 * 60_000), async (req, res) => {
    const user = requireUser(res);
    const b = req.body ?? {};
    const kind: JobKind = b.kind === 'certificates' ? 'certificates' : 'codes';
    const mode = b.mode === 'dynamic' ? 'dynamic' : 'static';
    const type = (kind === 'codes' && mode === 'static' ? b.type : 'url') as QrType;
    if (!STATIC_TYPES.includes(type)) throw new HttpError(400, 'Choose what kind of codes to make.');
    const { headers, rows } = csvObjects(str(b.csv, 3_000_000));
    if (!rows.length) throw new HttpError(400, 'The CSV has no rows under its header line.');
    if (rows.length > MAX_ROWS) throw new HttpError(400, `Up to ${MAX_ROWS} rows at a time, please (this file has ${rows.length}).`);
    const need = kind === 'certificates' ? ['recipient|name', 'title|course|award'] : mode === 'dynamic' ? ['url'] : [];
    for (const n of need) if (!n.split('|').some((h) => headers.includes(h))) throw new HttpError(400, `The CSV needs a "${n.split('|')[0]}" column.`);
    if (kind === 'certificates' && !headers.includes('issuer') && !str(b.title, 120).trim()) throw new HttpError(400, 'Add an "issuer" column or enter who is issuing the certificates.');
    const [{ n }] = await db.query<{ n: string }>("select count(*) as n from jobs where user_id = $1 and status in ('queued', 'running')", [user.id]);
    if (Number(n) >= 3) throw new HttpError(429, 'Three jobs are already waiting. Let them finish first.');
    const input: JobInput = {
      kind,
      format: b.format === 'pdf' ? 'pdf' : 'zip',
      mode,
      type,
      labelColumn: str(b.labelColumn, 60).trim().toLowerCase(),
      title: str(b.title, 120).trim(),
      color: typeof b.color === 'string' && /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#111111',
      rows,
    };
    const now = Date.now();
    const [job] = await db.query<JobRow>('insert into jobs (id, user_id, kind, total, input, created_at, updated_at) values ($1, $2, $3, $4, $5, $6, $6) returning *', [newId(), user.id, kind, rows.length, JSON.stringify(input), now]);
    void kick();
    res.status(201).json({ job: jobApi(job) });
  });

  app.get('/api/bulk', async (_req, res) => {
    const user = requireUser(res);
    const rows = await db.query<JobRow>('select * from jobs where user_id = $1 order by created_at desc limit 50', [user.id]);
    res.json({ jobs: rows.map(jobApi) });
  });

  const ownJob = async (res: express.Response, id: string) => {
    const user = requireUser(res);
    const [j] = await db.query<JobRow>('select * from jobs where id = $1 and user_id = $2', [id, user.id]);
    if (!j) throw new HttpError(404, 'Job not found.');
    return j;
  };

  app.get('/api/bulk/:id', async (req, res) => res.json({ job: jobApi(await ownJob(res, req.params.id)) }));

  app.get('/api/bulk/:id/download', async (req, res) => {
    const j = await ownJob(res, req.params.id);
    const [f] = j.result_file ? await db.query<{ name: string; mime: string; data: Uint8Array }>('select name, mime, data from files where id = $1', [j.result_file]) : [];
    if (!f) throw new HttpError(404, j.status === 'done' ? 'This download has expired.' : 'The job has not finished yet.');
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${f.name}"`);
    res.send(Buffer.from(f.data));
  });

  /** Deleting a running job also stops it: the worker's next progress update finds no running job. */
  app.delete('/api/bulk/:id', async (req, res) => {
    const j = await ownJob(res, req.params.id);
    await db.tx(async (q) => {
      await q('delete from jobs where id = $1', [j.id]);
      if (j.result_file) await q('delete from files where id = $1', [j.result_file]);
    });
    res.json({ ok: true });
  });

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
