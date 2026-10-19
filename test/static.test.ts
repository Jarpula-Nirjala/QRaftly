import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { startServer, type RunningServer } from '../server/app.ts';

describe('serving the web app', () => {
  let server: RunningServer;
  let dir: string;
  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qrf-static-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>QRaftly</title>');
    server = await startServer({ port: 0, dataDir: null, staticDir: dir });
  });
  after(async () => {
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves the app at the root and at client routes, but not for unknown API paths', async () => {
    const get = (p: string) => fetch(`http://localhost:${server.port}${p}`, { redirect: 'manual' });
    for (const p of ['/', '/app', '/t/abc.def', '/v/xyz.sig']) {
      const r = await get(p);
      assert.equal(r.status, 200, p);
      assert.match(await r.text(), /<title>QRaftly/, p);
    }
    assert.equal((await get('/api/nope')).status, 404);
    assert.equal((await get('/r/nope')).headers.get('location'), '/x/missing');
  });
});
