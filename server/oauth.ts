/**
 * "Continue with Google" via the OAuth 2.0 authorization-code flow.
 * Enabled when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set; the redirect URI to register
 * in Google Cloud is <PUBLIC_URL>/api/auth/oauth/google/callback.
 */
export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function googleAuthorizeUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}).`);
  return (await res.json()) as T;
}

/** Exchanges the authorization code for a token and reads the verified Google profile. */
export async function googleProfile(code: string, redirectUri: string): Promise<{ sub: string; email: string; name: string }> {
  const token = await json<{ access_token: string }>(
    await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    }),
  );
  const info = await json<{ sub: string; email: string; email_verified: boolean; name?: string }>(
    await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${token.access_token}` } }),
  );
  if (!info.email_verified) throw new Error('Your Google email address is not verified.');
  return { sub: info.sub, email: info.email.toLowerCase(), name: info.name?.trim() || info.email.split('@')[0] };
}
