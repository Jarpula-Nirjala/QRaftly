import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { Db } from './db.ts';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/** scrypt with a random salt, stored as "scrypt$salt$hash". */
export async function hashSecret(secret: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(secret, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const got = await scrypt(secret, Buffer.from(salt, 'base64url'), 32);
  const want = Buffer.from(hash, 'base64url');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('base64url');

/**
 * The server's long-lived keys, created on first start and kept in the database so they survive restarts:
 * an HMAC key (tickets, unlock tokens, anonymous visitor ids) and an Ed25519 key pair (certificates).
 */
export interface Keys {
  hmac: Buffer;
  signKey: crypto.KeyObject;
  verifyKey: crypto.KeyObject;
  /** The public key in PEM form, published so anyone can check a certificate. */
  publicPem: string;
}

export async function loadKeys(db: Db): Promise<Keys> {
  const get = async (name: string) => (await db.query<{ value: string }>('select value from secrets where name = $1', [name]))[0]?.value;
  const put = (name: string, value: string) => db.query('insert into secrets (name, value) values ($1, $2) on conflict (name) do nothing', [name, value]);
  let hmac = process.env.HMAC_SECRET ?? (await get('hmac'));
  if (!hmac) {
    await put('hmac', crypto.randomBytes(32).toString('base64url'));
    hmac = (await get('hmac'))!;
  }
  let priv = await get('ed25519');
  if (!priv) {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    await put('ed25519', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    priv = (await get('ed25519'))!;
  }
  const signKey = crypto.createPrivateKey(priv);
  const verifyKey = crypto.createPublicKey(signKey);
  return { hmac: Buffer.from(hmac), signKey, verifyKey, publicPem: verifyKey.export({ type: 'spki', format: 'pem' }).toString() };
}

/** A short HMAC tag for `value` (16 base64url characters = 96 bits). */
export function tag(keys: Keys, purpose: string, value: string): string {
  return crypto.createHmac('sha256', keys.hmac).update(`${purpose}:${value}`).digest('base64url').slice(0, 16);
}

export function checkTag(keys: Keys, purpose: string, value: string, given: string): boolean {
  const want = Buffer.from(tag(keys, purpose, value));
  const got = Buffer.from(given);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

/** Signs and verifies certificate payloads with Ed25519. */
export const signBytes = (keys: Keys, data: string) => crypto.sign(null, Buffer.from(data), keys.signKey).toString('base64url');
export function verifyBytes(keys: Keys, data: string, signature: string): boolean {
  try {
    return crypto.verify(null, Buffer.from(data), keys.verifyKey, Buffer.from(signature, 'base64url'));
  } catch {
    return false;
  }
}
