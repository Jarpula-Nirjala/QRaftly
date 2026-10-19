/** Browser-side cryptography for view-once notes and offline certificate checks (WebCrypto only). */

export const toB64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const fromB64 = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** Encrypts with a fresh AES-256-GCM key; the key goes in the link's #fragment, which is never sent to servers. */
export async function sealNote(text: string): Promise<{ ciphertext: string; iv: string; key: string }> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { ciphertext: toB64(ct), iv: toB64(iv), key: toB64(await crypto.subtle.exportKey('raw', key)) };
}

export async function openNote(ciphertext: string, iv: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', fromB64(key), { name: 'AES-GCM' }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, k, fromB64(ciphertext));
  return new TextDecoder().decode(pt);
}

/** The same canonical form the server signs: keys sorted, empty values left out. */
export function canonical(d: Record<string, unknown>): string {
  const keys = Object.keys(d).sort();
  return JSON.stringify(Object.fromEntries(keys.filter((k) => d[k] !== undefined && d[k] !== '').map((k) => [k, d[k]])));
}

/** Verifies an Ed25519 signature in the browser with the issuer's published public key (PEM, SPKI). */
export async function verifyEd25519(pem: string, message: string, signatureB64: string): Promise<boolean> {
  const der = fromB64(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_'));
  const key = await crypto.subtle.importKey('spki', der, { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify({ name: 'Ed25519' }, key, fromB64(signatureB64), new TextEncoder().encode(message));
}
