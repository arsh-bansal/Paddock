/**
 * Crop database loader.
 *
 * The crop catalogue now lives as data in `shared/crops.data.json` — adding or editing a crop is a
 * data edit, not a code change. This module imports that JSON at build time, validates it with zod
 * (throwing loudly on bad data so a broken catalogue can never be served silently), and re-exports
 * the unchanged public API: the `CropOption`/`Sourced` interfaces, the `CROP_OPTIONS` constant, and
 * the `cropLabel` / `defaultRequirement` / `hasIndicativeData` helpers.
 *
 * DATA CREDIBILITY. Each per-season block carries a `Sourced { indicative, source }` wrapper. When
 * `indicative` is true the threshold is a rule-of-thumb placeholder still being replaced with a
 * sourced figure; the UI badges those. Per-field sourcing rationale lives in
 * `docs/crop-data-sources.md`, the canonical data contract.
 *
 * RUNTIME NOTE. `shared/` is consumed by Vite, the esbuild server bundle, tsx and vitest, so this
 * module uses no Node-only APIs. The JSON is a static build-time import, inlined by every bundler;
 * `CROP_OPTIONS` is therefore synchronously available (used at render time by the planner/picker).
 */
import { z } from 'zod';
import { CONVERSION_SOURCE, hoursToPortions } from './chillConversion';
import rawCrops from './crops.data.json';

export interface Sourced {
  /** true while the value is a placeholder, not a sourced figure */
  indicative: boolean;
  /** citation or URL; empty while indicative */
  source: string;
}

export interface CropOption {
  id: string;
  crop: string;
  type: string;
  category: 'stone fruit' | 'pome fruit' | 'cherry';
  winter: Sourced & {
    /** chill-hour range for this class (Weinberger 0–7.2 °C model), shown to growers */
    chillHours: [number, number];
    /** chill-portion range (Dynamic Model). THIS is what winter is scored on. */
    chillPortions: [number, number];
    /** true when chillPortions was converted from chillHours rather than sourced directly */
    portionsDerived: boolean;
    /** where chillPortions came from */
    portionsSource: string;
  };
  spring:
    | (Sourced & {
        /** months (1–12) when the crop is usually flowering in Victoria */
        floweringMonths: number[];
        /** minimum temperature (°C) at which open flowers are damaged */
        frostDamageC: number;
      })
    | null;
  summer:
    | (Sourced & {
        /** days ≥35 °C per summer the crop handles before heat risk climbs */
        hotDaysTolerated: number;
      })
    | null;
  /** Plain-language heat risk, shown with results */
  heatNote: string;
}

/**
 * Heat-sensitivity bands → days ≥35 °C tolerated. Mirrors the legacy `HEAT` constants so authors
 * can write a keyword in the JSON instead of a magic number; the loader expands it.
 */
const HEAT = { high: 5, medium: 10, low: 15 } as const;

/** Per-season credibility wrapper. `source` is optional in the JSON and defaults to ''. */
const sourced = z.object({
  indicative: z.boolean(),
  source: z.string().default(''),
});

const cropSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'id must be lowercase alphanumeric/hyphen').max(60),
  crop: z.string().min(1),
  type: z.string().min(1),
  category: z.enum(['stone fruit', 'pome fruit', 'cherry']),
  heatNote: z.string().min(1).max(300),
  winter: sourced.extend({
    chillHours: z
      .tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])
      .refine(([lo, hi]) => lo <= hi, 'chillHours must be [min, max] with min <= max'),
    // Optional: a directly sourced Dynamic Model requirement. When absent it is converted from
    // chillHours (Brunt et al. 2017 Table 1) and flagged as derived.
    chillPortions: z
      .tuple([z.number().nonnegative(), z.number().nonnegative()])
      .refine(([lo, hi]) => lo <= hi, 'chillPortions must be [min, max] with min <= max')
      .optional(),
    portionsSource: z.string().optional(),
  }).refine((w) => !w.chillPortions || Boolean(w.portionsSource), 'chillPortions needs a portionsSource'),
  spring: sourced
    .extend({
      floweringMonths: z.array(z.number().int().min(1).max(12)).min(1),
      frostDamageC: z.number(),
    })
    .nullable(),
  summer: sourced
    .extend({
      // A positive int, or a band keyword expanded to the legacy HEAT numbers.
      hotDaysTolerated: z.union([
        z.number().int().positive(),
        z.enum(['high', 'medium', 'low']).transform((k) => HEAT[k]),
      ]),
    })
    .nullable(),
});

const cropsSchema = z
  .array(cropSchema)
  .min(1)
  .refine((cs) => new Set(cs.map((c) => c.id)).size === cs.length, 'crop ids must be unique');

/**
 * Validate once at module load. A `ZodError` here fails the build, tests, server startup and tsx
 * scripts rather than silently serving a partial catalogue. The validated output is structurally
 * identical to `CropOption`, so the cast is a formality; we keep the hand-written interfaces as the
 * public types so no downstream type identity changes. `Object.freeze` guards the read-only singleton.
 */
/** Fill in the scoring requirement (chill portions), converting from chill hours when not sourced. */
export function withPortions<W extends { chillHours: [number, number]; chillPortions?: [number, number]; portionsSource?: string }>(
  w: W,
): W & { chillPortions: [number, number]; portionsDerived: boolean; portionsSource: string } {
  if (w.chillPortions) return { ...w, chillPortions: w.chillPortions, portionsDerived: false, portionsSource: w.portionsSource ?? '' };
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    ...w,
    chillPortions: [round1(hoursToPortions(w.chillHours[0])), round1(hoursToPortions(w.chillHours[1]))],
    portionsDerived: true,
    portionsSource: CONVERSION_SOURCE,
  };
}

export const CROP_OPTIONS: CropOption[] = Object.freeze(
  cropsSchema.parse(rawCrops).map((c) => ({ ...c, winter: withPortions(c.winter) })),
) as CropOption[];

/** Words that keep their capital letter inside a label (proper adjectives). */
const PROPER = /^(Japanese|European|Chinese|Asian|American)\b/;

/** "Plum, Japanese types", "Peach / nectarine, standard-chill varieties". */
export function cropLabel(c: CropOption): string {
  const type = PROPER.test(c.type) ? c.type : c.type.charAt(0).toLowerCase() + c.type.slice(1);
  return `${c.crop}, ${type}`;
}

/** Default chill-HOURS figure shown in the "your variety needs" box: the middle of the class range. */
export function defaultRequirement(c: CropOption): number {
  return Math.round((c.winter.chillHours[0] + c.winter.chillHours[1]) / 2);
}

/** Default chill-PORTIONS requirement used for scoring: the middle of the portions range. */
export function defaultPortions(c: CropOption): number {
  return Math.round(((c.winter.chillPortions[0] + c.winter.chillPortions[1]) / 2) * 10) / 10;
}

export function hasIndicativeData(c: CropOption): boolean {
  return c.winter.indicative || c.winter.portionsDerived || Boolean(c.spring?.indicative) || Boolean(c.summer?.indicative);
}
