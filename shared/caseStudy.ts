import { CROP_OPTIONS, cropLabel } from './crops';
import { historyFor } from './history';
import { rankCrops } from './ranking';
import { evaluateCrop, type CropEvaluation } from './seasons';
import type { ClimateAnalysis } from './types';

/** Chill in one recent winter that the main record doesn't include yet. */
export interface LatestWinter {
  year: number;
  chillHours: number;
  chillPortions: number;
}

export interface CaseStudy {
  latest: LatestWinter;
  /** Every real winter, oldest first, including the latest */
  winters: { year: number; portions: number }[];
  /** 1 = the least chill of all real winters */
  rankFromLowest: number;
  /** The lowest winter before the latest one */
  previousLow: { year: number; portions: number };
  /** Share (0–100) of earlier real winters with this little chill or less */
  pastSharePct: number;
  /** Share (0–100) of projected winters with this little chill or less */
  futureSharePct: number;
  /** Median chill portions and hot days in each period */
  periods: { label: string; kind: 'real' | 'projected'; chill: number; hotDays: number }[];
  projected: { p10: number; median: number; p90: number; from: number; to: number };
  /** Every projected winter's chill portions, pooled across models */
  futureWinters: number[];
  ranked: CropEvaluation[];
}

const share = (values: number[], limit: number) =>
  values.length ? (values.filter((v) => v <= limit).length / values.length) * 100 : 0;

/** Everything the story page says about one location, computed from the analysis. */
export function buildCaseStudy(a: ClimateAnalysis, latest: LatestWinter): CaseStudy | null {
  const history = historyFor(a.observed);
  const past = a.observed.flatMap((y) => (y.winter && y.year < latest.year ? [{ year: y.year, portions: y.winter.chillPortions }] : []));
  if (!history || past.length < 15) return null;

  const winters = [...past, { year: latest.year, portions: latest.chillPortions }];
  const sorted = [...winters].sort((x, y) => x.portions - y.portions);
  const previousLow = [...past].sort((x, y) => x.portions - y.portions)[0];
  const future = a.future.years.flatMap((y) => (y.winter ? [y.winter.chillPortions] : []));
  const f = a.future.summary.chillPortions;

  return {
    latest,
    winters,
    rankFromLowest: sorted.findIndex((w) => w.year === latest.year) + 1,
    previousLow,
    pastSharePct: share(past.map((w) => w.portions), latest.chillPortions),
    futureSharePct: share(future, latest.chillPortions),
    periods: [
      { label: `${history.early.period[0]}–${history.early.period[1]}`, kind: 'real', chill: history.early.summary.chillPortions.median, hotDays: history.early.summary.hotDays.median },
      { label: `${history.recent.period[0]}–${history.recent.period[1]}`, kind: 'real', chill: history.recent.summary.chillPortions.median, hotDays: history.recent.summary.hotDays.median },
      { label: `${a.future.period[0]}–${a.future.period[1]}`, kind: 'projected', chill: f.median, hotDays: a.future.summary.hotDays.median },
    ],
    projected: { p10: f.p10, median: f.median, p90: f.p90, from: a.future.period[0], to: a.future.period[1] },
    futureWinters: future,
    ranked: rankCrops(CROP_OPTIONS.map((c) => evaluateCrop(c, cropLabel(c), a.baseline.years, a.future.years))),
  };
}

/** 20 → "1 in 5"; 0 → null (never happened). Rounded to a whole "1 in N". */
export function oneIn(pct: number): string | null {
  if (pct <= 0) return null;
  return `1 in ${Math.max(1, Math.round(100 / pct))}`;
}

/**
 * An illustrative year-by-year sequence for an animation: n evenly spaced quantiles of the
 * projected winters (so the share of low winters matches the projection), in a fixed shuffled
 * order. Not a forecast for any particular year.
 */
export function illustrativeSequence(values: number[], n: number, seed = 7): number[] {
  if (!values.length || n <= 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const picks = Array.from({ length: n }, (_, i) => sorted[Math.min(sorted.length - 1, Math.floor(((i + 0.5) / n) * sorted.length))]);
  const rand = mulberry32(seed);
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  return picks;
}

/** Small seeded PRNG so drawings and sequences look the same on every visit. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
