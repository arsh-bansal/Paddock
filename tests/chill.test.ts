import { describe, expect, it } from 'vitest';
import {
  applyMonthlyDelta, chillHours, chillPortions, daylengthHours, hourlyTemps,
  monthlyMeans, percentile, seasonalStats, type DailyTemp,
} from '../shared/chill';
import { pctMet, verdictFor } from '../shared/evaluate';

function series(year: number, f: (doy: number) => { tmin: number; tmax: number }): DailyTemp[] {
  const out: DailyTemp[] = [];
  const d = new Date(Date.UTC(year, 0, 1));
  let doy = 1;
  while (d.getUTCFullYear() === year) {
    out.push({ date: d.toISOString().slice(0, 10), ...f(doy) });
    d.setUTCDate(d.getUTCDate() + 1);
    doy++;
  }
  return out;
}

describe('daylength', () => {
  it('is ~12 h at the equinox and shorter in a southern winter', () => {
    expect(daylengthHours(-36.4, 80)).toBeGreaterThan(11.8);
    expect(daylengthHours(-36.4, 80)).toBeLessThan(12.3);
    expect(daylengthHours(-36.4, 172)).toBeLessThan(10); // ~21 June
    expect(daylengthHours(-36.4, 355)).toBeGreaterThan(14); // ~21 Dec
  });
});

describe('hourly reconstruction', () => {
  it('stays within the daily min/max envelope and hits both ends', () => {
    const days = series(2001, () => ({ tmin: 2, tmax: 14 }));
    const h = hourlyTemps(days, -36.4);
    const mid = Array.from(h.slice(100 * 24, 101 * 24));
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

  it('dynamic model accrues at optimal temps, not when warm', () => {
    const cold = chillPortions(Array(24 * 30).fill(6));
    const warm = chillPortions(Array(24 * 30).fill(20));
    expect(cold).toBeGreaterThan(15); // roughly 0.8–1 portion per day near optimum
    expect(cold).toBeLessThan(35);
    expect(warm).toBe(0);
  });

  it('warmer winters produce less chill', () => {
    const cool = series(2001, () => ({ tmin: 2, tmax: 12 }));
    const warmer = applyMonthlyDelta(cool, monthlyMeans(cool, 2001, 2001), {
      tmin: Array(12).fill(4), tmax: Array(12).fill(14),
    });
    const [a] = seasonalStats(cool, -36.4);
    const [b] = seasonalStats(warmer, -36.4);
    expect(b.chillHours).toBeLessThan(a.chillHours);
    expect(b.chillPortions).toBeLessThan(a.chillPortions);
  });

  it('counts hot days in Dec–Feb only', () => {
    const days = series(2001, (doy) => ({ tmin: 15, tmax: doy <= 10 || doy > 360 ? 38 : 30 }));
    expect(seasonalStats(days, -36.4)[0].hotDays).toBe(15);
  });

  it('drops seasons with missing data instead of under-counting', () => {
    const days = series(2001, () => ({ tmin: 2, tmax: 12 })).filter((d) => !d.date.startsWith('2001-06'));
    expect(seasonalStats(days, -36.4)).toHaveLength(0);
  });
});

describe('evaluation', () => {
  const winters = [300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200];
  it('percentile interpolates', () => {
    expect(percentile(winters, 50)).toBe(750);
    expect(percentile(winters, 10)).toBe(390);
  });
  it('verdict follows safe-winter-chill logic', () => {
    expect(verdictFor(winters, 350)).toBe('viable');
    expect(verdictFor(winters, 700)).toBe('at-risk');
    expect(verdictFor(winters, 900)).toBe('not-viable');
    expect(pctMet(winters, 700)).toBe(60);
  });
});
