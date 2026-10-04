import { describe, expect, it } from 'vitest';
import { changeWord, historyFor, pctChange } from '../shared/history';
import type { YearStat } from '../shared/seasons';

const year = (y: number, chillPortions: number | null, hotDays = 5): YearStat => ({
  year: y,
  winter: chillPortions == null ? null : { chillHours: chillPortions * 10, chillPortions },
  spring: null,
  summer: { hotDays, extremeDays: 0, longestHotSpell: 1 },
  autumn: null,
  annual: null,
});
const range = (a: number, b: number, f: (y: number) => YearStat) => Array.from({ length: b - a + 1 }, (_, i) => f(a + i));

describe('historyFor', () => {
  it('summarises each 20-year period separately', () => {
    const observed = range(1985, 2025, (y) => (y <= 2004 ? year(y, 80, 4) : year(y, 60, 10)));
    const h = historyFor(observed)!;
    expect(h.early.period).toEqual([1985, 2004]);
    expect(h.recent.period).toEqual([2005, 2024]);
    expect(h.early.summary.chillPortions.median).toBe(80);
    expect(h.recent.summary.chillPortions.median).toBe(60);
    expect(h.recent.summary.hotDays.mean).toBe(10);
    // 2025 belongs to neither period
    expect(h.recent.winters).toBe(20);
  });

  it('returns null when the record starts too late (e.g. reports saved from 1995 data)', () => {
    expect(historyFor(range(1995, 2025, (y) => year(y, 70)))).toBeNull();
  });

  it('returns null when too many winters are incomplete', () => {
    const observed = range(1985, 2024, (y) => year(y, y % 3 === 0 ? null : 70));
    expect(historyFor(observed)).toBeNull();
  });
});

describe('changeWord', () => {
  it('treats small changes as the same, and guards against dividing by zero', () => {
    expect(changeWord(pctChange(100, 97))).toBe('same');
    expect(changeWord(pctChange(100, 70))).toBe('less');
    expect(changeWord(pctChange(4, 8))).toBe('more');
    expect(changeWord(pctChange(0, 3))).toBe('unknown');
  });
});
