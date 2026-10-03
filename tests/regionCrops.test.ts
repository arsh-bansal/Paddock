import { describe, expect, it } from 'vitest';
import { CROP_OPTIONS } from '../shared/crops';
import { distanceKm, groupForRegion, MAX_REGION_KM, REGION_CROPS, regionForLocation, type RegionCrops } from '../shared/regionCrops';
import { REGION_PRESETS } from '../shared/regions';
import type { CropEvaluation, SeasonVerdict } from '../shared/seasons';

const evalOf = (id: string, overall: SeasonVerdict): CropEvaluation => ({
  id, label: id, overall, seasons: [], heatNote: '', chillRequirement: 500, chillPortionsRequirement: 40, portionsConverted: false,
});

describe('region crop data file', () => {
  it('has a list for every preset district', () => {
    expect(REGION_CROPS.map((r) => r.presetId).sort()).toEqual(REGION_PRESETS.map((p) => p.id).sort());
  });
  it('only links to crops that exist in the crop database', () => {
    const ids = new Set(CROP_OPTIONS.map((c) => c.id));
    for (const r of REGION_CROPS) for (const g of r.grownToday) if (g.cropId) expect(ids.has(g.cropId)).toBe(true);
  });
  it('comes from the ABS import, not hand-written placeholders', () => {
    for (const r of REGION_CROPS) {
      expect(r.indicative).toBe(false);
      expect(r.source).toContain('ABS, Agricultural Commodities, Australia, 2020-21');
    }
  });
  it('says so when a district has little commercial fruit', () => {
    for (const r of REGION_CROPS) if (r.grownToday.length === 0) expect(r.note).toBeTruthy();
  });
});

describe('regionForLocation', () => {
  it('uses the preset id when there is one', () => {
    expect(regionForLocation({ lat: 0, lon: 0, presetId: 'harcourt' })?.presetId).toBe('harcourt');
  });
  it('matches a pin near a district', () => {
    expect(regionForLocation({ lat: -36.42, lon: 145.35 })?.presetId).toBe('shepparton');
  });
  it('returns nothing for a pin far from every district (never guesses)', () => {
    expect(regionForLocation({ lat: -37.93, lon: 145.16 })).toBeNull(); // suburban Melbourne
    expect(regionForLocation({ lat: -33.87, lon: 151.21 })).toBeNull(); // Sydney
  });
  it('measures distance correctly', () => {
    expect(distanceKm(-37.81, 144.96, -33.87, 151.21)).toBeGreaterThan(700);
    expect(distanceKm(-37.81, 144.96, -33.87, 151.21)).toBeLessThan(720);
    expect(MAX_REGION_KM).toBeLessThanOrEqual(25);
  });
});

describe('groupForRegion', () => {
  const region: RegionCrops = {
    presetId: 'shepparton', name: 'test', indicative: true, source: '',
    grownToday: [{ cropId: 'pear', name: 'Pears' }, { cropId: null, name: 'Almonds' }, { cropId: 'not-in-db', name: 'Mystery' }],
  };
  const ranked = [evalOf('apple', 'viable'), evalOf('pear', 'at-risk'), evalOf('cherry', 'at-risk'), evalOf('plum', 'not-viable'), evalOf('fig', 'no-data')];

  it('splits around what is grown today and keeps rank order', () => {
    const g = groupForRegion(ranked, region);
    expect(g.grownToday.map((e) => e.id)).toEqual(['pear']);
    expect(g.couldSuit.map((e) => e.id)).toEqual(['apple', 'cherry']);
    expect(g.struggles.map((e) => e.id)).toEqual(['plum', 'fig']);
  });
  it('orders grown-today crops by the district list (largest first), not by climate rank', () => {
    const bySize: RegionCrops = { ...region, grownToday: [{ cropId: 'cherry', name: 'Cherries' }, { cropId: 'apple', name: 'Apples' }] };
    expect(groupForRegion(ranked, bySize).grownToday.map((e) => e.id)).toEqual(['cherry', 'apple']);
  });

  it('lists local crops with no climate data by name', () => {
    expect(groupForRegion(ranked, region).grownNoData.map((g) => g.name)).toEqual(['Almonds', 'Mystery']);
  });
  it('puts every crop in exactly one group', () => {
    const g = groupForRegion(ranked, region);
    expect([...g.grownToday, ...g.couldSuit, ...g.struggles].map((e) => e.id).sort()).toEqual(ranked.map((e) => e.id).sort());
  });
  it('with no district, nothing is "grown today"', () => {
    const g = groupForRegion(ranked, null);
    expect(g.grownToday).toEqual([]);
    expect(g.grownNoData).toEqual([]);
  });
});
