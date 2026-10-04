import type { SeasonSummary, YearStat } from '../../shared/seasons';
import type { ClimateAnalysis, Summary } from '../../shared/types';

/*
 * One definition per season chart, shared by the screen (SeasonCharts) and the PDF so they always
 * plot the same thing. Text is ASCII-safe for the PDF's built-in fonts (no ≥ or typographic minus).
 */

export type SeasonMetricKey = 'winter' | 'spring' | 'summer' | 'autumn' | 'water';

export interface SeasonMetric {
  key: SeasonMetricKey;
  /** Tab label */
  tab: string;
  title: string;
  /** What one point is */
  subtitle: string;
  /** Unit after numbers: "portions", "days", "mm" */
  unit: string;
  /** Word for one year in tooltips: "Winter 2010" */
  yearWord: string;
  colour: string;
  /** Value for one year, or null when that season is incomplete */
  pick: (y: YearStat) => number | null;
  summaryKey: keyof SeasonSummary;
  /** Whether more is better for growers (colours the change) */
  better: 'higher' | 'lower';
  /** Caveat shown under the chart */
  note?: string;
  /** Draw each crop's chill need (winter only) */
  cropLines?: boolean;
}

export const SEASON_METRICS: SeasonMetric[] = [
  {
    key: 'winter', tab: 'Winter', title: 'Winter chill', subtitle: 'Chill portions per winter, 1 April to 30 September',
    unit: 'portions', yearWord: 'Winter', colour: '#3c6f8f',
    pick: (y) => y.winter?.chillPortions ?? null, summaryKey: 'chillPortions', better: 'higher', cropLines: true,
  },
  {
    key: 'spring', tab: 'Spring', title: 'Spring frost', subtitle: 'Days at 0 °C or colder, August to October',
    unit: 'days', yearWord: 'Spring', colour: '#5a7f9c',
    pick: (y) => (y.spring ? y.spring.frostDays[1][0] + y.spring.frostDays[2][0] + y.spring.frostDays[3][0] : null),
    summaryKey: 'springFrostDays', better: 'lower',
    note: 'A district estimate: the 10-25 km weather grid smooths out cold nights, so it undercounts frost, especially in frost hollows.',
  },
  {
    key: 'summer', tab: 'Summer', title: 'Summer heat', subtitle: 'Days of 35 °C or hotter, December to February',
    unit: 'days', yearWord: 'Summer', colour: '#c9861b',
    pick: (y) => y.summer?.hotDays ?? null, summaryKey: 'hotDays', better: 'lower',
    note: 'Each summer is labelled by its January (summer 2010 = December 2009 to February 2010).',
  },
  {
    key: 'autumn', tab: 'Autumn', title: 'Autumn rain', subtitle: 'Rainfall, March to May',
    unit: 'mm', yearWord: 'Autumn', colour: '#7c4f0b',
    pick: (y) => y.autumn?.rainMm ?? null, summaryKey: 'autumnRainMm', better: 'higher',
  },
  {
    key: 'water', tab: 'Water', title: 'Water shortfall', subtitle: 'Evaporation minus rainfall over the year',
    unit: 'mm', yearWord: 'Year', colour: '#2f5a3b',
    pick: (y) => y.annual?.deficitMm ?? null, summaryKey: 'waterDeficitMm', better: 'lower',
    note: 'Below zero means more rain fell than evaporated that year. A guide to irrigation demand, not a crop water budget.',
  },
];

export interface SeasonSeries {
  metric: SeasonMetric;
  /** Real years, [year, value] */
  observed: [number, number][];
  /** Projected spread across models for the future period */
  future: Summary;
  baseline: Summary;
  baselinePeriod: readonly [number, number];
  period: readonly [number, number];
  modelCount: number;
}

export function seriesFor(a: ClimateAnalysis, metric: SeasonMetric): SeasonSeries {
  return {
    metric,
    observed: a.observed.flatMap((y) => {
      const v = metric.pick(y);
      return v != null && Number.isFinite(v) ? [[y.year, v] as [number, number]] : [];
    }),
    future: a.future.summary[metric.summaryKey],
    baseline: a.baseline.summary[metric.summaryKey],
    baselinePeriod: a.baseline.period,
    period: a.future.period,
    modelCount: a.future.models.length,
  };
}

/** Nice axis bounds and ticks covering every value (including negatives), about 5 steps. */
export function axisFor(values: number[]): { min: number; max: number; ticks: number[] } {
  const finite = values.filter(Number.isFinite);
  const lo = Math.min(0, ...finite);
  const hi = Math.max(1, ...finite);
  const span = (hi - lo) * 1.08;
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => span / s <= 6) ?? 1000;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil((hi + (hi - lo) * 0.08) / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + 1e-9; t += step) ticks.push(t);
  return { min, max, ticks };
}

/** "about 92 portions now ... 2026-2045" style one-liner for screen readers and the PDF. */
export function seriesSummary(s: SeasonSeries, place: string): string {
  const fmt = fmtValue;
  const first = s.observed[0]?.[0];
  const last = s.observed.at(-1)?.[0];
  return (
    `${s.metric.title} at ${place}: ${s.metric.subtitle.toLowerCase()}. Real years ${first}-${last}, averaging about ` +
    `${fmt(s.baseline.mean)} ${s.metric.unit} in ${s.baselinePeriod[0]}-${s.baselinePeriod[1]}; projected ${s.period[0]}-${s.period[1]} ` +
    `typically about ${fmt(s.future.median)} ${s.metric.unit} (likely range ${fmt(s.future.p10)} to ${fmt(s.future.p90)}).`
  );
}

/** Values under 10 keep one decimal (0.3 frost days shouldn't read as 0); ASCII minus for the PDF. */
export function fmtValue(v: number): string {
  const digits = Math.abs(v) < 10 ? 1 : 0;
  const text = Math.abs(v).toLocaleString('en-AU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return v < 0 && text !== '0' && text !== '0.0' ? `-${text}` : text;
}

/** "Average 32 mm in 1995-2014; projected typical 123 mm in 2026-2045 (likely range -170 to 384)." */
export function seriesLine(s: SeasonSeries): string {
  const u = s.metric.unit;
  return (
    `Average ${fmtValue(s.baseline.mean)} ${u} in ${s.baselinePeriod[0]}-${s.baselinePeriod[1]}; ` +
    `projected typical ${fmtValue(s.future.median)} ${u} in ${s.period[0]}-${s.period[1]} ` +
    `(likely range ${fmtValue(s.future.p10)} to ${fmtValue(s.future.p90)}).`
  );
}
