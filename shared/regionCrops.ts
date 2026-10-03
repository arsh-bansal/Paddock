/**
 * What's grown in each district today, and how the climate results split around it.
 *
 * Data: `shared/regionCrops.data.json`, GENERATED from the ABS Agricultural Commodities 2020-21
 * data cube by `npm run import:abs` (scripts/import-abs-region-crops.ts), and validated on load (a
 * bad file fails loudly, like the crop database).
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

const grownItemSchema = z.object({
  cropId: z.string().min(1).nullable(),
  name: z.string().min(1).max(60),
  /** ABS figure: number of trees or hectares (absent for hand-written lists) */
  amount: z.number().nonnegative().optional(),
  unit: z.enum(['trees', 'ha']).optional(),
  /** Share of the amount not yet bearing (new plantings), 0-1 */
  newShare: z.number().min(0).max(1).nullable().optional(),
  /** ABS "use with caution" estimate (relative standard error 10-50%) */
  caution: z.boolean().optional(),
});

const regionSchema = z.object({
  presetId: z.string().min(1),
  name: z.string().min(1),
  indicative: z.boolean(),
  source: z.string(),
  sa2: z.array(z.string()).optional(),
  /** May be empty when the district has little commercial fruit growing; then `note` says so. */
  grownToday: z.array(grownItemSchema),
  note: z.string().optional(),
});

const fileSchema = z
  .object({ regions: z.array(regionSchema) })
  .refine((f) => new Set(f.regions.map((r) => r.presetId)).size === f.regions.length, 'presetId must be unique')
  .refine(
    (f) => f.regions.every((r) => REGION_PRESETS.some((p) => p.id === r.presetId)),
    'every presetId must match a preset in shared/regions.ts',
  );

export type RegionCrops = z.infer<typeof regionSchema>;
export type GrownItem = z.infer<typeof grownItemSchema>;

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

/** Position of a crop in the district list (first mention), for size ordering. */
function listIndex(region: RegionCrops | null, cropId: string): number {
  const i = region?.grownToday.findIndex((g) => g.cropId === cropId) ?? -1;
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

export interface RegionalResults {
  /** Crops grown here today that we can score, largest planting first (the district list's order) */
  grownToday: CropEvaluation[];
  /** Crops grown here today with no climate data yet */
  grownNoData: GrownItem[];
  /** Other crops whose overall verdict is a good fit or risky, in rank order */
  couldSuit: CropEvaluation[];
  /** Other crops that struggle here (poor fit or not scorable), in rank order */
  struggles: CropEvaluation[];
}

/**
 * Split ranked evaluations around what the district grows today. `ranked` must already be in
 * `rankCrops` order. "Grown today" follows the district list (largest planting first: it's about
 * what matters locally); the other groups keep rank order. Every evaluation lands in exactly one group.
 */
export function groupForRegion(ranked: CropEvaluation[], region: RegionCrops | null): RegionalResults {
  const grownIds = new Set(region?.grownToday.flatMap((g) => (g.cropId ? [g.cropId] : [])) ?? []);
  const known = new Set(ranked.map((e) => e.id));
  const grownNoData = region ? region.grownToday.filter((g) => !g.cropId || !known.has(g.cropId)) : [];
  const others = ranked.filter((e) => !grownIds.has(e.id));
  return {
    grownToday: ranked
      .filter((e) => grownIds.has(e.id))
      .sort((a, b) => listIndex(region, a.id) - listIndex(region, b.id)),
    grownNoData,
    couldSuit: others.filter((e) => e.overall === 'viable' || e.overall === 'at-risk'),
    struggles: others.filter((e) => e.overall === 'not-viable' || e.overall === 'no-data'),
  };
}

/** The district's ABS figures for one of our crops (several items can map to one crop, e.g. grapes). */
export function grownFor(region: RegionCrops | null, cropId: string): GrownItem[] {
  return region?.grownToday.filter((g) => g.cropId === cropId) ?? [];
}

/** Round to 2 significant figures for display: 2,084,796 -> "about 2.1 million trees". */
export function formatAmount(amount: number, unit: 'trees' | 'ha'): string {
  if (amount <= 0) return unit === 'trees' ? 'no trees' : '0 ha';
  const digits = Math.floor(Math.log10(amount)) + 1;
  const rounded = digits <= 2 ? Math.round(amount) : Math.round(amount / 10 ** (digits - 2)) * 10 ** (digits - 2);
  const text =
    rounded >= 1_000_000
      ? `${(rounded / 1_000_000).toLocaleString('en-AU', { maximumFractionDigits: 1 })} million`
      : rounded.toLocaleString('en-AU');
  return `about ${text} ${unit === 'trees' ? 'trees' : 'ha'}`;
}

/** "about 2.1 million trees, 11% newly planted" */
export function describeGrown(g: GrownItem): string | null {
  if (g.amount == null || !g.unit) return null;
  const share = g.newShare != null && g.newShare >= 0.05 ? `, ${Math.round(g.newShare * 100)}% newly planted` : '';
  return `${formatAmount(g.amount, g.unit)}${share}`;
}
