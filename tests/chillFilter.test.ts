import { describe, expect, it } from 'vitest';
import { filterAppropriateByChill, isAppropriateByChill } from '../shared/chillFilter';
import type { CropOption } from '../shared/crops';

/*
 * Unit tests for the Step-2 chill-only pre-filter. The filter only reads `id` and
 * `winter.chillHours` (it keeps a crop iff the block's future median chill reaches the UN-ROUNDED
 * MIDPOINT of the crop's [min, max] range), so fixtures are minimal valid `CropOption` literals with
 * trivial values for the fields the filter ignores. These are plain literals (no climate run) and run
 * identically under vitest / tsx / Vite / esbuild.
 */

/** Build a minimal valid CropOption with a given id and chill range. */
function crop(id: string, chill: [number, number]): CropOption {
  return {
    id,
    crop: id,
    type: 'Standard varieties',
    category: 'stone fruit',
    winter: { indicative: false, source: '', chillHours: chill },
    spring: null,
    summer: null,
    heatNote: 'n/a',
  };
}

describe('isAppropriateByChill (per-crop predicate, midpoint rule)', () => {
  const c = crop('c', [400, 800]); // midpoint 600

  it('includes when median === crop midpoint (boundary, >=)', () => {
    expect(isAppropriateByChill(c, 600)).toBe(true);
  });

  it('excludes when median just below the midpoint (even though >= min)', () => {
    // 599 >= min(400) under the OLD rule, but 599 < midpoint(600) under the NEW rule → excluded.
    expect(isAppropriateByChill(c, 599)).toBe(false);
  });

  it('includes when median above the midpoint', () => {
    expect(isAppropriateByChill(c, 601)).toBe(true);
  });

  it('keeps all when median is NaN', () => {
    expect(isAppropriateByChill(c, NaN)).toBe(true);
  });

  it('matches the array filter per crop (predicate ⇔ filter)', () => {
    const crops = [crop('a', [400, 800]), crop('b', [600, 800])]; // midpoints 600, 700
    for (const median of [500, 600, 650, 700, 800, NaN]) {
      const viaFilter = new Set(filterAppropriateByChill(crops, median).map((x) => x.id));
      for (const x of crops) {
        expect(isAppropriateByChill(x, median)).toBe(viaFilter.has(x.id));
      }
    }
  });
});

