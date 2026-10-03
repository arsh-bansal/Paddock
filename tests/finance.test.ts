import { describe, expect, it } from 'vitest';
import { CROP_OPTIONS } from '../shared/crops';
import {
  ASSUMED_RAMP_YEARS, badYearChance, cashflow, emptyFinanceInputs, inputsComplete, timelineFor, type FinanceInputs,
} from '../shared/finance';
import type { SeasonResult } from '../shared/seasons';

const crop = (id: string) => CROP_OPTIONS.find((c) => c.id === id)!;
const season = (s: Partial<SeasonResult> & Pick<SeasonResult, 'season'>): SeasonResult => ({
  verdict: 'viable', baseline: null, future: null, threshold: null, indicative: false, ...s,
});
const inputs = (over: Partial<FinanceInputs> = {}): FinanceInputs => ({
  ...emptyFinanceInputs(), pricePerKg: 2, fullYieldTPerHa: 10, plantingCostPerHa: 50_000, yearlyCostPerHa: 10_000, ...over,
});

describe('crop timeline', () => {
  it('uses the sourced years (middle of the range)', () => {
    const t = timelineFor(crop('almond'), 2026)!; // first 3-4, full 7-8
    expect([t.firstCropYear, t.fullCropYear]).toEqual([2030, 2034]);
    expect(t.fullAssumed).toBe(false);
  });
  it('assumes a short ramp when no source gives full production, and says so', () => {
    const t = timelineFor(crop('pear'), 2026)!; // first 4-6, full not sourced
    expect(t.firstAfter).toBe(5);
    expect(t.fullAfter).toBe(5 + ASSUMED_RAMP_YEARS);
    expect(t.fullAssumed).toBe(true);
  });
  it('lets the grower override the years', () => {
    const t = timelineFor(crop('pear'), 2026, { firstCropAfterYears: 3, fullCropAfterYears: 6 })!;
    expect([t.firstCropYear, t.fullCropYear, t.edited, t.fullAssumed]).toEqual([2029, 2032, true, false]);
  });
  it('never puts full crop before first crop', () => {
    const t = timelineFor(crop('pear'), 2026, { firstCropAfterYears: 6, fullCropAfterYears: 2 })!;
    expect(t.fullAfter).toBe(6);
  });
  it('returns nothing for a crop with no timing data unless the grower gives it', () => {
    expect(timelineFor({ bearing: null }, 2026)).toBeNull();
    expect(timelineFor({ bearing: null }, 2026, { firstCropAfterYears: 2 })?.firstCropYear).toBe(2028);
  });
});

describe('bad-year chance', () => {
  it('combines winter chill shortfall and spring frost as independent risks', () => {
    const p = badYearChance({ seasons: [season({ season: 'winter', future: 80 }), season({ season: 'spring', future: 10 })] });
    expect(p).toBeCloseTo(1 - 0.8 * 0.9); // 0.28
  });
  it('ignores seasons that are not scored', () => {
    expect(badYearChance({ seasons: [season({ season: 'winter', verdict: 'no-data' }), season({ season: 'spring', future: 20 })] })).toBeCloseTo(0.2);
    expect(badYearChance({ seasons: [season({ season: 'winter', verdict: 'no-data' })] })).toBeNull();
  });
});

describe('cash flow', () => {
  const t = timelineFor({ bearing: { firstCropYears: [3, 3], fullCropYears: [5, 5], indicative: false, source: 'x' } }, 2026)!;

  it('needs all four grower numbers', () => {
    expect(inputsComplete(emptyFinanceInputs())).toBe(false);
    expect(cashflow(emptyFinanceInputs(), t, 2045, 0)).toBeNull();
  });

  it('has no income before the first crop, ramps up, then runs at full yield', () => {
    const cf = cashflow(inputs(), t, 2045, 0)!;
    expect(cf.years.map((y) => y.yieldShare).slice(0, 7)).toEqual([0, 0, 0, 1 / 3, 2 / 3, 1, 1]);
    expect(cf.years[0].cost).toBe(60_000); // planting + first year's running cost
    expect(cf.years[6].revenue).toBe(20_000); // 10 t/ha x 1000 kg x $2
  });

  it('finds the break-even year', () => {
    // Running totals: 2026 -60k, -70k, -80k, 2029 -83.3k, 2030 -80k, then +10k a year: 0 in 2038.
    const cf = cashflow(inputs(), t, 2045, 0)!;
    expect(cf.breakEvenYear).toBe(2038);
    expect(cf.totalByEnd).toBeCloseTo(70_000); // +10k a year for 2039-2045
  });

  it('climate risk lowers income and delays break-even', () => {
    const cf = cashflow(inputs({ badYearLossPct: 50 }), t, 2045, 0.4)!; // 20% less income
    expect(cf.riskHaircut).toBeCloseTo(0.2);
    expect(cf.years[6].revenueRisk).toBeCloseTo(16_000);
    expect(cf.breakEvenYearRisk!).toBeGreaterThan(cf.breakEvenYear!);
    expect(cf.totalByEndRisk).toBeLessThan(cf.totalByEnd);
  });

  it('reports no break-even when it never pays back in the period', () => {
    const cf = cashflow(inputs({ pricePerKg: 0.5 }), t, 2045, 0)!;
    expect(cf.breakEvenYear).toBeNull();
  });
});

describe('crop data', () => {
  it('every built-in crop has sourced bearing years', () => {
    for (const c of CROP_OPTIONS) {
      expect(c.bearing, c.id).toBeTruthy();
      expect(c.bearing!.source.length).toBeGreaterThan(20);
    }
  });
});
