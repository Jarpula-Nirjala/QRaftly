import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';

export interface DayCount {
  day: string; // YYYY-MM-DD
  n: number;
}

/** A year of scans as a calendar: one square per day, darker for busier days (one gold hue, light to dark). */
export function CalendarHeatmap({ days, caption }: { days: DayCount[]; caption: string }) {
  const max = Math.max(1, ...days.map((d) => d.n));
  const steps = [0.12, 0.3, 0.5, 0.72, 1];
  const shade = (n: number) => {
    if (!n) return 'var(--surface-2)';
    const k = steps.findIndex((s) => n / max <= s);
    return `color-mix(in srgb, var(--chart) ${[25, 45, 65, 82, 100][k < 0 ? 4 : k]}%, var(--surface-2))`;
  };
  // Pad the start so columns are weeks that begin on Sunday.
  const first = days.length ? new Date(`${days[0].day}T12:00:00`).getDay() : 0;
  const total = days.reduce((s, d) => s + d.n, 0);
  const busiest = days.reduce((a, b) => (b.n > a.n ? b : a), days[0] ?? { day: '', n: 0 });
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="heat" role="img" aria-label={`${caption}: ${total} scans, busiest ${busiest.day ? fmt(busiest.day) : 'none'}`}>
        {Array.from({ length: first }, (_, i) => (
          <i key={`p${i}`} style={{ visibility: 'hidden' }} />
        ))}
        {days.map((d) => (
          <i key={d.day} style={{ background: shade(d.n) }} title={`${fmt(d.day)}: ${d.n} scan${d.n === 1 ? '' : 's'}`} />
        ))}
      </div>
      <div className="spread" style={{ marginTop: 8 }}>
        <span className="small muted">
          {total.toLocaleString()} scans{busiest?.n ? ` · busiest day ${fmt(busiest.day)} (${busiest.n})` : ''}
        </span>
        <span className="heat-legend">
          Less
          {[0, ...steps].map((s, i) => (
            <i key={i} style={{ background: i === 0 ? 'var(--surface-2)' : `color-mix(in srgb, var(--chart) ${[25, 45, 65, 82, 100][i - 1]}%, var(--surface-2))` }} />
          ))}
          More
        </span>
      </div>
    </figure>
  );
}

export interface Anomaly {
  day: string;
  n: number;
  expected: number;
  kind: 'spike' | 'drop';
}

/**
 * Unusual days, by a robust test: each day is compared with the median of the 14 days before it, scaled by
 * the median absolute deviation, so one busy weekend does not hide the next spike.
 */
export function findAnomalies(days: DayCount[]): Anomaly[] {
  const out: Anomaly[] = [];
  for (let i = 14; i < days.length; i++) {
    const win = days.slice(i - 14, i).map((d) => d.n).sort((a, b) => a - b);
    const med = (win[6] + win[7]) / 2;
    const mad = [...win].map((v) => Math.abs(v - med)).sort((a, b) => a - b);
    const spread = 1.4826 * ((mad[6] + mad[7]) / 2) + 1;
    const { n } = days[i];
    if (n >= 10 && (n - med) / spread > 3.5) out.push({ day: days[i].day, n, expected: Math.round(med), kind: 'spike' });
    else if (med >= 10 && n < med * 0.25) out.push({ day: days[i].day, n, expected: Math.round(med), kind: 'drop' });
  }
  return out;
}

export function AnomalyList({ items }: { items: Anomaly[] }) {
  if (!items.length)
    return (
      <p className="small muted" style={{ margin: 0 }}>
        Nothing unusual: every day is within the normal range of the two weeks before it.
      </p>
    );
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <ul className="risk-list">
      {items.slice(-6).reverse().map((a) => (
        <li key={a.day}>
          {a.kind === 'spike' ? <TrendingUp size={18} color="var(--warn)" /> : <TrendingDown size={18} color="var(--bad)" />}
          <span>
            <b>{fmt(a.day)}:</b> {a.n} scans, about {a.expected} expected. {a.kind === 'spike' ? 'A sudden spike: was the code shared online, or copied onto a fake poster?' : 'A sudden drop: is the printed code damaged, covered or taken down?'}
          </span>
        </li>
      ))}
      <li className="small muted">
        <AlertTriangle size={16} /> Checked against the median of the 14 days before each day.
      </li>
    </ul>
  );
}

/** A year of made-up but realistic scans (weekly rhythm, a slow rise, a festival spike and a damaged-sign drop). */
export function sampleYear(): DayCount[] {
  const out: DayCount[] = [];
  const start = new Date();
  start.setDate(start.getDate() - 364);
  for (let i = 0; i < 365; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    let n = 18 + i * 0.06 + (weekend ? 14 : 0) + 6 * Math.sin(i / 9) + ((i * 7919) % 9);
    if (i === 290) n *= 4.2; // a festival weekend shared online
    if (i >= 330 && i <= 333) n *= 0.12; // the sign was covered
    out.push({ day: d.toISOString().slice(0, 10), n: Math.max(0, Math.round(n)) });
  }
  return out;
}
