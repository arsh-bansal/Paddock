import { describe, expect, it } from 'vitest';
import { districtCrops, MIN_HECTARES, MIN_TREES, reliabilityOf, type AbsRow, type District } from '../shared/absRegionImport';
import { describeGrown, formatAmount } from '../shared/regionCrops';

const d: District = { presetId: 'test', name: 'the test district', sa2: { '1': 'Area One', '2': 'Area Two' } };
const row = (regionCode: string, description: string, estimate: number | null, rse = ''): AbsRow => ({
  regionCode, regionLabel: `Area ${regionCode}`, description: `Fruit and nuts - ${description}`, estimate, rse,
});

describe('ABS reliability markers', () => {
  it('reads the table footnote symbols', () => {
    expect(reliabilityOf('')).toBe('good');
    expect(reliabilityOf('4.2')).toBe('good');
    expect(reliabilityOf('^')).toBe('caution');
    expect(reliabilityOf(' * ')).toBe('caution');
    expect(reliabilityOf('**')).toBe('unreliable');
  });
});

describe('districtCrops', () => {
  it('sums a crop across the district’s SA2 areas and ignores other areas', () => {
    const r = districtCrops([
      row('1', 'Other orchard fruit - Apples - Total trees', 30_000),
      row('2', 'Other orchard fruit - Apples - Total trees', 20_000),
      row('9', 'Other orchard fruit - Apples - Total trees', 999_999),
    ], d);
    expect(r.grownToday).toEqual([expect.objectContaining({ cropId: 'apple-mainstream', amount: 50_000, unit: 'trees' })]);
  });

  it('combines peaches and nectarines into one crop', () => {
    const r = districtCrops([
      row('1', 'Stone fruit - Peaches - Total trees', 8_000),
      row('1', 'Stone fruit - Nectarines - Total trees', 7_000),
    ], d);
    expect(r.grownToday[0]).toMatchObject({ name: 'Peaches and nectarines', amount: 15_000 });
  });

  it('drops figures the ABS marks too unreliable (**) and flags caution ones', () => {
    const r = districtCrops([
      row('1', 'Stone fruit - Cherries - Total trees', 500_000, '**'),
      row('2', 'Stone fruit - Cherries - Total trees', 12_000, '*'),
    ], d);
    expect(r.grownToday[0]).toMatchObject({ amount: 12_000, caution: true });
  });

  it('leaves out small plantings below the thresholds', () => {
    const r = districtCrops([
      row('1', 'Other orchard fruit - Apples - Total trees', MIN_TREES - 1),
      row('1', 'Grapes for wine production - Total area', MIN_HECTARES - 1),
    ], d);
    expect(r.grownToday).toEqual([]);
    expect(r.note).toMatch(/little commercial fruit/);
  });

  it('computes the share of new plantings', () => {
    const r = districtCrops([
      row('1', 'Nuts - Almonds - Total trees', 100_000),
      row('1', 'Nuts - Almonds - Trees not yet of bearing age', 25_000),
    ], d);
    expect(r.grownToday[0]).toMatchObject({ cropId: 'almond', newShare: 0.25 });
  });

  it('lists tree crops largest first, then area crops, and keeps unscored crops by name', () => {
    const r = districtCrops([
      row('1', 'Other orchard fruit - Olives - Total trees', 40_000),
      row('1', 'Other orchard fruit - Apples - Total trees', 90_000),
      row('1', 'Grapes for wine production - Total area', 300),
    ], d);
    expect(r.grownToday.map((g) => [g.name, g.cropId])).toEqual([
      ['Apples', 'apple-mainstream'], ['Olives', null], ['Wine grapes', 'grape'],
    ]);
    expect(r.source).toContain('Area One, Area Two');
  });
});

describe('display', () => {
  it('rounds to two significant figures', () => {
    expect(formatAmount(2_084_796, 'trees')).toBe('about 2.1 million trees');
    expect(formatAmount(383_022, 'trees')).toBe('about 380,000 trees');
    expect(formatAmount(1_690, 'ha')).toBe('about 1,700 ha');
    expect(formatAmount(71, 'ha')).toBe('about 71 ha');
  });
  it('mentions new plantings only when they are a meaningful share', () => {
    expect(describeGrown({ cropId: null, name: 'x', amount: 26_594, unit: 'trees', newShare: 0.2 })).toBe('about 27,000 trees, 20% newly planted');
    expect(describeGrown({ cropId: null, name: 'x', amount: 26_594, unit: 'trees', newShare: 0.02 })).toBe('about 27,000 trees');
  });
});
