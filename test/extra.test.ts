import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import jsQRModule from 'jsqr';
import { PNG } from 'pngjs';
import { startServer, type RunningServer } from '../server/app.ts';
import { pickSplit } from '../server/scan.ts';
import { encodeText, penalty, penaltyParts } from '../shared/qr/encode.ts';

const jsQR = jsQRModule as unknown as (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null;
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

describe('engine helpers', () => {
  it('A/B splits follow their weights and stay put for one visitor', () => {
    const arms = [
      { url: 'https://a.example', weight: 70 },
      { url: 'https://b.example', weight: 30 },
    ];
    let a = 0;
    for (let i = 0; i < 5000; i++) if (pickSplit(arms, `visitor-${i}`).arm === 0) a++;
    assert.ok(a > 3300 && a < 3700, `${a} of 5000 went to A`);
    assert.equal(pickSplit(arms, 'same').arm, pickSplit(arms, 'same').arm);
  });

  it('mask penalty parts add up to the total', () => {
    const qr = encodeText('penalty parts', { ecl: 'M' });
    const parts = penaltyParts(qr.modules);
    assert.equal(parts.reduce((x, y) => x + y, 0), penalty(qr.modules));
  });
});

describe('growth, venue and trust features', () => {
  let server: RunningServer;
  let cookie = '';
  let other = '';
  const B = () => `http://localhost:${server.port}`;
  const api = async (p: string, init: { method?: string; body?: unknown; as?: string; headers?: Record<string, string> } = {}) => {
    const res = await fetch(B() + p, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      redirect: 'manual',
      headers: { 'content-type': 'application/json', cookie: init.as ?? cookie, 'user-agent': ANDROID, ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    let json: any = null;
    try {
      json = JSON.parse(buf.toString());
    } catch {
      // binary
    }
    return { status: res.status, json, buf, location: res.headers.get('location'), cookie: res.headers.get('set-cookie')?.split(';')[0], type: res.headers.get('content-type') };
  };

  before(async () => {
    server = await startServer({ port: 0, dataDir: null });
    cookie = (await api('/api/auth/signup', { body: { name: 'Asha', email: 'asha@example.com', password: 'password123' }, as: '' })).cookie!;
    other = (await api('/api/auth/signup', { body: { name: 'Ravi', email: 'ravi@example.com', password: 'password123' }, as: '' })).cookie!;
  });
  after(() => server.close());

  it('dynamic codes: A/B variants, country rules and the scan simulator', async () => {
    assert.equal((await api('/api/qrs', { body: { kind: 'dynamic', data: { url: 'a.example', split: [{ url: 'b.example', weight: 50 }] } } })).status, 400);
    const c = await api('/api/qrs', {
      body: {
        kind: 'dynamic',
        data: { url: 'main.example', split: [{ url: 'a.example', weight: 1 }, { url: 'b.example', weight: 1 }] },
        rules: [{ label: 'UAE shop', country: ['ae'], target: 'ae.example' }],
      },
    });
    assert.equal(c.status, 201);
    const { slug, id } = c.json.qr;
    assert.deepEqual(c.json.qr.rules[0].country, ['AE']);
    // A country header from the CDN decides the rule.
    assert.equal((await api(`/r/${slug}`, { as: '', headers: { 'x-country': 'AE' } })).location, 'https://ae.example/');
    // Everyone else is split between A and B; different visitors land on both.
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add((await api(`/r/${slug}`, { as: '', headers: { 'x-forwarded-for': `198.51.100.${i}` } })).location!);
    assert.deepEqual([...seen].sort(), ['https://a.example/', 'https://b.example/']);
    const sim = await api(`/api/qrs/${id}/simulate`, { body: { os: 'ios', lang: 'en', country: 'AE' } });
    assert.equal(sim.json.target, 'https://ae.example/');
    assert.equal(sim.json.label, 'UAE shop');
    const sim2 = await api(`/api/qrs/${id}/simulate`, { body: { country: 'IN', visitor: 'someone' } });
    assert.match(sim2.json.label, /^Variant [AB]$/);
    assert.equal((await api(`/api/qrs/${id}/simulate`, { body: {}, as: other })).status, 404);
  });

  it('destination preview: the gate shows where the code goes before opening it', async () => {
    const c = await api('/api/qrs', { body: { kind: 'dynamic', data: { url: 'https://shop.example/sale' }, security: { preview: true } } });
    const { slug } = c.json.qr;
    assert.equal((await api(`/r/${slug}`, { as: '' })).location, `/g/${slug}`);
    const gate = await api(`/api/r/${slug}`, { as: '' });
    assert.equal(gate.json.preview, 'https://shop.example/sale');
    const open = await api(`/api/r/${slug}/unlock`, { body: {}, as: '' });
    assert.equal(open.json.target, 'https://shop.example/sale');
  });

  it('feedback forms: public ratings and an owner summary', async () => {
    const f = await api('/api/forms', { body: { title: 'Table feedback', question: 'How was dinner?' } });
    assert.equal(f.status, 201);
    const fid = f.json.form.id;
    assert.match(f.json.form.url, /\/f\/\w+$/);
    assert.equal((await api(`/api/f/${fid}`, { as: '' })).json.question, 'How was dinner?');
    for (const rating of [5, 4, 5]) assert.equal((await api(`/api/f/${fid}`, { body: { rating, comment: 'Lovely' }, as: '' })).status, 201);
    assert.equal((await api(`/api/f/${fid}`, { body: { rating: 9 }, as: '' })).status, 400);
    const s = await api(`/api/forms/${fid}`);
    assert.equal(s.json.total, 3);
    assert.equal(s.json.average, 4.67);
    assert.deepEqual(s.json.distribution, [0, 0, 0, 1, 2]);
    assert.equal((await api(`/api/forms/${fid}`, { as: other })).status, 404);
  });

  it('queue tickets: unique numbers, position, and "next" calls each person once', async () => {
    const q = (await api('/api/queues', { body: { title: 'Pharmacy' } })).json.queue;
    const joins = await Promise.all(Array.from({ length: 6 }, (_, i) => api(`/api/q/${q.id}/join`, { body: { name: `P${i}` }, as: '', headers: { 'x-forwarded-for': `192.0.2.${i}` } })));
    const numbers = joins.map((j) => j.json.number).sort((a, b) => a - b);
    assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6]);
    const third = joins.find((j) => j.json.number === 3)!;
    assert.equal((await api(`/api/q/${q.id}/me/${third.json.token}`, { as: '' })).json.ahead, 2);
    // Two staff press "Next" together: they call two different people.
    const both = await Promise.all([api(`/api/queues/${q.id}/next`, { body: {} }), api(`/api/queues/${q.id}/next`, { body: {} })]);
    assert.deepEqual(both.map((r) => r.json.queue.serving).sort(), [1, 2]);
    assert.equal((await api(`/api/q/${q.id}/me/${third.json.token}`, { as: '' })).json.ahead, 0);
    assert.equal((await api(`/api/q/${q.id}/me/${third.json.token.slice(0, -2)}xx`, { as: '' })).status, 404);
  });

  it('view-once notes are handed out once, then gone', async () => {
    const n = await api('/api/notes', { body: { ciphertext: 'A'.repeat(40), iv: 'abcdefghijklmnop', hours: 1 }, as: '' });
    assert.equal(n.status, 201);
    assert.equal((await api(`/api/notes/${n.json.id}`, { as: '' })).status, 200);
    const both = await Promise.all([api(`/api/notes/${n.json.id}/open`, { body: {}, as: '' }), api(`/api/notes/${n.json.id}/open`, { body: {}, as: '' })]);
    assert.deepEqual(both.map((r) => r.status).sort(), [200, 404]);
    assert.equal(both.find((r) => r.status === 200)!.json.ciphertext, 'A'.repeat(40));
    assert.equal((await api(`/api/notes/${n.json.id}`, { as: '' })).status, 404);
    assert.equal((await api('/api/notes', { body: { ciphertext: 'not base64!', iv: 'x' }, as: '' })).status, 400);
  });

  it('API keys: shown once, then used to make PNG codes and short links', async () => {
    const k = await api('/api/keys', { body: { label: 'Website' } });
    assert.match(k.json.key, /^qrft_/);
    const list = await api('/api/keys');
    assert.equal(list.json.keys[0].prefix, k.json.key.slice(0, 9));
    assert.equal(JSON.stringify(list.json).includes(k.json.key), false);
    const auth = { authorization: `Bearer ${k.json.key}` };
    assert.equal((await api('/api/v1/qr', { body: { text: 'x' }, as: '', headers: { authorization: 'Bearer qrft_wrongwrongwrongwrongwrong' } })).status, 401);
    const png = await api('/api/v1/qr', { body: { text: 'https://example.com/api', format: 'png' }, as: '', headers: auth });
    assert.equal(png.type, 'image/png');
    const img = PNG.sync.read(png.buf);
    assert.equal(jsQR(new Uint8ClampedArray(img.data), img.width, img.height)?.data, 'https://example.com/api');
    const svg = await api('/api/v1/qr', { body: { text: 'hello', design: { dots: 'rounded' } }, as: '', headers: auth });
    assert.match(svg.buf.toString(), /^<svg/);
    const link = await api('/api/v1/links', { body: { url: 'example.com/from-api' }, as: '', headers: auth });
    assert.equal(link.status, 201);
    assert.equal((await api(`/r/${link.json.shortUrl.split('/r/')[1]}`, { as: '' })).location, 'https://example.com/from-api');
    await api(`/api/keys/${k.json.id}`, { method: 'DELETE' });
    assert.equal((await api('/api/v1/qr', { body: { text: 'x' }, as: '', headers: auth })).status, 401);
  });

  it('name badges: a PDF with one signed ticket code per guest', async () => {
    const ev = (await api('/api/events', { body: { title: 'Badge Day', venue: 'Hall 1' } })).json.event;
    await api(`/api/events/${ev.id}/tickets`, { body: { attendees: [{ name: 'Asha' }, { name: 'Ravi' }, { name: 'Meena' }] } });
    const pdf = await api(`/api/events/${ev.id}/badges.pdf`);
    assert.equal(pdf.type, 'application/pdf');
    const text = pdf.buf.toString('latin1');
    assert.match(text, /\(Meena\) Tj/);
    assert.match(text, /\/Count 1 /);
  });
});

describe('encoding explained', () => {
  it('the explained steps rebuild exactly the code the encoder makes', async () => {
    const { explain } = await import('../shared/qr/explain.ts');
    const e = explain('HELLO WORLD', 'M');
    assert.equal(e.mode, 'alphanumeric');
    assert.equal(e.header.modeBits, '0010');
    assert.equal(e.header.count, 11);
    // The published HELLO WORLD 1-M data codewords.
    assert.deepEqual(e.dataCodewords.slice(0, 4), [32, 91, 11, 120]);
    const best = e.masks.reduce((a, b) => (b.total < a.total ? b : a));
    assert.equal(best.mask, e.chosen);
    assert.deepEqual(e.masks[e.chosen].modules, e.modules);
    // Every codeword bit has a module; a few remainder bits may be left over.
    assert.ok(e.order.length >= e.interleaved.length * 8 && e.order.length - e.interleaved.length * 8 < 8);
  });
});

describe('link safety checker', () => {
  it('flags the usual scam patterns and passes ordinary links', async () => {
    const { checkLink } = await import('../shared/linkcheck.ts');
    assert.equal(checkLink('https://www.google.com/maps').verdict, 'safe-looking');
    assert.equal(checkLink('https://paypa1.com/login').verdict, 'danger');
    assert.equal(checkLink('https://secure-paypa1.com.account-verify.xyz/login').verdict, 'danger');
    assert.equal(checkLink('https://www.paypal.com/in/home').verdict, 'safe-looking');
    assert.equal(checkLink('https://secure-sbi.kyc-update.xyz/verify').verdict, 'danger');
    assert.equal(checkLink('https://kyc-update.xyz/verify').verdict, 'caution');
    assert.equal(checkLink('https://www.google.com@evil.example/').verdict, 'danger');
    assert.equal(checkLink('http://192.168.4.20/pay').verdict, 'danger');
    assert.equal(checkLink('https://xn--pple-43d.com').verdict, 'danger');
    assert.equal(checkLink('https://bit.ly/3abc').verdict, 'caution');
    assert.equal(checkLink('javascript:alert(1)').verdict, 'danger');
    const upi = checkLink('upi://pay?pa=asha@okaxis&pn=Asha%20Stores&am=250.00&cu=INR');
    assert.equal(upi.kind, 'upi');
    assert.equal(upi.verdict, 'safe-looking');
    assert.match(upi.summary, /Asha Stores/);
    assert.equal(checkLink('upi://pay?pa=x@ybl&pn=Refund%20Desk&am=5000&tn=cashback%20refund').verdict, 'danger');
    assert.equal(checkLink('WIFI:T:nopass;S:Free Airport WiFi;;').verdict, 'caution');
    assert.equal(checkLink('Just a note').kind, 'text');
  });
});
