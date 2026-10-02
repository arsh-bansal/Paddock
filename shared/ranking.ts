/**
 * Pure, deterministic best-fit-first ordering of already-evaluated crops.
 *
 * `rankCrops` takes the `CropEvaluation[]` produced by `evaluateCrop` (see `shared/seasons.ts`) and
 * returns a new array ordered best-fit-first. It performs no I/O and does not call `evaluateCrop`,
 * so it is trivially unit-testable and reusable by the planner, the PDF report and `topCrop`.
 *
 * The ordering is a *superset* of the existing verdict sort in `OptionResults.tsx`: it first buckets
 * by overall verdict (so it never contradicts the card's own sort) and only refines *within* a
 * bucket. See design section 4.5.
 */
import type { CropEvaluation, SeasonResult, SeasonVerdict } from './seasons';

/** Verdict bucket order, best first. Matches the RANK/SEVERITY ordering used elsewhere. */
const VERDICT_BUCKET: Record<SeasonVerdict, number> = {
  viable: 0,
  'at-risk': 1,
  'not-viable': 2,
  'no-data': 3,
};

/**
 * Normalise one season to a 0–1 "comfort" using the engine's own numbers (no new thresholds).
 * Higher is safer. Returns null for seasons with no usable data so they are skipped in the min.
 *  - winter: `future` = % of winters meeting the chill need (higher is better).
 *  - spring: `future` = % of years with a damaging frost in flowering (lower is better).
 *  - summer: `future` = hot days in a typical summer vs the tolerated `threshold` (lower is better).
 */
function seasonComfort(s: SeasonResult): number | null {
  if (s.verdict === 'no-data' || s.future == null) return null;
  switch (s.season) {
    case 'winter':
      return clamp01(s.future / 100);
    case 'spring':
      return clamp01(1 - s.future / 100);
    case 'summer': {
      // Comfort relative to tolerance: at/under tolerance is comfortable, well over is not.
      const limit = s.threshold;
      if (limit == null || limit <= 0) return null;
      return clamp01(1 - s.future / limit);
    }
    default:
      return null;
  }
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * A crop is judged by its worst season (consistent with `overallVerdict`): the minimum comfort
 * across the seasons that have data. Crops with no usable season score as the least comfortable.
 */
function worstSeasonComfort(c: CropEvaluation): number {
  const comforts = c.seasons.map(seasonComfort).filter((v): v is number => v != null);
  return comforts.length ? Math.min(...comforts) : -1;
}

/** Count of seasons whose verdict rests on indicative (unsourced) data. Fewer is more credible. */
function indicativeSeasonCount(c: CropEvaluation): number {
  return c.seasons.filter((s) => s.indicative).length;
}

/**
 * Deterministic best-fit-first ordering. Ordered comparators; the first non-zero decides:
 *  1. overall verdict bucket (viable < at-risk < not-viable < no-data)
 *  2. within a bucket, higher worst-season comfort (safer first)
 *  3. fewer indicative seasons first (prefer sourced data)
 *  4. stable final tie-break: label ascending, then id ascending
 */
export function rankCrops(evaluations: CropEvaluation[]): CropEvaluation[] {
  return [...evaluations].sort((a, b) => {
    const bucket = VERDICT_BUCKET[a.overall] - VERDICT_BUCKET[b.overall];
    if (bucket !== 0) return bucket;

    const comfort = worstSeasonComfort(b) - worstSeasonComfort(a); // higher comfort first
    if (comfort !== 0) return comfort;

    const indicative = indicativeSeasonCount(a) - indicativeSeasonCount(b); // fewer first
    if (indicative !== 0) return indicative;

    const byLabel = a.label.localeCompare(b.label);
    if (byLabel !== 0) return byLabel;

    return a.id.localeCompare(b.id);
  });
}
