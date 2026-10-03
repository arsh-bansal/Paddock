/**
 * Irrigation today (ABS) + how the climate's water shortfall changes (our projection).
 *
 * Data: `shared/regionWater.data.json`, GENERATED from the ABS water-use census by
 * `npm run import:abs-water` and validated on load.
 *
 * The extra-water figure is deliberately simple and labelled indicative: the change in the yearly
 * shortfall between reference evaporation (Hargreaves) and rainfall, converted to ML per hectare
 * (1 mm over 1 ha = 10 m³ = 0.01 ML). Real orchard needs also depend on the crop, canopy, soil and
 * how much rain is effective, so it's a guide to the direction and rough size of the change.
 */
import { z } from 'zod';
import type { ClimateAnalysis } from './types';
import raw from './regionWater.data.json';

const figuresSchema = z
  .object({
    areaHa: z.number().nonnegative(),
    wateredHa: z.number().nonnegative(),
    volumeMl: z.number().nonnegative(),
    mlPerHa: z.number().nonnegative().nullable(),
  })
  .nullable();

const regionSchema = z.object({
  presetId: z.string().min(1),
  lga: z.string().min(1),
  source: z.string().min(1),
  orchards: figuresSchema,
  vines: figuresSchema,
});

export type DistrictWater = z.infer<typeof regionSchema>;

export const REGION_WATER: readonly DistrictWater[] = Object.freeze(
  z.object({ regions: z.array(regionSchema) }).parse(raw).regions,
);

export function waterForRegion(presetId: string | undefined | null): DistrictWater | null {
  return presetId ? REGION_WATER.find((r) => r.presetId === presetId) ?? null : null;
}

/** 1 mm of water over 1 ha is 10 m³, i.e. 0.01 ML. */
export const ML_PER_HA_PER_MM = 0.01;

export interface WaterOutlook {
  /** Yearly shortfall, evaporation minus rain, mm */
  shortfallThenMm: number;
  shortfallFutureMm: number;
  shortfallChangeMm: number;
  rainThenMm: number;
  rainFutureMm: number;
  /** Change in shortfall expressed as ML/ha (indicative) */
  extraMlPerHa: number;
  /** extraMlPerHa as a share of today's orchard irrigation (null without ABS orchard data) */
  shareOfOrchardUse: number | null;
}

export function waterOutlook(a: ClimateAnalysis, water: DistrictWater | null): WaterOutlook | null {
  const b = a.baseline.summary;
  const f = a.future.summary;
  const then = b.waterDeficitMm.mean;
  const fut = f.waterDeficitMm.mean;
  if (!Number.isFinite(then) || !Number.isFinite(fut)) return null;
  const change = fut - then;
  const extra = change * ML_PER_HA_PER_MM;
  const orchardUse = water?.orchards?.mlPerHa ?? null;
  return {
    shortfallThenMm: then,
    shortfallFutureMm: fut,
    shortfallChangeMm: change,
    rainThenMm: b.annualRainMm.mean,
    rainFutureMm: f.annualRainMm.mean,
    extraMlPerHa: extra,
    shareOfOrchardUse: orchardUse && orchardUse > 0 ? extra / orchardUse : null,
  };
}
