import { describe, expect, it } from 'vitest';
import { CROP_OPTIONS, type CropOption } from '../shared/crops';
import {
  evaluateCrop, evaluateSpring, evaluateSummer, evaluateWinter, overallVerdict, summariseYears, yearlyStats,
  type YearStat,
} from '../shared/seasons';
import { series } from './helpers';

const LAT = -36.4;

describe('yearlyStats', () => {
  const days = series('2000-12-01', '2001-12-31', (date) => {
    const m = Number(date.slice(5, 7));
    const d = Number(date.slice(8, 10));
    // A 4-day 38 °C heatwave from 30 Dec 2000 into Jan 2001, plus one 41 °C day in Feb.
    if (date >= '2000-12-30' && date <= '2001-01-02') return { tmin: 20, tmax: 38 };
    if (date === '2001-02-10') return { tmin: 22, tmax: 41 };
    // Three frosty mornings in September: 0, -1.5 and -3 °C.
    if (m === 9 && d === 5) return { tmin: 0, tmax: 14 };
    if (m === 9 && d === 6) return { tmin: -1.5, tmax: 14 };
    if (m === 9 && d === 7) return { tmin: -3, tmax: 14 };
    if (m >= 3 && m <= 5) return { tmin: 10, tmax: m === 3 && d <= 6 ? 31 : 22, precip: 2 };
    return {};
  });
  const stats = yearlyStats(days, LAT);
  const y2001 = stats.find((s) => s.year === 2001)!;

  it('builds summer from Dec of the previous year and finds the hot spell across New Year', () => {
    expect(y2001.summer).toEqual({ hotDays: 5, extremeDays: 1, longestHotSpell: 4 });
  });

  it('records frost days by month and threshold', () => {
    const sep = y2001.spring!.frostDays[2]; // Jul, Aug, Sep...
    expect(sep).toEqual([3, 2, 1, 1, 0]); // ≤0, ≤-1, ≤-2, ≤-3, ≤-4
  });

  it('sums autumn rainfall and warm days', () => {
    expect(y2001.autumn!.rainMm).toBe(92 * 2);
    expect(y2001.autumn!.warmDays).toBe(6);
  });

  it('computes an annual water balance', () => {
    expect(y2001.annual!.rainMm).toBe(273 + 92 * 2);
    expect(y2001.annual!.et0Mm).toBeGreaterThan(300);
    expect(y2001.annual!.deficitMm).toBeCloseTo(y2001.annual!.et0Mm - y2001.annual!.rainMm!);
  });

  it('leaves seasons null when data is incomplete', () => {
    const y2000 = stats.find((s) => s.year === 2000)!;
    expect(y2000.winter).toBeNull();
    expect(y2000.summer).toBeNull();
    expect(y2000.annual).toBeNull();
  });

  it('marks rainfall null instead of under-counting when it is missing', () => {
    const gappy = series('2002-01-01', '2002-12-31', (date) => (date.slice(5, 7) === '04' ? { precip: null } : {}));
    const [y] = yearlyStats(gappy, LAT);
    expect(y.autumn!.rainMm).toBeNull();
    expect(y.annual!.rainMm).toBeNull();
    expect(y.annual!.et0Mm).toBeGreaterThan(0);
  });

  it('summarises across years and drops missing seasons', () => {
    const s = summariseYears(stats);
    expect(s.hotDays.median).toBe(5);
    expect(s.springFrostDays.mean).toBe(3);
  });
});

/* ---- evaluation on hand-built years ---- */

function year(i: number, p: { chill?: number; frostSep?: number; hot?: number }): YearStat {
  const frost = [0, 0, 0, 0, 0].map(() => [0, 0, 0, 0, 0]);
  if (p.frostSep) frost[2] = [p.frostSep, p.frostSep, p.frostSep, 0, 0];
  return {
    year: 2000 + i,
    // `chill` is in chill portions: winter is scored on portions.
    winter: p.chill == null ? null : { chillHours: p.chill * 15, chillPortions: p.chill },
    spring: { frostDays: frost },
    summer: p.hot == null ? null : { hotDays: p.hot, extremeDays: 0, longestHotSpell: 1 },
    autumn: null,
    annual: null,
  };
}

