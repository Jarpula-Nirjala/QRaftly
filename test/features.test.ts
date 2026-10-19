import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { after, before, describe, it } from 'node:test';
import jsQRModule from 'jsqr';
import { PNG } from 'pngjs';
import { encodeText } from '../shared/qr/encode.ts';
import { startServer, type RunningServer } from '../server/app.ts';
import { csvObjects, parseCsv } from '../server/csv.ts';
import { makeQrSheet } from '../server/pdf.ts';
import { makeZip } from '../server/zip.ts';

const jsQR = jsQRModule as unknown as (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null;

/** Reads a stored-method ZIP through its central directory, checking every CRC. */
function readZip(buf: Buffer): Map<string, Buffer> {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'end of central directory');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    assert.equal(buf.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + buf.readUInt16LE(local + 26);
    const data = buf.subarray(start, start + size);
    assert.equal(zlib.crc32(data), crc, `crc of ${name}`);
    out.set(name, data);
    p += 46 + nameLen;
  }
  return out;
}

const readPng = (data: Buffer) => {
  const png = PNG.sync.read(data);
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
};

describe('file formats written from scratch', () => {
  it('CSV: quotes, doubled quotes, embedded commas and newlines, CRLF, BOM, blank lines', () => {
    const rows = parseCsv('﻿name,note\r\n"Rao, Asha","said ""hi""\nthen left"\r\n\r\nRavi,\n');
    assert.deepEqual(rows, [['name', 'note'], ['Rao, Asha', 'said "hi"\nthen left'], ['Ravi', '']]);
    assert.deepEqual(csvObjects(' Name , EMAIL\nA, a@x.io').rows, [{ name: 'A', email: 'a@x.io' }]);
  });

  it('ZIP: names, sizes and CRCs read back', () => {
    const files = [{ name: 'a.txt', data: new Uint8Array(Buffer.from('hello')) }, { name: 'ünïcode.txt', data: new Uint8Array(Buffer.alloc(70_000, 7)) }];
    const z = readZip(makeZip(files));
    assert.equal(z.get('a.txt')?.toString(), 'hello');
    assert.equal(z.get('ünïcode.txt')?.length, 70_000);
  });

  it('PDF: valid cross-reference table and one page per 12 codes', () => {
    const cell = { modules: encodeText('https://example.com', { ecl: 'M' }).modules, label: 'A (test) \\ label', sublabel: 'Ünicode → ?' };
    const pdf = makeQrSheet(Array(13).fill(cell), { title: 'Sheet' });
    const text = pdf.toString('latin1');
    assert.ok(text.startsWith('%PDF-1.4'));
    assert.match(text, /\/Count 2 /);
    const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
    assert.ok(text.startsWith('xref', xref));
    const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => assert.ok(text.startsWith(`${i + 1} 0 obj`, o), `object ${i + 1} offset`));
    assert.match(text, /\(A \\\(test\\\) \\\\ label\) Tj/);
    for (const m of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) assert.ok(text.startsWith('endstream', m.index! + m[0].length + Number(m[1])));
  });
});

