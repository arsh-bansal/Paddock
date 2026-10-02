/**
 * Winter chill + summer heat calculations.
 *
 * Method references (verify before citing in the pitch):
 *  - Hourly temperatures from daily min/max: Linvill (1990), HortScience 25:14-16,
 *    as implemented in the chillR R package (Luedeling).
 *  - Chill Hours: Weinberger (1950) — hours between 0 and 7.2 °C.
 *  - Chill Portions (Dynamic Model): Fishman, Erez & Couvillon (1987); equations as in chillR.
 *  - "Safe winter chill" (10th percentile of winters): Luedeling et al. (2009), PLoS ONE.
 *  - Reference evapotranspiration: Hargreaves & Samani (1985), with FAO-56 extraterrestrial radiation.
 */

export interface DailyWeather {
  /** ISO date, YYYY-MM-DD (local time at the site) */
  date: string;
  tmin: number;
  tmax: number;
  /** Daily precipitation in mm; null when the source has no value */
  precip: number | null;
}

export interface Summary {
  p10: number;
  median: number;
  p90: number;
  mean: number;
}

const DEG = Math.PI / 180;

export function monthOf(date: string): number {
  return Number(date.slice(5, 7));
}

export function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

export function dayOfYear(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

/** Astronomical day length in hours for a latitude (degrees) and day of year. */
export function daylengthHours(latDeg: number, doy: number): number {
  const decl = 23.44 * Math.sin((2 * Math.PI * (284 + doy)) / 365);
  const cosH = -Math.tan(latDeg * DEG) * Math.tan(decl * DEG);
  if (cosH <= -1) return 24;
  if (cosH >= 1) return 0;
  return (2 / 15) * (Math.acos(cosH) / DEG);
}

/**
 * Reconstruct 24 hourly temperatures per day (Linvill 1990):
 * sine curve during daylight, logarithmic decay overnight towards the next day's minimum.
 * Returns an array with 24 * days.length values.
 */
export function hourlyTemps(days: Pick<DailyWeather, 'date' | 'tmin' | 'tmax'>[], latDeg: number): Float64Array {
  const out = new Float64Array(days.length * 24);
  const n = days.length;

  const info = days.map((d) => {
    const dl = Math.min(Math.max(daylengthHours(latDeg, dayOfYear(d.date)), 1), 23);
    const sunrise = 12 - dl / 2;
    const sunset = 12 + dl / 2;
    const tSunset = d.tmin + (d.tmax - d.tmin) * Math.sin((Math.PI * dl) / (dl + 4));
    return { dl, sunrise, sunset, tSunset };
  });

  for (let i = 0; i < n; i++) {
    const d = days[i];
    const cur = info[i];
    const prev = info[Math.max(i - 1, 0)];
    const next = info[Math.min(i + 1, n - 1)];
    const nextTmin = days[Math.min(i + 1, n - 1)].tmin;

    for (let h = 0; h < 24; h++) {
      let t: number;
      if (h < cur.sunrise) {
        // Night that started at the previous day's sunset.
        const nightLen = 24 - prev.sunset + cur.sunrise;
        const elapsed = h + 24 - prev.sunset;
        t = prev.tSunset - ((prev.tSunset - d.tmin) * Math.log(elapsed + 1)) / Math.log(nightLen + 1);
      } else if (h <= cur.sunset) {
        t = d.tmin + (d.tmax - d.tmin) * Math.sin((Math.PI * (h - cur.sunrise)) / (cur.dl + 4));
      } else {
        const nightLen = 24 - cur.sunset + next.sunrise;
        const elapsed = h - cur.sunset;
        t = cur.tSunset - ((cur.tSunset - nextTmin) * Math.log(elapsed + 1)) / Math.log(nightLen + 1);
      }
      out[i * 24 + h] = t;
    }
  }
  return out;
}

/** Weinberger chill hours: count of hours with 0 <= T <= 7.2 °C. */
export function chillHours(hourly: ArrayLike<number>): number {
  let count = 0;
  for (let i = 0; i < hourly.length; i++) {
    const t = hourly[i];
    if (t >= 0 && t <= 7.2) count++;
  }
  return count;
}

/** Dynamic Model chill portions (Fishman et al. 1987), equations as in chillR. */
export function chillPortions(hourly: ArrayLike<number>): number {
  const e0 = 4153.5;
  const e1 = 12888.8;
  const a0 = 139500;
  const a1 = 2.567e18;
  const slp = 1.6;
  const tetmlt = 277;
  const aa = a0 / a1;
  const ee = e1 - e0;

  let portions = 0;
  let interE = 0;
  let prevXi = 0;

  for (let i = 0; i < hourly.length; i++) {
    const tk = hourly[i] + 273;
    const ftmprt = (slp * tetmlt * (tk - tetmlt)) / tk;
    const sr = Math.exp(ftmprt);
    const xi = sr / (1 + sr);
    const xs = aa * Math.exp(ee / tk);
    const ak1 = a1 * Math.exp(-e1 / tk);

    // Once the intermediate product reaches 1, a fraction (prevXi) is fixed as a portion.
    const interS = i > 0 && interE >= 1 ? interE * (1 - prevXi) : interE;
    interE = xs - (xs - interS) * Math.exp(-ak1);
    if (interE >= 1) portions += interE * xi;
    prevXi = xi;
  }
  return portions;
}

/** Linear-interpolated percentile, p in [0, 100]. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function summarise(values: number[]): Summary {
  if (values.length === 0) return { p10: NaN, median: NaN, p90: NaN, mean: NaN };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return {
    p10: percentile(values, 10),
    median: percentile(values, 50),
    p90: percentile(values, 90),
    mean,
  };
}

export interface MonthlyMeans {
  /** index 0 = January */
  tmin: number[];
  tmax: number[];
  /** mean daily precipitation, mm/day (NaN when no data) */
  precip: number[];
}

