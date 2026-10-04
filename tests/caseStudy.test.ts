import { describe, expect, it } from 'vitest';
import { buildCaseStudy, illustrativeSequence, oneIn } from '../shared/caseStudy';
import type { YearStat } from '../shared/seasons';
import type { ClimateAnalysis } from '../shared/types';
import { summariseYears } from '../shared/seasons';

const year = (y: number, portions: number, hotDays = 5): YearStat => ({
  year: y,
  winter: { chillHours: portions * 9, chillPortions: portions },
  spring: { frostDays: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]] },
  summer: { hotDays, extremeDays: 0, longestHotSpell: 1 },
  autumn: null,
  annual: null,
});

function analysis(): ClimateAnalysis {
  // Real winters 1985–2025: 100 portions except a 90 in 2007. Projected: 60 years spread 80–99.
  const observed = Array.from({ length: 41 }, (_, i) => year(1985 + i, 1985 + i === 2007 ? 90 : 100));
  const baseline = observed.filter((y) => y.year >= 1995 && y.year <= 2014);
  const future = Array.from({ length: 60 }, (_, i) => year(1995 + (i % 20), 80 + (i % 20), 12));
  return {
    schemaVersion: 2,
    location: { lat: -36.4, lon: 145.4, elevation: 100, label: 'Test' },
    observed,
    baseline: { period: [1995, 2014], years: baseline, summary: summariseYears(baseline) },
    future: { period: [2026, 2045], years: future, summary: summariseYears(future), models: [] },
    generatedAt: '',
    servedFrom: 'cache',
  };
}

describe('buildCaseStudy', () => {
  it('ranks the latest winter against every real winter and the projection', () => {
    const cs = buildCaseStudy(analysis(), { year: 2026, chillHours: 700, chillPortions: 84 })!;
    expect(cs.winters).toHaveLength(42);
    expect(cs.rankFromLowest).toBe(1);
    expect(cs.previousLow).toEqual({ year: 2007, portions: 90 });
    expect(cs.pastSharePct).toBe(0);
    // future winters 80..99, five of twenty are <= 84
    expect(cs.futureSharePct).toBe(25);
    expect(cs.periods.map((p) => p.kind)).toEqual(['real', 'real', 'projected']);
    expect(cs.ranked.length).toBeGreaterThan(0);
  });

  it('does not double count a latest winter that is already in the record', () => {
    const cs = buildCaseStudy(analysis(), { year: 2025, chillHours: 700, chillPortions: 95 })!;
    expect(cs.winters).toHaveLength(41);
    expect(cs.rankFromLowest).toBe(2);
  });

  it('returns null without enough history', () => {
    const a = analysis();
    a.observed = a.observed.filter((y) => y.year >= 1995);
    expect(buildCaseStudy(a, { year: 2026, chillHours: 700, chillPortions: 84 })).toBeNull();
  });
});

describe('oneIn', () => {
  it('turns a percentage into plain odds', () => {
    expect(oneIn(20)).toBe('1 in 5');
    expect(oneIn(33.3)).toBe('1 in 3');
    expect(oneIn(0)).toBeNull();
  });
});

describe('illustrativeSequence', () => {
  it('keeps the projected share of low winters and is the same every time', () => {
    const values = Array.from({ length: 60 }, (_, i) => 80 + (i % 20)); // 80..99, 25% <= 84
    const seq = illustrativeSequence(values, 20);
    expect(seq).toHaveLength(20);
    expect(seq.filter((v) => v <= 84).length).toBe(5);
    expect(illustrativeSequence(values, 20)).toEqual(seq);
    expect([...seq].sort((a, b) => a - b)).not.toEqual(seq); // shuffled, not sorted
  });
});
