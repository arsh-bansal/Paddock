import { describe, expect, it } from 'vitest';
import { CONVERSION_ANCHORS, hoursToPortions, portionsToHours } from '../shared/chillConversion';
import { CROP_OPTIONS, defaultPortions, type CropOption } from '../shared/crops';
import { rankCrops } from '../shared/ranking';
import { evaluateCrop, evaluateSummer, type YearStat } from '../shared/seasons';

/** Years with given chill portions and hot days; no frost. */
function years(portions: number[], hot = 10): YearStat[] {
  return portions.map((cp, i) => ({
    year: 2000 + i,
    winter: { chillHours: cp * 15, chillPortions: cp },
    spring: { frostDays: [0, 0, 0, 0, 0].map(() => [0, 0, 0, 0, 0]) },
    summer: { hotDays: hot, extremeDays: 0, longestHotSpell: 2 },
    autumn: null,
    annual: null,
  }));
}
const crop = (id: string) => CROP_OPTIONS.find((c) => c.id === id)!;

describe('chill hours <-> portions conversion (Brunt et al. 2017, Table 1)', () => {
  it('hits every anchor exactly', () => {
    for (const [h, cp] of CONVERSION_ANCHORS) {
      expect(hoursToPortions(h)).toBeCloseTo(cp);
      expect(portionsToHours(cp)).toBeCloseTo(h);
    }
  });
  it('interpolates between anchors and round-trips', () => {
    expect(hoursToPortions(625)).toBeCloseTo(45); // halfway 500->750 = 40->50
    for (const h of [0, 120, 400, 875, 1250, 1800]) expect(portionsToHours(hoursToPortions(h))).toBeCloseTo(h);
  });
  it('is monotonic and never negative', () => {
    let prev = -1;
    for (let h = 0; h <= 2000; h += 25) {
      const cp = hoursToPortions(h);
      expect(cp).toBeGreaterThanOrEqual(prev);
      prev = cp;
    }
    expect(hoursToPortions(-50)).toBe(0);
  });
});

describe('winter is scored in chill portions', () => {
  const winters = years([50, 55, 60, 65, 70, 75, 80, 85, 90, 95]); // p10 = 54.5, median 72.5

  it('uses the crop’s own portions requirement by default', () => {
    const e = evaluateCrop(crop('cherry-standard'), 'Cherry', winters, winters);
    expect(e.chillPortionsRequirement).toBe(70);
    expect(e.portionsConverted).toBe(false);
    expect(e.seasons[0].verdict).toBe('at-risk'); // median 72.5 >= 70 > p10 54.5
  });

  it('converts the grower’s chill-hours figure and flags it', () => {
    const e = evaluateCrop(crop('cherry-standard'), 'Cherry', winters, winters, { chillHoursOverride: 500 });
    expect(e.chillPortionsRequirement).toBe(40);
    expect(e.chillRequirement).toBe(500);
    expect(e.portionsConverted).toBe(true);
    expect(e.seasons[0].verdict).toBe('viable');
  });

  it('reports the poor-winter margin', () => {
    const e = evaluateCrop(crop('cherry-standard'), 'Cherry', winters, winters, { chillHoursOverride: 500 });
    expect(e.seasons[0].margin).toBeCloseTo((54.5 - 40) / 40);
  });
});

describe('summer heat without a sourced limit', () => {
  it('is reported but not scored, so it never drags the overall verdict down', () => {
    const hot = years([90, 90, 90, 90, 90], 30); // 30 hot days every summer
    const s = evaluateSummer(hot, hot, crop('apple-mainstream'));
    expect(s.verdict).toBe('no-data');
    expect(s.future).toBe(30);
    expect(s.baseline).toBe(30);
    expect(evaluateCrop(crop('apple-mainstream'), 'Apple', hot, hot).overall).toBe('viable');
  });

  it('is scored when a crop does have a limit', () => {
    const withLimit: CropOption = { ...crop('apple-mainstream'), summer: { hotDaysTolerated: 10, indicative: false, source: 'test' } };
    const hot = years([90, 90, 90, 90, 90], 30);
    expect(evaluateSummer(hot, hot, withLimit).verdict).toBe('not-viable');
  });
});

describe('ranking uses the poor-winter margin', () => {
  it('puts the crop with more spare chill first among good fits', () => {
    const winters = years([80, 82, 84, 86, 88, 90, 92, 94, 96, 98]);
    const ranked = rankCrops([
      evaluateCrop(crop('cherry-standard'), 'Cherry', winters, winters), // needs 70, margin ~0.16
      evaluateCrop(crop('pear'), 'Pear', winters, winters), // needs 52, margin ~0.56
    ]);
    expect(ranked.map((e) => e.id)).toEqual(['pear', 'cherry-standard']);
    expect(defaultPortions(crop('pear'))).toBe(52);
  });
});