export function monthlyMeans(days: DailyWeather[], fromYear: number, toYear: number): MonthlyMeans {
  const sum = { tmin: Array(12).fill(0), tmax: Array(12).fill(0), precip: Array(12).fill(0) };
  const count = Array(12).fill(0);
  const pCount = Array(12).fill(0);
  for (const d of days) {
    const y = yearOf(d.date);
    if (y < fromYear || y > toYear) continue;
    if (!Number.isFinite(d.tmin) || !Number.isFinite(d.tmax)) continue;
    const m = monthOf(d.date) - 1;
    sum.tmin[m] += d.tmin;
    sum.tmax[m] += d.tmax;
    count[m]++;
    if (d.precip != null && Number.isFinite(d.precip)) {
      sum.precip[m] += d.precip;
      pCount[m]++;
    }
  }
  return {
    tmin: sum.tmin.map((s, i) => (count[i] ? s / count[i] : NaN)),
    tmax: sum.tmax.map((s, i) => (count[i] ? s / count[i] : NaN)),
    precip: sum.precip.map((s, i) => (pCount[i] ? s / pCount[i] : NaN)),
  };
}

/** Rainfall change is applied as a ratio, clamped so a dry baseline month can't explode. */
const PRECIP_RATIO_LIMITS = [0.5, 1.5] as const;

export function precipRatios(baseline: MonthlyMeans, future: MonthlyMeans): number[] {
  return baseline.precip.map((b, i) => {
    const f = future.precip[i];
    if (!Number.isFinite(b) || !Number.isFinite(f) || b < 0.1) return 1;
    return Math.min(Math.max(f / b, PRECIP_RATIO_LIMITS[0]), PRECIP_RATIO_LIMITS[1]);
  });
}

/**
 * Delta-change method: shift the observed baseline record by each month's modelled change
 * (future-period mean vs the same model's baseline-period mean). Temperatures shift additively,
 * rainfall scales by a ratio. This keeps real local day-to-day variability and avoids raw model
 * bias, which matters a lot for threshold metrics like chill hours and frost days.
 */
export function applyMonthlyDelta(observed: DailyWeather[], baseline: MonthlyMeans, future: MonthlyMeans): DailyWeather[] {
  const dMin = future.tmin.map((f, i) => f - baseline.tmin[i]);
  const dMax = future.tmax.map((f, i) => f - baseline.tmax[i]);
  const pRatio = precipRatios(baseline, future);
  return observed.map((d) => {
    const m = monthOf(d.date) - 1;
    return {
      date: d.date,
      tmin: d.tmin + dMin[m],
      tmax: d.tmax + dMax[m],
      precip: d.precip == null ? null : d.precip * pRatio[m],
    };
  });
}

export function meanDelta(baseline: MonthlyMeans, future: MonthlyMeans, months: readonly number[]): number {
  const deltas = months.map((m) => {
    const i = m - 1;
    return (future.tmin[i] + future.tmax[i]) / 2 - (baseline.tmin[i] + baseline.tmax[i]) / 2;
  });
  return deltas.reduce((s, v) => s + v, 0) / deltas.length;
}

/** Annual rainfall change in percent, from monthly means weighted by month length. */
export function annualPrecipChangePct(baseline: MonthlyMeans, future: MonthlyMeans): number | null {
  const days = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if ([...baseline.precip, ...future.precip].some((v) => !Number.isFinite(v))) return null;
  const b = baseline.precip.reduce((s, v, i) => s + v * days[i], 0);
  const f = future.precip.reduce((s, v, i) => s + v * days[i], 0);
  return b > 0 ? ((f - b) / b) * 100 : null;
}

/** FAO-56 extraterrestrial radiation, MJ m-2 day-1. */
export function extraterrestrialRadiation(latDeg: number, doy: number): number {
  const phi = latDeg * DEG;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const decl = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const ws = Math.acos(Math.min(Math.max(-Math.tan(phi) * Math.tan(decl), -1), 1));
  return ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.sin(ws));
}

/**
 * Hargreaves–Samani reference evapotranspiration, mm/day. Needs only min/max temperature,
 * so it can be computed identically for observed and projected climates.
 */
export function et0Hargreaves(latDeg: number, doy: number, tmin: number, tmax: number): number {
  const ra = extraterrestrialRadiation(latDeg, doy) * 0.408; // MJ -> mm equivalent
  const tmean = (tmin + tmax) / 2;
  return Math.max(0, 0.0023 * ra * (tmean + 17.8) * Math.sqrt(Math.max(tmax - tmin, 0)));
}
