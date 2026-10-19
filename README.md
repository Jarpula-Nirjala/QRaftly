# QRForge

QR codes that keep working after you print them: editable links with scan analytics, context-aware redirects, PIN-protected and single-use codes, event tickets with a door scanner, signed certificates and bulk printing.

Everything QR-related is written from scratch. There is no QR library in the dependency tree. The encoder, Reed–Solomon error correction, the matrix decoder, the camera decoder, and the PNG, ZIP and PDF writers are all part of this repository.

**Stack:** Node 24 (TypeScript run directly), Express 5, PostgreSQL (Neon in production, embedded PGlite for development), React 19 with Vite.

## Features

| # | Feature | What makes it work |
|---|---|---|
| 1 | **Living profile card** | A hosted page (`/p/:slug`) with photo, links and a one-tap vCard download. You can edit it without reprinting the code. |
| 2 | **Dynamic links with analytics** | `/r/:slug` redirects and records the scan. Charts show scans by day (in the owner's timezone) and by hour, unique visitors, OS, browser, country, language and which rule won. Scans export to CSV. |
| 3 | **Context-aware rules** | Rules by weekday, time window (overnight windows such as 22:00–02:00 included), phone OS or language. The first matching rule picks the destination. |
| 4 | **Design studio with a scan check** | Five dot styles, four corner styles, gradients, eye colours and a logo. Before download, the design is decoded with the logo-covered modules **inverted** (the worst case), and the share of the error-correction budget used is reported, along with WCAG contrast and polarity. |
| 5 | **Secure codes** | PIN, expiry, scan limit, single use. The limit is enforced by a single `UPDATE … WHERE scan_count < max RETURNING`, so two people scanning at the same moment cannot both get through. Chat-app link previews are recognised and never use up a scan. |
| 6 | **Event tickets and check-in** | Each ticket is `id.HMAC(id)`, so tickets cannot be guessed or forged. The door scanner runs on any phone: check-in is atomic, a reused ticket shows "already used at 7:42 pm (North gate)", and the headcount streams live to every door over server-sent events. |
| 7 | **Medical emergency card** | Blood group, allergies and an emergency contact are written into the QR text, so any camera can read them offline. Private notes are online behind a separate PIN. |
| 8 | **Wi-Fi, UPI and quick actions** | Wi-Fi join, UPI payment (amount and note filled in), WhatsApp, SMS, email, phone, calendar event (iCalendar), map location and vCard contact. |
| 9 | **Bulk generation** | Upload up to 1,000 CSV rows and get a ZIP of PNGs (with a manifest and skipped-row report) or a vector PDF sheet. A background job reports live progress. |
| 10 | **Scan-to-verify certificates** | The QR carries the certificate as canonical JSON plus an **Ed25519** signature. Verification returns *valid*, *tampered* (any edited field) or *revoked*. Anyone can check it offline with the published public key. |

## Written from scratch

```
shared/qr/
  gf.ts        GF(256) arithmetic (primitive polynomial 0x11D)
  rs.ts        Reed–Solomon: encoder, and a decoder (Berlekamp–Massey, Chien search, Forney)
  tables.ts    versions 1–40, block layout, alignment positions
  segments.ts  numeric, alphanumeric and UTF-8 byte modes
  encode.ts    interleaving, zigzag placement, 8 masks scored by the 4 penalty rules, BCH format/version bits
  decode.ts    module matrix → text, with error correction
  detect.ts    camera decoder: pixels → module matrix
  render.ts    styled SVG
  check.ts     the "safe to print" check
server/
  png.ts       PNG writer (CRC-32, zlib)
  zip.ts       ZIP writer (stored entries, UTF-8 names)
  pdf.ts       PDF 1.4 writer (vector modules, Helvetica labels)
  csv.ts       RFC 4180 CSV parser
```

**The camera decoder** (`detect.ts`) lets the door scanner work in browsers without a built-in QR API, such as Chrome on Windows and Firefox. It runs in a Web Worker and works in four steps:

1. Local-mean adaptive thresholding.
2. A row scan for the 1:1:3:1:1 finder pattern, confirmed with vertical, horizontal and diagonal cross-checks.
3. An orientation fix from the three finders, with the module size corrected for rotation.
4. Alignment-pattern template matching and a projective transform, then grid sampling into the matrix decoder.

### How it is verified

- **Every version and level, against an independent decoder.** All 160 version × level combinations are encoded and read back by [jsQR](https://github.com/cozmo/jsQR). The one exception is 23-L, which jsQR cannot read; OpenCV's decoder reads it, confirming the encoding.
- **Reference codewords.** The output for "HELLO WORLD" at 1-M matches the published codewords.
- **Error correction.** Reed–Solomon corrects up to ⌊n/2⌋ errors per block, and a 5×5 damaged patch still decodes.
- **Camera decoder benchmark** (`node bench/decoder-sweep.ts`): 200 synthetic photos with random rotation, strong perspective, blur, noise and shadow. QRForge reads **89%**; jsQR reads 44% of the same frames, at about 15 ms per 640×480 frame.
- **Print output.** Printed PDF sheets were rasterised and every code decoded with OpenCV.

## Run it

```bash
npm install
npm run build && npm start      # http://localhost:3000, embedded database in ./data
```

For development, run `npm run dev:server` and `npm run dev:client` in two terminals. Vite serves the client on :5173 and proxies `/api` and `/r` to the server.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (required in production; without it the embedded PGlite is used) |
| `PUBLIC_URL` | The address put inside QR codes, e.g. `https://qrforge.onrender.com` |
| `HMAC_SECRET` | Key for ticket, unlock-link and visitor-id tags (generated and stored in the database if unset) |
| `GEOIP` | `off` disables the country lookup for scans |

## Tests

```bash
npm test          # 55 tests: QR engine, design check, server, events, certificates, bulk, camera decoder
npm run e2e       # browser smoke test against a running server (BASE=http://localhost:3000)
```

The browser test drives the Edge or Chrome already installed on the machine (`playwright-core`, no browser download). It covers the whole app. The door scanner is tested end to end: a real ticket's QR code is written into a Y4M video that the browser uses as its camera.

## Deploy on Render (free plan)

1. Create a free Postgres database on [Neon](https://neon.tech) and copy its connection string.
2. On Render, choose **New → Blueprint** and select this repository. `render.yaml` sets the build, the start command and the health check.
3. Set `DATABASE_URL` to the Neon string and `PUBLIC_URL` to the service's `onrender.com` address.

Measured on this codebase:

- The build peaks at about 245 MB.
- The server idles at about 80 MB.
- Three back-to-back 1,000-code bulk jobs peaked under 300 MB, with other requests answered within a second throughout. The job worker yields between codes so scans never wait behind it.

## Design notes

- **Privacy.** No IP addresses are stored. Unique visitors are a daily HMAC of IP and user agent, which cannot be reversed or linked across days. Countries come from a CDN header or a lookup whose result alone is kept.
- **Sessions.** Only a SHA-256 hash of the session token is stored. Sessions last 30 days and renew as you use the app. Passwords and PINs are hashed with scrypt.
- **Resumable jobs.** Each 25-row batch commits its own progress in one transaction (with a savepoint per row), so a job interrupted by a restart resumes instead of duplicating codes. Workers claim jobs with `FOR UPDATE SKIP LOCKED`.
- **Signed data.** Certificates are signed over a canonical (sorted-key) JSON form, so the same certificate always produces the same bytes. Tickets and unlock links use truncated HMAC-SHA256 tags compared in constant time.

## License

MIT
