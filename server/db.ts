import pg from 'pg';

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs `fn` in one transaction (BEGIN … COMMIT, rolled back on error). */
  tx<T>(fn: (q: Db['query']) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly kind: 'postgres' | 'pglite';
}

/**
 * Postgres when DATABASE_URL is set (Neon in production). Otherwise an embedded Postgres (PGlite) for
 * development and tests; it is loaded only then, as it needs a few hundred MB of memory.
 */
export async function openDb(opts: { url?: string | null; dir?: string | null }): Promise<Db> {
  let db: Db;
  if (opts.url) {
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(opts.url);
    const pool = new pg.Pool({ connectionString: opts.url, max: 5, ssl: local ? undefined : { rejectUnauthorized: false } });
    db = {
      kind: 'postgres',
      async query<T>(text: string, params?: unknown[]) {
        return (await pool.query(text, params as unknown[])).rows as T[];
      },
      async tx<T>(fn: (q: Db['query']) => Promise<T>) {
        const client = await pool.connect();
        try {
          await client.query('begin');
          const out = await fn(async <R,>(text: string, params?: unknown[]) => (await client.query(text, params as unknown[])).rows as R[]);
          await client.query('commit');
          return out;
        } catch (err) {
          await client.query('rollback').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const lite = new PGlite(opts.dir ?? undefined);
    await lite.waitReady;
    // PGlite runs one statement at a time: queue callers so a transaction is never interleaved.
    let queue: Promise<unknown> = Promise.resolve();
    const run = <T,>(work: () => Promise<T>): Promise<T> => {
      const p = queue.then(work);
      queue = p.catch(() => {});
      return p;
    };
    const raw = async <T,>(text: string, params?: unknown[]) => (await lite.query<T>(text, params)).rows;
    db = {
      kind: 'pglite',
      query: (text, params) => run(() => raw(text, params)),
      tx: (fn) =>
        run(async () => {
          await raw('begin');
          try {
            const out = await fn(raw);
            await raw('commit');
            return out;
          } catch (err) {
            await raw('rollback').catch(() => {});
            throw err;
          }
        }),
      close: () => lite.close(),
    };
  }
  await migrate(db);
  return db;
}

// Timestamps are epoch milliseconds (double precision), so both drivers return plain numbers.
const MIGRATIONS: string[] = [
  `create table users (
     id text primary key,
     email text not null unique,
     name text not null,
     password_hash text not null,
     created_at double precision not null
   );
   create table sessions (
     token_hash text primary key,
     user_id text not null references users(id) on delete cascade,
     expires_at double precision not null
   );
   create table secrets (
     name text primary key,
     value text not null
   );
   create table qrcodes (
     id text primary key,
     user_id text not null references users(id) on delete cascade,
     slug text not null unique,
     kind text not null,
     type text not null,
     title text not null,
     data jsonb not null default '{}',
     design jsonb not null default '{}',
     rules jsonb not null default '[]',
     security jsonb not null default '{}',
     timezone text not null default 'UTC',
     scan_count integer not null default 0,
     active boolean not null default true,
     created_at double precision not null,
     updated_at double precision not null
   );
   create index qrcodes_user on qrcodes (user_id, updated_at);
   create table scans (
     id bigint generated always as identity primary key,
     qr_id text not null references qrcodes(id) on delete cascade,
     at double precision not null,
     visitor text not null,
     device text not null,
     os text not null,
     browser text not null,
     lang text not null,
     country text not null default '',
     outcome text not null,
     target text not null default ''
   );
   create index scans_qr on scans (qr_id, at);
   create table events (
     id text primary key,
     user_id text not null references users(id) on delete cascade,
     title text not null,
     venue text not null default '',
     starts_at text not null default '',
     created_at double precision not null
   );
   create table tickets (
     id text primary key,
     event_id text not null references events(id) on delete cascade,
     name text not null,
     email text not null default '',
     created_at double precision not null,
     checked_in_at double precision,
     checked_in_by text
   );
   create index tickets_event on tickets (event_id);
   create table certificates (
     id text primary key,
     user_id text not null references users(id) on delete cascade,
     data jsonb not null,
     signature text not null,
     revoked boolean not null default false,
     created_at double precision not null
   );
   create table files (
     id text primary key,
     user_id text not null references users(id) on delete cascade,
     name text not null,
     mime text not null,
     data bytea not null,
     created_at double precision not null
   );
   create table jobs (
     id text primary key,
     user_id text not null references users(id) on delete cascade,
     kind text not null,
     status text not null default 'queued',
     progress integer not null default 0,
     total integer not null default 0,
     input jsonb not null,
     result_file text,
     error text,
     attempts integer not null default 0,
     created_at double precision not null,
     updated_at double precision not null
   );
   create index jobs_queue on jobs (status, created_at);`,
  // Bulk jobs keep their finished items and row errors, so a restarted job resumes instead of starting over.
  `alter table jobs add column report jsonb not null default '{}'`,
];

async function migrate(db: Db): Promise<void> {
  await db.query('create table if not exists schema_version (version integer not null)');
  const [row] = await db.query<{ version: number }>('select version from schema_version');
  let version = row?.version ?? 0;
  if (!row) await db.query('insert into schema_version (version) values (0)');
  for (; version < MIGRATIONS.length; version++) {
    for (const stmt of MIGRATIONS[version].split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.query(stmt);
    await db.query('update schema_version set version = $1', [version + 1]);
  }
}