describe('filterAppropriateByChill (midpoint rule)', () => {
  it('boundary: median === crop midpoint → included', () => {
    const crops = [crop('a', [400, 800])]; // midpoint 600
    expect(filterAppropriateByChill(crops, 600).map((c) => c.id)).toEqual(['a']);
  });

  it('median just below midpoint → excluded (the case that CHANGES vs the old min rule)', () => {
    // Cherry-standard-like [600, 800], midpoint 700. A median of 599 was INCLUDED by the old min
    // rule (599 >= 600 is false actually for min 600 — use the documented 599-vs-[600,800] case):
    const cherryStandard = crop('cherry-standard', [600, 800]); // midpoint 700
    expect(filterAppropriateByChill([cherryStandard], 599)).toEqual([]); // 599 < 700 → excluded
    // And a crop whose MIN is met but MIDPOINT is not: [400, 800] midpoint 600, median 599.
    const peachStandard = crop('peach-standard', [400, 800]);
    expect(filterAppropriateByChill([peachStandard], 599)).toEqual([]); // old rule kept it, new drops it
  });

  it('median above midpoint → included', () => {
    const crops = [crop('a', [400, 800])]; // midpoint 600
    expect(filterAppropriateByChill(crops, 601).map((c) => c.id)).toEqual(['a']);
  });

  it('non-integer midpoint boundary: plum-japanese [118, 685] midpoint 401.5', () => {
    const plumJ = crop('plum-japanese', [118, 685]); // midpoint 401.5
    expect(filterAppropriateByChill([plumJ], 401)).toEqual([]); // 401 < 401.5 → excluded
    expect(filterAppropriateByChill([plumJ], 402).map((c) => c.id)).toEqual(['plum-japanese']); // 402 >= 401.5
    expect(filterAppropriateByChill([plumJ], 401.5).map((c) => c.id)).toEqual(['plum-japanese']); // exact
  });

  it('non-integer midpoint: plum-european [579, 1323] midpoint 951', () => {
    const plumE = crop('plum-european', [579, 1323]); // midpoint 951
    expect(filterAppropriateByChill([plumE], 950)).toEqual([]); // just below
    expect(filterAppropriateByChill([plumE], 951).map((c) => c.id)).toEqual(['plum-european']); // exact
  });

  it('degenerate user crop [500, 500]: midpoint === 500 (same as old min rule)', () => {
    const user = crop('user-myplum', [500, 500]); // midpoint 500 === v
    expect(filterAppropriateByChill([user], 500).map((c) => c.id)).toEqual(['user-myplum']); // median === v → kept
    expect(filterAppropriateByChill([user], 499)).toEqual([]); // just below → dropped
    expect(filterAppropriateByChill([user], 600).map((c) => c.id)).toEqual(['user-myplum']); // above → kept
  });

  it('mixed list: filters by midpoint and preserves input order', () => {
    const crops = [
      crop('a', [200, 400]), // midpoint 300
      crop('b', [600, 800]), // midpoint 700
      crop('c', [300, 600]), // midpoint 450
      crop('d', [800, 1000]), // midpoint 900
    ];
    // median 500 → keep midpoints 300 and 450, drop 700 and 900, order preserved.
    expect(filterAppropriateByChill(crops, 500).map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('NaN median → returns ALL crops in original order', () => {
    const crops = [crop('a', [300, 600]), crop('b', [900, 1200])];
    expect(filterAppropriateByChill(crops, NaN).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('non-finite +Infinity → returns ALL crops (show-all fallback)', () => {
    const crops = [crop('a', [300, 600]), crop('b', [900, 1200])];
    expect(filterAppropriateByChill(crops, Infinity).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('is pure: does not mutate the input array or its elements', () => {
    const a = crop('a', [300, 600]);
    const b = crop('b', [900, 1200]);
    const crops = [a, b];
    const snapshot = JSON.stringify(crops);
    const result = filterAppropriateByChill(crops, 500);
    // input array untouched
    expect(crops).toHaveLength(2);
    expect(crops[0]).toBe(a);
    expect(crops[1]).toBe(b);
    expect(JSON.stringify(crops)).toBe(snapshot);
    // result is a new array reference, not the input
    expect(result).not.toBe(crops);
  });

  it('returns a NEW array reference even on the show-all (NaN) path', () => {
    const crops = [crop('a', [300, 600])];
    const result = filterAppropriateByChill(crops, NaN);
    expect(result).not.toBe(crops);
    expect(result.map((c) => c.id)).toEqual(['a']);
  });
});

/*
 * Integration-style test over the 10 REAL crops' [min, max] pairs (from shared/crops.data.json),
 * pinning the headline warm-vs-cold behaviour the midpoint rule exists to produce.
 */
describe('filterAppropriateByChill over the real 10-crop catalogue', () => {
  // [id, [min, max]] — midpoints noted in comments (addendum A2.4).
  const realCrops: CropOption[] = [
    crop('peach-standard', [400, 800]), // 600
    crop('peach-low', [200, 400]), // 300
    crop('apricot', [300, 600]), // 450
    crop('plum-japanese', [118, 685]), // 401.5
    crop('plum-european', [579, 1323]), // 951
    crop('cherry-standard', [600, 800]), // 700
    crop('cherry-low', [300, 500]), // 400
    crop('apple-mainstream', [550, 1000]), // 775
    crop('apple-low', [200, 400]), // 300
    crop('pear', [700, 900]), // 800
  ];

  it('COLD block (future median 1000) keeps all 10 crops, order preserved', () => {
    const kept = filterAppropriateByChill(realCrops, 1000).map((c) => c.id);
    expect(kept).toEqual(realCrops.map((c) => c.id));
    expect(kept).toHaveLength(10);
  });

  it('WARM block (future median 500) keeps exactly the 5 crops whose midpoint <= 500', () => {
    const kept = filterAppropriateByChill(realCrops, 500).map((c) => c.id);
    // midpoints <= 500: peach-low(300), apricot(450), plum-japanese(401.5), cherry-low(400),
    // apple-low(300). In INPUT order:
    expect(kept).toEqual([
      'peach-low',
      'apricot',
      'plum-japanese',
      'cherry-low',
      'apple-low',
    ]);
    // and it drops the other 5 (midpoints 600, 951, 700, 775, 800):
    expect(kept).not.toContain('peach-standard'); // 600
    expect(kept).not.toContain('plum-european'); // 951
    expect(kept).not.toContain('cherry-standard'); // 700
    expect(kept).not.toContain('apple-mainstream'); // 775
    expect(kept).not.toContain('pear'); // 800
  });
});
