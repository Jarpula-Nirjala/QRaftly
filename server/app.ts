import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { AppCtx } from './context.ts';
import { openDb } from './db.ts';
import { HttpError } from './http.ts';
import { authRoutes, sessionMiddleware } from './routes-auth.ts';
import { qrRoutes } from './routes-qr.ts';
import { loadKeys } from './security.ts';

export interface ServerOptions {
  port: number;
  databaseUrl?: string | null;
  /** Folder for the embedded database (when there is no DATABASE_URL); null keeps it in memory. */
  dataDir?: string | null;
  /** The built website (dist/); omitted in tests. */
  staticDir?: string;
  publicUrl?: string;
  geo?: boolean;
}

export interface RunningServer {
  port: number;
  ctx: AppCtx;
  close(): Promise<void>;
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const db = await openDb({ url: opts.databaseUrl, dir: opts.dataDir });
  const ctx: AppCtx = { db, keys: await loadKeys(db), publicUrl: (opts.publicUrl ?? `http://localhost:${opts.port}`).replace(/\/+$/, ''), geo: opts.geo ?? false };
  /** Feature modules; each may return a function that stops its background work. */
  const extra: Array<(app: express.Express, ctx: AppCtx) => void | (() => void)> = [];
  const stops: Array<() => void> = [];
  for (const mod of ['./routes-events.ts', './routes-certs.ts', './routes-bulk.ts']) {
    const file = new URL(mod, import.meta.url);
    if (fs.existsSync(file)) extra.push((await import(file.href)).mount);
  }

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.use(sessionMiddleware(ctx));
  app.use('/api/auth', express.json({ limit: '20kb' }), authRoutes(ctx));
  app.use(qrRoutes(ctx));
  for (const mount of extra) {
    const stop = mount(app, ctx);
    if (stop) stops.push(stop);
  }
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

  if (opts.staticDir && fs.existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir, { index: false, maxAge: '1h', setHeaders: (res, p) => /[\\/]assets[\\/]/.test(p) && res.setHeader('Cache-Control', 'public, max-age=31536000, immutable') }));
    // The web app handles every other page.
    const index = path.join(opts.staticDir, 'index.html');
    app.get('/*rest', (_req, res) => res.sendFile(index));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : (err as { status?: number })?.status === 413 ? 413 : (err as { type?: string })?.type === 'entity.parse.failed' ? 400 : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Something went wrong on our side.' : status === 413 ? 'That is too large.' : (err as Error).message });
  });

  const server = http.createServer(app);
  await new Promise<void>((ok) => server.listen(opts.port, ok));
  const port = (server.address() as { port: number }).port;
  if (!opts.publicUrl) ctx.publicUrl = `http://localhost:${port}`;
  return {
    port,
    ctx,
    close: async () => {
      for (const stop of stops) stop();
      server.closeAllConnections();
      await new Promise<void>((ok) => server.close(() => ok()));
      await db.close();
    },
  };
}
