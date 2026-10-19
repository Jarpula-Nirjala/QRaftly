/**
 * Browser smoke test against a running server, in the Edge or Chrome already installed (playwright-core,
 * no browser download). The door scanner is tested end to end: a ticket's QR code is written into a Y4M
 * video that the browser uses as its camera, so frames go through the worker and our own decoder.
 *
 *   BASE=http://localhost:3100 SHOTS=./shots node e2e/smoke.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { PNG } from 'pngjs';
import { scanImage } from '../shared/qr/detect.ts';
import { encodeText } from '../shared/qr/encode.ts';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const SHOTS = process.env.SHOTS ?? path.join(os.tmpdir(), 'qrforge-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const email = `smoke-${Date.now()}@example.com`;

/** A 640×480 Y4M clip (2 s at 10 fps) of a QR code on a grey desk, slightly rotated. */
function y4m(text: string, file: string) {
  const W = 640;
  const H = 480;
  const qr = encodeText(text, { ecl: 'M' });
  const n = qr.size + 8;
  const unit = 300 / n;
  const a = (8 * Math.PI) / 180;
  const y = Buffer.alloc(W * H);
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      // Rotate the pixel back into the code's frame.
      const dx = px - W / 2;
      const dy = py - H / 2;
      const u = (dx * Math.cos(a) + dy * Math.sin(a)) / unit + n / 2;
      const v = (-dx * Math.sin(a) + dy * Math.cos(a)) / unit + n / 2;
      let val = 110 + ((px + py) % 7);
      if (u >= 0 && v >= 0 && u < n && v < n) {
        const mx = Math.floor(u) - 4;
        const my = Math.floor(v) - 4;
        val = mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.modules[my][mx] ? 30 : 230;
      }
      y[py * W + px] = val;
    }
  const uv = Buffer.alloc((W / 2) * (H / 2), 128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), y, uv, uv]);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), ...Array(20).fill(frame)]));
}

