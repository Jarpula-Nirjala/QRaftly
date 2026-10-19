export class ApiError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown>;
  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** JSON requests to the server; failures become ApiError with the server's readable message. */
export async function api<T = Record<string, unknown>>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'Cannot reach QRaftly. Check your connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status}).`, data);
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Saves a Blob as a file. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const fileName = (s: string, fallback = 'qr-code') => s.trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback;
