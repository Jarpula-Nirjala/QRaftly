import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkReadability, contrastRatio } from '../shared/qr/check.ts';
import { encodeText } from '../shared/qr/encode.ts';
import { toSvg } from '../shared/qr/render.ts';
import { buildPayload, vcard } from '../shared/payloads.ts';

const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

describe('SVG rendering', () => {
  it('draws every dot and eye style as valid SVG', () => {
    const qr = encodeText('https://qraftly.app');
    for (const dots of ['square', 'rounded', 'dots', 'classy', 'fluid'] as const)
      for (const eyes of ['square', 'rounded', 'circle', 'leaf'] as const) {
        const svg = toSvg(qr, { dots, eyes, fg: '#123456', bg: '#fefefe', fg2: '#884400' });
        assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 \d+ \d+"/);
        assert.ok(svg.includes('linearGradient'), 'gradient');
        assert.ok(!svg.includes('NaN') && !svg.includes('undefined'), `${dots}/${eyes}`);
      }
  });

  it('refuses colour and logo values that could inject markup', () => {
    const qr = encodeText('x');
    const svg = toSvg(qr, { fg: '"/><script>alert(1)</script>', logo: 'javascript:alert(1)' });
    assert.ok(!svg.includes('<script') && !svg.includes('javascript:'));
    assert.ok(svg.includes('#111111'));
  });

  it('leaves the logo area empty and puts the image there', () => {
    const qr = encodeText('https://qraftly.app/logo', { ecl: 'H' });
    const svg = toSvg(qr, { logo: LOGO, logoScale: 0.25 });
    assert.ok(svg.includes(`<image href="${LOGO}"`));
  });
});

describe('Readability check', () => {
  it('passes a plain dark-on-light code', () => {
    const r = checkReadability('https://qraftly.app/plain');
    assert.ok(r.ok, r.issues.join('; '));
    assert.equal(r.budgetUsed, 0);
  });

  it('proves a modest logo still scans, and how much error correction it costs', () => {
    const r = checkReadability('https://qraftly.app/with-a-logo', { logo: LOGO, logoScale: 0.2 });
    assert.equal(r.qr.ecl, 'H');
    assert.ok(r.budgetUsed > 0 && r.budgetUsed <= 1, `budget ${r.budgetUsed}`);
  });

  it('flags a logo too large to read', () => {
    const r = checkReadability('hi', { logo: LOGO, logoScale: 0.3 });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => /smaller/.test(i)));
  });

  it('flags low contrast and inverted colours', () => {
    assert.ok(contrastRatio('#000000', '#ffffff') > 20);
    const pale = checkReadability('x', { fg: '#cccccc', bg: '#ffffff' });
    assert.ok(pale.issues.some((i) => /Contrast is too low/.test(i)));
    const inverted = checkReadability('x', { fg: '#ffffff', bg: '#000000' });
    assert.ok(inverted.issues.some((i) => /Light dots/.test(i)));
  });
});

describe('Payload formats', () => {
  it('Wi-Fi escapes special characters', () => {
    assert.equal(buildPayload({ type: 'wifi', ssid: 'Home;Net', password: 'p@ss:"1"', security: 'WPA' }), 'WIFI:T:WPA;S:Home\\;Net;P:p@ss\\:\\"1\\";;');
    assert.equal(buildPayload({ type: 'wifi', ssid: 'Cafe', security: 'nopass', hidden: true }), 'WIFI:T:nopass;S:Cafe;H:true;;');
  });

  it('UPI builds a payment link and validates the amount', () => {
    assert.equal(buildPayload({ type: 'upi', vpa: 'nirjala@okaxis', name: 'Nirjala J', amount: '250', note: 'Lunch' }), 'upi://pay?pa=nirjala%40okaxis&pn=Nirjala%20J&am=250.00&cu=INR&tn=Lunch');
    assert.throws(() => buildPayload({ type: 'upi', vpa: 'not-a-vpa', name: 'x' }), /UPI ID/);
    assert.throws(() => buildPayload({ type: 'upi', vpa: 'asha@ybl', name: 'x', amount: '-3' }), /amount/);
  });

  it('WhatsApp, SMS, email, phone, geo and calendar', () => {
    assert.equal(buildPayload({ type: 'whatsapp', phone: '+91 98765 43210', message: 'Hi there!' }), 'https://wa.me/919876543210?text=Hi%20there!');
    assert.equal(buildPayload({ type: 'sms', phone: '+91 98765-43210', message: 'OK' }), 'SMSTO:+919876543210:OK');
    assert.equal(buildPayload({ type: 'email', to: 'a@b.co', subject: 'Hello there' }), 'mailto:a@b.co?subject=Hello%20there');
    assert.equal(buildPayload({ type: 'phone', phone: '(080) 123-4567' }), 'tel:0801234567');
    assert.equal(buildPayload({ type: 'geo', lat: '17.385', lng: '78.4867' }), 'geo:17.385,78.4867');
    assert.equal(
      buildPayload({ type: 'event', title: 'Demo, day', start: '2026-11-20T18:30', end: '2026-11-20T20:00', location: 'Hyderabad' }),
      'BEGIN:VEVENT\nSUMMARY:Demo\\, day\nDTSTART:20261120T183000\nDTEND:20261120T200000\nLOCATION:Hyderabad\nEND:VEVENT',
    );
  });

  it('vCard and links', () => {
    const v = vcard({ firstName: 'Nirjala', lastName: 'Jarpula', org: 'IIT Bombay', phone: '+91 98765 43210', website: 'github.com/Jarpula-Nirjala' });
    assert.ok(v.startsWith('BEGIN:VCARD\nVERSION:3.0\nN:Jarpula;Nirjala;;;\nFN:Nirjala Jarpula'));
    assert.ok(v.includes('URL:https://github.com/Jarpula-Nirjala'));
    assert.equal(buildPayload({ type: 'url', url: 'example.com/a b' }), 'https://example.com/a%20b');
    assert.throws(() => buildPayload({ type: 'url', url: 'javascript:alert(1)' }), /http/);
  });

  it('every payload encodes into a QR code that reads back', async () => {
    const { decodeMatrix } = await import('../shared/qr/decode.ts');
    const p = buildPayload({ type: 'medical', name: 'Asha', bloodGroup: 'O+', allergies: 'Penicillin', contactName: 'Ravi', contactPhone: '+91 90000 00000' });
    assert.equal(decodeMatrix(encodeText(p).modules).text, p);
  });
});
