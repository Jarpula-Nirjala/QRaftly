import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './app.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Private local settings (Google sign-in keys and the like) from an uncommitted .env file; Render sets its own.
if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));

if (!process.env.DATABASE_URL && process.env.RENDER)
  console.warn('DATABASE_URL is not set: starting the embedded database, which needs about 400 MB of memory and is lost on every redeploy. Set DATABASE_URL (a free Neon Postgres) in Render → Environment.');

const server = await startServer({
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || null,
  dataDir: process.env.DATABASE_URL ? null : (process.env.DATA_DIR ?? path.join(root, 'data')),
  staticDir: path.join(root, 'dist'),
  publicUrl: process.env.PUBLIC_URL || undefined,
  geo: process.env.GEOIP !== 'off',
});
console.log(`QRaftly listening on http://localhost:${server.port} (database: ${server.ctx.db.kind})`);

let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    await server.close();
    process.exit(0);
  });