async function api(p: string, cookie: string, body?: unknown) {
  const res = await fetch(BASE + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json().catch(() => null)) as any, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

const shot = (page: Page, name: string, fullPage = true) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });
const noSideScroll = async (page: Page, where: string) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${where}: page scrolls sideways`);

// Accounts and data through the API first, so the camera clip can contain a real ticket.
const signup = await api('/api/auth/signup', '', { name: 'Smoke Test', email, password: 'password123' });
assert.equal(signup.status, 200, JSON.stringify(signup.json));
const cookie = signup.cookie!;
const ev = (await api('/api/events', cookie, { title: 'Smoke Meetup', venue: 'Hall 2', startsAt: '2026-11-20T18:30' })).json.event;
const [ticket] = (await api(`/api/events/${ev.id}/tickets`, cookie, { attendees: [{ name: 'Asha Rao' }, { name: 'Ravi Kumar' }] })).json.tickets;
const clip = path.join(SHOTS, 'ticket.y4m');
y4m(ticket.url, clip);

const browser = await chromium.launch({
  channel: process.env.CHANNEL ?? 'msedge',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${clip}`],
});
const errors: string[] = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, permissions: ['camera'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));

  // Home page and the free generator.
  await page.goto(BASE);
  await page.getByRole('heading', { name: /keep working/ }).waitFor();
  await page.locator('.preview .qr svg').waitFor();
  await page.getByText('Safe to print').waitFor();
  await shot(page, '01-landing');
  // The codes drawn inside the home page's mockups must really scan (decoded from the rendered pixels).
  let scannable = 0;
  for (const stage of await page.locator('.v-scene, .v-stage').all()) {
    await stage.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const png = PNG.sync.read(await stage.screenshot());
    if (scanImage(png.data, png.width, png.height)?.text === BASE) scannable++;
  }
  assert.ok(scannable >= 6, `only ${scannable} mockup codes scanned`);
  await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole('button', { name: 'Wi-Fi' }).click();
  await page.getByLabel('Network name (SSID)').fill('Home-WiFi');
  await page.getByLabel('Password').fill('secret123');
  await page.getByRole('tab', { name: '2. Design' }).click();
  await page.getByRole('button', { name: 'Dots', exact: true }).click();
  await page.getByText('Safe to print').waitFor();
  await shot(page, '02-generator-design', false);

  // Sign in through the form.
  await ctx.clearCookies();
  await page.goto(`${BASE}/signin`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${BASE}/app`);
  await page.getByRole('heading', { name: 'Your codes' }).waitFor();

  // A dynamic code with a rule, then scans from two kinds of phone.
  await page.getByRole('link', { name: 'New code' }).click();
  await page.getByLabel('Name (only you see this)').fill('Cafe menu');
  await page.getByLabel('Where the code goes').fill('example.com/menu');
  await page.getByRole('tab', { name: /Rules/ }).click();
  await page.getByRole('button', { name: 'Add a rule' }).click();
  await page.getByLabel('Then open').fill('https://apps.apple.com/app/cafe');
  await page.getByLabel('iPhone / iPad').check();
  await page.getByRole('button', { name: 'Create code' }).click();
  await page.waitForURL(/\/app\/qr\//);
  const short = (await page.locator('.mono').first().textContent())!;
  const slug = short.split('/r/')[1];
  const iphone = await fetch(`${BASE}/r/${slug}`, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1' } });
  assert.equal(iphone.headers.get('location'), 'https://apps.apple.com/app/cafe');
  for (let i = 0; i < 3; i++) await fetch(`${BASE}/r/${slug}`, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 15) Chrome/130 Mobile Safari/537.36' } });
  await page.waitForTimeout(300);
  await page.reload();
  await page.locator('.stat .value').first().filter({ hasText: '4' }).waitFor();
  await shot(page, '03-analytics');
  await page.getByRole('tab', { name: /Edit/ }).click();
  await page.getByText('Scan check').waitFor();
  await shot(page, '04-edit', false);

  // Door scanner: the fake camera shows Asha's ticket.
  await page.goto(`${BASE}/app/events/${ev.id}/scan`);
  await page.getByRole('heading', { name: 'Welcome, Asha Rao' }).waitFor({ timeout: 20_000 });
  await page.locator('.headcount').filter({ hasText: '1' }).waitFor();
  await shot(page, '05-door-scanner', false);
  await page.goto(`${BASE}/app/events/${ev.id}`);
  await page.getByText('Ravi Kumar').waitFor();
  await shot(page, '06-event');

  // Ticket page (public).
  await page.goto(ticket.url);
  await page.getByText('ADMIT ONE').waitFor();
  await page.getByText(/Checked in/).waitFor();
  await shot(page, '07-ticket');

  // Certificates: issue, verify, then forge.
  await page.goto(`${BASE}/app/certificates`);
  await page.getByLabel('Awarded to').fill('Asha Rao');
  await page.getByLabel('For', { exact: true }).fill('Full-stack web development');
  await page.getByRole('button', { name: 'Issue and sign' }).click();
  await page.locator('.cert-sheet').waitFor();
  await shot(page, '08-certificate');
  const certs = (await api('/api/certs', cookie)).json.certs;
  await page.goto(certs[0].url);
  await page.getByRole('heading', { name: 'Genuine certificate' }).waitFor();
  await page.getByRole('button', { name: 'Try to forge it' }).click();
  await page.locator('.cert-fields input').first().fill('Mallory');
  await page.getByRole('button', { name: 'Check the edited certificate' }).click();
  await page.getByRole('heading', { name: 'Tampered' }).waitFor();
  await shot(page, '09-verify-tampered');

  // Bulk: a PDF sheet of dynamic codes.
  await page.goto(`${BASE}/app/bulk`);
  await page.getByLabel('…or paste it here').fill('label,url\nTable 1,example.com/t1\nTable 2,example.com/t2\nTable 3,example.com/t3');
  await page.getByRole('button', { name: 'Generate' }).click();
  await page.getByText('Ready').waitFor({ timeout: 20_000 });
  await shot(page, '10-bulk');

  // A profile page and the PIN gate.
  const prof = (await api('/api/qrs', cookie, { kind: 'profile', data: { firstName: 'Asha', lastName: 'Rao', title: 'Engineer', org: 'QRForge', email: 'asha@example.com', bio: 'I build web apps.', links: [{ label: 'GitHub', url: 'https://github.com' }] } })).json.qr;
  await page.goto(`${BASE}/p/${prof.slug}`);
  await page.getByRole('link', { name: 'Save contact' }).waitFor();
  await shot(page, '11-profile');
  const locked = (await api('/api/qrs', cookie, { kind: 'dynamic', data: { url: 'https://example.com/secret' }, security: { pin: '4321' } })).json.qr;
  await page.goto(`${BASE}/r/${locked.slug}`);
  await page.getByLabel('PIN').fill('4321');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.waitForURL('https://example.com/secret');

  // Phone width, dark theme.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const m = await phone.newPage();
  m.on('pageerror', (e) => errors.push(`pageerror (phone): ${e.message}`));
  await m.goto(BASE);
  await m.locator('.preview .qr svg').waitFor();
  await noSideScroll(m, 'home on a phone');
  await shot(m, '12-phone-dark');
  await m.goto(`${BASE}/p/${prof.slug}`);
  await m.getByRole('link', { name: 'Save contact' }).waitFor();
  await noSideScroll(m, 'profile on a phone');

  assert.deepEqual(errors, []);
  console.log(`smoke test passed; screenshots in ${SHOTS}`);
} finally {
  await browser.close();
}
