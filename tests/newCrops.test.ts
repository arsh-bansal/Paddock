import { describe, expect, it } from 'vitest';
import { partitionByChill } from '../shared/chillFilter';
import { CROP_OPTIONS, defaultPortions, defaultRequirement } from '../shared/crops';
import { evaluateCrop, type YearStat } from '../shared/seasons';

const crop = (id: string) => {
  const c = CROP_OPTIONS.find((x) => x.id === id);
  if (!c) throw new Error(`missing crop ${id}`);
  return c;
};

/** Years with a given chill and, optionally, frost on every September day at the given threshold index. */
function years(cp: number, septFrostAtIdx: number | null = null): YearStat[] {
  return Array.from({ length: 10 }, (_, i) => {
    const frost = [0, 0, 0, 0, 0].map(() => [0, 0, 0, 0, 0]);
    if (septFrostAtIdx != null) for (let t = 0; t <= septFrostAtIdx; t++) frost[2][t] = 1;
    return { year: 2000 + i, winter: { chillHours: cp * 15, chillPortions: cp }, spring: { frostDays: frost }, summer: null, autumn: null, annual: null };
  });
}

describe('new crops load with sourced figures', () => {
  it.each(['almond', 'pistachio', 'walnut', 'blueberry-southern', 'blueberry-northern', 'grape'])('%s is present and sourced', (id) => {
    const c = crop(id);
    if (c.winter) {
      expect(c.winter.portionsDerived ? c.winter.source : c.winter.portionsSource).not.toBe('');
    }
    if (c.spring) expect(c.spring.source).not.toBe('');
  });

  it('nut chill figures come directly in chill portions, with hours converted for display', () => {
    const almond = crop('almond').winter!;
    expect(almond.chillPortions).toEqual([22, 32]);
    expect(almond.portionsDerived).toBe(false);
    expect(almond.hoursDerived).toBe(true);
    // The conversion lands inside what nurseries publish for almonds (about 300-500 h).
    expect(almond.chillHours[0]).toBeGreaterThanOrEqual(300);
    expect(almond.chillHours[1]).toBeLessThanOrEqual(500);
  });

  it('European plum now uses the direct prune figure', () => {
    expect(crop('plum-european').winter!.chillPortions).toEqual([55, 60]);
    expect(crop('plum-european').winter!.portionsDerived).toBe(false);
  });
});

describe('a crop with no winter requirement (grapes)', () => {
  const grape = crop('grape');

  it('has no default chill figures', () => {
    expect(grape.winter).toBeNull();
    expect(defaultPortions(grape)).toBeNull();
    expect(defaultRequirement(grape)).toBe(0);
  });

  it('reports winter as not scored and is judged on spring frost', () => {
    const warmWinters = years(5); // far too little chill for any fruit tree
    const e = evaluateCrop(grape, 'Grapes', warmWinters, warmWinters);
    expect(e.seasons[0]).toMatchObject({ season: 'winter', verdict: 'no-data', threshold: null });
    expect(e.chillPortionsRequirement).toBeNull();
    expect(e.overall).toBe('viable'); // no frost in these years
  });

  it('frost at budburst still makes it a poor fit', () => {
    const frosty = years(80, 1); // a -1 C frost in September every year
    expect(evaluateCrop(grape, 'Grapes', frosty, frosty).overall).toBe('not-viable');
  });

  it('is never ruled out by the chill filter', () => {
    const { struggling } = partitionByChill([grape, crop('pistachio')], 10);
    expect(struggling.map((c) => c.id)).toEqual(['pistachio']);
  });
});
