/**
 * Pure, deterministic "appropriate crops" filter — the narrow slice that drives the planner's
 * dynamic crop list and feeds the ranking owner's work.
 *
 * `appropriateCrops` takes the `CropEvaluation[]` produced by `evaluateCrop` (see `shared/seasons.ts`)
 * and returns only the crops whose overall verdict is `viable` or `at-risk`, i.e. the crops that are
 * an appropriate fit for the block. It performs no I/O, calls neither `evaluateCrop` nor `rankCrops`,
 * and does NOT impose any ordering — input order is preserved verbatim. Ordering is the ranking
 * owner's responsibility (`shared/ranking.ts`), so this module stays deliberately separate from it.
 *
 * Runtime-agnostic: pure array filtering over in-memory values, no `fs` or Node builtins, so it works
 * identically under Vite, esbuild, tsx and vitest.
 */
import type { CropEvaluation, SeasonVerdict } from './seasons';

/** Verdicts that count as an appropriate fit for the block. Single source of truth for the cut line. */
export const APPROPRIATE_VERDICTS: ReadonlySet<SeasonVerdict> = new Set<SeasonVerdict>([
  'viable',
  'at-risk',
]);

/**
 * Pure. Returns only the crops whose overall verdict is `viable` or `at-risk`, preserving the input
 * order. A single-pass filter guarantees stability and that the output is a subsequence of the input
 * (no crop added, reordered, or duplicated). `not-viable` and `no-data` crops are excluded.
 */
export function appropriateCrops(evaluations: CropEvaluation[]): CropEvaluation[] {
  return evaluations.filter((crop) => APPROPRIATE_VERDICTS.has(crop.overall));
}
