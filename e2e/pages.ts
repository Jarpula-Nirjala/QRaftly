/**
 * Browser test for the five feature pages and the tools behind them (run against a live server).
 *
 *   BASE=http://localhost:3100 SHOTS=./shots node e2e/pages.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const SHOTS = process.env.SHOTS ?? path.join(os.tmpdir(), 'qraftly-pages');
fs.mkdirSync(SHOTS, { recursive: true });

async function api(p: string, cookie: string, body?: unknown, method?: string) {
  const res = await fetch(BASE + p, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json().catch(() => null)) as any, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });

const email = `pages-${Date.now()}@example.com`;
const cookie = (await api('/api/auth/signup', '', { name: 'Page Tester', email, password: 'password123' })).cookie!;

const browser = await chromium.launch({ channel: process.env.CHANNEL ?? 'msedge', headless: true });
const errors: string[] = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));

  // Dark is the default theme.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('.hero-name').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  // Header links scroll to their sections.
  for (const [label, id] of [['Features', 'features'], ['How it works', 'how']] as const) {
    await page.evaluate(() => scrollTo(0, 0));
    await page.locator('.nav').getByRole('link', { name: label, exact: true }).click();
    // Smooth scrolling over a long page takes a moment: wait for it to settle.
    let top = Infinity;
    for (let t = 0; t < 30 && !(top > -5 && top < 140); t++) {
      await page.waitForTimeout(200);
      top = await page.evaluate((i) => document.getElementById(i)!.getBoundingClientRect().top, id);
    }
    assert.ok(top > -5 && top < 140, `${label} scrolled to ${top}`);
  }
  await shot(page, 'how-it-works');
  await page.locator('#compare').scrollIntoViewIfNeeded();
  await shot(page, 'compare');

  // The five pages: tabs, five features each, previous/next, back.
  for (const p of ['/studio', '/growth', '/venues', '/trust', '/engine']) {
    await page.goto(BASE + p, { waitUntil: 'domcontentloaded' });
    await page.locator('.ex-head h1').waitFor();
    assert.equal(await page.locator('.ex-feature').count(), 5, `${p} has five features`);
    await page.locator('.back-btn').waitFor();
    await shot(page, `page${p.replace('/', '-')}`);
  }
  // Page tabs and the back button; no Home tab or "Page n of 5" labels on these pages.
  await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded' });
  assert.deepEqual((await page.locator('.ex-tabs a').allTextContents()).map((t) => t.trim()), ['Studio', 'Growth', 'Venues', 'Trust', 'Engine']);
  assert.equal(await page.getByText(/Page \d of 5/).count(), 0);
  await page.locator('.ex-tabs a', { hasText: 'Growth' }).click();
  await page.waitForURL(`${BASE}/growth`);
  await page.locator('.back-btn').click();
  await page.waitForURL(`${BASE}/studio`);

  // Studio: picture QR proves itself; damage simulator reads the intact code.
  await page.getByText('Scans: decoded from its own pixels').waitFor({ timeout: 15_000 });
  await page.locator('#f4').getByText('Still scans').waitFor();
  await page.locator('#f5 .mini-qr svg').waitFor();

  // Growth: the split follows the weights; UTM link is built.
  await page.goto(`${BASE}/growth`, { waitUntil: 'domcontentloaded' });
  await page.locator('#f6 .hbar .n').first().waitFor();
  const shareA = Number((await page.locator('#f6 .hbar .n').first().textContent())!.replace('%', ''));
  assert.ok(shareA > 45 && shareA < 55, `share ${shareA}`);
  assert.match((await page.locator('#f8 .code-block').textContent())!, /utm_source=poster/);

  // Trust: link checker, then a real view-once note round trip.
  await page.goto(`${BASE}/trust`, { waitUntil: 'domcontentloaded' });
  await page.locator('#f16').getByRole('heading', { name: 'Do not open' }).waitFor();
  await page.locator('#f18 textarea').fill('Locker 14 code: 7392');
  await page.locator('#f18').getByRole('button', { name: 'Seal it' }).click();
  const link = (await page.locator('#f18 .mono').textContent())!;
  assert.match(link, /\/n\/[\w-]+#[\w-]+$/);
  const reader = await browser.newContext();
  const rp = await reader.newPage();
  await rp.goto(link, { waitUntil: 'domcontentloaded' });
  await rp.getByRole('button', { name: 'Reveal the note' }).click();
  await rp.getByText('Locker 14 code: 7392').waitFor();
  // A second visitor (a fresh tab) finds nothing.
  const again = await reader.newPage();
  await again.goto(link, { waitUntil: 'domcontentloaded' });
  await again.getByText('This note is gone').waitFor();
  await reader.close();

  // Offline certificate check in the browser.
  await ctx.addCookies([{ name: cookie.split('=')[0], value: cookie.split('=').slice(1).join('='), url: BASE }]);
  const cert = (await api('/api/certs', cookie, { recipient: 'Asha Rao', title: 'Bootcamp', issuer: 'QRaftly Academy', date: '2026-10-01' })).json.cert;
  await page.locator('#f17 input.input').fill(cert.url);
  await page.locator('#f17').getByRole('button', { name: 'Check on this device' }).click();
  await page.locator('#f17 .note').waitFor();
  const verdict = (await page.locator('#f17 .note').textContent())!;
  assert.ok(/Genuine/.test(verdict) || /cannot check Ed25519/.test(verdict), verdict);

  // Engine: x-ray, encoder steps, masks, benchmark.
  await page.goto(`${BASE}/engine`, { waitUntil: 'domcontentloaded' });
  await page.locator('#f21 .kv').getByText('/r/xray-demo').waitFor();
  await page.locator('#f23 figure.best').waitFor();
  await page.locator('#f25').getByRole('button', { name: /Run the benchmark/ }).click();
  await page.locator('#f25').getByText(/30\/30|2\d\/30/).waitFor({ timeout: 60_000 });
  await shot(page, 'engine-benchmark');

  // Account tools: feedback form → public rating → summary.
  await page.goto(`${BASE}/app/feedback`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Name (only you see this)').fill('Table feedback');
  await page.getByRole('button', { name: 'Create form' }).click();
  await page.waitForURL(/\/app\/feedback\/\w+/);
  const formUrl = (await page.locator('.mono').first().textContent())!;
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(formUrl, { waitUntil: 'domcontentloaded' });
  await guest.getByRole('radio', { name: '4 stars' }).click();
  await guest.getByRole('button', { name: 'Send' }).click();
  await guest.getByText('Thank you!').waitFor();
  await page.reload();
  await page.locator('.stat .value').first().filter({ hasText: '4' }).waitFor();

  // Queue: a customer takes a number, staff call it.
  await page.goto(`${BASE}/app/queues`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Name').fill('Pharmacy');
  await page.getByRole('button', { name: 'Create queue' }).click();
  await page.waitForURL(/\/app\/queues\/\w+/);
  const qUrl = (await page.locator('.mono').first().textContent())!;
  await guest.goto(qUrl, { waitUntil: 'domcontentloaded' });
  await guest.getByRole('button', { name: 'Take a number' }).click();
  await guest.getByText('Your number').waitFor();
  await page.getByRole('button', { name: /Call next/ }).click({ timeout: 10_000 });
  await guest.getByText('It’s your turn', { exact: false }).waitFor({ timeout: 12_000 });
  await shot(page, 'queue-desk');

  // API keys: shown once.
  await page.goto(`${BASE}/app/keys`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Create key' }).click();
  await page.getByText('shown only once', { exact: false }).waitFor();

  // A dynamic code: the Simulate tab answers.
  const qr = (await api('/api/qrs', cookie, { kind: 'dynamic', data: { url: 'example.com', split: [{ url: 'a.example', weight: 1 }, { url: 'b.example', weight: 1 }] }, rules: [{ label: 'iPhones', os: ['ios'], target: 'apps.apple.com' }] })).json.qr;
  await page.goto(`${BASE}/app/qr/${qr.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Simulate' }).click();
  await page.locator('.note.good').getByText(/Variant [AB]/).waitFor();
  await page.locator('select').first().selectOption('ios');
  await page.locator('.note.good').getByText('iPhones').waitFor();
  await page.getByRole('tab', { name: 'Analytics' }).click();
  await page.getByRole('heading', { name: 'The last year' }).waitFor();

  // Kiosk page renders (camera is not available here; it falls back gracefully).
  const ev = (await api('/api/events', cookie, { title: 'Kiosk test' })).json.event;
  await page.goto(`${BASE}/app/events/${ev.id}/kiosk`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Kiosk test' }).waitFor();

  // Phone width: no sideways scrolling on any page.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const p of ['/', '/studio', '/growth', '/venues', '/trust', '/engine']) {
    await phone.goto(BASE + p, { waitUntil: 'domcontentloaded' });
    await phone.waitForTimeout(800);
    assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${p} scrolls sideways on a phone`);
  }

  assert.deepEqual(errors, []);
  console.log(`pages test passed; screenshots in ${SHOTS}`);
} finally {
  await browser.close();
}
