import { summariseYears, type SeasonSummary, type YearStat } from './seasons';
import { EARLY_PERIOD, RECENT_PERIOD } from './types';

export interface HistoryPeriod {
  period: readonly [number, number];
  summary: SeasonSummary;
  /** Years in the period with a complete winter */
  winters: number;
}

/** Fewer complete winters than this and a 20-year comparison isn't meaningful. */
export const MIN_WINTERS = 15;

/**
 * Split real years into the two 20-year periods. Returns null when either period is too thin,
 * e.g. a report saved before the record went back to 1985.
 */
export function historyFor(observed: YearStat[]): { early: HistoryPeriod; recent: HistoryPeriod } | null {
  const make = (period: readonly [number, number]): HistoryPeriod => {
    const years = observed.filter((y) => y.year >= period[0] && y.year <= period[1]);
    return { period, summary: summariseYears(years), winters: years.filter((y) => y.winter).length };
  };
  const early = make(EARLY_PERIOD);
  const recent = make(RECENT_PERIOD);
  return early.winters >= MIN_WINTERS && recent.winters >= MIN_WINTERS ? { early, recent } : null;
}

/** Percent change from a to b, or null when a is ~0 (a % of nothing is meaningless). */
export function pctChange(a: number, b: number): number | null {
  return Math.abs(a) < 1e-9 ? null : Math.round(((b - a) / a) * 100);
}

/** Under 5% either way is within normal year-to-year noise for these measures. */
export function changeWord(pct: number | null): 'less' | 'more' | 'same' | 'unknown' {
  if (pct == null) return 'unknown';
  if (Math.abs(pct) < 5) return 'same';
  return pct < 0 ? 'less' : 'more';
}
