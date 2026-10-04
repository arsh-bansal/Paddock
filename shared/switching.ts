/**
 * "I currently grow X": how the grower's crop holds up, what holds up better, and how to switch.
 *
 * Switch routes, cheapest first:
 *  1. A different variety of the same crop (keeps the shed, equipment and buyers).
 *  2. Top-working: graft a new variety onto the existing trees. Only within the same kind of fruit
 *     (UNH Extension), comes back into production much sooner than replanting (University of
 *     Minnesota); apples and pears of almost any age, stone fruit over ~5 years usually not
 *     (Michigan State University Extension).
 *  3. Replant part of the block each year so income doesn't stop.
 *  4. A full switch to a different crop.
 */
import { cashflow, type CashFlow, type FinanceInputs, type Timeline } from './finance';
import type { CropOption } from './crops';
import type { CropEvaluation, SeasonVerdict } from './seasons';

const SEVERITY: Record<SeasonVerdict, number> = { viable: 0, 'at-risk': 1, 'not-viable': 2, 'no-data': 3 };

export interface SwitchAnalysis {
  current: CropEvaluation;
  /** Other varieties of the same crop that hold up at least as well, best first */
  sameCrop: CropEvaluation[];
  /** Other crops that hold up better on climate, best first */
  better: CropEvaluation[];
  /** True when nothing else in the database holds up better */
  alreadyBest: boolean;
  /** Whether grafting a new variety onto existing trees is an option for this crop */
  topWork: 'any-age' | 'young-trees-only' | 'no';
}

/** Kind of fruit for grafting compatibility (grafting only works within one kind). */
function topWorkFor(crop: CropOption | undefined): SwitchAnalysis['topWork'] {
  if (!crop) return 'no';
  if (crop.category === 'pome fruit') return 'any-age';
  if (crop.category === 'stone fruit' || crop.category === 'cherry') return 'young-trees-only';
  return 'no';
}

/**
 * `ranked` must be in rankCrops order. A crop "holds up better" when it ranks above the current
 * crop without a worse overall verdict; crops that can't be scored are left out.
 */
export function analyseSwitch(currentId: string, ranked: CropEvaluation[], crops: CropOption[], maxBetter = 5): SwitchAnalysis | null {
  const idx = ranked.findIndex((e) => e.id === currentId);
  if (idx === -1) return null;
  const current = ranked[idx];
  const currentCrop = crops.find((c) => c.id === currentId);
  const sameKind = (e: CropEvaluation) => {
    const c = crops.find((x) => x.id === e.id);
    return Boolean(c && currentCrop && c.crop === currentCrop.crop);
  };
  const scored = ranked.filter((e) => e.id !== currentId && e.overall !== 'no-data');
  const notWorse = (e: CropEvaluation) => SEVERITY[e.overall] <= SEVERITY[current.overall];
  const sameCrop = scored.filter((e) => sameKind(e) && notWorse(e));
  const better = ranked.slice(0, idx).filter((e) => e.overall !== 'no-data' && !sameKind(e) && notWorse(e));
  return {
    current,
    sameCrop,
    better: better.slice(0, maxBetter),
    alreadyBest: better.length === 0 && !sameCrop.some((e) => ranked.indexOf(e) < idx),
    topWork: topWorkFor(currentCrop),
  };
}

/** Keeping the current trees: already cropping, no planting cost. */
export function stayCashflow(inputs: FinanceInputs, plantYear: number, endYear: number, pBad: number | null): CashFlow | null {
  const mature: Timeline = {
    plantYear, firstAfter: 0, fullAfter: 0, firstCropYear: plantYear, fullCropYear: plantYear,
    firstRange: null, fullRange: null, fullAssumed: false, edited: true,
  };
  return cashflow({ ...inputs, plantingCostPerHa: 0 }, mature, endYear, pBad);
}

export interface StayVsSwitch {
  stay: CashFlow;
  switchTo: CashFlow;
  /** First year the switch's running total (with climate risk) catches up with staying; null if not by the end */
  catchUpYear: number | null;
  /** Switch minus stay by the end, with climate risk ($/ha) */
  differenceByEnd: number;
}

export function compareStaySwitch(stay: CashFlow, switchTo: CashFlow): StayVsSwitch {
  let catchUp: number | null = null;
  for (let i = 1; i < Math.min(stay.years.length, switchTo.years.length); i++) {
    if (switchTo.years[i].cumulativeRisk >= stay.years[i].cumulativeRisk && switchTo.years[i - 1].cumulativeRisk < stay.years[i - 1].cumulativeRisk) {
      catchUp = switchTo.years[i].year;
      break;
    }
  }
  return { stay, switchTo, catchUpYear: catchUp, differenceByEnd: switchTo.totalByEndRisk - stay.totalByEndRisk };
}

/* ---------- Something else: a current crop or enterprise that isn't in the database ---------- */

/** Value used in the "what do you grow now?" picker for anything not in the list. */
export const OTHER_CROP = '__other__';

export interface OtherCrop {
  /** What the grower typed, e.g. "olives" or "sheep grazing" */
  name: string;
  /** Their current income per hectare per year, $ */
  incomePerHa: number | null;
  /** Their current running cost per hectare per year, $ */
  costPerHa: number | null;
}

export function emptyOtherCrop(): OtherCrop {
  return { name: '', incomePerHa: null, costPerHa: null };
}

/** Crops that hold up well here, for a grower whose current enterprise we can't score. */
export function bestFitsForOther(ranked: CropEvaluation[], max = 5): CropEvaluation[] {
  return ranked.filter((e) => e.overall === 'viable' || e.overall === 'at-risk').slice(0, max);
}

/**
 * Keeping the current (unscored) enterprise: the grower's own yearly income and cost, no planting
 * cost and no climate-risk adjustment, since we can't rate its climate outlook.
 */
export function stayCashflowFromIncome(other: OtherCrop, plantYear: number, endYear: number): CashFlow | null {
  if (other.incomePerHa == null || other.costPerHa == null || endYear < plantYear) return null;
  const years: CashFlow['years'] = [];
  let cum = 0;
  for (let year = plantYear; year <= endYear; year++) {
    cum += other.incomePerHa - other.costPerHa;
    years.push({ year, yieldShare: 1, cost: other.costPerHa, revenue: other.incomePerHa, revenueRisk: other.incomePerHa, cumulative: cum, cumulativeRisk: cum });
  }
  return { years, breakEvenYear: null, breakEvenYearRisk: null, totalByEnd: cum, totalByEndRisk: cum, endYear, badYearChance: 0, riskHaircut: 0 };
}
