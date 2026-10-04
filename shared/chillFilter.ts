/**
 * Pre-verdict, chill-only "suits this block" split for the Step-2 crop picker.
 *
 * A crop suits the block iff the block's FUTURE median chill PORTIONS reach the midpoint of the
 * crop's chill-portions range (the typical cultivar in that class). Crops that don't are NOT hidden:
 * the picker shows them in a separate "struggles here" group with the reason, because a grower
 * deciding what to plant needs to see what's ruled out and why.
 *
 * This is a display split only. It does not call `evaluateCrop` or `rankCrops`. When the future
 * median is non-finite (sparse location), every crop counts as suited so the picker is never empty.
 * Pure: never mutates input and preserves input order within each group.
 */
import type { CropOption } from './crops';

/**
 * Un-rounded midpoint of a crop's chill-portions range. A user crop `[v, v]` gives exactly `v`.
 * null for crops whose winter isn't scored.
 */
export function chillPortionsMidpoint(crop: CropOption): number | null {
  return crop.winter ? (crop.winter.chillPortions[0] + crop.winter.chillPortions[1]) / 2 : null;
}

export function isAppropriateByChill(crop: CropOption, futureMedianChillPortions: number): boolean {
  if (!Number.isFinite(futureMedianChillPortions)) return true; // unavailable -> keep all
  const need = chillPortionsMidpoint(crop);
  if (need == null) return true; // chill isn't scored for this crop, so chill can't rule it out
  return futureMedianChillPortions >= need;
}

export function filterAppropriateByChill(crops: CropOption[], futureMedianChillPortions: number): CropOption[] {
  if (!Number.isFinite(futureMedianChillPortions)) return crops.slice();
  return crops.filter((c) => isAppropriateByChill(c, futureMedianChillPortions));
}

export interface ChillPartition {
  suited: CropOption[];
  struggling: CropOption[];
}

/** Split crops into those a typical future winter suits and those it doesn't. */
export function partitionByChill(crops: CropOption[], futureMedianChillPortions: number): ChillPartition {
  const suited: CropOption[] = [];
  const struggling: CropOption[] = [];
  for (const c of crops) (isAppropriateByChill(c, futureMedianChillPortions) ? suited : struggling).push(c);
  return { suited, struggling };
}
