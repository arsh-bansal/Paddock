/**
 * Season-by-season climate metrics for orchard crops (southern hemisphere).
 *
 *  Winter  chill season, 1 Apr – 30 Sep of year Y        chill hours, chill portions
 *  Spring  flowering window, Jul – Nov of year Y         frost days by month and temperature
 *  Summer  Dec of Y-1 to Feb of Y (labelled Y)           hot days ≥35 °C, extreme days ≥40 °C, longest hot spell
 *  Autumn  Mar – May of Y                                rainfall, warm days ≥30 °C
 *  Annual  Jan – Dec of Y                                rainfall, reference evapotranspiration, water deficit
 *
 * Every metric is computed per year, so any period (baseline, recent, projected) is just a
 * filter over the yearly list. Seasons with too much missing data are null, never under-counted.
 */
import {
  chillHours, chillPortions, dayOfYear, et0Hargreaves, hourlyTemps, monthOf, percentile, summarise, yearOf,
  type DailyWeather, type Summary,
} from './chill';
import { hoursToPortions } from './chillConversion';
import { defaultPortions, type CropOption } from './crops';
import type { Verdict } from './types';

export const HOT_DAY_C = 35;
export const EXTREME_DAY_C = 40;
export const WARM_AUTUMN_DAY_C = 30;
/** Months covered by the frost matrix (1-based). */
export const FROST_MONTHS = [7, 8, 9, 10, 11] as const;
/** Minimum-temperature thresholds covered by the frost matrix, °C. */
export const FROST_THRESHOLDS = [0, -1, -2, -3, -4] as const;
const MAX_MISSING = 0.05;

export interface YearStat {
  year: number;
  winter: { chillHours: number; chillPortions: number } | null;
  /** frostDays[m][t] = days in FROST_MONTHS[m] with tmin <= FROST_THRESHOLDS[t] */
  spring: { frostDays: number[][] } | null;
  summer: { hotDays: number; extremeDays: number; longestHotSpell: number } | null;
  autumn: { rainMm: number | null; warmDays: number } | null;
  annual: { rainMm: number | null; et0Mm: number; deficitMm: number | null } | null;
}

