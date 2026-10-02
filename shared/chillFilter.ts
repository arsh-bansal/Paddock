/**
 * Pre-verdict, chill-only "appropriate for this block" pre-filter.
 *
 * This is a lightweight DISPLAY filter for the Step-2 crop picker, NOT a verdict: it keeps a crop iff
 * the block's FUTURE median chill reaches the MIDPOINT of the crop's `[min, max]` chill range (the
 * chill at which the typical cultivar in that class performs, rather than the bare minimum that only
 * the easiest cultivar needs). It deliberately does NOT call `evaluateCrop` or `rankCrops` — it is a
 * distinct stage from `shared/appropriateCrops.ts` (which filters post-verdict `CropEvaluation[]`).
 *
 * When the future median is NaN / non-finite (a sparse location → `summarise([])` yields `NaN`), every
 * crop is treated as appropriate so the picker is never mysteriously empty (the caller shows a note).
 *
 * Runtime-agnostic: pure array work over in-memory values, no `fs` or Node builtins, so it behaves
 * identically under Vite, esbuild, tsx and vitest. Pure: it never mutates its input and preserves input
 * order (the output is a subsequence of the input — none added, reordered, or duplicated).
 */
import type { CropOption } from './crops';

/**
 * The UN-ROUNDED midpoint of a crop's `[min, max]` chill range — the chosen "appropriate" cut-point.
 * For a user crop stored as `[v, v]` this is exactly `v`, so user-crop behaviour is unchanged from the
 * old minimum rule. Kept private (not exported): no public-API change and no new import for callers.
 * Deliberately independent of `defaultRequirement` in `shared/crops.ts` (which rounds and lives in a
 * forbidden file) so a `.5` midpoint keeps exact boundary semantics.
 */
function chillMidpoint(crop: CropOption): number {
  return (crop.winter.chillHours[0] + crop.winter.chillHours[1]) / 2;
}

/**
 * Per-crop predicate: is this crop appropriate for a block with the given future median chill?
 * A non-finite median (NaN / ±Infinity) is treated as "unavailable", in which case the crop is kept
 * (show-all fallback). Otherwise keep iff median >= the crop's chill-range midpoint.
 */
export function isAppropriateByChill(
  crop: CropOption,
  futureMedianChillHours: number,
): boolean {
  if (!Number.isFinite(futureMedianChillHours)) return true; // unavailable → keep all
  return futureMedianChillHours >= chillMidpoint(crop);
}

/**
 * Pure. Returns only the crops whose chill-range midpoint is met by the block's future median chill,
 * preserving input order. A NaN / non-finite median returns the full input list (as a copy) so the
 * picker is never empty. No mutation of the input array or its elements; the returned array is always
 * a NEW array reference.
 */
export function filterAppropriateByChill(
  crops: CropOption[],
  futureMedianChillHours: number,
): CropOption[] {
  if (!Number.isFinite(futureMedianChillHours)) return crops.slice(); // show all; copy keeps it pure
  return crops.filter((crop) => isAppropriateByChill(crop, futureMedianChillHours));
}

