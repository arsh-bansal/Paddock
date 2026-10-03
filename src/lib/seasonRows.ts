import type { Summary } from '../../shared/chill';
import type { SeasonSummary } from '../../shared/seasons';
import type { ClimateAnalysis } from '../../shared/types';

export type SeasonName = 'Winter' | 'Spring' | 'Summer' | 'Autumn' | 'Whole year';

export interface SeasonRow {
  season: SeasonName;
  measure: string;
  then: number;
  projected: number;
  unit: string;
  digits: 0 | 1;
  /** Which direction is good for growers, used to colour the change */
  better: 'higher' | 'lower' | 'neutral';
}

type Stat = keyof Summary;
const row = (
  season: SeasonName, measure: string, key: keyof SeasonSummary, stat: Stat, unit: string, digits: 0 | 1,
  better: SeasonRow['better'], a: ClimateAnalysis,
): SeasonRow => ({
  season, measure, unit, digits, better,
  then: a.baseline.summary[key][stat],
  projected: a.future.summary[key][stat],
});

/**
 * The location-level season table. Plain ASCII-safe wording so it renders in the PDF's
 * built-in fonts as well as on screen.
 */
export function seasonRows(a: ClimateAnalysis): SeasonRow[] {
  return [
    row('Winter', 'Chill portions, typical winter', 'chillPortions', 'median', 'portions', 0, 'higher', a),
    row('Winter', 'Chill portions, poor winter (1 in 10)', 'chillPortions', 'p10', 'portions', 0, 'higher', a),
    row('Winter', 'Chill hours, typical winter (for reference)', 'chillHours', 'median', 'h', 0, 'higher', a),
    row('Spring', 'Frost days at 0 °C or colder, Aug to Oct', 'springFrostDays', 'mean', 'days', 1, 'lower', a),
    row('Summer', 'Days 35 °C or hotter', 'hotDays', 'mean', 'days', 1, 'lower', a),
    row('Summer', 'Days 40 °C or hotter', 'extremeDays', 'mean', 'days', 1, 'lower', a),
    row('Summer', 'Longest hot spell, typical summer', 'longestHotSpell', 'median', 'days', 0, 'lower', a),
    row('Autumn', 'Days 30 °C or hotter, Mar to May', 'autumnWarmDays', 'mean', 'days', 1, 'lower', a),
    row('Autumn', 'Rainfall, Mar to May', 'autumnRainMm', 'mean', 'mm', 0, 'higher', a),
    row('Whole year', 'Rainfall', 'annualRainMm', 'mean', 'mm', 0, 'higher', a),
    row('Whole year', 'Water shortfall (evaporation minus rain)', 'waterDeficitMm', 'mean', 'mm', 0, 'lower', a),
  ].filter((r) => Number.isFinite(r.then) && Number.isFinite(r.projected));
}

/** "1 day" not "1 days". */
export function withUnit(v: number, digits: 0 | 1, unit: string): string {
  const text = formatValue(v, digits);
  const singular: Record<string, string> = { days: 'day', portions: 'portion' };
  return `${text} ${text === '1' && singular[unit] ? singular[unit] : unit}`;
}

export function formatValue(v: number, digits: 0 | 1): string {
  return v.toLocaleString('en-AU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** `minus` lets the PDF use ASCII, since its built-in fonts lack the typographic minus sign. */
export function formatChange(r: SeasonRow, minus = '−'): string {
  const d = r.projected - r.then;
  const rounded = Number(d.toFixed(r.digits));
  if (rounded === 0) return 'no change';
  return `${rounded > 0 ? '+' : minus}${withUnit(Math.abs(rounded), r.digits, r.unit)}`;
}

/** 'good' | 'bad' | 'neutral' for colouring the change. */
export function changeTone(r: SeasonRow): 'good' | 'bad' | 'neutral' {
  const d = Number((r.projected - r.then).toFixed(r.digits));
  if (d === 0 || r.better === 'neutral') return 'neutral';
  return (d > 0) === (r.better === 'higher') ? 'good' : 'bad';
}

export const SEASON_LABEL = { winter: 'Winter chill', spring: 'Spring frost', summer: 'Summer heat' } as const;

/** "needs about 52 chill portions (about 750 chill hours)", or a note when winter isn't scored. */
export function requirementText(c: { chillPortionsRequirement: number | null; chillRequirement: number | null; portionsConverted: boolean }): string {
  if (c.chillPortionsRequirement == null || c.chillRequirement == null) return 'winter chill not scored for this crop';
  return `needs about ${Math.round(c.chillPortionsRequirement)} chill portions (about ${Math.round(c.chillRequirement).toLocaleString('en-AU')} chill hours)`;
}

/** One-line, plain-English reading of a crop's season result. */
export function describeSeason(s: { season: 'winter' | 'spring' | 'summer'; verdict: string; future: number | null; baseline: number | null; threshold: number | null; margin?: number | null }): string {
  // Summer heat is reported even when it isn't scored, so growers still see the change.
  if (s.season === 'summer' && s.verdict === 'no-data' && s.future != null) {
    const b = s.baseline == null ? '' : ` (was ${Math.round(s.baseline)})`;
    return `About ${Math.round(s.future)} days of 35 °C or hotter in a typical summer${b}. Not scored yet: no published heat limit for this crop.`;
  }
  if (s.season === 'winter' && s.verdict === 'no-data' && s.threshold == null) {
    return 'Not scored: we have no chill figure for this crop that fits our winter-chill model.';
  }
  if (s.verdict === 'no-data' || s.future == null) return 'No crop data yet for this season.';
  const f = Math.round(s.future);
  const b = s.baseline == null ? null : Math.round(s.baseline);
  switch (s.season) {
    case 'winter':
      // A big surplus isn't free: varieties bred for warm areas tend to flower early in cold districts.
      if (s.margin != null && s.margin > 1) {
        return `Enough chill in ${f}% of winters${b != null ? ` (was ${b}%)` : ''}. Even a poor winter gives over double its need. Crops that need this little chill can flower early in a district this cold, raising frost risk.`;
      }
      return `Enough chill in ${f}% of winters${b != null ? ` (was ${b}%)` : ''}.`;
    case 'spring':
      return `Frost of ${s.threshold} °C or colder at flowering in ${f}% of years${b != null ? ` (was ${b}%)` : ''}. District estimate: frost hollows get more.`;
    case 'summer':
      return `About ${f} days of 35 °C or hotter in a typical summer${b != null ? ` (was ${b})` : ''}; it handles about ${s.threshold}.`;
  }
}
