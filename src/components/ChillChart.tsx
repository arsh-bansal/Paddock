import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ClimateAnalysis, OptionEvaluation } from '../../shared/types';
import { fmtInt } from '../lib/format';

interface Props {
  analysis: ClimateAnalysis;
  options: OptionEvaluation[];
}

const VERDICT_STROKE = { viable: '#2f5a3b', 'at-risk': '#c9861b', 'not-viable': '#9b2f23' } as const;

interface Row {
  year: number;
  observed?: number;
  band?: [number, number];
  median?: number;
}

export function ChillChart({ analysis, options }: Props) {
  const { future } = analysis;
  const rows: Row[] = [];
  const obs = new Map(analysis.observed.map((s) => [s.year, s.chillHours]));
  for (let y = 1995; y <= future.period[1]; y++) {
    const row: Row = { year: y };
    if (obs.has(y)) row.observed = obs.get(y);
    if (y >= future.period[0]) {
      row.band = [future.chillHours.p10, future.chillHours.p90];
      row.median = future.chillHours.median;
    }
    rows.push(row);
  }

  const reqs = options.map((o) => o.requirement);
  const rawMax = Math.max(future.chillHours.p90, analysis.baseline.chillHours.p90, ...reqs, ...obs.values()) * 1.08;
  const step = [100, 200, 250, 500, 1000].find((s) => rawMax / s <= 6) ?? 1000;
  const yMax = Math.ceil(rawMax / step) * step;
  const yTicks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);

  const summary =
    `Chill hours per winter at ${analysis.location.label}. Observed winters ${analysis.observed[0]?.year}–` +
    `${analysis.observed.at(-1)?.year}; projected typical winter ${future.period[0]}–${future.period[1]} about ` +
    `${fmtInt(future.chillHours.median)} hours, poor winter about ${fmtInt(future.chillHours.p10)} hours.`;

  return (
    <figure className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xl font-bold">Winter chill at your block</h3>
        <span className="text-sm text-muted">Chill hours per winter, 1 April to 30 September</span>
      </figcaption>
      <div className="h-[340px] w-full" role="img" aria-label={summary}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#e7e9e1" vertical={false} />
            <XAxis dataKey="year" type="number" domain={[1995, future.period[1]]} ticks={[1995, 2005, 2015, 2025, 2035, 2045]}
              tick={{ fill: '#5b5e55', fontSize: 13 }} tickLine={false} axisLine={{ stroke: '#d8dbd0' }} />
            <YAxis domain={[0, yMax]} ticks={yTicks} tick={{ fill: '#5b5e55', fontSize: 13 }} tickLine={false}
              axisLine={false} width={48} tickFormatter={(v: number) => fmtInt(v)} />
            <ReferenceArea x1={future.period[0]} x2={future.period[1]} fill="#dfeaf1" fillOpacity={0.35}
              label={{ value: 'Projected', position: 'insideTopLeft', fill: '#3c6f8f', fontSize: 13 }} />
            <Area dataKey="band" stroke="none" fill="#3c6f8f" fillOpacity={0.22} isAnimationActive={false} name="Likely range (10th–90th percentile)" />
            <Line dataKey="median" stroke="#3c6f8f" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} name="Typical winter" />
            <Line dataKey="observed" stroke="#3c6f8f" strokeWidth={1.5} dot={{ r: 3, fill: '#3c6f8f' }} connectNulls={false}
              isAnimationActive={false} name="Observed winter" />
            {options.map((o) => (
              <ReferenceLine key={o.id} y={o.requirement} stroke={VERDICT_STROKE[o.verdict]} strokeWidth={1.5} strokeDasharray="2 3" />
            ))}
            <Tooltip
              formatter={(v: unknown, name: unknown) =>
                Array.isArray(v) ? [`${fmtInt(v[0])}–${fmtInt(v[1])} h`, String(name)] : [`${fmtInt(Number(v))} h`, String(name)]}
              labelFormatter={(y: unknown) => `Winter ${y}`}
              contentStyle={{ borderRadius: 8, borderColor: '#d8dbd0', fontFamily: 'Atkinson Hyperlegible, sans-serif' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Chill need of each option">
        {[...options].sort((a, b) => b.requirement - a.requirement).map((o) => (
          <li key={o.id} className="flex items-center gap-2">
            <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke={VERDICT_STROKE[o.verdict]} strokeWidth="2" strokeDasharray="2 3" /></svg>
            <span>{o.label} <span className="tabular text-muted">{fmtInt(o.requirement)} h</span></span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">
        {`Dots are real winters (reanalysis). The shaded band is the spread of winters expected in ${future.period[0]}–${future.period[1]} across ${future.models.length} climate models, not a year-by-year forecast. Dotted lines are each option’s chill need, coloured by how it fares.`}
      </p>
    </figure>
  );
}
