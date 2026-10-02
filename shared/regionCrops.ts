/**
 * What's grown in each district today, and how the climate results split around it.
 *
 * Data: `shared/regionCrops.data.json`, validated on load (a bad file fails loudly, like the crop
 * database). The current lists are PLACEHOLDERS flagged `indicative: true`; they are meant to be
 * replaced with ABS Agricultural Census commodity data per region.
 *
 * A location maps to a district by preset id, or for a map pin / GPS / coordinates, to the nearest
 * preset within MAX_REGION_KM. Further away than that, there is no "grown here" list and the app
 * shows a single ranked list instead (it never guesses a district).
 *
 * Runtime-agnostic (no Node APIs): used by the planner, the PDF and the server.
 */
import { z } from 'zod';
import type { CropEvaluation } from './seasons';
import { REGION_PRESETS } from './regions';
import raw from './regionCrops.data.json';

/** How far a pin can be from a district centre and still use that district's crop list. */
export const MAX_REGION_KM = 25;

const regionSchema = z.object({
  presetId: z.string().min(1),
  name: z.string().min(1),
  indicative: z.boolean(),
  source: z.string(),
  grownToday: z
    .array(z.object({ cropId: z.string().min(1).nullable(), name: z.string().min(1).max(60) }))
    .min(1),
});

const fileSchema = z
  .object({ regions: z.array(regionSchema) })
  .refine((f) => new Set(f.regions.map((r) => r.presetId)).size === f.regions.length, 'presetId must be unique')
  .refine(
    (f) => f.regions.every((r) => REGION_PRESETS.some((p) => p.id === r.presetId)),
    'every presetId must match a preset in shared/regions.ts',
  );

export type RegionCrops = z.infer<typeof regionSchema>;

export const REGION_CROPS: readonly RegionCrops[] = Object.freeze(fileSchema.parse(raw).regions);

/** Great-circle distance in km. */
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The district crop list for a location, or null when it isn't near a district we have data for. */
export function regionForLocation(loc: { lat: number; lon: number; presetId?: string }): RegionCrops | null {
  if (loc.presetId) {
    const byId = REGION_CROPS.find((r) => r.presetId === loc.presetId);
    if (byId) return byId;
  }
  let best: { region: RegionCrops; km: number } | null = null;
  for (const region of REGION_CROPS) {
    const preset = REGION_PRESETS.find((p) => p.id === region.presetId)!;
    const km = distanceKm(loc.lat, loc.lon, preset.lat, preset.lon);
    if (km <= MAX_REGION_KM && (!best || km < best.km)) best = { region, km };
  }
  return best?.region ?? null;
}

export interface RegionalResults {
  /** Crops grown here today that we can score, in rank order */
  grownToday: CropEvaluation[];
  /** Crops grown here today with no climate data yet (names only) */
  grownNoData: string[];
  /** Other crops whose overall verdict is a good fit or risky, in rank order */
  couldSuit: CropEvaluation[];
  /** Other crops that struggle here (poor fit or not scorable), in rank order */
  struggles: CropEvaluation[];
}

/**
 * Split ranked evaluations around what the district grows today. `ranked` must already be in
 * `rankCrops` order; every group keeps that order. Every evaluation lands in exactly one group.
 */
export function groupForRegion(ranked: CropEvaluation[], region: RegionCrops | null): RegionalResults {
  const grownIds = new Set(region?.grownToday.flatMap((g) => (g.cropId ? [g.cropId] : [])) ?? []);
  const known = new Set(ranked.map((e) => e.id));
  const grownNoData = region
    ? region.grownToday.filter((g) => !g.cropId || !known.has(g.cropId)).map((g) => g.name)
    : [];
  const others = ranked.filter((e) => !grownIds.has(e.id));
  return {
    grownToday: ranked.filter((e) => grownIds.has(e.id)),
    grownNoData,
    couldSuit: others.filter((e) => e.overall === 'viable' || e.overall === 'at-risk'),
    struggles: others.filter((e) => e.overall === 'not-viable' || e.overall === 'no-data'),
  };
}
