/**
 * What a QR code contains, for each kind of code. Each builder follows the format phone cameras understand
 * (Wi-Fi config, vCard, UPI deep link…) and escapes user text so it cannot break the format.
 */

export type QrType = 'url' | 'text' | 'wifi' | 'upi' | 'whatsapp' | 'sms' | 'email' | 'phone' | 'event' | 'geo' | 'vcard' | 'medical';

export interface WifiData {
  ssid: string;
  password?: string;
  security: 'WPA' | 'WEP' | 'nopass';
  hidden?: boolean;
}
export interface UpiData {
  vpa: string;
  name: string;
  amount?: string;
  note?: string;
}
export interface ContactData {
  firstName: string;
  lastName?: string;
  org?: string;
  title?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  note?: string;
}
export interface EventData {
  title: string;
  start: string; // datetime-local, e.g. 2026-11-20T18:30
  end?: string;
  location?: string;
  description?: string;
}
export interface MedicalData {
  name: string;
  bloodGroup?: string;
  allergies?: string;
  conditions?: string;
  medicines?: string;
  contactName?: string;
  contactPhone?: string;
}

export type PayloadData =
  | { type: 'url'; url: string }
  | { type: 'text'; text: string }
  | ({ type: 'wifi' } & WifiData)
  | ({ type: 'upi' } & UpiData)
  | { type: 'whatsapp'; phone: string; message?: string }
  | { type: 'sms'; phone: string; message?: string }
  | { type: 'email'; to: string; subject?: string; body?: string }
  | { type: 'phone'; phone: string }
  | ({ type: 'event' } & EventData)
  | { type: 'geo'; lat: string; lng: string; label?: string }
  | ({ type: 'vcard' } & ContactData)
  | ({ type: 'medical' } & MedicalData & { moreUrl?: string });

/** Wi-Fi and MECARD-style fields escape \ ; , : and " with a backslash. */
const escField = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');
/** vCard text values escape \ , ; and newlines. */
const escVcard = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const digits = (s: string) => s.replace(/[^\d+]/g, '');
const ics = (local: string) => local.replace(/[-:]/g, '').replace(/^(\d{8}T\d{4})$/, '$100');

export function normaliseUrl(url: string): string {
  const u = url.trim();
  if (!u) throw new Error('Enter a link.');
  const full = /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
  const parsed = new URL(full);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http and https links are allowed.');
  return parsed.toString();
}

