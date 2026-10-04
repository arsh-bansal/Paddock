/**
 * "Will it pay?" — a simple per-hectare cash view for one crop, using the GROWER'S OWN numbers.
 *
 * Paddock doesn't supply prices, yields or costs: they vary too much by variety, district, market
 * and year to put a credible default on. The grower enters them; Paddock adds what it does know:
 *  - when the crop starts and reaches full production (sourced bearing years, editable), and
 *  - how often the projected climate gives a bad year for it (winter chill short, or damaging
 *    frost at flowering), from the season verdicts.
 *
 * Model (per hectare, Australian dollars, planting year = year 0):
 *  - Costs: the planting cost in year 0, plus the yearly running cost every year from year 0.
 *  - Income: nothing before the first crop; ramps up evenly from the first crop to full crop;
 *    full yield × price after that.
 *  - "With climate risk": income × (1 − chance of a bad year × share of a crop lost in a bad year).
 *    The loss share is the grower's own estimate.
 * It's a planning sketch, not a farm budget: no tax, finance costs, inflation or price changes.
 */
import type { CropOption } from './crops';
import type { CropEvaluation } from './seasons';

export interface FinanceInputs {
  /** Expected farm-gate price, $ per kg */
  pricePerKg: number | null;
  /** Yield at full production, tonnes per hectare */
  fullYieldTPerHa: number | null;
  /** One-off cost to plant, $ per hectare */
  plantingCostPerHa: number | null;
  /** Running cost every year, $ per hectare */
  yearlyCostPerHa: number | null;
  /** Share of a normal crop lost in a bad year, 0-100 (the grower's estimate) */
  badYearLossPct: number;
  /** Years after planting to the first crop / full crop; null = use the crop data */
  firstCropAfterYears: number | null;
  fullCropAfterYears: number | null;
}

export const DEFAULT_BAD_YEAR_LOSS_PCT = 50;
/** Used only when no source gives years to full production. Shown as an assumption. */
export const ASSUMED_RAMP_YEARS = 3;

export function emptyFinanceInputs(): FinanceInputs {
  return {
    pricePerKg: null,
    fullYieldTPerHa: null,
    plantingCostPerHa: null,
    yearlyCostPerHa: null,
    badYearLossPct: DEFAULT_BAD_YEAR_LOSS_PCT,
    firstCropAfterYears: null,
    fullCropAfterYears: null,
  };
}

export interface Timeline {
  plantYear: number;
  /** Years after planting */
  firstAfter: number;
  fullAfter: number;
  /** Calendar years */
  firstCropYear: number;
  fullCropYear: number;
  /** Sourced ranges, for display */
  firstRange: [number, number] | null;
  fullRange: [number, number] | null;
  /** True when full-crop timing is the ramp assumption, not a sourced or grower figure */
  fullAssumed: boolean;
  /** True when the grower set the years themselves */
  edited: boolean;
}

const mid = (r: [number, number]) => Math.round((r[0] + r[1]) / 2);

/** When this crop starts and reaches full production, from the grower's figures or the crop data. */
export function timelineFor(crop: Pick<CropOption, 'bearing'>, plantYear: number, inputs?: Partial<FinanceInputs>): Timeline | null {
  const b = crop.bearing;
  const firstOverride = inputs?.firstCropAfterYears ?? null;
  const fullOverride = inputs?.fullCropAfterYears ?? null;
  if (!b && firstOverride == null) return null;

  const firstAfter = Math.max(1, firstOverride ?? mid(b!.firstCropYears));
  let fullAfter: number;
  let fullAssumed = false;
  if (fullOverride != null) fullAfter = fullOverride;
  else if (b?.fullCropYears) fullAfter = mid(b.fullCropYears);
  else {
    fullAfter = firstAfter + ASSUMED_RAMP_YEARS;
    fullAssumed = true;
  }
  fullAfter = Math.max(firstAfter, fullAfter);
  return {
    plantYear,
    firstAfter,
    fullAfter,
    firstCropYear: plantYear + firstAfter,
    fullCropYear: plantYear + fullAfter,
    firstRange: b?.firstCropYears ?? null,
    fullRange: b?.fullCropYears ?? null,
    fullAssumed,
    edited: firstOverride != null || fullOverride != null,
  };
}

