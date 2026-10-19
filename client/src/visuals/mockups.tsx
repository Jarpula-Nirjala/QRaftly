import { useMemo, type CSSProperties } from 'react';
import { checkReadability } from '../../../shared/qr/check.ts';
import { encodeText, formatPositions, functionPatterns } from '../../../shared/qr/encode.ts';
import { toSvg, type Design } from '../../../shared/qr/render.ts';
import { QrSvg } from '../studio.tsx';
import { BRAND_SVG } from '../ui.tsx';
import { useCanvas } from './scene.tsx';
import './visuals.css';

/** Real codes in the mockups open this site, so a visitor who scans one lands somewhere useful. */
const siteUrl = () => (typeof location === 'undefined' ? 'https://qraftly.app' : location.origin);

/** A QR-looking pattern with finder eyes and random modules: decorative, deliberately not decodable. */
function fakeQr(seed: number, n = 21, color = '#1f2937'): string {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const finder = (x: number, y: number) => {
    for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      const dx = x - ox;
      const dy = y - oy;
      if (dx >= -1 && dy >= -1 && dx <= 7 && dy <= 7) {
        if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return 0;
        return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) ? 1 : 0;
      }
    }
    return -1;
  };
  let d = '';
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const f = finder(x, y);
      if (f === 1 || (f === -1 && rnd() < 0.48)) d += `M${x} ${y}h1v1h-1z`;
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${n + 2} ${n + 2}" shape-rendering="crispEdges"><path d="${d}" fill="${color}"/></svg>`;
}

const Fake = ({ seed, className, color }: { seed: number; className?: string; color?: string }) => <div className={className} dangerouslySetInnerHTML={{ __html: fakeQr(seed, 21, color) }} aria-hidden="true" />;

// ------------------------------------------------------------ 10 + 12: phone and business card

/** A smartphone showing a live profile page, next to the printed business card that points to it. */
export function ProfileScene() {
  const url = siteUrl();
  return (
    <div className="v-stage stone v-grain" role="img" aria-label="A business card with a QR code and a phone showing the live profile it opens">
      <BusinessCard style={{ left: '4%', bottom: '9%', width: '50cqw', rotate: '-7deg' }} url={url} />
      <div className="v-contact-shadow" style={{ left: '70%', bottom: '5%', width: '30cqw', height: '4cqw' }} />
      <div className="v-phone" style={{ left: '70%', top: '6%', width: '30cqw' }}>
        <div className="v-screen">
          <div className="v-notch" />
          <div className="bar">
            <span>9:41</span>
            <span>●●●</span>
          </div>
          <div className="avatar-ph" />
          <div className="name">Asha Rao</div>
          <div className="role">Full-stack engineer</div>
          <div className="btn-ph">Save contact</div>
          <QrSvg text={url} className="v-qr" design={{ fg: '#14243A', margin: 1 }} />
          <div className="scan-ok">✓ Ready to scan</div>
        </div>
      </div>
    </div>
  );
}

export function BusinessCard({ style, url = siteUrl() }: { style?: CSSProperties; url?: string }) {
  return (
    <div className="v-card" style={style}>
      <div className="who">
        <div className="portrait" />
        <div className="nm">Asha Rao</div>
        <div className="rl">Full-stack engineer</div>
        <div className="accent" />
        <div className="ct">asha@example.com</div>
      </div>
      <QrSvg text={url} className="v-qr" design={{ fg: '#1c2233', bg: '#fbfaf7', margin: 1 }} />
    </div>
  );
}

// ------------------------------------------------------------ 11: analytics dashboard

const series = Array.from({ length: 30 }, (_, i) => 40 + 18 * Math.sin(i / 3.2) + i * 2.2 + ((i * 37) % 11));

