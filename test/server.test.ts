import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import jsQRModule from 'jsqr';
import { PNG } from 'pngjs';
import { startServer, type RunningServer } from '../server/app.ts';

const jsQR = jsQRModule as unknown as (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null;
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const WHATSAPP = 'WhatsApp/2.24.1 A';

describe('QRaftly server', () => {
  let server: RunningServer;
  let cookie = '';
  let other = '';
  const B = () => `http://localhost:${server.port}`;
  const api = async (p: string, init: { method?: string; body?: unknown; as?: string; ua?: string; lang?: string } = {}) => {
    const res = await fetch(B() + p, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      redirect: 'manual',
      headers: { 'content-type': 'application/json', cookie: init.as ?? cookie, 'user-agent': init.ua ?? IPHONE, 'accept-language': init.lang ?? 'en-IN,en;q=0.9', 'x-forwarded-for': '203.0.113.7' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const set = res.headers.get('set-cookie');
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: res.status, json, text, location: res.headers.get('location'), cookie: set?.split(';')[0], headers: res.headers };
  };
  const scan = (slug: string, ua = IPHONE, lang?: string) => api(`/r/${slug}`, { ua, lang, as: '' });

  before(async () => {
    server = await startServer({ port: 0, dataDir: null });
    const a = await api('/api/auth/signup', { body: { name: 'Asha', email: 'asha@example.com', password: 'password123' } });
    assert.equal(a.status, 200);
    cookie = a.cookie!;
    other = (await api('/api/auth/signup', { body: { name: 'Ravi', email: 'ravi@example.com', password: 'password123' }, as: '' })).cookie!;
  });
  after(() => server.close());

  it('accounts: sign up, sign in, wrong password, me, sign out', async () => {
    assert.equal((await api('/api/auth/me')).json.user.name, 'Asha');
    assert.equal((await api('/api/auth/signup', { body: { name: 'A', email: 'asha@example.com', password: 'password123' }, as: '' })).status, 409);
    assert.equal((await api('/api/auth/signup', { body: { name: 'A', email: 'x@y.co', password: 'short' }, as: '' })).status, 400);
    assert.equal((await api('/api/auth/signin', { body: { email: 'asha@example.com', password: 'nope-nope' }, as: '' })).status, 401);
    const s = await api('/api/auth/signin', { body: { email: 'ASHA@example.com', password: 'password123' }, as: '' });
    assert.equal(s.status, 200);
    const out = await api('/api/auth/signout', { body: {}, as: s.cookie });
    assert.equal(out.status, 200);
    assert.equal((await api('/api/auth/me', { as: s.cookie })).json.user, null);
    assert.equal((await api('/api/qrs', { as: '' })).status, 401);
  });

  it('static codes store the payload and validate it', async () => {
    const w = await api('/api/qrs', { body: { kind: 'static', type: 'wifi', data: { ssid: 'Home', password: 'secret12', security: 'WPA' } } });
    assert.equal(w.status, 201);
    assert.equal(w.json.qr.content, 'WIFI:T:WPA;S:Home;P:secret12;;');
    assert.equal(w.json.qr.title, 'Wi-Fi');
    assert.equal(w.json.qr.shortUrl, null);
    const bad = await api('/api/qrs', { body: { kind: 'static', type: 'upi', data: { vpa: 'nope', name: 'x' } } });
    assert.equal(bad.status, 400);
    assert.match(bad.json.error, /UPI ID/);
  });

  it('dynamic codes redirect, can change destination, and record scans', async () => {
    const c = await api('/api/qrs', { body: { kind: 'dynamic', data: { url: 'example.com/menu' }, title: 'Cafe menu' } });
    assert.equal(c.status, 201);
    const { slug, id, content } = c.json.qr;
    assert.equal(content, `${B()}/r/${slug}`);
    const first = await scan(slug);
    assert.equal(first.status, 302);
    assert.equal(first.location, 'https://example.com/menu');
    // Change where it points without reprinting.
    await api(`/api/qrs/${id}`, { method: 'PATCH', body: { data: { url: 'https://example.com/new-menu' } } });
    assert.equal((await scan(slug, ANDROID, 'hi-IN')).location, 'https://example.com/new-menu');
    await new Promise((r) => setTimeout(r, 150));
    const stats = (await api(`/api/qrs/${id}/stats`)).json;
    assert.equal(stats.total, 2);
    assert.deepEqual(stats.os.map((o: any) => o.name).sort(), ['android', 'ios']);
    assert.ok(stats.lang.some((l: any) => l.name === 'hi'));
    assert.equal(stats.byDay.length, 30);
    assert.equal(stats.byDay.at(-1).n, 2);
    const csv = await api(`/api/qrs/${id}/scans.csv`);
    assert.match(csv.text.split('\n')[0], /^time,device,os/);
    assert.equal(csv.text.trim().split('\n').length, 3);
  });

  it('context rules send phones and times to different places', async () => {
    const c = await api('/api/qrs', {
      body: {
        kind: 'dynamic',
        data: { url: 'https://example.com/web' },
        rules: [
          { label: 'Android', os: ['android'], target: 'https://play.google.com/store/apps/details?id=app' },
          { label: 'iPhone', os: ['ios'], target: 'https://apps.apple.com/app/id1' },
          { label: 'Always (time window)', from: '00:00', to: '23:59', target: 'https://example.com/any-time' },
        ],
        timezone: 'Asia/Kolkata',
      },
    });
    const slug = c.json.qr.slug;
    assert.match((await scan(slug, ANDROID)).location!, /play\.google/);
    assert.match((await scan(slug, IPHONE)).location!, /apps\.apple/);
    assert.equal((await scan(slug, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0')).location, 'https://example.com/any-time');
    const bad = await api('/api/qrs', { body: { kind: 'dynamic', data: { url: 'a.com' }, rules: [{ target: 'https://b.com' }] } });
    assert.equal(bad.status, 400);
    assert.match(bad.json.error, /condition/);
  });

  it('a PIN-protected code goes to the gate and opens with the right PIN only', async () => {
    const c = await api('/api/qrs', { body: { kind: 'dynamic', data: { url: 'https://example.com/secret' }, security: { pin: '4321' } } });
    const slug = c.json.qr.slug;
    assert.equal(c.json.qr.security.hasPin, true);
    assert.equal(c.json.qr.security.pinHash, undefined);
    assert.equal((await scan(slug)).location, `/g/${slug}`);
    assert.equal((await api(`/api/r/${slug}`, { as: '' })).json.needsPin, true);
    assert.equal((await api(`/api/r/${slug}/unlock`, { body: { pin: '0000' }, as: '' })).status, 403);
    const ok = await api(`/api/r/${slug}/unlock`, { body: { pin: '4321' }, as: '' });
    assert.equal(ok.json.target, 'https://example.com/secret');
    assert.equal((await api('/api/qrs', { body: { kind: 'dynamic', data: { url: 'a.com' }, security: { pin: '12' } } })).status, 400);
  });

  it('expired and switched-off codes stop working', async () => {
    const e = await api('/api/qrs', { body: { kind: 'dynamic', data: { url: 'https://example.com/sale' }, security: { expiresAt: Date.now() - 1000 } } });
    assert.equal((await scan(e.json.qr.slug)).location, '/x/expired');
    const live = await api('/api/qrs', { body: { kind: 'dynamic', data: { url: 'https://example.com/live' } } });
    await api(`/api/qrs/${live.json.qr.id}`, { method: 'PATCH', body: { active: false } });
    assert.equal((await scan(live.json.qr.slug)).location, '/x/off');
  });

  it('a single-use code works exactly once, even with five scans at the same moment', async () => {
    const c = await api('/api/qrs', { body: { kind: 'dynamic', data: { url: 'https://example.com/once' }, security: { maxScans: 1 } } });
    const slug = c.json.qr.slug;
    // A WhatsApp link preview must not use it up.
    assert.equal((await scan(slug, WHATSAPP)).location, `/g/${slug}`);
    const results = await Promise.all(Array.from({ length: 5 }, () => scan(slug)));
    const through = results.filter((r) => r.location === 'https://example.com/once');
    assert.equal(through.length, 1, results.map((r) => r.location).join(', '));
    assert.equal(results.filter((r) => r.location === '/x/limit').length, 4);
    assert.equal((await api(`/api/qrs/${c.json.qr.id}`)).json.qr.scanCount, 1);
  });

  it('link previews follow ordinary codes without counting as scans', async () => {
    const c = await api('/api/qrs', { body: { kind: 'dynamic', data: { url: 'https://example.com/p' } } });
    assert.equal((await scan(c.json.qr.slug, WHATSAPP)).location, 'https://example.com/p');
    await new Promise((r) => setTimeout(r, 100));
    const s = (await api(`/api/qrs/${c.json.qr.id}/stats`)).json;
    assert.equal(s.total, 0);
    assert.equal(s.bots, 1);
  });

  it('the server PNG is a real image that decodes to the code content', async () => {
    const c = await api('/api/qrs', { body: { kind: 'static', type: 'url', data: { url: 'https://qraftly.app/png-check' }, design: { fg: '#1f3a68', bg: '#ffffff' } } });
    const res = await fetch(`${B()}/api/qrs/${c.json.qr.id}/png?scale=6`, { headers: { cookie } });
    assert.equal(res.headers.get('content-type'), 'image/png');
    const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
    assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data, 'https://qraftly.app/png-check');
  });

  it('profile pages, contact download and medical cards with private details', async () => {
    const p = await api('/api/qrs', { body: { kind: 'profile', data: { firstName: 'Nirjala', lastName: 'J', title: 'SDE Intern', phone: '+91 90000 00000', links: [{ label: 'GitHub', url: 'github.com/x' }], bio: 'Builds things' } } });
    assert.equal(p.status, 201);
    const slug = p.json.qr.slug;
    assert.equal((await scan(slug)).location, `/p/${slug}`);
    const pub = (await api(`/api/public/${slug}`, { as: '' })).json;
    assert.equal(pub.data.title, 'SDE Intern');
    assert.equal(pub.data.links[0].url, 'https://github.com/x');
    const vcf = await api(`/api/public/${slug}/vcard`, { as: '' });
    assert.match(vcf.text, /^BEGIN:VCARD/);
    assert.match(vcf.headers.get('content-disposition') ?? '', /Nirjala-J\.vcf/);

    assert.equal((await api('/api/qrs', { body: { kind: 'medical', data: { public: { name: 'Asha' }, private: { notes: 'Diabetic' } } } })).status, 400, 'private details need a PIN');
    const m = await api('/api/qrs', { body: { kind: 'medical', data: { public: { name: 'Asha', bloodGroup: 'B+' }, private: { notes: 'Type 1 diabetic', doctor: 'Dr Rao' } }, security: { privatePin: '2468' } } });
    assert.equal(m.status, 201);
    assert.match(m.json.qr.content, /^EMERGENCY INFORMATION\nName: Asha\nBlood group: B\+\nMore: http/);
    const ms = m.json.qr.slug;
    const page = (await api(`/api/public/${ms}`, { as: '' })).json;
    assert.equal(page.data.private, undefined);
    assert.equal(page.data.hasPrivate, true);
    assert.equal((await api(`/api/public/${ms}/private`, { body: { pin: '1111' }, as: '' })).status, 403);
    assert.equal((await api(`/api/public/${ms}/private`, { body: { pin: '2468' }, as: '' })).json.private.doctor, 'Dr Rao');
  });

  it('a PIN-protected profile page needs the token from unlocking', async () => {
    const p = await api('/api/qrs', { body: { kind: 'profile', data: { firstName: 'Private' }, security: { pin: '9999' } } });
    const slug = p.json.qr.slug;
    assert.equal((await api(`/api/public/${slug}`, { as: '' })).status, 403);
    const target = (await api(`/api/r/${slug}/unlock`, { body: { pin: '9999' }, as: '' })).json.target as string;
    assert.match(target, new RegExp(`^/p/${slug}\\?k=`));
    const k = new URL(target, B()).searchParams.get('k');
    assert.equal((await api(`/api/public/${slug}?k=${k}`, { as: '' })).json.data.firstName, 'Private');
    assert.equal((await api(`/api/public/${slug}?k=${k}x`, { as: '' })).status, 403);
  });

  it('people cannot see or change each other’s codes', async () => {
    const mine = (await api('/api/qrs')).json.qrs;
    assert.ok(mine.length > 5);
    assert.equal((await api('/api/qrs', { as: other })).json.qrs.length, 0);
    assert.equal((await api(`/api/qrs/${mine[0].id}`, { as: other })).status, 404);
    assert.equal((await api(`/api/qrs/${mine[0].id}`, { method: 'DELETE', as: other })).status, 404);
    assert.equal((await api(`/api/qrs/${mine[0].id}/stats`, { as: other })).status, 404);
  });
});