/**
 * Chance a projected year is bad for this crop: winter chill falls short, or damaging frost at
 * flowering, treated as independent. Seasons that aren't scored don't count. null if none scored.
 */
export function badYearChance(e: Pick<CropEvaluation, 'seasons'>): number | null {
  const winter = e.seasons.find((s) => s.season === 'winter');
  const spring = e.seasons.find((s) => s.season === 'spring');
  const pWinter = winter && winter.verdict !== 'no-data' && winter.future != null ? 1 - winter.future / 100 : null;
  const pFrost = spring && spring.verdict !== 'no-data' && spring.future != null ? spring.future / 100 : null;
  if (pWinter == null && pFrost == null) return null;
  return 1 - (1 - (pWinter ?? 0)) * (1 - (pFrost ?? 0));
}

export interface CashYear {
  year: number;
  /** Share of full yield this year, 0-1 */
  yieldShare: number;
  cost: number;
  revenue: number;
  revenueRisk: number;
  cumulative: number;
  cumulativeRisk: number;
}

export interface CashFlow {
  years: CashYear[];
  /** First year the running total is back to zero or above; null if not by the end */
  breakEvenYear: number | null;
  breakEvenYearRisk: number | null;
  totalByEnd: number;
  totalByEndRisk: number;
  endYear: number;
  /** Chance of a bad year used for the risk line (0 when no season is scored) */
  badYearChance: number;
  /** Income lost to climate risk each full-crop year, as a share */
  riskHaircut: number;
}

export function inputsComplete(i: FinanceInputs): boolean {
  return [i.pricePerKg, i.fullYieldTPerHa, i.plantingCostPerHa, i.yearlyCostPerHa].every(
    (v) => v != null && Number.isFinite(v) && v >= 0,
  );
}

/** Yearly per-hectare cash from the planting year to `endYear`, with and without climate risk. */
export function cashflow(inputs: FinanceInputs, t: Timeline, endYear: number, pBad: number | null): CashFlow | null {
  if (!inputsComplete(inputs) || endYear < t.plantYear) return null;
  const fullRevenue = inputs.fullYieldTPerHa! * 1000 * inputs.pricePerKg!;
  const chance = Math.min(1, Math.max(0, pBad ?? 0));
  const loss = Math.min(100, Math.max(0, inputs.badYearLossPct)) / 100;
  const haircut = chance * loss;

  const years: CashYear[] = [];
  let cum = 0;
  let cumRisk = 0;
  let breakEven: number | null = null;
  let breakEvenRisk: number | null = null;
  for (let year = t.plantYear; year <= endYear; year++) {
    const k = year - t.plantYear;
    const share = k < t.firstAfter ? 0 : k >= t.fullAfter ? 1 : (k - t.firstAfter + 1) / (t.fullAfter - t.firstAfter + 1);
    const cost = inputs.yearlyCostPerHa! + (k === 0 ? inputs.plantingCostPerHa! : 0);
    const revenue = share * fullRevenue;
    const revenueRisk = revenue * (1 - haircut);
    const prev = cum;
    const prevRisk = cumRisk;
    cum += revenue - cost;
    cumRisk += revenueRisk - cost;
    // Break-even = the year the running total climbs back to zero after being below it.
    if (breakEven == null && k > 0 && prev < 0 && cum >= 0) breakEven = year;
    if (breakEvenRisk == null && k > 0 && prevRisk < 0 && cumRisk >= 0) breakEvenRisk = year;
    years.push({ year, yieldShare: share, cost, revenue, revenueRisk, cumulative: cum, cumulativeRisk: cumRisk });
  }
  return {
    years,
    breakEvenYear: breakEven,
    breakEvenYearRisk: breakEvenRisk,
    totalByEnd: cum,
    totalByEndRisk: cumRisk,
    endYear,
    badYearChance: chance,
    riskHaircut: haircut,
  };
}
