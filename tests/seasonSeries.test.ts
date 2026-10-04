import { describe, expect, it } from 'vitest';
import type { YearStat } from '../shared/seasons';
import type { ClimateAnalysis } from '../shared/types';
import { axisFor, fmtValue, SEASON_METRICS, seriesFor, seriesLine, seriesSummary } from '../src/lib/seasonSeries';

const year = (yr: number): YearStat => ({
  year: yr,
  winter: { chillHours: 900, chillPortions: 90 },
  // frostDays[month][threshold]: Jul..Nov x 0,-1,-2,-3,-4
  spring: { frostDays: [[9, 0, 0, 0, 0], [2, 1, 0, 0, 0], [3, 0, 0, 0, 0], [1, 0, 0, 0, 0], [7, 0, 0, 0, 0]] },
  summer: { hotDays: 12, extremeDays: 1, longestHotSpell: 3 },
  autumn: { rainMm: 140, warmDays: 4 },
  annual: { rainMm: 600, et0Mm: 550, deficitMm: -50 },
});

const metric = (k: string) => SEASON_METRICS.find((m) => m.key === k)!;

describe('season chart definitions', () => {
  it('covers all five seasons, winter first with crop lines only on winter', () => {
    expect(SEASON_METRICS.map((m) => m.key)).toEqual(['winter', 'spring', 'summer', 'autumn', 'water']);
    expect(SEASON_METRICS.filter((m) => m.cropLines).map((m) => m.key)).toEqual(['winter']);
  });
  it('picks the right value for each season', () => {
    const y = year(2001);
    expect(metric('winter').pick(y)).toBe(90);
    expect(metric('spring').pick(y)).toBe(6); // Aug-Oct at 0 °C: 2 + 3 + 1 (July and November excluded)
    expect(metric('summer').pick(y)).toBe(12);
    expect(metric('autumn').pick(y)).toBe(140);
    expect(metric('water').pick(y)).toBe(-50);
  });
  it('treats an incomplete season as missing, not zero', () => {
    const y = { ...year(2001), spring: null, autumn: { rainMm: null, warmDays: 3 } };
    expect(metric('spring').pick(y)).toBeNull();
    expect(metric('autumn').pick(y)).toBeNull();
  });
  it('keeps chart text drawable by the PDF fonts', () => {
    for (const m of SEASON_METRICS) for (const t of [m.title, m.subtitle, m.note ?? '']) expect(t).not.toMatch(/[≥≤−]/);
  });
});

describe('axis', () => {
  it('starts at zero for positive data', () => {
    const a = axisFor([12, 30, 41]);
    expect(a.min).toBe(0);
    expect(a.max).toBeGreaterThanOrEqual(41);
    expect(a.ticks[0]).toBe(0);
  });
  it('extends below zero for a wet year’s negative water shortfall', () => {
    const a = axisFor([-120, 40, 230]);
    expect(a.min).toBeLessThanOrEqual(-120);
    expect(a.ticks).toContain(0);
  });
});

describe('series', () => {
  const summary = { p10: 1, median: 2, p90: 3, mean: 2 };
  const all = { chillHours: summary, chillPortions: summary, springFrostDays: summary, hotDays: summary, extremeDays: summary,
    longestHotSpell: summary, autumnRainMm: summary, autumnWarmDays: summary, annualRainMm: summary, annualEt0Mm: summary, waterDeficitMm: summary };
  const analysis = {
    observed: [year(1995), { ...year(1996), summer: null }, year(1997)],
    baseline: { period: [1995, 2014], summary: all },
    future: { period: [2026, 2045], summary: all, models: [{}, {}, {}] },
  } as unknown as ClimateAnalysis;

  it('skips years where the season is incomplete', () => {
    expect(seriesFor(analysis, metric('summer')).observed.map(([y]) => y)).toEqual([1995, 1997]);
  });
  it('describes the real baseline period', () => {
    expect(seriesSummary(seriesFor(analysis, metric('winter')), 'Shepparton')).toMatch(/in 1995-2014; projected 2026-2045/);
  });
});

describe('number formatting', () => {
  it('keeps a decimal for small values and uses words for ranges', () => {
    expect(fmtValue(0.3)).toBe('0.3');
    expect(fmtValue(123.4)).toBe('123');
    expect(fmtValue(-170.2)).toBe('-170');
    expect(fmtValue(-0.01)).toBe('0.0');
    const line = seriesLine({
      metric: SEASON_METRICS[4], observed: [], baseline: { p10: 0, median: 0, p90: 0, mean: 32 },
      future: { p10: -170, median: 123, p90: 384, mean: 120 }, baselinePeriod: [1995, 2014], period: [2026, 2045], modelCount: 3,
    });
    expect(line).toBe('Average 32 mm in 1995-2014; projected typical 123 mm in 2026-2045 (likely range -170 to 384).');
  });
});
