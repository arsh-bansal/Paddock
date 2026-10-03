import { describe, expect, it } from 'vitest';
import { districtWater, MIN_WATERED_HA, WATER_ITEMS, type WaterRow } from '../shared/absWaterImport';
import { REGION_PRESETS } from '../shared/regions';
import { ML_PER_HA_PER_MM, REGION_WATER, waterForRegion, waterOutlook } from '../shared/regionWater';
import type { ClimateAnalysis } from '../shared/types';
import { districtComparison, outlookText, todayText } from '../src/lib/waterText';

const rows = (code: string, area: number, watered: number, volume: number): WaterRow[] => [
  { regionCode: code, regionLabel: 'X', itemCode: WATER_ITEMS.orchards.area, estimate: area },
  { regionCode: code, regionLabel: 'X', itemCode: WATER_ITEMS.orchards.watered, estimate: watered },
  { regionCode: code, regionLabel: 'X', itemCode: WATER_ITEMS.orchards.volume, estimate: volume },
];

describe('water importer', () => {
  it('computes ML per irrigated hectare for the district’s LGA only', () => {
    const w = districtWater([...rows('1', 1000, 900, 4500), ...rows('2', 5, 5, 999)], 'test', { '1': 'Test Shire' });
    expect(w.orchards).toEqual({ areaHa: 1000, wateredHa: 900, volumeMl: 4500, mlPerHa: 5 });
    expect(w.vines).toBeNull();
    expect(w.source).toContain('Test Shire');
  });
  it('withholds ML/ha when the irrigated area is too small to be meaningful', () => {
    const w = districtWater(rows('1', 19, MIN_WATERED_HA - 1, 14), 'test', { '1': 'Small' });
    expect(w.orchards?.mlPerHa).toBeNull();
  });
});

describe('generated water data', () => {
  it('covers every preset district', () => {
    expect(REGION_WATER.map((w) => w.presetId).sort()).toEqual(REGION_PRESETS.map((p) => p.id).sort());
  });
  it('matches the ABS figures for Swan Hill and has no ML/ha for Bacchus Marsh', () => {
    expect(waterForRegion('swan-hill')?.orchards?.mlPerHa).toBe(8.2);
    expect(waterForRegion('bacchus-marsh')?.orchards?.mlPerHa).toBeNull();
    expect(waterForRegion(undefined)).toBeNull();
  });
  it('compares districts highest use first, leaving out ones without enough data', () => {
    const c = districtComparison();
    expect(c[0].presetId).toBe('swan-hill');
    expect(c.some((x) => x.presetId === 'bacchus-marsh')).toBe(false);
  });
});

const analysis = (then: number, fut: number) =>
  ({
    baseline: { summary: { waterDeficitMm: { mean: then }, annualRainMm: { mean: 500 } } },
    future: { summary: { waterDeficitMm: { mean: fut }, annualRainMm: { mean: 480 } }, period: [2026, 2045] },
  }) as unknown as ClimateAnalysis;

describe('water outlook', () => {
  it('turns a bigger shortfall into ML/ha (1 mm over 1 ha = 0.01 ML)', () => {
    const o = waterOutlook(analysis(600, 700), waterForRegion('shepparton'))!;
    expect(ML_PER_HA_PER_MM).toBe(0.01);
    expect(o.extraMlPerHa).toBeCloseTo(1);
    expect(o.shareOfOrchardUse).toBeCloseTo(1 / 4.8);
  });
  it('works without local ABS data', () => {
    const o = waterOutlook(analysis(600, 650), null)!;
    expect(o.shareOfOrchardUse).toBeNull();
    expect(outlookText(o, [2026, 2045])).not.toMatch(/on top of/);
  });
  it('returns nothing when the climate has no water figures', () => {
    expect(waterOutlook(analysis(NaN, 700), null)).toBeNull();
  });
});

describe('water wording', () => {
  it('describes today’s use from ABS data', () => {
    const t = todayText(waterForRegion('swan-hill'))!;
    expect(t).toMatch(/Swan Hill/);
    expect(t).toMatch(/8\.2 ML of irrigation water per hectare in 2020-21/);
    expect(todayText(waterForRegion('bacchus-marsh'))).toBeNull();
  });
  it('states a growing shortfall with the rough share of today’s use', () => {
    const o = waterOutlook(analysis(32, 117), waterForRegion('wandin'))!;
    const t = outlookText(o, [2026, 2045]);
    expect(t).toMatch(/grows from about 32 mm to 117 mm in 2026-2045 \(\+85 mm\)/);
    expect(t).toMatch(/roughly 0\.9 ML more per hectare/);
    expect(t).toMatch(/about 40% on top/);
  });
  it('uses only characters the PDF fonts can draw', () => {
    const o = waterOutlook(analysis(600, 550), waterForRegion('cobram'))!;
    for (const s of [todayText(waterForRegion('cobram'))!, outlookText(o, [2026, 2045])]) expect(s).not.toMatch(/[≥≤−]/);
  });
});