describe('events, certificates and bulk jobs', () => {
  let server: RunningServer;
  let cookie = '';
  let other = '';
  const B = () => `http://localhost:${server.port}`;
  const api = async (p: string, init: { method?: string; body?: unknown; as?: string } = {}) => {
    const res = await fetch(B() + p, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      redirect: 'manual',
      headers: { 'content-type': 'application/json', cookie: init.as ?? cookie, 'x-forwarded-for': '203.0.113.9' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    let json: any = null;
    try {
      json = JSON.parse(buf.toString());
    } catch {
      // binary
    }
    return { status: res.status, json, buf, headers: res.headers, cookie: res.headers.get('set-cookie')?.split(';')[0] };
  };
  const waitJob = async (id: string) => {
    for (let i = 0; i < 200; i++) {
      const j = (await api(`/api/bulk/${id}`)).json.job;
      if (j.status === 'done' || j.status === 'failed') return j;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('job did not finish');
  };

  before(async () => {
    server = await startServer({ port: 0, dataDir: null });
    cookie = (await api('/api/auth/signup', { body: { name: 'Asha', email: 'asha@example.com', password: 'password123' }, as: '' })).cookie!;
    other = (await api('/api/auth/signup', { body: { name: 'Ravi', email: 'ravi@example.com', password: 'password123' }, as: '' })).cookie!;
  });
  after(() => server.close());

  it('event tickets: signed codes, check-in once, duplicates refused, live headcount', async () => {
    const ev = await api('/api/events', { body: { title: 'Tech Meetup', venue: 'Hall 2', startsAt: '2026-11-20T18:30' } });
    assert.equal(ev.status, 201);
    const id = ev.json.event.id;
    const add = await api(`/api/events/${id}/tickets`, { body: { csv: 'Name,Email\n"Rao, Asha",asha@x.io\nRavi,\nMeena,meena@x.io\n' } });
    assert.equal(add.status, 201);
    assert.equal(add.json.tickets.length, 3);
    assert.equal((await api(`/api/events/${id}/tickets`, { body: { csv: 'email\na@b.co' } })).status, 400);
    const [t1, t2] = add.json.tickets;
    assert.match(t1.url, new RegExp(`^${B()}/t/[\\w-]+\\.[\\w-]{16}$`));

    // The attendee's page needs the signed token; a forged one is refused.
    const token = t1.url.split('/t/')[1];
    const page = await api(`/api/tickets/${token}`, { as: '' });
    assert.equal(page.json.name, 'Rao, Asha');
    assert.equal(page.json.event.title, 'Tech Meetup');
    assert.equal((await api(`/api/tickets/${t1.id}.AAAAAAAAAAAAAAAA`, { as: '' })).status, 404);

    // Live headcount over server-sent events.
    const ctrl = new AbortController();
    const stream = await fetch(`${B()}/api/events/${id}/live`, { headers: { cookie }, signal: ctrl.signal });
    const reader = stream.body!.getReader();
    const events: any[] = [];
    const reading = (async () => {
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
        if (done) return;
        buf += Buffer.from(value!).toString();
        for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (chunk.startsWith('data: ')) events.push(JSON.parse(chunk.slice(6)));
        }
      }
    })();

    // Two doors scan the same ticket at once: exactly one admits it.
    const both = await Promise.all([api(`/api/events/${id}/checkin`, { body: { code: t1.url, gate: 'North' } }), api(`/api/events/${id}/checkin`, { body: { code: t1.url, gate: 'South' } })]);
    assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
    const dup = both.find((r) => r.status === 409)!.json;
    assert.equal(dup.status, 'duplicate');
    assert.ok(dup.ticket.checkedInAt > 0);
    assert.equal(dup.checkedIn, 1);
    assert.equal((await api(`/api/events/${id}/checkin`, { body: { code: 'https://evil.example/t/abc' } })).json.status, 'invalid');
    // Manual check-in from the attendee list, then undo.
    assert.equal((await api(`/api/events/${id}/checkin`, { body: { ticketId: t2.id } })).json.checkedIn, 2);
    assert.equal((await api(`/api/events/${id}/tickets/${t2.id}/undo`, { body: {} })).json.checkedIn, 1);

    // A ticket from another event is not accepted here.
    const ev2 = (await api('/api/events', { body: { title: 'Other' } })).json.event.id;
    assert.equal((await api(`/api/events/${ev2}/checkin`, { body: { code: t2.url } })).json.status, 'wrong-event');
    // Another account cannot use this event's scanner.
    assert.equal((await api(`/api/events/${id}/checkin`, { body: { code: t2.url }, as: other })).status, 404);

    await new Promise((r) => setTimeout(r, 100));
    ctrl.abort();
    await reading;
    assert.equal(events[0].checkedIn, 0);
    assert.ok(events.some((e) => e.last?.name === 'Rao, Asha' && e.checkedIn === 1));
    assert.equal(events.at(-1).checkedIn, 1);

    const csv = await api(`/api/events/${id}/tickets.csv`);
    assert.match(csv.buf.toString(), /"Rao, Asha","asha@x.io","http/);
  });

  it('certificates: valid, tampered, revoked, and the public key checks the signature', async () => {
    const c = await api('/api/certs', { body: { recipient: 'Asha Rao', title: 'Full-stack bootcamp', issuer: 'QRForge Academy', date: '2026-10-01' } });
    assert.equal(c.status, 201);
    const url: string = c.json.cert.url;
    const v = await api('/api/verify', { body: { code: url }, as: '' });
    assert.equal(v.json.status, 'valid');
    assert.equal(v.json.data.recipient, 'Asha Rao');
    // Anyone with the public key can check it without asking the server.
    const [b64, sig] = url.split('/v/')[1].split('.');
    const crypto = await import('node:crypto');
    const pem = (await api('/api/certs/public-key', { as: '' })).buf.toString();
    assert.ok(crypto.verify(null, Buffer.from(b64, 'base64url'), crypto.createPublicKey(pem), Buffer.from(sig, 'base64url')));
    // Change one field: the signature no longer matches.
    const forged = { ...JSON.parse(Buffer.from(b64, 'base64url').toString()), recipient: 'Mallory' };
    const t = await api('/api/verify', { body: { code: `${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}` }, as: '' });
    assert.equal(t.json.status, 'tampered');
    assert.equal((await api('/api/verify', { body: { code: 'hello' }, as: '' })).json.status, 'invalid');
    // Revoke, then restore.
    assert.equal((await api(`/api/certs/${c.json.cert.id}/revoke`, { body: {}, as: other })).status, 404);
    await api(`/api/certs/${c.json.cert.id}/revoke`, { body: {} });
    assert.equal((await api('/api/verify', { body: { code: url }, as: '' })).json.status, 'revoked');
    await api(`/api/certs/${c.json.cert.id}/restore`, { body: {} });
    assert.equal((await api('/api/verify', { body: { code: url }, as: '' })).json.status, 'valid');
    assert.equal((await api('/api/certs', { body: { recipient: 'X', title: 'Y', issuer: 'Z', date: '01/02/2026' } })).status, 400);
  });

  it('bulk: Wi-Fi codes to a ZIP whose PNGs scan, with bad rows reported', async () => {
    const csv = 'label,ssid,password\nRoom 101,Hotel-101,pass-101\nRoom 102,Hotel-102,\nBroken,,x\n';
    const j = await api('/api/bulk', { body: { kind: 'codes', mode: 'static', type: 'wifi', format: 'zip', csv, title: 'Rooms' } });
    assert.equal(j.status, 201);
    const done = await waitJob(j.json.job.id);
    assert.equal(done.status, 'done');
    assert.equal(done.made, 2);
    assert.deepEqual(done.errors, [{ row: 4, error: 'Enter the network name.' }]);
    const dl = await api(done.download);
    assert.equal(dl.headers.get('content-type'), 'application/zip');
    const zip = readZip(dl.buf);
    assert.equal(readPng(zip.get('0001-Room-101.png')!), 'WIFI:T:WPA;S:Hotel-101;P:pass-101;;');
    assert.equal(readPng(zip.get('0002-Room-102.png')!), 'WIFI:T:nopass;S:Hotel-102;;');
    assert.match(zip.get('manifest.csv')!.toString(), /"0001-Room-101.png","Room 101"/);
    assert.match(zip.get('skipped-rows.csv')!.toString(), /4,"Enter the network name."/);
    assert.equal((await api(done.download, { as: other })).status, 404);
  });

  it('bulk: dynamic codes are created in the account and a PDF sheet is made', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => `Table ${i + 1},example.com/menu?t=${i + 1}`);
    const j = await api('/api/bulk', { body: { kind: 'codes', mode: 'dynamic', format: 'pdf', csv: `name,url\n${rows.join('\n')}`, title: 'Cafe tables' } });
    const done = await waitJob(j.json.job.id);
    assert.equal(done.status, 'done');
    assert.equal(done.made, 30);
    const pdf = (await api(done.download)).buf.toString('latin1');
    assert.match(pdf, /\/Count 3 /);
    assert.match(pdf, /\(Table 30\) Tj/);
    const qrs = (await api('/api/qrs')).json.qrs.filter((q: any) => q.title.startsWith('Table '));
    assert.equal(qrs.length, 30);
    assert.equal(qrs.find((q: any) => q.title === 'Table 7').data.url, 'https://example.com/menu?t=7');
  });

  it('bulk: certificates from a CSV, each verifiable', async () => {
    const j = await api('/api/bulk', { body: { kind: 'certificates', format: 'zip', csv: 'name,course,date\nAsha,Python,2026-09-01\nRavi,SQL,2026-09-02', title: 'QRForge Academy' } });
    const done = await waitJob(j.json.job.id);
    assert.equal(done.made, 2);
    const zip = readZip((await api(done.download)).buf);
    const code = readPng(zip.get('0002-Ravi.png')!)!;
    const v = await api('/api/verify', { body: { code }, as: '' });
    assert.equal(v.json.status, 'valid');
    assert.deepEqual([v.json.data.recipient, v.json.data.title, v.json.data.issuer], ['Ravi', 'SQL', 'QRForge Academy']);
  });

  it('bulk: validation and limits', async () => {
    assert.equal((await api('/api/bulk', { body: { kind: 'codes', mode: 'dynamic', csv: 'name\nA' } })).status, 400);
    assert.equal((await api('/api/bulk', { body: { kind: 'certificates', csv: 'name,course\nA,B' } })).json.error, 'Add an "issuer" column or enter who is issuing the certificates.');
    const many = `url\n${'a.com\n'.repeat(1001)}`;
    assert.match((await api('/api/bulk', { body: { kind: 'codes', mode: 'dynamic', csv: many } })).json.error, /Up to 1000 rows/);
  });
});
