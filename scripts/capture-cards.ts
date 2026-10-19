/**
 * Photographs the site's own tools for the pictures on the home page's Explore cards.
 * Run against a running server, then commit client/public/cards/*.jpg:
 *
 *   BASE=http://localhost:3100 node scripts/capture-cards.ts
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Locator, type Page } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const OUT = path.resolve('client/public/cards');
const RAW = path.join(OUT, '.raw');
fs.mkdirSync(RAW, { recursive: true });

async function api(p: string, cookie: string, body?: unknown) {
  const res = await fetch(BASE + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  return { json: (await res.json().catch(() => null)) as any, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

// A plain studio backdrop instead of the page background, so each picture stands on its own.
const STUDIO_CSS = `
.bg-layer, .header, .back-bar, .toast-box { display: none !important; }
.ex-visual { max-width: 640px !important; width: 640px !important; }
body { background: #f4f6f9 !important; }
.v-stage { background: radial-gradient(120% 90% at 30% 10%, #ffffff 0%, #f3f5f8 55%, #e3e7ee 100%) !important;
  -webkit-mask-image: none !important; mask-image: none !important; border-radius: 0 !important; }
.v-stage.stone { background: radial-gradient(90% 70% at 25% 15%, rgb(255 255 255 / .9), transparent 60%), linear-gradient(160deg, #eceae6, #ddd9d2) !important; }
* { animation-play-state: paused !important; }
`;

const shots: Array<[string, (p: Page) => Promise<Locator>]> = [];

async function main() {
  const { cookie } = await api('/api/auth/signup', '', { name: 'Card Shots', email: `cards-${Date.now()}@example.com`, password: 'password123' });
  // Each Explore card shows the main mockup from the top of its own page.
  for (const [file, path] of [['x-studio', '/studio'], ['x-growth', '/growth'], ['x-venues', '/venues'], ['x-trust', '/trust'], ['x-engine', '/engine']])
    shots.push([file, async (p) => (await p.goto(BASE + path, { waitUntil: 'domcontentloaded' }), p.locator('.ex-visual .v-stage'))]);

  const browser = await chromium.launch({ channel: process.env.CHANNEL ?? 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => localStorage.setItem('qrf-theme', 'light'));
  const [name, value] = cookie!.split('=');
  await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage();
  for (const [file, find] of shots) {
    const el = await find(page);
    await page.addStyleTag({ content: STUDIO_CSS });
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await el.screenshot({ path: path.join(RAW, `${file}.png`) });
    console.log('captured', file);
  }
  await browser.close();
  // Resize to 760 px wide and compress (OpenCV is used here only as an offline image tool).
  execFileSync('python', ['-I', '-c', `
import cv2, glob, os, sys
for f in glob.glob(os.path.join(sys.argv[1], '*.png')):
    im = cv2.imread(f); h, w = im.shape[:2]; s = min(1, 760 / w)
    im = cv2.resize(im, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(sys.argv[2], os.path.basename(f)[:-4] + '.jpg'), im, [cv2.IMWRITE_JPEG_QUALITY, 80, cv2.IMWRITE_JPEG_PROGRESSIVE, 1])
`, RAW, OUT]);
  fs.rmSync(RAW, { recursive: true, force: true });
}

await main();
