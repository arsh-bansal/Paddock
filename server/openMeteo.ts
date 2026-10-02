import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DailyWeather } from '../shared/chill';
import { FUTURE_PERIOD, OBSERVED_PERIOD, BASELINE_PERIOD } from '../shared/types';

/**
 * Data sources (both free, no key required for non-commercial use — check Open-Meteo's terms):
 *  - Observed: Open-Meteo Historical Weather API (ERA5 / ERA5-Land reanalysis, ECMWF).
 *  - Projections: Open-Meteo Climate API (CMIP6 HighResMIP models, downscaled to ~10 km).
 */
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const CLIMATE_URL = 'https://climate-api.open-meteo.com/v1/climate';

export const CLIMATE_MODELS = ['EC_Earth3P_HR', 'MPI_ESM1_2_XR', 'MRI_AGCM3_2_S'] as const;

const CACHE_DIR = path.resolve(process.cwd(), 'data', 'cache');
const memoryCache = new Map<string, unknown>();

export interface RawDaily {
  elevation?: number;
  daily: Record<string, (number | null)[]> & { time: string[] };
}

/** Bump when the requested variables change so old cache files aren't reused. */
const CACHE_VERSION = 'v2';
const DAILY_VARS = 'temperature_2m_max,temperature_2m_min,precipitation_sum';

export function cacheKey(kind: 'observed' | 'models', lat: number, lon: number): string {
  return `${CACHE_VERSION}_${kind}_${lat.toFixed(2)}_${lon.toFixed(2)}`;
}

async function readCache(key: string): Promise<RawDaily | null> {
  if (memoryCache.has(key)) return memoryCache.get(key) as RawDaily;
  try {
    const raw = JSON.parse(await readFile(path.join(CACHE_DIR, `${key}.json`), 'utf8')) as RawDaily;
    memoryCache.set(key, raw);
    return raw;
  } catch {
    return null;
  }
}

async function writeCache(key: string, value: RawDaily): Promise<void> {
  memoryCache.set(key, value);
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(value));
  } catch (err) {
    console.warn(`[cache] could not persist ${key}:`, (err as Error).message);
  }
}

async function fetchJson(url: string, attempts = 2): Promise<RawDaily> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      const body = (await res.json()) as RawDaily & { error?: boolean; reason?: string };
      if (!res.ok || body.error) throw new Error(body.reason ?? `Open-Meteo responded ${res.status}`);
      return body;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

async function cached(key: string, url: string): Promise<{ data: RawDaily; fromCache: boolean }> {
  const hit = await readCache(key);
  if (hit) return { data: hit, fromCache: true };
  const data = await fetchJson(url);
  await writeCache(key, data);
  return { data, fromCache: false };
}

export async function getObserved(lat: number, lon: number) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: `${OBSERVED_PERIOD[0]}-01-01`,
    end_date: `${OBSERVED_PERIOD[1]}-12-31`,
    daily: DAILY_VARS,
    timezone: 'auto',
  });
  return cached(cacheKey('observed', lat, lon), `${ARCHIVE_URL}?${params}`);
}

export async function getModels(lat: number, lon: number) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: `${BASELINE_PERIOD[0]}-01-01`,
    end_date: `${FUTURE_PERIOD[1]}-12-31`,
    models: CLIMATE_MODELS.join(','),
    daily: DAILY_VARS,
  });
  return cached(cacheKey('models', lat, lon), `${CLIMATE_URL}?${params}`);
}

/**
 * Pull one model's daily series out of an Open-Meteo daily block.
 * Multi-model responses suffix each variable with the model name; single-series responses don't.
 * Rainfall is optional: a missing rainfall variable gives precip = null rather than failing.
 */
export function toDailyWeather(raw: RawDaily, model?: string): DailyWeather[] | null {
  const d = raw.daily;
  if (!d?.time) return null;
  const hasSuffixed = Object.keys(d).some((k) => CLIMATE_MODELS.some((m) => k.endsWith(`_${m}`)));
  const key = (v: string) => (model && hasSuffixed ? `${v}_${model}` : v);
  // Without suffixes we can't tell models apart, so only the first model gets the series.
  if (model && !hasSuffixed && model !== CLIMATE_MODELS[0]) return null;

  const tmax = d[key('temperature_2m_max')];
  const tmin = d[key('temperature_2m_min')];
  const precip = d[key('precipitation_sum')];
  if (!tmax || !tmin) return null;
  const out: DailyWeather[] = [];
  d.time.forEach((date, i) => {
    const lo = tmin[i];
    const hi = tmax[i];
    if (lo == null || hi == null) return;
    const p = precip?.[i];
    out.push({ date, tmin: lo, tmax: hi, precip: p == null ? null : p });
  });
  return out.length ? out : null;
}
