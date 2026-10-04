import { annualPrecipChangePct, applyMonthlyDelta, meanDelta, monthlyMeans, summarise } from '../shared/chill';
import { summariseYears, yearlyStats } from '../shared/seasons';
import { BASELINE_PERIOD, FUTURE_PERIOD, type ClimateAnalysis, type ModelResult, type YearStat } from '../shared/types';
import { CLIMATE_MODELS, getModels, getObserved, getWinter, latestWinterYear, toDailyWeather } from './openMeteo';

export class DataUnavailableError extends Error {}

const inPeriod = (p: readonly [number, number]) => (y: number) => y >= p[0] && y <= p[1];

export async function analyseLocation(lat: number, lon: number, label: string): Promise<ClimateAnalysis> {
  const [obs, mod] = await Promise.all([getObserved(lat, lon), getModels(lat, lon)]);

  const observedDays = toDailyWeather(obs.data);
  if (!observedDays) throw new DataUnavailableError('No observed weather record for this location.');

  const observed = yearlyStats(observedDays, lat);
  // Keep Dec of the year before the baseline so the first baseline summer is complete.
  const baselineDays = observedDays.filter((d) => {
    const y = Number(d.date.slice(0, 4));
    const m = Number(d.date.slice(5, 7));
    return inPeriod(BASELINE_PERIOD)(y) || (y === BASELINE_PERIOD[0] - 1 && m === 12);
  });
  const baselineYears = observed.filter((s) => inPeriod(BASELINE_PERIOD)(s.year));
  if (baselineYears.filter((y) => y.winter).length < 15) {
    throw new DataUnavailableError('Not enough complete baseline years for this location.');
  }

  const models: ModelResult[] = [];
  const futureYears: YearStat[] = [];

  for (const model of CLIMATE_MODELS) {
    const series = toDailyWeather(mod.data, model);
    if (!series) continue;
    const base = monthlyMeans(series, BASELINE_PERIOD[0], BASELINE_PERIOD[1]);
    const fut = monthlyMeans(series, FUTURE_PERIOD[0], FUTURE_PERIOD[1]);
    if ([...base.tmin, ...fut.tmin, ...base.tmax, ...fut.tmax].some((v) => !Number.isFinite(v))) continue;

    const synthetic = yearlyStats(applyMonthlyDelta(baselineDays, base, fut), lat).filter((s) =>
      inPeriod(BASELINE_PERIOD)(s.year),
    );
    if (synthetic.filter((y) => y.winter).length < 15) continue;

    futureYears.push(...synthetic);
    models.push({
      model,
      winterWarming: meanDelta(base, fut, [4, 5, 6, 7, 8, 9]),
      summerWarming: meanDelta(base, fut, [12, 1, 2]),
      rainChangePct: annualPrecipChangePct(base, fut),
      medianChillHours: summarise(synthetic.flatMap((s) => (s.winter ? [s.winter.chillHours] : []))).median,
      meanHotDays: summarise(synthetic.flatMap((s) => (s.summer ? [s.summer.hotDays] : []))).mean,
    });
  }

  if (models.length === 0) throw new DataUnavailableError('Climate projections are unavailable for this location.');

  return {
    schemaVersion: 2,
    location: { lat, lon, elevation: obs.data.elevation ?? null, label },
    observed,
    baseline: { period: BASELINE_PERIOD, years: baselineYears, summary: summariseYears(baselineYears) },
    future: { period: FUTURE_PERIOD, years: futureYears, summary: summariseYears(futureYears), models },
    generatedAt: new Date().toISOString(),
    servedFrom: obs.fromCache && mod.fromCache ? 'cache' : 'live',
  };
}

/** Chill in the most recent complete winter, which the main record (to 2025) doesn't include yet. */
export async function latestWinter(lat: number, lon: number): Promise<{ year: number; chillHours: number; chillPortions: number }> {
  const year = latestWinterYear();
  const { data } = await getWinter(lat, lon, year);
  const days = toDailyWeather(data);
  const winter = days && yearlyStats(days, lat).find((y) => y.year === year)?.winter;
  if (!winter) throw new DataUnavailableError(`The ${year} winter isn't complete in the weather record yet.`);
  return { year, ...winter };
}
