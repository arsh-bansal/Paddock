import { describe, expect, it } from 'vitest';
import type { CropOption } from '../shared/crops';
import { appropriateCrops } from '../shared/appropriateCrops';
import { rankCrops } from '../shared/ranking';
import { evaluateCrop, type YearStat } from '../shared/seasons';

/**
 * Flow test (design §4.12): a user crop is a plain `CropOption` with spring/summer null and a tight
 * winter chill range. We confirm it flows through evaluateCrop -> appropriateCrops -> rankCrops
 * IDENTICALLY to a built-in — no special-casing anywhere — using plain-literal YearStat fixtures.
 */

/** A YearStat carrying only the winter chill figure (other seasons null -> engine 'no-data'). */
function winterYear(year: number, chillHours: number): YearStat {
  return {
    year,
    winter: { chillHours, chillPortions: 0 },
    spring: null,
    summer: null,
    autumn: null,
    annual: null,
  };
}

/** Build a user-style CropOption (what the store's toCropOption produces). */
function userCrop(id: string, name: string, chill: number): CropOption {
  return {
    id,
    crop: name,
    type: 'Your figures',
    category: 'stone fruit',
    heatNote: '',
    winter: { chillHours: [chill, chill], indicative: true, source: 'Your own figure' },
    spring: null,
    summer: null,
  };
}

/** Years all comfortably above requirement -> winter 'viable'. */
const richWinters: YearStat[] = [500, 520, 540, 560, 580, 600].map((h, i) => winterYear(2000 + i, h));
/** Years all well below requirement -> winter 'not-viable'. */
const poorWinters: YearStat[] = [100, 120, 110, 130, 90, 105].map((h, i) => winterYear(2000 + i, h));

describe('user crop flows through the engine like a built-in', () => {
  it('spring/summer are no-data and overall === the winter verdict', () => {
    const c = userCrop('user-abc', 'Mango', 300);
    const evalResult = evaluateCrop(c, 'Mango, your figures', richWinters, richWinters, 300);

    const spring = evalResult.seasons.find((s) => s.season === 'spring');
    const summer = evalResult.seasons.find((s) => s.season === 'summer');
    const winter = evalResult.seasons.find((s) => s.season === 'winter');
    expect(spring?.verdict).toBe('no-data');
    expect(summer?.verdict).toBe('no-data');
    // Overall is driven entirely by winter (no-data seasons are ignored).
    expect(evalResult.overall).toBe(winter?.verdict);
    expect(evalResult.overall).toBe('viable');
  });

  it('a viable user crop is included by appropriateCrops', () => {
    const c = userCrop('user-viable', 'Fig', 400);
    const evalResult = evaluateCrop(c, 'Fig', richWinters, richWinters, 400);
    expect(appropriateCrops([evalResult]).map((e) => e.id)).toEqual(['user-viable']);
  });

  it('a not-viable user crop is excluded by appropriateCrops', () => {
    const c = userCrop('user-cold', 'Cherry-high-chill', 1000);
    const evalResult = evaluateCrop(c, 'High chill', poorWinters, poorWinters, 1000);
    expect(evalResult.overall).toBe('not-viable');
    expect(appropriateCrops([evalResult])).toEqual([]);
  });

  it('ranks within a mixed list with no special-casing', () => {
    const builtinLike = userCrop('apple-like', 'Apple', 400); // id has no user- prefix: acts as a built-in
    const user = userCrop('user-xyz', 'Mango', 400);
    const builtinEval = evaluateCrop(builtinLike, 'Apple', richWinters, richWinters, 400);
    const userEval = evaluateCrop(user, 'Mango', richWinters, richWinters, 400);

    const ranked = rankCrops([userEval, builtinEval]);
    // Both viable; deterministic tie-break is by label then id -> Apple before Mango.
    expect(ranked.map((e) => e.id)).toEqual(['apple-like', 'user-xyz']);
    // The user crop is present and ranked, not dropped or special-cased.
    expect(ranked.some((e) => e.id === 'user-xyz')).toBe(true);
  });
});