export interface SeasonSummary {
  chillHours: Summary;
  chillPortions: Summary;
  /** Days at or below 0 °C in Aug–Oct (district-level frost exposure, not crop-specific) */
  springFrostDays: Summary;
  hotDays: Summary;
  extremeDays: Summary;
  longestHotSpell: Summary;
  autumnRainMm: Summary;
  autumnWarmDays: Summary;
  annualRainMm: Summary;
  annualEt0Mm: Summary;
  waterDeficitMm: Summary;
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const expected = (months: [number, number][]) => months.reduce((s, [y, m]) => s + daysInMonth(y, m), 0);
const complete = (got: number, want: number) => got >= want * (1 - MAX_MISSING);

/** Per-year season statistics for a continuous daily series. */
export function yearlyStats(days: DailyWeather[], latDeg: number): YearStat[] {
  const clean = days.filter((d) => Number.isFinite(d.tmin) && Number.isFinite(d.tmax));
  if (clean.length === 0) return [];
  const hourly = hourlyTemps(clean, latDeg);

  // Index days by year and month, preserving date order.
  const byYm = new Map<string, number[]>();
  clean.forEach((d, i) => {
    const key = `${yearOf(d.date)}-${monthOf(d.date)}`;
    if (!byYm.has(key)) byYm.set(key, []);
    byYm.get(key)!.push(i);
  });
  const idx = (y: number, m: number) => byYm.get(`${y}-${m}`) ?? [];
  const years = [...new Set(clean.map((d) => yearOf(d.date)))].sort((a, b) => a - b);

  return years.map((year): YearStat => {
    // Winter chill, Apr–Sep.
    const winterIdx = [4, 5, 6, 7, 8, 9].flatMap((m) => idx(year, m));
    let winter: YearStat['winter'] = null;
    if (complete(winterIdx.length, expected([4, 5, 6, 7, 8, 9].map((m) => [year, m])))) {
      const hours: number[] = [];
      for (const i of winterIdx) for (let h = 0; h < 24; h++) hours.push(hourly[i * 24 + h]);
      winter = { chillHours: chillHours(hours), chillPortions: chillPortions(hours) };
    }

    // Spring frost matrix, Jul–Nov.
    let spring: YearStat['spring'] = null;
    const springOk = FROST_MONTHS.every((m) => complete(idx(year, m).length, daysInMonth(year, m)));
    if (springOk) {
      spring = {
        frostDays: FROST_MONTHS.map((m) =>
          FROST_THRESHOLDS.map((t) => idx(year, m).filter((i) => clean[i].tmin <= t).length),
        ),
      };
    }

    // Summer, Dec of previous year through Feb.
    const summerIdx = [...idx(year - 1, 12), ...idx(year, 1), ...idx(year, 2)];
    let summer: YearStat['summer'] = null;
    if (complete(summerIdx.length, daysInMonth(year - 1, 12) + daysInMonth(year, 1) + daysInMonth(year, 2))) {
      let hot = 0;
      let extreme = 0;
      let run = 0;
      let longest = 0;
      for (const i of summerIdx) {
        const t = clean[i].tmax;
        if (t >= HOT_DAY_C) {
          hot++;
          run++;
          longest = Math.max(longest, run);
        } else {
          run = 0;
        }
        if (t >= EXTREME_DAY_C) extreme++;
      }
      summer = { hotDays: hot, extremeDays: extreme, longestHotSpell: longest };
    }

    // Autumn, Mar–May.
    const autumnIdx = [3, 4, 5].flatMap((m) => idx(year, m));
    let autumn: YearStat['autumn'] = null;
    const autumnDays = expected([[year, 3], [year, 4], [year, 5]]);
    if (complete(autumnIdx.length, autumnDays)) {
      const rain = autumnIdx.map((i) => clean[i].precip).filter((p): p is number => p != null);
      autumn = {
        rainMm: complete(rain.length, autumnDays) ? rain.reduce((s, v) => s + v, 0) : null,
        warmDays: autumnIdx.filter((i) => clean[i].tmax >= WARM_AUTUMN_DAY_C).length,
      };
    }

    // Annual water balance.
    const yearIdx = Array.from({ length: 12 }, (_, k) => idx(year, k + 1)).flat();
    const yearDays = expected(Array.from({ length: 12 }, (_, k) => [year, k + 1] as [number, number]));
    let annual: YearStat['annual'] = null;
    if (complete(yearIdx.length, yearDays)) {
      const et0 = yearIdx.reduce((s, i) => s + et0Hargreaves(latDeg, dayOfYear(clean[i].date), clean[i].tmin, clean[i].tmax), 0);
      const rain = yearIdx.map((i) => clean[i].precip).filter((p): p is number => p != null);
      const rainMm = complete(rain.length, yearDays) ? rain.reduce((s, v) => s + v, 0) : null;
      annual = { rainMm, et0Mm: et0, deficitMm: rainMm == null ? null : et0 - rainMm };
    }

    return { year, winter, spring, summer, autumn, annual };
  });
}

function collect(years: YearStat[], pick: (y: YearStat) => number | null | undefined): number[] {
  return years.map(pick).filter((v): v is number => v != null && Number.isFinite(v));
}

export function summariseYears(years: YearStat[]): SeasonSummary {
  const augToOctFrost = (y: YearStat) => {
    if (!y.spring) return null;
    // FROST_MONTHS index 1..3 = Aug..Oct, threshold index 0 = 0 °C
    return y.spring.frostDays[1][0] + y.spring.frostDays[2][0] + y.spring.frostDays[3][0];
  };
  return {
    chillHours: summarise(collect(years, (y) => y.winter?.chillHours)),
    chillPortions: summarise(collect(years, (y) => y.winter?.chillPortions)),
    springFrostDays: summarise(collect(years, augToOctFrost)),
    hotDays: summarise(collect(years, (y) => y.summer?.hotDays)),
    extremeDays: summarise(collect(years, (y) => y.summer?.extremeDays)),
    longestHotSpell: summarise(collect(years, (y) => y.summer?.longestHotSpell)),
    autumnRainMm: summarise(collect(years, (y) => y.autumn?.rainMm)),
    autumnWarmDays: summarise(collect(years, (y) => y.autumn?.warmDays)),
    annualRainMm: summarise(collect(years, (y) => y.annual?.rainMm)),
    annualEt0Mm: summarise(collect(years, (y) => y.annual?.et0Mm)),
    waterDeficitMm: summarise(collect(years, (y) => y.annual?.deficitMm)),
  };
}

/* ------------------------------------------------------------------ */
/* Per-crop evaluation                                                  */
/* ------------------------------------------------------------------ */

export type SeasonKey = 'winter' | 'spring' | 'summer';
export type SeasonVerdict = Verdict | 'no-data';

export interface SeasonResult {
  season: SeasonKey;
  verdict: SeasonVerdict;
  /**
   * winter: % of winters with enough chill (higher is better)
   * spring: % of years with a damaging frost during flowering (lower is better)
   * summer: hot days (≥35 °C) in a typical summer (lower is better)
   */
  baseline: number | null;
  future: number | null;
  /** chill hours needed / frost damage °C / hot days the crop handles before risk climbs */
  threshold: number | null;
  /** True while the crop threshold behind this result is not yet sourced */
  indicative: boolean;
  /**
   * Winter only: how far a poor (1-in-10) projected winter clears the need, as a fraction of the
   * need ((p10 - need) / need). Negative = falls short. Used to rank crops that all pass.
   */
  margin?: number | null;
}

export interface CropEvaluation {
  id: string;
  label: string;
  overall: SeasonVerdict;
  seasons: SeasonResult[];
  heatNote: string;
  /** Chill hours shown to the grower (crop default or their own figure) */
  chillRequirement: number;
  /** Chill portions actually scored against (Dynamic Model) */
  chillPortionsRequirement: number;
  /** True when the portions requirement was converted from hours rather than sourced directly */
  portionsConverted: boolean;
}

/** Share of years, 0–100, where `test` is true. */
function pctYears(values: number[], test: (v: number) => boolean): number | null {
  return values.length ? (values.filter(test).length / values.length) * 100 : null;
}

/**
 * Winter: "safe winter chill" (Luedeling et al. 2009), scored in Chill Portions (Dynamic Model).
 *  viable: the 10th-percentile winter meets the need; at-risk: the median does; else not-viable.
 * `requirement` and `threshold` are in chill portions.
 */
export function evaluateWinter(base: YearStat[], fut: YearStat[], requirement: number, indicative: boolean): SeasonResult {
  const b = collect(base, (y) => y.winter?.chillPortions);
  const f = collect(fut, (y) => y.winter?.chillPortions);
  if (f.length === 0) return { season: 'winter', verdict: 'no-data', baseline: null, future: null, threshold: requirement, indicative };
  const verdict: Verdict =
    percentile(f, 10) >= requirement ? 'viable' : percentile(f, 50) >= requirement ? 'at-risk' : 'not-viable';
  return {
    season: 'winter',
    verdict,
    baseline: pctYears(b, (v) => v >= requirement),
    future: pctYears(f, (v) => v >= requirement),
    threshold: requirement,
    indicative,
    margin: requirement > 0 ? (percentile(f, 10) - requirement) / requirement : null,
  };
}

/** Frost risk bands: share of years with at least one damaging frost while the crop is flowering. */
export const FROST_RISK_BANDS = { viable: 10, atRisk: 30 } as const;

export function evaluateSpring(base: YearStat[], fut: YearStat[], crop: CropOption): SeasonResult {
  const spec = crop.spring;
  if (!spec) return { season: 'spring', verdict: 'no-data', baseline: null, future: null, threshold: null, indicative: false };
  // Use the coldest matrix threshold that is still at or above the crop's damage temperature.
  // Rounding towards warmer counts more frosts, so the result errs on the cautious side.
  let thresholdIdx = 0;
  FROST_THRESHOLDS.forEach((t, i) => {
    if (t >= spec.frostDamageC - 1e-9) thresholdIdx = i;
  });
  const monthIdx = spec.floweringMonths
    .map((m) => (FROST_MONTHS as readonly number[]).indexOf(m))
    .filter((i) => i >= 0);
  if (monthIdx.length === 0) return { season: 'spring', verdict: 'no-data', baseline: null, future: null, threshold: spec.frostDamageC, indicative: spec.indicative };

  const frostYear = (y: YearStat) => (y.spring ? (monthIdx.some((m) => y.spring!.frostDays[m][thresholdIdx] > 0) ? 1 : 0) : null);
  const b = collect(base, frostYear);
  const f = collect(fut, frostYear);
  const futPct = pctYears(f, (v) => v === 1);
  if (futPct == null) return { season: 'spring', verdict: 'no-data', baseline: null, future: null, threshold: spec.frostDamageC, indicative: spec.indicative };
  const verdict: Verdict = futPct <= FROST_RISK_BANDS.viable ? 'viable' : futPct <= FROST_RISK_BANDS.atRisk ? 'at-risk' : 'not-viable';
  return {
    season: 'spring',
    verdict,
    baseline: pctYears(b, (v) => v === 1),
    future: futPct,
    threshold: FROST_THRESHOLDS[thresholdIdx],
    indicative: spec.indicative,
  };
}

/**
 * Summer: hot days per summer against the crop's tolerance.
 *  viable: even a hot summer (90th percentile) stays within tolerance; at-risk: a typical one does; else not-viable.
 * With no sourced tolerance (crop.summer null) the season is NOT scored ('no-data'), but the
 * location's typical hot days are still reported so growers see the change.
 */
export function evaluateSummer(base: YearStat[], fut: YearStat[], crop: CropOption): SeasonResult {
  const spec = crop.summer;
  const b = collect(base, (y) => y.summer?.hotDays);
  const f = collect(fut, (y) => y.summer?.hotDays);
  const baseline = b.length ? percentile(b, 50) : null;
  const future = f.length ? percentile(f, 50) : null;
  if (!spec || f.length === 0) {
    return { season: 'summer', verdict: 'no-data', baseline, future, threshold: spec?.hotDaysTolerated ?? null, indicative: Boolean(spec?.indicative) };
  }
  const limit = spec.hotDaysTolerated;
  const verdict: Verdict = percentile(f, 90) <= limit ? 'viable' : percentile(f, 50) <= limit ? 'at-risk' : 'not-viable';
  return { season: 'summer', verdict, baseline, future, threshold: limit, indicative: spec.indicative };
}

const SEVERITY: Record<SeasonVerdict, number> = { 'no-data': -1, viable: 0, 'at-risk': 1, 'not-viable': 2 };

/** One bad season can ruin a crop, so the overall verdict is the worst season with data. */
export function overallVerdict(results: SeasonResult[]): SeasonVerdict {
  return results.reduce<SeasonVerdict>((worst, r) => (SEVERITY[r.verdict] > SEVERITY[worst] ? r.verdict : worst), 'no-data');
}

export interface EvaluateOptions {
  /**
   * The grower's own chill-hours figure for their variety (nursery figures are usually in hours).
   * Converted to chill portions for scoring. Omit to use the crop's own portions requirement.
   */
  chillHoursOverride?: number;
}

export function evaluateCrop(
  crop: CropOption,
  label: string,
  baseYears: YearStat[],
  futureYears: YearStat[],
  opts: EvaluateOptions = {},
): CropEvaluation {
  const override = opts.chillHoursOverride;
  const hasOverride = override != null && Number.isFinite(override);
  const chillRequirement = hasOverride
    ? override
    : Math.round((crop.winter.chillHours[0] + crop.winter.chillHours[1]) / 2);
  const portions = hasOverride ? Math.round(hoursToPortions(override) * 10) / 10 : defaultPortions(crop);
  const portionsConverted = hasOverride || crop.winter.portionsDerived;

  const seasons = [
    evaluateWinter(baseYears, futureYears, portions, crop.winter.indicative || portionsConverted),
    evaluateSpring(baseYears, futureYears, crop),
    evaluateSummer(baseYears, futureYears, crop),
  ];
  return {
    id: crop.id,
    label,
    overall: overallVerdict(seasons),
    seasons,
    heatNote: crop.heatNote,
    chillRequirement,
    chillPortionsRequirement: portions,
    portionsConverted,
  };
}
