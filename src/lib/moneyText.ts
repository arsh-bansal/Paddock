import type { CropOption } from '../../shared/crops';
import { badYearChance, cashflow, emptyFinanceInputs, timelineFor, type CashFlow, type FinanceInputs, type Timeline } from '../../shared/finance';
import type { CropEvaluation } from '../../shared/seasons';

/*
 * Plain-English money wording shared by the screen and the PDF. ASCII-safe for the PDF fonts
 * (plain hyphen for negatives, no typographic minus).
 */

const money = (v: number) => `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v / 100) * 100).toLocaleString('en-AU')}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export interface MoneyText {
  headline: string;
  payback: string;
  total: string;
  risk: string;
  timing: string;
  caveat: string;
  summary: string;
}

export function moneyText(cf: CashFlow, t: Timeline, i: FinanceInputs): MoneyText {
  const pays = cf.breakEvenYear;
  const paysRisk = cf.breakEvenYearRisk;
  const payback =
    pays == null
      ? `With your numbers it doesn't pay back by ${cf.endYear}.`
      : paysRisk == null
        ? `With your numbers it pays back around ${pays}, but allowing for climate risk not by ${cf.endYear}.`
        : paysRisk === pays
          ? `With your numbers it pays back around ${pays}, even allowing for climate risk.`
          : `With your numbers it pays back around ${pays}, or around ${paysRisk} allowing for climate risk.`;
  const total = `By ${cf.endYear}: about ${money(cf.totalByEnd)} per hectare in total, or ${money(cf.totalByEndRisk)} allowing for climate risk.`;
  const risk =
    cf.badYearChance > 0
      ? `About ${pct(cf.badYearChance)} of projected years are bad for this crop here (short winter chill or frost at flowering). With your ${Math.round(i.badYearLossPct)}% loss estimate, that's about ${pct(cf.riskHaircut)} less income in a full-crop year.`
      : `No bad years are projected for this crop here on winter chill or spring frost, so the two lines match.`;
  const timing = `Timeline used: first crop in ${t.firstCropYear}, full crop in ${t.fullCropYear}${t.fullAssumed ? ' (assumed; no source gives full-crop timing)' : ''}.`;
  const headline = pays == null ? `Not paid back by ${cf.endYear}` : `Pays back around ${paysRisk ?? pays}${paysRisk != null && paysRisk !== pays ? ' with climate risk' : ''}`;
  return {
    headline,
    payback,
    total,
    risk,
    timing,
    caveat:
      'A planning sketch with your figures: no tax, interest, inflation or price changes. Frost comes from a district estimate that undercounts cold nights, so frost risk may be understated.',
    summary: `${payback} ${total}`,
  };
}

export function moneyLines(_cf: CashFlow, t: MoneyText): string[] {
  return [t.payback, t.total, t.risk, t.timing];
}

/** "Plant 2026, first crop around 2030 (usually 3-4 years), full crop around 2034." */
export function timelineText(t: Timeline): string {
  const range = (r: [number, number] | null) => (r ? (r[0] === r[1] ? `${r[0]} years` : `${r[0]}-${r[1]} years`) : null);
  const first = t.edited ? `first crop in ${t.firstCropYear} (your figure)` : `first crop around ${t.firstCropYear}${range(t.firstRange) ? ` (usually ${range(t.firstRange)})` : ''}`;
  const full = t.fullAssumed
    ? `full crop assumed around ${t.fullCropYear}`
    : t.edited
      ? `full crop in ${t.fullCropYear}`
      : `full crop around ${t.fullCropYear}${range(t.fullRange) ? ` (usually ${range(t.fullRange)})` : ''}`;
  return `Plant ${t.plantYear}, ${first}, ${full}.`;
}

export interface CropNotes {
  timeline?: string;
  money?: string[];
}

/** Timeline and (if the grower entered figures) money lines for each crop, for the PDF. */
export function cropNotes(
  crops: CropEvaluation[],
  cropOptions: CropOption[],
  finance: Record<string, FinanceInputs | undefined>,
  plantYear: number,
  endYear: number,
): Record<string, CropNotes> {
  const out: Record<string, CropNotes> = {};
  for (const e of crops) {
    const crop = cropOptions.find((c) => c.id === e.id);
    if (!crop) continue;
    const inputs = finance[e.id] ?? emptyFinanceInputs();
    const t = timelineFor(crop, plantYear, inputs);
    if (!t) continue;
    const cf = cashflow(inputs, t, endYear, badYearChance(e));
    out[e.id] = { timeline: timelineText(t), money: cf ? moneyLines(cf, moneyText(cf, t, inputs)) : undefined };
  }
  return out;
}
