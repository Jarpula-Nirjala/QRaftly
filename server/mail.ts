/**
 * Transactional email through Resend's HTTP API when RESEND_API_KEY is set.
 * Without it (local development) each message is printed to the server log and kept in `outbox`.
 */
export const outbox: Array<{ to: string; subject: string; text: string }> = [];

export const mailEnabled = () => Boolean(process.env.RESEND_API_KEY);

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    outbox.push({ to, subject, text });
    if (outbox.length > 20) outbox.shift();
    console.log(`\n[mail] To: ${to}\n[mail] Subject: ${subject}\n${text}\n`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM ?? 'QRaftly <onboarding@resend.dev>', to, subject, text }),
  });
  if (!res.ok) throw new Error(`email failed: ${res.status} ${await res.text()}`);
}
