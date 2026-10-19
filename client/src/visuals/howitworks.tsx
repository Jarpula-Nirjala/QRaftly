import { useMemo } from 'react';
import { BarChart3, Fingerprint, Route, ScanLine, ShieldCheck, Smartphone } from 'lucide-react';
import { explain } from '../../../shared/qr/explain.ts';

/** Six small pictures of the encoding pipeline, each drawn from the real intermediate data for "QRaftly". */
export function Pipeline() {
  const e = useMemo(() => explain('https://qraftly.app', 'M'), []);
  const n = e.size;
  const bits = (e.header.modeBits + e.header.countBits + e.dataBits).slice(0, 96);
  const sq = (m: boolean[][], fg = '#14243a') => {
    let d = '';
    m.forEach((row, y) => row.forEach((v, x) => v && (d += `M${x} ${y}h1v1h-1z`)));
    return <path d={d} fill={fg} />;
  };
  const path = e.order.slice(0, 260).map(([x, y], i) => `${i ? 'L' : 'M'}${x + 0.5} ${y + 0.5}`).join('');
  const best = e.masks[e.chosen];
  const steps = [
    {
      title: 'Turn text into bits',
      text: `The text is read in the most compact mode (here “${e.mode}”), behind a 4-bit mode marker and a ${e.header.countBits.length}-bit length.`,
      svg: (
        <svg viewBox="0 0 96 30">
          {[...bits].map((b, i) => (
            <rect key={i} x={(i % 24) * 4} y={Math.floor(i / 24) * 7.5} width="3.4" height="6.4" rx="0.8" fill={i < 4 ? '#c2410c' : i < 4 + e.header.countBits.length ? '#b08a3e' : b === '1' ? '#14243a' : '#d6dae2'} />
          ))}
        </svg>
      ),
    },
    {
      title: 'Add error correction',
      text: `${e.dataCodewords.length} data codewords get ${e.blocks.reduce((s, b) => s + b.ecc.length, 0)} Reed–Solomon codewords, computed over the finite field GF(256), so the code survives damage.`,
      svg: (
        <svg viewBox="0 0 96 30">
          {e.blocks.map((b, i) => {
            const total = b.data.length + b.ecc.length;
            const h = 26 / e.blocks.length;
            return (
              <g key={i}>
                <rect x="0" y={2 + i * h} width={(b.data.length / total) * 96} height={h - 2} rx="1.5" fill="#14243a" />
                <rect x={(b.data.length / total) * 96} y={2 + i * h} width={(b.ecc.length / total) * 96} height={h - 2} rx="1.5" fill="#d4af65" />
              </g>
            );
          })}
        </svg>
      ),
    },
    {
      title: 'Interleave the blocks',
      text: 'Codewords from each block are dealt out in turn, so a scratch in one place damages a little of every block instead of all of one.',
      svg: (
        <svg viewBox="0 0 96 30">
          {e.interleaved.slice(0, 48).map((_, i) => (
            <rect key={i} x={(i % 24) * 4} y={Math.floor(i / 24) * 14 + 2} width="3.4" height="12" rx="0.8" fill={['#14243a', '#b08a3e', '#6b7688', '#e2c98f'][i % Math.max(1, e.blocks.length)]} />
          ))}
        </svg>
      ),
    },
    {
      title: 'Place them in a zigzag',
      text: 'Bits fill the symbol two columns at a time, up and down from the bottom-right corner, flowing around the finder and timing patterns.',
      svg: (
        <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`}>
          {sq(e.isFunction.map((r, y) => r.map((v, x) => v && e.modules[y][x])), '#b08a3e')}
          <path d={path} fill="none" stroke="#14243a" strokeWidth="0.35" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      title: 'Pick the best mask',
      text: `All eight mask patterns are tried and scored by the standard’s four penalty rules; mask ${e.chosen} wins here with ${best.total} points.`,
      svg: (
        <svg viewBox={`0 0 ${4 * (n + 3)} ${n + 2}`}>
          {e.masks.slice(0, 4).map((m, i) => (
            <g key={m.mask} transform={`translate(${i * (n + 3)} 1)`}>
              <rect x="-0.6" y="-0.6" width={n + 1.2} height={n + 1.2} rx="1" fill="#fff" stroke={m.mask === e.chosen ? '#d4af65' : '#d6dae2'} strokeWidth={m.mask === e.chosen ? 1 : 0.4} />
              {sq(m.modules, '#14243a')}
            </g>
          ))}
        </svg>
      ),
    },
    {
      title: 'Seal and print',
      text: 'The level and mask are written twice in BCH-protected format bits, and the finished symbol is checked by our own decoder before you download it.',
      svg: <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`}>{sq(e.modules)}</svg>,
    },
  ];
  return (
    <ol className="how-steps">
      {steps.map((s, i) => (
        <li key={s.title}>
          <div className="how-pic">{s.svg}</div>
          <div>
            <span className="how-n">{i + 1}</span>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** What happens between a phone camera and the page it opens. */
export function ScanFlow() {
  const steps = [
    { icon: Smartphone, title: 'A phone scans', text: 'The camera reads a short link such as /r/Ab3dE7k.' },
    { icon: ShieldCheck, title: 'Safety checks', text: 'Switched off, expired, out of scans, PIN or preview? Each is checked first.' },
    { icon: Route, title: 'Rules decide', text: 'Time, day, phone, language and country rules, then any A/B split.' },
    { icon: Fingerprint, title: 'Counted privately', text: 'A daily keyed hash, never the IP address; link previews are ignored.' },
    { icon: ScanLine, title: 'The page opens', text: 'A redirect in a few milliseconds, with no app to install.' },
    { icon: BarChart3, title: 'You see it', text: 'Scans by day and hour, devices, countries, languages, alerts.' },
  ];
  return (
    <div className="flow">
      {steps.map(({ icon: Icon, title, text }) => (
        <div key={title} className="flow-step">
          <div className="flow-ic">
            <Icon size={22} />
          </div>
          <h4>{title}</h4>
          <p>{text}</p>
        </div>
      ))}
    </div>
  );
}
