import type { Db } from './db.ts';
import type { Keys } from './security.ts';

export interface AppCtx {
  db: Db;
  keys: Keys;
  /** The site's public address, e.g. https://qrforge.onrender.com (used inside QR codes). */
  publicUrl: string;
  /** Look up countries for scans (off in tests). */
  geo: boolean;
}