const crop = (patch: Partial<CropOption> = {}): CropOption => ({ ...CROP_OPTIONS[0], ...patch });
const tenYears = (f: (i: number) => Parameters<typeof year>[1]) => Array.from({ length: 10 }, (_, i) => year(i, f(i)));

describe('winter verdicts (safe winter chill)', () => {
  const winters = tenYears((i) => ({ chill: 300 + i * 100 })); // 300..1200
  it('is viable when a poor winter still meets the need', () => {
    expect(evaluateWinter(winters, winters, 350, true).verdict).toBe('viable');
  });
  it('is at-risk when only a typical winter meets it', () => {
    const r = evaluateWinter(winters, winters, 700, true);
    expect(r.verdict).toBe('at-risk');
    expect(r.future).toBe(60);
  });
  it('is not-viable when a typical winter falls short', () => {
    expect(evaluateWinter(winters, winters, 900, true).verdict).toBe('not-viable');
  });
});

describe('spring frost verdicts', () => {
  const sepFlowering = crop({ spring: { floweringMonths: [9], frostDamageC: -2, indicative: true, source: '' } });
  it('counts years with a damaging frost during flowering', () => {
    const yrs = tenYears((i) => ({ frostSep: i < 2 ? 1 : 0 })); // 2 in 10 years
    const r = evaluateSpring(yrs, yrs, sepFlowering);
    expect(r.future).toBe(20);
    expect(r.verdict).toBe('at-risk');
  });
  it('ignores frost outside the flowering months', () => {
    const augOnly = crop({ spring: { floweringMonths: [8], frostDamageC: -2, indicative: true, source: '' } });
    const yrs = tenYears(() => ({ frostSep: 5 }));
    expect(evaluateSpring(yrs, yrs, augOnly).verdict).toBe('viable');
  });
  it('uses the nearest threshold that is not colder than the damage temperature', () => {
    const yrs = tenYears(() => ({ frostSep: 1 })); // frost reaches -2 but not -3
    const tender = crop({ spring: { floweringMonths: [9], frostDamageC: -2.5, indicative: true, source: '' } });
    const r = evaluateSpring(yrs, yrs, tender);
    expect(r.threshold).toBe(-2);
    expect(r.verdict).toBe('not-viable');
  });
  it('reports no data when the crop has no spring entry', () => {
    expect(evaluateSpring([], [], crop({ spring: null })).verdict).toBe('no-data');
  });
});

describe('summer heat verdicts', () => {
  const c = crop({ summer: { hotDaysTolerated: 10, indicative: true, source: '' } });
  it('is viable when even a hot summer stays within tolerance', () => {
    const yrs = tenYears((i) => ({ hot: i }));
    expect(evaluateSummer(yrs, yrs, c).verdict).toBe('viable');
  });
  it('is not-viable when a typical summer exceeds tolerance', () => {
    const yrs = tenYears((i) => ({ hot: 8 + i }));
    expect(evaluateSummer(yrs, yrs, c).verdict).toBe('not-viable');
  });
});

describe('overall verdict', () => {
  it('takes the worst season and ignores missing ones', () => {
    const r = (verdict: 'viable' | 'at-risk' | 'not-viable' | 'no-data') =>
      ({ season: 'winter', verdict, baseline: null, future: null, threshold: null, indicative: false }) as const;
    expect(overallVerdict([r('viable'), r('at-risk'), r('no-data')])).toBe('at-risk');
    expect(overallVerdict([r('no-data')])).toBe('no-data');
  });
  it('evaluates all three seasons for a crop', () => {
    const yrs = tenYears((i) => ({ chill: 1000, hot: i % 3, frostSep: 0 }));
    const e = evaluateCrop(CROP_OPTIONS[0], 'Peach', yrs, yrs, { chillHoursOverride: 750 });
    expect(e.seasons.map((s) => s.season)).toEqual(['winter', 'spring', 'summer']);
    expect(e.overall).toBe('viable');
  });
});
