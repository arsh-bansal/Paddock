import { describe, expect, it } from 'vitest';
import { CROP_OPTIONS } from '../shared/crops';
import { emptyFinanceInputs, timelineFor, cashflow } from '../shared/finance';
import type { CropEvaluation, SeasonVerdict } from '../shared/seasons';
import { analyseSwitch, compareStaySwitch, stayCashflow } from '../shared/switching';

const ev = (id: string, overall: SeasonVerdict): CropEvaluation => ({
  id, label: id, overall, seasons: [], heatNote: '', chillRequirement: 500, chillPortionsRequirement: 40, portionsConverted: false,
});

describe('analyseSwitch', () => {
  // rankCrops order: best first
  const ranked = [ev('almond', 'viable'), ev('peach-low', 'viable'), ev('pear', 'viable'), ev('peach-standard', 'at-risk'),
    ev('cherry-standard', 'at-risk'), ev('grape', 'no-data'), ev('walnut', 'not-viable')];

  it('finds crops that hold up better and other varieties of the same crop', () => {
    const a = analyseSwitch('peach-standard', ranked, CROP_OPTIONS)!;
    expect(a.better.map((e) => e.id)).toEqual(['almond', 'pear']);
    expect(a.sameCrop.map((e) => e.id)).toEqual(['peach-low']);
    expect(a.alreadyBest).toBe(false);
  });
  it('says when the current crop is already the best fit', () => {
    expect(analyseSwitch('almond', ranked, CROP_OPTIONS)!.alreadyBest).toBe(true);
  });
  it('never suggests a crop with a worse verdict or one that can’t be scored', () => {
    const a = analyseSwitch('cherry-standard', ranked, CROP_OPTIONS)!;
    expect(a.better.some((e) => e.id === 'grape' || e.id === 'walnut')).toBe(false);
  });
  it('knows where grafting a new variety works', () => {
    expect(analyseSwitch('pear', ranked, CROP_OPTIONS)!.topWork).toBe('any-age');
    expect(analyseSwitch('peach-standard', ranked, CROP_OPTIONS)!.topWork).toBe('young-trees-only');
    expect(analyseSwitch('walnut', ranked, CROP_OPTIONS)!.topWork).toBe('no');
  });
  it('returns nothing for a crop that isn’t in the results', () => {
    expect(analyseSwitch('nope', ranked, CROP_OPTIONS)).toBeNull();
  });
});

describe('stay vs switch', () => {
  const inputs = { ...emptyFinanceInputs(), pricePerKg: 2, fullYieldTPerHa: 10, plantingCostPerHa: 50_000, yearlyCostPerHa: 10_000 };

  it('staying earns full income from year one with no planting cost', () => {
    const stay = stayCashflow(inputs, 2026, 2045, 0)!;
    expect(stay.years[0].revenue).toBe(20_000);
    expect(stay.years[0].cost).toBe(10_000);
    expect(stay.totalByEnd).toBe(20 * 10_000);
  });

  it('a better-paying switch catches up after its establishment years', () => {
    const stay = stayCashflow({ ...inputs, pricePerKg: 1.5 }, 2026, 2045, 0.3)!; // weaker, riskier crop
    const t = timelineFor(CROP_OPTIONS.find((c) => c.id === 'almond')!, 2026)!;
    const sw = cashflow({ ...inputs, pricePerKg: 4 }, t, 2045, 0)!;
    const cmp = compareStaySwitch(stay, sw);
    expect(cmp.catchUpYear).toBeGreaterThan(2030);
    expect(cmp.differenceByEnd).toBeGreaterThan(0);
  });

  it('reports no catch-up when switching never pays more by the end', () => {
    const stay = stayCashflow(inputs, 2026, 2045, 0)!;
    const t = timelineFor(CROP_OPTIONS.find((c) => c.id === 'walnut')!, 2026)!;
    const sw = cashflow(inputs, t, 2045, 0)!;
    expect(compareStaySwitch(stay, sw).catchUpYear).toBeNull();
  });
});

import { bestFitsForOther, stayCashflowFromIncome } from '../shared/switching';

describe('something else (not in the list)', () => {
  const ranked = [ev('almond', 'viable'), ev('pear', 'at-risk'), ev('grape', 'no-data'), ev('walnut', 'not-viable')];

  it('suggests only crops that hold up, best first', () => {
    expect(bestFitsForOther(ranked).map((e) => e.id)).toEqual(['almond', 'pear']);
  });

  it('stays on the grower’s own income and costs, with no climate adjustment', () => {
    const stay = stayCashflowFromIncome({ name: 'sheep grazing', incomePerHa: 900, costPerHa: 400 }, 2026, 2045)!;
    expect(stay.years).toHaveLength(20);
    expect(stay.totalByEnd).toBe(20 * 500);
    expect(stay.totalByEndRisk).toBe(stay.totalByEnd);
  });

  it('needs both income and cost', () => {
    expect(stayCashflowFromIncome({ name: 'x', incomePerHa: 900, costPerHa: null }, 2026, 2045)).toBeNull();
  });
});
