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
    ranked: rankCrops(CROP_OPTIONS.map((c) => evaluateCrop(c, cropLabel(c), a.baseline.years, a.future.years))),
  };
}

/** 20 → "1 in 5"; 0 → null (never happened). Rounded to a whole "1 in N". */
export function oneIn(pct: number): string | null {
  if (pct <= 0) return null;
  return `1 in ${Math.max(1, Math.round(100 / pct))}`;
}
