import { percentile } from './chill';
import type { Verdict } from './types';

/** Share of winters (0–100) where seasonal chill met the requirement. */
export function pctMet(values: number[], requirement: number): number {
  if (values.length === 0) return 0;
  return (values.filter((v) => v >= requirement).length / values.length) * 100;
}

/**
 * Verdict based on "safe winter chill" (10th percentile of winters):
 *  - viable:     even a poor (1-in-10) winter meets the requirement
 *  - at-risk:    a typical winter meets it, but more than 1 in 10 don't
 *  - not-viable: a typical winter doesn't meet it
 */
export function verdictFor(values: number[], requirement: number): Verdict {
  const safe = percentile(values, 10);
  const median = percentile(values, 50);
  if (safe >= requirement) return 'viable';
  if (median >= requirement) return 'at-risk';
  return 'not-viable';
}