/** The text stored in the QR code for this data. Throws with a readable message when something required is missing. */
export function buildPayload(d: PayloadData): string {
  switch (d.type) {
    case 'url':
      return normaliseUrl(d.url);
    case 'text':
      if (!d.text) throw new Error('Enter some text.');
      return d.text;
    case 'wifi': {
      if (!d.ssid) throw new Error('Enter the network name.');
      const pass = d.security === 'nopass' ? '' : `P:${escField(d.password ?? '')};`;
      return `WIFI:T:${d.security};S:${escField(d.ssid)};${pass}${d.hidden ? 'H:true;' : ''};`;
    }
    case 'upi': {
      if (!/^[\w.\-]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,63}$/.test(d.vpa.trim())) throw new Error('Enter a valid UPI ID, like name@bank.');
      const vpa = d.vpa.trim();
      // The UPI ID goes in as-is: UPI apps expect a literal "@", and many reject "%40" as an invalid ID.
      // It can only contain letters, digits, ".", "-", "_" and "@" (checked above), so nothing needs escaping.
      const parts = [`pa=${vpa}`, `pn=${encodeURIComponent((d.name || vpa).trim())}`];
      if (d.amount) {
        if (!/^\d+(\.\d{1,2})?$/.test(d.amount) || Number(d.amount) <= 0) throw new Error('Enter the amount in rupees, like 250 or 99.50.');
        parts.push(`am=${Number(d.amount).toFixed(2)}`);
      }
      parts.push('cu=INR');
      if (d.note) parts.push(`tn=${encodeURIComponent(d.note.slice(0, 80))}`);
      return `upi://pay?${parts.join('&')}`;
    }
    case 'whatsapp': {
      const n = digits(d.phone).replace(/^\+/, '');
      if (n.length < 8) throw new Error('Enter the phone number with country code, like 919876543210.');
      return `https://wa.me/${n}${d.message ? `?text=${encodeURIComponent(d.message)}` : ''}`;
    }
    case 'sms': {
      const n = digits(d.phone);
      if (n.replace('+', '').length < 3) throw new Error('Enter a phone number.');
      return `SMSTO:${n}:${d.message ?? ''}`;
    }
    case 'email': {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.to)) throw new Error('Enter a valid email address.');
      const q = new URLSearchParams();
      if (d.subject) q.set('subject', d.subject);
      if (d.body) q.set('body', d.body);
      const qs = q.toString().replace(/\+/g, '%20');
      return `mailto:${d.to}${qs ? `?${qs}` : ''}`;
    }
    case 'phone': {
      const n = digits(d.phone);
      if (n.replace('+', '').length < 3) throw new Error('Enter a phone number.');
      return `tel:${n}`;
    }
    case 'event': {
      if (!d.title || !d.start) throw new Error('Enter a title and a start time.');
      const lines = ['BEGIN:VEVENT', `SUMMARY:${escVcard(d.title)}`, `DTSTART:${ics(d.start)}`];
      if (d.end) lines.push(`DTEND:${ics(d.end)}`);
      if (d.location) lines.push(`LOCATION:${escVcard(d.location)}`);
      if (d.description) lines.push(`DESCRIPTION:${escVcard(d.description)}`);
      lines.push('END:VEVENT');
      return lines.join('\n');
    }
    case 'geo': {
      const lat = Number(d.lat);
      const lng = Number(d.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Enter a valid latitude and longitude.');
      return `geo:${lat},${lng}${d.label ? `?q=${encodeURIComponent(`${lat},${lng}(${d.label})`)}` : ''}`;
    }
    case 'vcard':
      return vcard(d);
    case 'medical':
      return medicalText(d, d.moreUrl);
  }
}

/** A vCard 3.0 contact card: phones add it straight to contacts. */
export function vcard(c: ContactData): string {
  if (!c.firstName) throw new Error('Enter a first name.');
  const full = [c.firstName, c.lastName].filter(Boolean).join(' ');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${escVcard(c.lastName ?? '')};${escVcard(c.firstName)};;;`, `FN:${escVcard(full)}`];
  if (c.org) lines.push(`ORG:${escVcard(c.org)}`);
  if (c.title) lines.push(`TITLE:${escVcard(c.title)}`);
  if (c.phone) lines.push(`TEL;TYPE=CELL:${digits(c.phone)}`);
  if (c.email) lines.push(`EMAIL:${c.email}`);
  if (c.website) lines.push(`URL:${normaliseUrl(c.website)}`);
  if (c.address) lines.push(`ADR:;;${escVcard(c.address)};;;;`);
  if (c.note) lines.push(`NOTE:${escVcard(c.note)}`);
  lines.push('END:VCARD');
  return lines.join('\n');
}

/** Emergency information as plain text, readable by any camera even with no internet. */
export function medicalText(m: MedicalData, moreUrl?: string): string {
  if (!m.name) throw new Error('Enter a name.');
  const lines = ['EMERGENCY INFORMATION', `Name: ${m.name}`];
  if (m.bloodGroup) lines.push(`Blood group: ${m.bloodGroup}`);
  if (m.allergies) lines.push(`Allergies: ${m.allergies}`);
  if (m.conditions) lines.push(`Conditions: ${m.conditions}`);
  if (m.medicines) lines.push(`Medicines: ${m.medicines}`);
  if (m.contactName || m.contactPhone) lines.push(`Emergency contact: ${[m.contactName, m.contactPhone].filter(Boolean).join(', ')}`);
  if (moreUrl) lines.push(`More: ${moreUrl}`);
  return lines.join('\n');
}
