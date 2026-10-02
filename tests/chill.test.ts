import { describe, expect, it } from 'vitest';
import {
  annualPrecipChangePct, applyMonthlyDelta, chillHours, chillPortions, daylengthHours, et0Hargreaves, hourlyTemps,
  monthlyMeans, percentile, precipRatios,
} from '../shared/chill';
import { series } from './helpers';

describe('daylength', () => {
  it('is ~12 h at the equinox and shorter in a southern winter', () => {
    expect(daylengthHours(-36.4, 80)).toBeGreaterThan(11.8);
    expect(daylengthHours(-36.4, 80)).toBeLessThan(12.3);
    expect(daylengthHours(-36.4, 172)).toBeLessThan(10);
    expect(daylengthHours(-36.4, 355)).toBeGreaterThan(14);
  });
});

describe('hourly reconstruction', () => {
  it('stays within the daily min/max envelope and reaches both ends', () => {
    const days = series('2001-01-01', '2001-12-31', () => ({ tmin: 2, tmax: 14 }));
    const mid = Array.from(hourlyTemps(days, -36.4).slice(100 * 24, 101 * 24));
    expect(Math.min(...mid)).toBeGreaterThanOrEqual(1.99);
    expect(Math.max(...mid)).toBeLessThanOrEqual(14.01);
    expect(Math.max(...mid)).toBeGreaterThan(13.5);
    expect(Math.min(...mid)).toBeLessThan(2.6);
  });
});

describe('chill models', () => {
  it('chill hours count only 0–7.2 °C', () => {
    expect(chillHours([-1, 0, 3, 7.2, 7.3, 15])).toBe(3);
  });
  it('dynamic model accrues near the optimum but not when warm', () => {
    const cold = chillPortions(Array(24 * 30).fill(6));
    expect(cold).toBeGreaterThan(15);
    expect(cold).toBeLessThan(35);
    expect(chillPortions(Array(24 * 30).fill(20))).toBe(0);
  });
});

describe('delta change', () => {
  const base = series('2001-01-01', '2001-12-31', () => ({ tmin: 2, tmax: 12, precip: 2 }));
  const baseMeans = monthlyMeans(base, 2001, 2001);

  it('shifts temperatures additively and rainfall by ratio', () => {
    const fut = { tmin: Array(12).fill(3), tmax: Array(12).fill(14), precip: Array(12).fill(1.6) };
    const shifted = applyMonthlyDelta(base, baseMeans, fut);
    expect(shifted[0].tmin).toBeCloseTo(3);
    expect(shifted[0].tmax).toBeCloseTo(14);
    expect(shifted[0].precip).toBeCloseTo(1.6);
    expect(annualPrecipChangePct(baseMeans, fut)).toBeCloseTo(-20);
  });

  it('clamps rainfall ratios and ignores near-dry baseline months', () => {
    const wet = { ...baseMeans, precip: Array(12).fill(10) };
    expect(precipRatios(baseMeans, wet).every((r) => r === 1.5)).toBe(true);
    const dryBase = { ...baseMeans, precip: Array(12).fill(0.05) };
    expect(precipRatios(dryBase, wet).every((r) => r === 1)).toBe(true);
  });

  it('keeps missing rainfall missing', () => {
    const withGap = [{ date: '2001-01-01', tmin: 1, tmax: 10, precip: null }];
    expect(applyMonthlyDelta(withGap, baseMeans, baseMeans)[0].precip).toBeNull();
  });
});

describe('evapotranspiration', () => {
  it('gives plausible Victorian values: high in summer, low in winter', () => {
    const jan = et0Hargreaves(-36.4, 15, 15, 31);
    const jul = et0Hargreaves(-36.4, 196, 3, 13);
    expect(jan).toBeGreaterThan(5);
    expect(jan).toBeLessThan(8);
    expect(jul).toBeGreaterThan(0.5);
    expect(jul).toBeLessThan(1.8);
  });
});

describe('percentile', () => {
  it('interpolates linearly', () => {
    const v = [300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200];
    expect(percentile(v, 50)).toBe(750);
    expect(percentile(v, 10)).toBe(390);
  });
});
