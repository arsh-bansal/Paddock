import { describe, expect, it } from 'vitest';
import { rankCrops } from '../shared/ranking';
import type { CropEvaluation, SeasonResult, SeasonVerdict } from '../shared/seasons';

/** Build a winter season result with a given comfort via its `future` (% winters meeting chill). */
function winter(future: number, indicative = false): SeasonResult {
  return { season: 'winter', verdict: 'viable', baseline: null, future, threshold: 500, indicative };
}

/** Build a summer season result; comfort = 1 - future/threshold. */
function summer(future: number, threshold: number, indicative = false): SeasonResult {
  return { season: 'summer', verdict: 'viable', baseline: null, future, threshold, indicative };
}

function evalCrop(
  id: string,
  overall: SeasonVerdict,
  seasons: SeasonResult[],
  label = id,
): CropEvaluation {
  return { id, label, overall, seasons, heatNote: '', chillRequirement: 500, chillPortionsRequirement: 40, portionsConverted: false };
}

/** Deterministic shuffle (seeded) so "shuffled input" is reproducible across runs. */
function shuffle<T>(arr: T[], seed = 1): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

describe('rankCrops verdict buckets', () => {
  it('orders viable < at-risk < not-viable < no-data', () => {
    const input = [
      evalCrop('d', 'no-data', [winter(50)]),
      evalCrop('b', 'at-risk', [winter(50)]),
      evalCrop('a', 'viable', [winter(50)]),
      evalCrop('c', 'not-viable', [winter(50)]),
    ];
    expect(rankCrops(input).map((c) => c.overall)).toEqual([
      'viable',
      'at-risk',
      'not-viable',
      'no-data',
    ]);
  });
});

describe('rankCrops within-bucket worst-season comfort', () => {
  it('ranks the crop with the better worst-season comfort first', () => {
    const safe = evalCrop('safe', 'viable', [winter(90)]); // comfort 0.9
    const risky = evalCrop('risky', 'viable', [winter(40)]); // comfort 0.4
    expect(rankCrops([risky, safe]).map((c) => c.id)).toEqual(['safe', 'risky']);
  });

  it('judges a crop by its worst season (minimum comfort)', () => {
    // a: winter 0.9 but summer 0.2 -> worst 0.2;  b: winter 0.5, summer 0.5 -> worst 0.5
    const a = evalCrop('a', 'viable', [winter(90), summer(8, 10)]); // summer comfort 0.2
    const b = evalCrop('b', 'viable', [winter(50), summer(5, 10)]); // summer comfort 0.5
    expect(rankCrops([a, b]).map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('rankCrops indicative tie-break', () => {
  it('prefers fewer indicative seasons when comfort is equal', () => {
    const sourced = evalCrop('sourced', 'viable', [winter(80, false)]);
    const guessed = evalCrop('guessed', 'viable', [winter(80, true)]);
    expect(rankCrops([guessed, sourced]).map((c) => c.id)).toEqual(['sourced', 'guessed']);
  });
});

describe('rankCrops deterministic final tie-break', () => {
  it('breaks remaining ties by label then id, independent of input order', () => {
    const base = () => [
      evalCrop('id-b', 'viable', [winter(80)], 'Beta'),
      evalCrop('id-a', 'viable', [winter(80)], 'Alpha'),
      evalCrop('id-c', 'viable', [winter(80)], 'Alpha'), // same label as id-a -> id decides
    ];
    const expected = ['id-a', 'id-c', 'id-b']; // Alpha(id-a) < Alpha(id-c) < Beta
    for (let seed = 1; seed <= 5; seed++) {
      expect(rankCrops(shuffle(base(), seed)).map((c) => c.id)).toEqual(expected);
    }
  });

  it('is pure: does not mutate its input', () => {
    const input = [
      evalCrop('b', 'at-risk', [winter(50)]),
      evalCrop('a', 'viable', [winter(50)]),
    ];
    const before = input.map((c) => c.id);
    rankCrops(input);
    expect(input.map((c) => c.id)).toEqual(before);
  });
});

describe('rankCrops edge cases', () => {
  it('empty input -> empty output', () => {
    expect(rankCrops([])).toEqual([]);
  });

  it('single crop -> itself', () => {
    const only = evalCrop('only', 'viable', [winter(70)]);
    expect(rankCrops([only])).toEqual([only]);
  });
});
