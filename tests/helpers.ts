import type { DailyWeather } from '../shared/chill';

/** Daily series from `from` to `to` (inclusive, YYYY-MM-DD), values from a function of the date. */
export function series(from: string, to: string, f: (date: string, doy: number) => Partial<DailyWeather>): DailyWeather[] {
  const out: DailyWeather[] = [];
  const end = new Date(`${to}T00:00:00Z`).getTime();
  for (let d = new Date(`${from}T00:00:00Z`); d.getTime() <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    const doy = Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000);
    out.push({ date, tmin: 5, tmax: 15, precip: 1, ...f(date, doy) });
  }
  return out;
}
