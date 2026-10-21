import { EventEmitter } from 'node:events';
import express, { type Response } from 'express';
import type { AppCtx } from './context.ts';
import { csvObjects } from './csv.ts';
import { HttpError, newId, rateLimit, requireUser, str } from './http.ts';
import { checkTag, tag } from './security.ts';
import { encodeText } from '../shared/qr/encode.ts';
import { makeQrSheet } from './pdf.ts';

interface EventRow {
  id: string;
  user_id: string;
  title: string;
  venue: string;
  starts_at: string;
  created_at: number;
}

interface TicketRow {
  id: string;
  event_id: string;
  name: string;
  email: string;
  created_at: number;
  checked_in_at: number | null;
  checked_in_by: string | null;
}

const MAX_TICKETS = 5000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A ticket's QR text: its id plus an HMAC tag, so tickets cannot be guessed or forged. */
export const ticketToken = (ctx: AppCtx, id: string) => `${id}.${tag(ctx.keys, 'ticket', id)}`;

/** Accepts the token itself or anything that ends with it (the full /t/… link a phone camera reads). */
export function parseTicketCode(ctx: AppCtx, code: string): string | null {
  const m = /([A-Za-z0-9_-]{8,32})\.([A-Za-z0-9_-]{16})\s*$/.exec(code.trim());
  if (!m || !checkTag(ctx.keys, 'ticket', m[1], m[2])) return null;
  return m[1];
}

