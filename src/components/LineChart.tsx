import { useState } from 'react';

export interface ChartPoint {
  label: string;
  value: number;
  note?: string;
}

interface LineChartProps {
  data: ChartPoint[];
  min: number;
  max: number;
  ticks: number[];
  format: (value: number) => string;
  /** Title line of the tooltip for a point. */
  pointLabel?: (p: ChartPoint) => string;
  defaultNote: string;
}

/** Single-series line chart with hover/focus tooltips; the last value is labelled when idle. */
export function LineChart({ data, min, max, ticks, format, pointLabel = (p) => p.label, defaultNote }: LineChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => ((max - v) / (max - min)) * 100;
  const active = hover != null && hover < n ? hover : null;
  const last = data[n - 1];

  return (
    <div className="chart">
      <div className="chart__axis" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className="chart__tick" style={{ top: `${y(t)}%` }}>
            {t} %
          </span>
        ))}
      </div>
      <div className="stack gap-8 grow">
        <div className="chart__plot" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <div key={t} className={t === min ? 'chart__grid chart__grid--base' : 'chart__grid'} style={{ top: `${y(t)}%` }} />
          ))}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
          >
            <defs>
              <linearGradient id="chart-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: 'var(--blue)', stopOpacity: 0.22 }} />
                <stop offset="1" style={{ stopColor: 'var(--blue)', stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <polygon points={`${x(0)},100 ${data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')} ${x(n - 1)},100`} fill="url(#chart-area)" stroke="none" />
            <polyline
              points={data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')}
              fill="none"
              stroke="var(--blue)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {active != null && <div className="chart__guide" style={{ left: `${x(active)}%` }} />}
          {data.map((d, i) => (
            <div
              key={d.label}
              className="chart__dot"
              data-active={i === active}
              style={{ left: `${x(i)}%`, top: `${y(d.value)}%` }}
            />
          ))}
          {active == null ? (
            <span className="chart__label" style={{ left: `${x(n - 1)}%`, top: `${y(last.value)}%` }}>
              {format(last.value)}
            </span>
          ) : (
            <div className="chart__tooltip" style={{ left: `${x(active)}%`, top: `${y(data[active].value)}%` }}>
              <span>{pointLabel(data[active])}</span>
              <strong style={{ fontSize: 15 }}>{format(data[active].value)} asistencia</strong>
              <span>{data[active].note ?? defaultNote}</span>
            </div>
          )}
          <div className="chart__hit">
            {data.map((d, i) => (
              <button
                key={d.label}
                type="button"
                aria-label={`${d.label}: ${format(d.value)}${d.note ? '. ' + d.note : ''}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            ))}
          </div>
        </div>
        <div className="chart__x" aria-hidden="true">
          {data.map((d) => (
            <span key={d.label}>{d.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
