import {
  applyMonthlyDelta, CHILL_SEASON_MONTHS, HEAT_MONTHS, meanDelta, monthlyMeans, seasonalStats, summarise,
} from '../shared/chill';
import { BASELINE_PERIOD, FUTURE_PERIOD, type ClimateAnalysis, type ModelResult } from '../shared/types';
import { CLIMATE_MODELS, getModels, getObserved, toDailyTemps } from './openMeteo';

export class DataUnavailableError extends Error {}

export async function analyseLocation(lat: number, lon: number, label: string): Promise<ClimateAnalysis> {
  const [obs, mod] = await Promise.all([getObserved(lat, lon), getModels(lat, lon)]);

  const observedDays = toDailyTemps(obs.data);
  if (!observedDays) throw new DataUnavailableError('No observed temperature record for this location.');

  const observed = seasonalStats(observedDays, lat);
  const baselineDays = observedDays.filter((d) => {
    const y = Number(d.date.slice(0, 4));
    return y >= BASELINE_PERIOD[0] && y <= BASELINE_PERIOD[1];
  });
  const baselineSeasons = observed.filter((s) => s.year >= BASELINE_PERIOD[0] && s.year <= BASELINE_PERIOD[1]);
  if (baselineSeasons.length < 15) throw new DataUnavailableError('Not enough complete baseline years for this location.');

  const models: ModelResult[] = [];
  const pooled = { chillHours: [] as number[], chillPortions: [] as number[], hotDays: [] as number[] };

  for (const model of CLIMATE_MODELS) {
    const series = toDailyTemps(mod.data, model);
    if (!series) continue;
    const base = monthlyMeans(series, BASELINE_PERIOD[0], BASELINE_PERIOD[1]);
    const fut = monthlyMeans(series, FUTURE_PERIOD[0], FUTURE_PERIOD[1]);
    if ([...base.tmin, ...fut.tmin].some((v) => !Number.isFinite(v))) continue;

    const synthetic = seasonalStats(applyMonthlyDelta(baselineDays, base, fut), lat);
    if (synthetic.length < 15) continue;

    pooled.chillHours.push(...synthetic.map((s) => s.chillHours));
    pooled.chillPortions.push(...synthetic.map((s) => s.chillPortions));
    pooled.hotDays.push(...synthetic.map((s) => s.hotDays));
    models.push({
      model,
      winterWarming: meanDelta(base, fut, CHILL_SEASON_MONTHS),
      summerWarming: meanDelta(base, fut, HEAT_MONTHS),
      medianChillHours: summarise(synthetic.map((s) => s.chillHours)).median,
      meanHotDays: summarise(synthetic.map((s) => s.hotDays)).mean,
    });
  }

  if (models.length === 0) throw new DataUnavailableError('Climate projections are unavailable for this location.');

  return {
    location: { lat, lon, elevation: obs.data.elevation ?? null, label },
    observed,
    baseline: {
      period: BASELINE_PERIOD,
      chillHoursByYear: baselineSeasons.map((s) => s.chillHours),
      chillHours: summarise(baselineSeasons.map((s) => s.chillHours)),
      chillPortions: summarise(baselineSeasons.map((s) => s.chillPortions)),
      hotDays: summarise(baselineSeasons.map((s) => s.hotDays)),
    },
    future: {
      period: FUTURE_PERIOD,
      chillHoursPooled: pooled.chillHours,
      chillHours: summarise(pooled.chillHours),
      chillPortions: summarise(pooled.chillPortions),
      hotDays: summarise(pooled.hotDays),
      models,
    },
    generatedAt: new Date().toISOString(),
    servedFrom: obs.fromCache && mod.fromCache ? 'cache' : 'live',
  };
}