export function DashboardScene() {
  const max = Math.max(...series);
  const pts = series.map((v, i) => [(i / (series.length - 1)) * 100, 38 - (v / max) * 32] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('');
  const hours = [2, 1, 1, 1, 2, 4, 8, 14, 18, 16, 15, 17, 22, 19, 15, 14, 16, 21, 26, 24, 18, 12, 7, 4];
  return (
    <div className="v-stage wide" role="img" aria-label="The scan analytics dashboard on a monitor">
      <div className="v-monitor">
        <div className="bezel">
          <div className="v-dash">
            <div className="side">
              <i className="on" />
              <i />
              <i />
              <i />
              <i style={{ width: '70%' }} />
            </div>
            <div className="main">
              <div className="ttl">Cafe menu · last 30 days</div>
              <div className="tiles">
                {[
                  ['Scans', '12,480', '+18%'],
                  ['Unique visitors', '8,903', '+12%'],
                  ['Countries', '41', '+3'],
                  ['Blocked', '27', ''],
                ].map(([k, v, d]) => (
                  <div key={k} className="tile">
                    <small>{k}</small>
                    <b>{v}</b> {d && <span className="up">{d}</span>}
                  </div>
                ))}
              </div>
              <div className="panels">
                <div className="pnl">
                  <small>Scans per day</small>
                  <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                    {[8, 18, 28, 38].map((y) => (
                      <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#edf0f5" strokeWidth="0.4" />
                    ))}
                    <path d={`${line}L100 38L0 38Z`} fill="#B08A3E" opacity="0.1" />
                    <path d={line} fill="none" stroke="#B08A3E" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r="1.4" fill="#B08A3E" stroke="#fff" strokeWidth="0.6" />
                  </svg>
                </div>
                <div className="pnl">
                  <small>Time of day</small>
                  <svg viewBox="0 0 48 40" preserveAspectRatio="none">
                    {hours.map((v, i) => (
                      <rect key={i} x={i * 2 + 0.2} y={38 - v * 1.3} width="1.6" height={v * 1.3} rx="0.5" fill="#B08A3E" />
                    ))}
                  </svg>
                </div>
              </div>
              <div className="panels">
                <div className="pnl">
                  <small>Phones</small>
                  <div className="row-bars">
                    {[
                      ['Android', 62],
                      ['iPhone', 31],
                      ['Desktop', 7],
                    ].map(([k, v]) => (
                      <div key={k}>
                        {k}
                        <span style={{ width: `${v}%` }} />
                        <em>{v}%</em>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pnl">
                  <small>Countries</small>
                  <div className="row-bars">
                    {[
                      ['India', 54],
                      ['UAE', 18],
                      ['UK', 11],
                    ].map(([k, v]) => (
                      <div key={k}>
                        {k}
                        <span style={{ width: `${v}%` }} />
                        <em>{v}%</em>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="neck" />
        <div className="foot" />
      </div>
      <span className="v-caption">Illustrative numbers</span>
    </div>
  );
}

// ------------------------------------------------------------ 17: global scan intelligence

const CITIES: Array<[string, number, number]> = [
  ['Bengaluru', 12.97, 77.59],
  ['Mumbai', 19.07, 72.88],
  ['Delhi', 28.61, 77.21],
  ['Dubai', 25.2, 55.27],
  ['London', 51.5, -0.12],
  ['Berlin', 52.52, 13.4],
  ['New York', 40.71, -74],
  ['San Francisco', 37.77, -122.42],
  ['São Paulo', -23.55, -46.63],
  ['Lagos', 6.52, 3.38],
  ['Singapore', 1.35, 103.82],
  ['Tokyo', 35.68, 139.69],
  ['Sydney', -33.87, 151.21],
];

/** A translucent globe turning slowly, with square markers at scan locations and arcs back to the owner's city. */
export function GlobeScene() {
  const ref = useCanvas((ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    const R = Math.min(w, h) * 0.38;
    const cx = w / 2;
    const cy = h / 2;
    const rot = (-60 + t * 6) * (Math.PI / 180);
    const tilt = -18 * (Math.PI / 180);
    const rad = Math.PI / 180;
    // Orthographic projection; `front` is how far a point faces the viewer (> 0 is visible).
    const proj = (lat: number, lon: number, lift = 1) => {
      const p = lat * rad;
      const l = lon * rad + rot;
      const x = Math.cos(p) * Math.sin(l);
      const y = Math.cos(tilt) * Math.sin(p) - Math.sin(tilt) * Math.cos(p) * Math.cos(l);
      const front = Math.sin(tilt) * Math.sin(p) + Math.cos(tilt) * Math.cos(p) * Math.cos(l);
      return { x: cx + x * R * lift, y: cy - y * R * lift, front };
    };
    const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    const dark = document.documentElement.dataset.theme === 'dark';
    g.addColorStop(0, dark ? 'rgba(255,248,235,0.4)' : 'rgba(255,255,255,0.95)');
    g.addColorStop(0.7, dark ? 'rgba(182,154,88,0.22)' : 'rgba(246,236,214,0.55)');
    g.addColorStop(1, dark ? 'rgba(182,154,88,0.35)' : 'rgba(226,201,143,0.45)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(176,138,62,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Graticule.
    ctx.lineWidth = 0.7;
    const curve = (pts: Array<{ x: number; y: number; front: number }>) => {
      let on = false;
      ctx.beginPath();
      for (const q of pts) {
        if (q.front > 0) {
          if (on) ctx.lineTo(q.x, q.y);
          else ctx.moveTo(q.x, q.y);
          on = true;
        } else on = false;
      }
      ctx.stroke();
    };
    ctx.strokeStyle = 'rgba(176,138,62,0.16)';
    for (let lon = -180; lon < 180; lon += 20) curve(Array.from({ length: 61 }, (_, i) => proj(-90 + i * 3, lon)));
    for (let lat = -60; lat <= 60; lat += 20) curve(Array.from({ length: 121 }, (_, i) => proj(lat, -180 + i * 3)));
    // Arcs from the owner's city to where scans came from.
    const [, hlat, hlon] = CITIES[0];
    const toVec = (lat: number, lon: number) => [Math.cos(lat * rad) * Math.cos(lon * rad), Math.cos(lat * rad) * Math.sin(lon * rad), Math.sin(lat * rad)];
    const a = toVec(hlat, hlon);
    ctx.lineWidth = 1.2;
    CITIES.slice(1).forEach(([, lat, lon], k) => {
      const b = toVec(lat, lon);
      const om = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
      const pts = Array.from({ length: 33 }, (_, i) => {
        const s = i / 32;
        const k1 = Math.sin((1 - s) * om) / Math.sin(om);
        const k2 = Math.sin(s * om) / Math.sin(om);
        const v = [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
        const la = Math.asin(v[2]) / rad;
        const lo = Math.atan2(v[1], v[0]) / rad;
        return proj(la, lo, 1 + 0.18 * Math.sin(Math.PI * s) * Math.min(1, om));
      });
      const phase = (t * 0.35 + k * 0.13) % 1;
      ctx.strokeStyle = k % 3 === 0 ? 'rgba(212,175,101,0.75)' : 'rgba(176,138,62,0.55)';
      ctx.setLineDash([3, 4]);
      ctx.lineDashOffset = -phase * 40;
      curve(pts);
    });
    ctx.setLineDash([]);
    for (const [name, lat, lon] of CITIES) {
      const q = proj(lat, lon);
      if (q.front <= 0) continue;
      const s = name === 'Bengaluru' ? 7 : 5;
      ctx.fillStyle = dark ? 'rgba(48,43,37,0.95)' : 'rgba(255,255,255,0.95)';
      ctx.fillRect(q.x - s / 2 - 1.5, q.y - s / 2 - 1.5, s + 3, s + 3);
      ctx.fillStyle = name === 'Bengaluru' ? (dark ? '#FAF7F0' : '#14243A') : dark ? '#D9C08A' : '#B08A3E';
      ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
      if (q.front > 0.35 && (name === 'Bengaluru' || name === 'London' || name === 'Dubai' || name === 'Singapore')) {
        ctx.fillStyle = dark ? 'rgba(232,223,207,0.92)' : 'rgba(61,72,99,0.9)';
        ctx.font = '600 12px "Times New Roman", Tinos, serif';
        ctx.fillText(name, q.x + 7, q.y + 4);
      }
    }
  }, 30);
  return (
    <div className="v-stage square" role="img" aria-label="A globe with scans arriving from cities around the world">
      <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <span className="v-caption">Scans by city</span>
    </div>
  );
}

// ------------------------------------------------------------ 19: designed codes on pedestals

const logoUrl = () => `data:image/svg+xml;base64,${btoa(BRAND_SVG())}`;

export function PedestalScene() {
  const url = siteUrl();
  const codes = useMemo(() => {
    const designs: Array<{ d: Partial<Design>; ry: string; h: string; cls: string }> = [
      { d: { fg: '#111111', margin: 1 }, ry: '16deg', h: '13cqw', cls: '' },
      { d: { fg: '#14243A', bg: '#fdfaf3', dots: 'rounded', eyes: 'rounded', margin: 1 }, ry: '0deg', h: '18cqw', cls: 'navy' },
      { d: { fg: '#14243A', dots: 'dots', eyes: 'circle', eyeColor: '#B08A3E', logo: logoUrl(), logoScale: 0.22, margin: 1 }, ry: '-16deg', h: '13cqw', cls: '' },
    ];
    // Each design goes through the same scan check the studio uses (the logo counted as damage).
    return designs.map((x) => {
      const check = checkReadability(url, x.d);
      return { ...x, svg: toSvg(check.qr, x.d), ok: check.ok };
    });
  }, [url]);
  return (
    <div className="v-stage grey" role="img" aria-label="Three styled QR codes on white pedestals">
      <div className="v-pedestals">
        {codes.map((c, i) => (
          <div key={i} className="v-ped">
            <div className={`tile ${c.cls}`} style={{ '--ry': c.ry } as CSSProperties}>
              <div className="v-qr" dangerouslySetInnerHTML={{ __html: c.svg }} />
            </div>
            <div className="cyl" style={{ '--h': c.h } as CSSProperties}>
              <div className="top" />
              <div className="side" />
            </div>
            {c.ok && <span className="ok">✓ Scan-checked</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 16: secure codes

export function ShieldScene() {
  const shield = 'M100 16 L170 42 V96 C170 140 140 170 100 186 C60 170 30 140 30 96 V42 Z';
  return (
    <div className="v-stage square" role="img" aria-label="A crystal shield protecting a QR code">
      <div className="v-contact-shadow" style={{ bottom: '7%', width: '46cqw', height: '6cqw' }} />
      <svg className="v-shield" viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.7" />
            <stop offset="0.5" stopColor="#f6ecd6" stopOpacity="0.28" />
            <stop offset="1" stopColor="#efdcae" stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#e2c98f" />
          </linearGradient>
          <filter id="blueGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d={shield} fill="url(#glass)" stroke="url(#edge)" strokeWidth="2.5" />
        {/* Facets, as if cut from one crystal. */}
        <path d="M100 16 L100 186 M30 42 L100 100 L170 42 M30 96 L100 100 L170 96" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="0.8" fill="none" />
        <path d="M100 16 L30 42 L100 100 Z" fill="#ffffff" opacity="0.18" />
        <path d="M100 100 L170 96 C170 140 140 170 100 186 Z" fill="#e2c98f" opacity="0.12" />
        <path d={shield} className="trace" fill="none" stroke="#B08A3E" strokeWidth="2" strokeLinecap="round" filter="url(#blueGlow)" pathLength="990" />
      </svg>
      <div style={{ position: 'absolute', zIndex: 2, left: '50%', top: '50%', width: '30cqw', transform: 'translate(-50%, -46%)', background: '#fff', padding: '2cqw', borderRadius: '2cqw', boxShadow: '0 16px 30px -16px rgb(20 36 58 / .4)' }}>
        <QrSvg text={siteUrl()} className="v-qr" design={{ fg: '#14243A', margin: 0 }} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 13: event ticket

export function TicketScene() {
  return (
    <div className="v-stage grey v-grain" role="img" aria-label="A black event ticket with a white QR code and silver foil edges">
      <div className="v-ticket">
        <div className="body">
          <svg className="art" viewBox="0 0 210 100" preserveAspectRatio="xMinYMid slice" aria-hidden="true">
            {[22, 34, 46, 58, 70].map((r) => (
              <circle key={r} cx="150" cy="96" r={r} fill="none" stroke="#ffffff" strokeOpacity={0.05 + r / 1400} strokeWidth="0.6" />
            ))}
            <circle cx="150" cy="96" r="12" fill="#D4AF65" opacity="0.25" />
          </svg>
          <div className="info">
            <div className="adm">ADMIT ONE</div>
            <div className="ev">Launch Night</div>
            <div className="sec">◆ SIGNED · VERIFIED AT THE DOOR</div>
            <div className="meta">
              <span>
                Date<b>20 Nov</b>
              </span>
              <span>
                Doors<b>6:30 pm</b>
              </span>
              <span>
                Gate<b>North</b>
              </span>
            </div>
          </div>
          <div className="stub">
            <QrSvg text={siteUrl()} className="v-qr" design={{ fg: '#0b0d12', margin: 0 }} />
          </div>
          <div className="strip" />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 18: bulk print sheets

export function SheetsScene() {
  return (
    <div className="v-stage stone v-grain" role="img" aria-label="Printed sheets of QR labels on a desk, next to a laptop with a spreadsheet">
      {[
        { left: '6%', top: '8%', rotate: '-8deg', z: 1 },
        { left: '28%', top: '4%', rotate: '4deg', z: 2 },
      ].map((p, k) => (
        <div key={k} className="v-sheet" style={{ left: p.left, top: p.top, rotate: p.rotate, zIndex: p.z }}>
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="lbl">
              <Fake seed={k * 100 + i + 1} />
              <i />
            </div>
          ))}
        </div>
      ))}
      <div className="v-laptop" style={{ zIndex: 3 }}>
        <div className="scr">
          <div className="sheet-ui">
            <div className="tb">
              <i className="on" />
              <i />
              <i />
            </div>
            <div className="r h">
              {[0, 1, 2, 3].map((i) => (
                <span key={i}>
                  <i />
                </span>
              ))}
            </div>
            {Array.from({ length: 9 }, (_, r) => (
              <div key={r} className="r">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i}>
                    <i style={{ width: `${40 + ((r * 7 + i * 13) % 50)}%` }} />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 14: product packaging

export function PackagingScene() {
  const url = siteUrl();
  return (
    <div className="v-stage grey" role="img" aria-label="A white box, a kraft pouch and a bottle, each with a QR label">
      <div className="v-pack-shadow" style={{ left: '6%', width: '40cqw' }} />
      <div className="v-pack-shadow" style={{ left: '40%', width: '28cqw' }} />
      <div className="v-pack-shadow" style={{ left: '70%', width: '22cqw' }} />
      <div className="v-pack v-box">
        <div className="top" />
        <div className="side" />
        <div className="front">
          <div className="emboss" />
          <div className="v-label">
            <QrSvg text={url} className="v-qr" design={{ margin: 0 }} />
          </div>
        </div>
      </div>
      <div className="v-pack v-pouch">
        <div className="v-label">
          <QrSvg text={url} className="v-qr" design={{ margin: 0 }} />
        </div>
      </div>
      <div className="v-pack v-bottle">
        <div className="cap" />
        <div className="neck" />
        <div className="bd">
          <div className="v-label">
            <QrSvg text={url} className="v-qr" design={{ margin: 0 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 15: the encoder, layer by layer

/**
 * An exploded view of a real version-1 symbol from our encoder: the module grid, the data and error-correction
 * modules, the function patterns (finders, timing) and the format information, each on its own layer.
 */
export function EncoderScene() {
  const layers = useMemo(() => {
    const qr = encodeText('QRaftly', { ecl: 'M' });
    const { isFunction } = functionPatterns(qr.version);
    const n = qr.size;
    const fmt = new Set(formatPositions(n).flat().map(([x, y]) => `${x},${y}`));
    let data = '';
    let func = '';
    let format = '';
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const cell = `M${x + 0.08} ${y + 0.08}h0.84v0.84h-0.84z`;
        if (fmt.has(`${x},${y}`)) format += cell;
        else if (isFunction[y][x]) {
          if (qr.modules[y][x]) func += cell;
        } else if (qr.modules[y][x]) data += cell;
      }
    let grid = '';
    for (let i = 0; i <= n; i++) grid += `M${i} 0V${n}M0 ${i}H${n}`;
    return { n, data, func, format, grid };
  }, []);
  const { n } = layers;
  return (
    <div className="v-stage square" role="img" aria-label="A QR code taken apart into its layers">
      <div className="v-iso">
        <div className="layer l0">
          <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`}>
            <rect x="-1" y="-1" width={n + 2} height={n + 2} rx="0.8" fill="#ffffff" stroke="#d3d9e4" strokeWidth="0.08" />
            <path d={layers.grid} stroke="#c9d1dd" strokeWidth="0.03" />
          </svg>
        </div>
        <div className="layer l1">
          <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`}>
            <rect x="-0.6" y="-0.6" width={n + 1.2} height={n + 1.2} rx="0.6" fill="#ffffff" fillOpacity="0.42" stroke="#94a3b8" strokeOpacity="0.55" strokeWidth="0.06" strokeDasharray="0.4 0.3" />
            <path d={layers.data} fill="#334155" opacity="0.92" />
          </svg>
        </div>
        <div className="layer l2">
          <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`}>
            <rect x="-0.6" y="-0.6" width={n + 1.2} height={n + 1.2} rx="0.6" fill="#ffffff" fillOpacity="0.42" stroke="#94a3b8" strokeOpacity="0.55" strokeWidth="0.06" strokeDasharray="0.4 0.3" />
            <path d={layers.func} fill="#B08A3E" />
          </svg>
        </div>
        <div className="layer l3">
          <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`}>
            <rect x="-0.6" y="-0.6" width={n + 1.2} height={n + 1.2} rx="0.6" fill="#ffffff" fillOpacity="0.42" stroke="#94a3b8" strokeOpacity="0.55" strokeWidth="0.06" strokeDasharray="0.4 0.3" />
            <path d={layers.format} fill="#D4AF65" opacity="0.9" />
          </svg>
        </div>
      </div>
      <div className="v-legend">
        <span>
          <i style={{ background: '#D4AF65' }} /> Format bits (BCH code)
        </span>
        <span>
          <i style={{ background: '#B08A3E' }} /> Finder and timing patterns
        </span>
        <span>
          <i style={{ background: '#334155' }} /> Data + Reed–Solomon codewords
        </span>
        <span>
          <i style={{ background: '#fff', boxShadow: 'inset 0 0 0 1px #c9d1dd' }} /> 21 × 21 module grid
        </span>
      </div>
    </div>
  );
}