export function mount(app: express.Express, ctx: AppCtx) {
  const { db } = ctx;
  const json = express.json({ limit: '2mb' });
  /** Check-ins announced to the organiser's open scanner pages (one Render instance, so in-process is enough). */
  const live = new EventEmitter();
  live.setMaxListeners(0);

  const ticketUrl = (id: string) => `${ctx.publicUrl}/t/${ticketToken(ctx, id)}`;
  const ticketApi = (t: TicketRow) => ({ id: t.id, name: t.name, email: t.email, createdAt: t.created_at, checkedInAt: t.checked_in_at, checkedInBy: t.checked_in_by, url: ticketUrl(t.id) });

  const own = async (res: Response, id: string): Promise<EventRow> => {
    const user = requireUser(res);
    const [row] = await db.query<EventRow>('select * from events where id = $1 and user_id = $2', [id, user.id]);
    if (!row) throw new HttpError(404, 'Event not found.');
    return row;
  };

  const counts = async (eventId: string) => {
    const [c] = await db.query<{ total: string; checked: string }>('select count(*) as total, count(checked_in_at) as checked from tickets where event_id = $1', [eventId]);
    return { total: Number(c.total), checkedIn: Number(c.checked) };
  };

  const eventApi = async (e: EventRow) => ({ id: e.id, title: e.title, venue: e.venue, startsAt: e.starts_at, createdAt: e.created_at, ...(await counts(e.id)) });

  function cleanEvent(b: Record<string, unknown>, current?: EventRow) {
    const title = str(b.title, 120).trim() || current?.title || '';
    if (!title) throw new HttpError(400, 'Give the event a name.');
    const startsAt = 'startsAt' in b ? str(b.startsAt, 30) : (current?.starts_at ?? '');
    if (startsAt && Number.isNaN(Date.parse(startsAt))) throw new HttpError(400, 'Enter a valid date and time.');
    return { title, venue: 'venue' in b ? str(b.venue, 200).trim() : (current?.venue ?? ''), startsAt };
  }

  app.get('/api/events', async (_req, res) => {
    const user = requireUser(res);
    const rows = await db.query<EventRow>('select * from events where user_id = $1 order by created_at desc limit 200', [user.id]);
    res.json({ events: await Promise.all(rows.map(eventApi)) });
  });

  app.post('/api/events', json, async (req, res) => {
    const user = requireUser(res);
    const e = cleanEvent(req.body ?? {});
    const [row] = await db.query<EventRow>('insert into events (id, user_id, title, venue, starts_at, created_at) values ($1, $2, $3, $4, $5, $6) returning *', [newId(), user.id, e.title, e.venue, e.startsAt, Date.now()]);
    res.status(201).json({ event: await eventApi(row) });
  });

  app.get('/api/events/:id', async (req, res) => {
    const e = await own(res, req.params.id);
    const tickets = await db.query<TicketRow>('select * from tickets where event_id = $1 order by name limit $2', [e.id, MAX_TICKETS]);
    res.json({ event: await eventApi(e), tickets: tickets.map(ticketApi) });
  });

  app.patch('/api/events/:id', json, async (req, res) => {
    const cur = await own(res, req.params.id);
    const e = cleanEvent(req.body ?? {}, cur);
    const [row] = await db.query<EventRow>('update events set title = $2, venue = $3, starts_at = $4 where id = $1 returning *', [cur.id, e.title, e.venue, e.startsAt]);
    res.json({ event: await eventApi(row) });
  });

  app.delete('/api/events/:id', async (req, res) => {
    const e = await own(res, req.params.id);
    await db.query('delete from events where id = $1', [e.id]);
    res.json({ ok: true });
  });

  /** Adds attendees from a list or from CSV text with "name" and optional "email" columns. */
  app.post('/api/events/:id/tickets', json, async (req, res) => {
    const e = await own(res, req.params.id);
    const b = req.body ?? {};
    let people: Array<{ name: string; email: string }>;
    if (typeof b.csv === 'string') {
      const { headers, rows } = csvObjects(b.csv);
      const nameKey = headers.find((h) => h === 'name' || h === 'full name' || h === 'attendee');
      if (!nameKey) throw new HttpError(400, 'The CSV needs a "name" column (and optionally "email").');
      people = rows.map((r) => ({ name: r[nameKey], email: r.email ?? '' }));
    } else if (Array.isArray(b.attendees)) {
      people = b.attendees.map((a: Record<string, unknown>) => ({ name: str(a?.name, 120).trim(), email: str(a?.email, 200).trim() }));
    } else throw new HttpError(400, 'Add at least one attendee.');
    people = people.map((p) => ({ name: p.name.slice(0, 120).trim(), email: p.email.slice(0, 200).trim().toLowerCase() })).filter((p) => p.name);
    if (!people.length) throw new HttpError(400, 'Add at least one attendee with a name.');
    const bad = people.findIndex((p) => p.email && !EMAIL.test(p.email));
    if (bad >= 0) throw new HttpError(400, `Attendee ${bad + 1} (${people[bad].name}): that email address does not look right.`);
    const { total } = await counts(e.id);
    if (total + people.length > MAX_TICKETS) throw new HttpError(400, `An event can have up to ${MAX_TICKETS} tickets.`);
    const now = Date.now();
    const created = await db.tx(async (q) => {
      const out: TicketRow[] = [];
      for (const p of people) out.push((await q<TicketRow>('insert into tickets (id, event_id, name, email, created_at) values ($1, $2, $3, $4, $5) returning *', [newId(9), e.id, p.name, p.email, now]))[0]);
      return out;
    });
    res.status(201).json({ tickets: created.map(ticketApi) });
  });

  app.delete('/api/events/:id/tickets/:ticket', async (req, res) => {
    const e = await own(res, req.params.id);
    await db.query('delete from tickets where id = $1 and event_id = $2', [req.params.ticket, e.id]);
    live.emit(e.id, await counts(e.id));
    res.json({ ok: true });
  });

  app.get('/api/events/:id/tickets.csv', async (req, res) => {
    const e = await own(res, req.params.id);
    const tickets = await db.query<TicketRow>('select * from tickets where event_id = $1 order by name', [e.id]);
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ['name,email,ticket link,checked in at', ...tickets.map((t) => [t.name, t.email, ticketUrl(t.id), t.checked_in_at ? new Date(t.checked_in_at).toISOString() : ''].map(cell).join(','))];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tickets-${e.title.replace(/[^\w-]+/g, '-').slice(0, 40)}.csv"`);
    res.send(lines.join('\n'));
  });

  /** Name badges for every guest, 8 to an A4 page, each with the guest's signed ticket code. */
  app.get('/api/events/:id/badges.pdf', async (req, res) => {
    const e = await own(res, String(req.params.id));
    const tickets = await db.query<TicketRow>('select * from tickets where event_id = $1 order by name', [e.id]);
    if (!tickets.length) throw new HttpError(400, 'Add guests first.');
    const cells = tickets.map((t) => ({ modules: encodeText(ticketUrl(t.id), { ecl: 'M' }).modules, label: t.name, sublabel: [e.title, e.venue].filter(Boolean).join(' · ') }));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="badges-${e.title.replace(/[^\w-]+/g, '-').slice(0, 40)}.pdf"`);
    res.send(makeQrSheet(cells, { cols: 2, rows: 4, color: '#14243a', title: `${e.title} · name badges` }));
  });

  /**
   * Checks a ticket in. One UPDATE … WHERE checked_in_at IS NULL decides, so the same ticket shown at two
   * doors at once is admitted once; the second door is told when it was used.
   */
  async function checkIn(e: EventRow, ticketId: string, by: string) {
    const now = Date.now();
    const [done] = await db.query<TicketRow>('update tickets set checked_in_at = $3, checked_in_by = $4 where id = $1 and event_id = $2 and checked_in_at is null returning *', [ticketId, e.id, now, by]);
    if (done) {
      const c = await counts(e.id);
      live.emit(e.id, { ...c, last: { name: done.name, at: now } });
      return { status: 'ok' as const, ticket: ticketApi(done), ...c };
    }
    const [t] = await db.query<TicketRow>('select * from tickets where id = $1', [ticketId]);
    // The ticket's signature was genuine, so a missing row means it was cancelled (cancelling deletes it).
    if (!t) return { status: 'cancelled' as const, error: 'This ticket has been cancelled.', ...(await counts(e.id)) };
    if (t.event_id !== e.id) return { status: 'wrong-event' as const, ...(await counts(e.id)) };
    return { status: 'duplicate' as const, ticket: ticketApi(t), ...(await counts(e.id)) };
  }

  app.post('/api/events/:id/checkin', json, rateLimit(600, 60_000), async (req, res) => {
    const e = await own(res, String(req.params.id));
    const by = str(req.body?.gate, 40).trim() || requireUser(res).name;
    const code = str(req.body?.code, 500);
    const ticketId = req.body?.ticketId ? str(req.body.ticketId, 40) : parseTicketCode(ctx, code);
    if (!ticketId) return res.status(400).json({ status: 'invalid', error: 'This is not a valid ticket.', ...(await counts(e.id)) });
    const out = await checkIn(e, ticketId, by);
    const status = out.status === 'ok' ? 200 : out.status === 'duplicate' ? 409 : 404;
    res.status(status).json(out);
  });

  app.post('/api/events/:id/tickets/:ticket/undo', async (req, res) => {
    const e = await own(res, req.params.id);
    await db.query('update tickets set checked_in_at = null, checked_in_by = null where id = $1 and event_id = $2', [req.params.ticket, e.id]);
    const c = await counts(e.id);
    live.emit(e.id, c);
    res.json(c);
  });

  /** Live headcount as server-sent events, with a comment line every 25 s so proxies keep it open. */
  app.get('/api/events/:id/live', async (req, res) => {
    const e = await own(res, req.params.id);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    send(await counts(e.id));
    live.on(e.id, send);
    const beat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(beat);
      live.off(e.id, send);
    });
  });

  /** The attendee's ticket page (public: the signed token is the proof). */
  app.get('/api/tickets/:token', rateLimit(120, 60_000), async (req, res) => {
    const id = parseTicketCode(ctx, String(req.params.token));
    if (!id) throw new HttpError(404, 'This ticket is not valid.');
    const [t] = await db.query<TicketRow & { title: string; venue: string; starts_at: string }>('select t.*, e.title, e.venue, e.starts_at from tickets t join events e on e.id = t.event_id where t.id = $1', [id]);
    if (!t) throw new HttpError(404, 'This ticket has been cancelled.');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ name: t.name, event: { title: t.title, venue: t.venue, startsAt: t.starts_at }, checkedInAt: t.checked_in_at, code: ticketUrl(t.id) });
  });
}
