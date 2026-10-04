import { describe, expect, it } from 'vitest';
import { appropriateCrops } from '../shared/appropriateCrops';
import type { CropEvaluation, SeasonResult, SeasonVerdict } from '../shared/seasons';

/** Minimal winter season result; its own verdict is irrelevant to the overall-based filter. */
function winter(future: number, indicative = false): SeasonResult {
  return { season: 'winter', verdict: 'viable', baseline: null, future, threshold: 500, indicative };
}

function evalCrop(id: string, overall: SeasonVerdict, label = id): CropEvaluation {
  return { id, label, overall, seasons: [winter(50)], heatNote: '', chillRequirement: 500, chillPortionsRequirement: 40, portionsConverted: false };
}

describe('appropriateCrops verdict filter', () => {
  it('includes viable and at-risk crops', () => {
    const input = [evalCrop('a', 'viable'), evalCrop('b', 'at-risk')];
    expect(appropriateCrops(input).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('excludes not-viable and no-data crops', () => {
    const input = [evalCrop('a', 'not-viable'), evalCrop('b', 'no-data')];
    expect(appropriateCrops(input)).toEqual([]);
  });

  it('keeps only the appropriate crops from a mixed list', () => {
    const input = [
      evalCrop('a', 'viable'),
      evalCrop('b', 'not-viable'),
      evalCrop('c', 'at-risk'),
      evalCrop('d', 'no-data'),
    ];
    expect(appropriateCrops(input).map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('preserves input order (does NOT impose ranking order)', () => {
    // Deliberately not in any verdict/rank order: at-risk appears before viable.
    const input = [
      evalCrop('first', 'at-risk'),
      evalCrop('second', 'viable'),
      evalCrop('third', 'at-risk'),
      evalCrop('fourth', 'viable'),
    ];
    expect(appropriateCrops(input).map((c) => c.id)).toEqual([
      'first',
      'second',
      'third',
      'fourth',
    ]);
  });

  it('empty input -> empty output', () => {
    expect(appropriateCrops([])).toEqual([]);
  });

  it('all-excluded input -> empty output', () => {
    const input = [
      evalCrop('a', 'not-viable'),
      evalCrop('b', 'no-data'),
      evalCrop('c', 'not-viable'),
    ];
    expect(appropriateCrops(input)).toEqual([]);
  });

  it('is pure: does not mutate its input', () => {
    const input = [evalCrop('b', 'at-risk'), evalCrop('a', 'not-viable')];
    const before = input.map((c) => c.id);
    appropriateCrops(input);
    expect(input.map((c) => c.id)).toEqual(before);
  });
});
