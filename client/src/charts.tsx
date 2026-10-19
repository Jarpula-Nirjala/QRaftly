import { useEffect, useRef, useState } from 'react';

const compact = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(n));

/** Round tick values: 0 and up to four steps of 1, 2 or 5 × 10^k. */
function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(Math.round(v * 1000) / 1000);
  if (out.at(-1)! < max) out.push(out.at(-1)! + step);
  return out.map((v) => Math.max(v, 0)).filter((v, i, a) => a.indexOf(v) === i).map((v) => (step >= 1 ? Math.round(v) : v));
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export interface Column {
  /** Axis label (shown sparsely). */
  label: string;
  /** Full label for the tooltip and table. */
  title: string;
  n: number;
}

/** A single-series column chart: one baseline, ≤24px columns with a 4px rounded top, hover tooltip, table view. */
export function ColumnChart({ data, height = 220, unit = 'scans', caption, labelAll = false }: { data: Column[]; height?: number; unit?: string; caption: string; /** Show every non-empty label (the data already spaces them). */ labelAll?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const left = 34;
  const bottom = 24;
  const top = 10;
  const plotW = Math.max(10, width - left - 4);
  const plotH = height - bottom - top;
  const max = Math.max(1, ...data.map((d) => d.n));
  const tk = ticks(max);
  const yMax = tk.at(-1)!;
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(24, slot - 2)); // 2px surface gap between neighbours
  const y = (v: number) => top + plotH - (v / yMax) * plotH;
  const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(plotW / 54))));
  const peak = data.reduce((best, d, i) => (d.n > data[best].n ? i : best), 0);

  return (
    <figure className="chart" ref={ref} style={{ margin: 0 }}>
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: -6, marginBottom: 4 }}>
        <button type="button" className="btn ghost sm" onClick={() => setTable(!table)} aria-pressed={table}>
          {table ? 'Chart' : 'Table'}
        </button>
      </div>
      {table ? (
        <div className="table-wrap" style={{ maxHeight: height + 40, overflowY: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th className="num">{unit}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.title}>
                  <td>{d.title}</td>
                  <td className="num">{d.n.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <svg width={width} height={height} role="img" aria-label={caption} onMouseLeave={() => setHover(null)}>
            {tk.map((t) => (
              <g key={t}>
                <line x1={left} x2={width} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} shapeRendering="crispEdges" />
                <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)">
                  {compact(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = left + i * slot + (slot - barW) / 2;
              const h = Math.max(0, y(0) - y(d.n));
              const r = Math.min(4, barW / 2, h);
              const path = h > 0 ? `M${x},${y(0)}V${y(d.n) + r}Q${x},${y(d.n)} ${x + r},${y(d.n)}H${x + barW - r}Q${x + barW},${y(d.n)} ${x + barW},${y(d.n) + r}V${y(0)}Z` : '';
              return (
                <g key={d.title}>
                  {path && <path d={path} fill="var(--chart)" opacity={hover === null || hover === i ? 1 : 0.45} />}
                  {d.label && (labelAll || i % every === 0) && (
                    <text x={left + i * slot + slot / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">
                      {d.label}
                    </text>
                  )}
                  {/* The hit target is the whole slot, taller than the mark. */}
                  <rect x={left + i * slot} y={top} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
                </g>
              );
            })}
            {data[peak]?.n > 0 && hover === null && (
              <text x={left + peak * slot + slot / 2} y={y(data[peak].n) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--ink-2)">
                {compact(data[peak].n)}
              </text>
            )}
            <line x1={left} x2={width} y1={y(0)} y2={y(0)} stroke="var(--line-2)" strokeWidth={1} shapeRendering="crispEdges" />
          </svg>
          {hover !== null && data[hover] && (
            <div className="tip" style={{ left: Math.min(width - 60, Math.max(60, left + hover * slot + slot / 2)), top: y(data[hover].n) + 36 }}>
              {data[hover].title}: <b>{data[hover].n.toLocaleString()}</b> {unit}
            </div>
          )}
        </>
      )}
    </figure>
  );
}

/** A ranked horizontal bar list (single series): name, bar, value at the tip. */
export function BarList({ items, total, limit = 6, empty = 'No scans yet.' }: { items: Array<{ name: string; n: number }>; total?: number; limit?: number; empty?: string }) {
  if (!items.length) return <p className="muted small" style={{ margin: 0 }}>{empty}</p>;
  const shown = items.slice(0, limit);
  const rest = items.slice(limit).reduce((s, x) => s + x.n, 0);
  if (rest) shown.push({ name: 'Other', n: rest });
  const max = Math.max(...shown.map((x) => x.n));
  const sum = total ?? items.reduce((s, x) => s + x.n, 0);
  return (
    <div className="hbars">
      {shown.map((x) => (
        <div key={x.name} className="hbar" title={`${x.name}: ${x.n.toLocaleString()} (${Math.round((x.n / Math.max(1, sum)) * 100)}%)`}>
          <span className="name">{x.name}</span>
          <div className="track">
            <div className="fill" style={{ width: `${(x.n / max) * 100}%` }} />
          </div>
          <span className="n">{x.n.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
