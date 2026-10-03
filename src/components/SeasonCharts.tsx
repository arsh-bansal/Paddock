import { useId, useRef, useState } from 'react';
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { CropEvaluation } from '../../shared/seasons';
import type { ClimateAnalysis } from '../../shared/types';
import { fmtInt } from '../lib/format';
import { axisFor, SEASON_METRICS, seriesFor, seriesLine, seriesSummary, type SeasonMetricKey } from '../lib/seasonSeries';

const VERDICT_STROKE = { viable: '#2f5a3b', 'at-risk': '#c9861b', 'not-viable': '#9b2f23', 'no-data': '#9a9c94' } as const;

interface Row {
  year: number;
  observed?: number;
  band?: [number, number];
  median?: number;
}

interface Props {
  analysis: ClimateAnalysis;
  /** Crops whose chill need is drawn on the winter chart */
  crops: CropEvaluation[];
  placeName: string;
}

/** Past and projected climate for every season, one tab per season. */
export function SeasonCharts({ analysis, crops, placeName }: Props) {
  const [active, setActive] = useState<SeasonMetricKey>('winter');
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const metric = SEASON_METRICS.find((m) => m.key === active)!;
  const s = seriesFor(analysis, metric);
  const [f0, f1] = s.period;

  const lines = metric.cropLines
    ? crops.flatMap((c) => {
        if (c.chillPortionsRequirement == null) return [];
        const winter = c.seasons.find((x) => x.season === 'winter')!;
        return [{ id: c.id, label: c.label, value: c.chillPortionsRequirement, verdict: winter.verdict }];
      })
    : [];

  const firstYear = s.observed[0]?.[0] ?? s.baselinePeriod[0];
  const obs = new Map(s.observed);
  const rows: Row[] = [];
  for (let y = firstYear; y <= f1; y++) {
    const row: Row = { year: y };
    if (obs.has(y)) row.observed = obs.get(y);
    if (y >= f0) {
      row.band = [s.future.p10, s.future.p90];
      row.median = s.future.median;
    }
    rows.push(row);
  }
  const axis = axisFor([...obs.values(), s.future.p10, s.future.p90, ...lines.map((l) => l.value)]);
  const decadeTicks = [1995, 2005, 2015, 2025, 2035, 2045].filter((t) => t >= firstYear && t <= f1);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = SEASON_METRICS.length;
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (next == null) return;
    e.preventDefault();
    setActive(SEASON_METRICS[next].key);
    tabsRef.current[next]?.focus();
  };

  return (
    <figure className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      <figcaption className="mb-4 space-y-3">
        <h3 className="text-xl font-bold">Every season, past and projected</h3>
        <div role="tablist" aria-label="Season" className="flex flex-wrap gap-1 rounded-xl bg-paper p-1">
          {SEASON_METRICS.map((m, i) => (
            <button key={m.key} ref={(el) => { tabsRef.current[i] = el; }} type="button" role="tab"
              id={`${baseId}-tab-${m.key}`} aria-controls={`${baseId}-panel`} aria-selected={m.key === active}
              tabIndex={m.key === active ? 0 : -1} onClick={() => setActive(m.key)} onKeyDown={(e) => onKey(e, i)}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${m.key === active ? 'bg-card shadow-sm' : 'text-muted hover:text-bark'}`}
              style={m.key === active ? { color: m.colour } : undefined}>
              {m.tab}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">{metric.subtitle}</p>
      </figcaption>

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${active}`}>
        <div className="h-[320px] w-full" role="img" aria-label={seriesSummary(s, placeName)}>
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#e7e9e1" vertical={false} />
              <XAxis dataKey="year" type="number" domain={[firstYear, f1]} ticks={decadeTicks}
                tick={{ fill: '#5b5e55', fontSize: 13 }} tickLine={false} axisLine={{ stroke: '#d8dbd0' }} />
              <YAxis domain={[axis.min, axis.max]} ticks={axis.ticks} tick={{ fill: '#5b5e55', fontSize: 13 }} tickLine={false}
                axisLine={false} width={52} tickFormatter={(v: number) => fmtInt(v)} />
              {axis.min < 0 && <ReferenceLine y={0} stroke="#b9bcb2" />}
              <ReferenceArea x1={f0} x2={f1} fill="#dfeaf1" fillOpacity={0.35}
                label={{ value: 'Projected', position: 'insideTopLeft', fill: '#3c6f8f', fontSize: 13 }} />
              <Area dataKey="band" stroke="none" fill={metric.colour} fillOpacity={0.22} isAnimationActive={false} name="Likely range (10th–90th percentile)" />
              <Line dataKey="median" stroke={metric.colour} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} name="Typical year" />
              <Line dataKey="observed" stroke={metric.colour} strokeWidth={1.5} dot={{ r: 3, fill: metric.colour }} connectNulls={false}
                isAnimationActive={false} name="Real year" />
              {lines.map((l) => (
                <ReferenceLine key={l.id} y={l.value} stroke={VERDICT_STROKE[l.verdict]} strokeWidth={1.5} strokeDasharray="2 3" />
              ))}
              <Tooltip
                formatter={(v: unknown, name: unknown) =>
                  Array.isArray(v) ? [`${fmtInt(v[0])}–${fmtInt(v[1])} ${metric.unit}`, String(name)] : [`${fmtInt(Number(v))} ${metric.unit}`, String(name)]}
                labelFormatter={(y: unknown) => `${metric.yearWord} ${y}`}
                contentStyle={{ borderRadius: 8, borderColor: '#d8dbd0', fontFamily: 'Atkinson Hyperlegible, sans-serif' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <p className="mt-3 text-sm">{seriesLine(s)}</p>

        {lines.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Chill need of each crop">
            {[...lines].sort((a, b) => b.value - a.value).map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke={VERDICT_STROKE[l.verdict]} strokeWidth="2" strokeDasharray="2 3" /></svg>
                <span>{l.label} <span className="tabular text-muted">{fmtInt(l.value)} portions</span></span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-muted">
          {`Dots are real years (reanalysis). The shaded band is the spread of years expected in ${f0}–${f1} across ${s.modelCount} climate models, not a year-by-year forecast.`}
          {metric.cropLines && ' Dotted lines are each crop’s chill need, coloured by how it fares in winter.'}
          {metric.note && ` ${metric.note}`}
        </p>
      </div>
    </figure>
  );
}
