/**
 * Chill Hours <-> Chill Portions conversion.
 *
 * Winter is SCORED in Chill Portions (Dynamic Model), the measure Australian fruit research uses
 * (Hort Innovation, Darbyshire et al.). It is also less inflated by warming than Chill Hours: on
 * real Shepparton data, projected chill hours fall ~25% but chill portions only ~10%.
 *
 * Most published crop requirements are in Chill Hours, so they are converted with the cross-model
 * equivalence table in:
 *   Brunt, C., Darbyshire, R., Nissen, R., Chapman, S. (2017). "Chill and heat requirements: from
 *   dormancy to flowering." Australian Cherry Production Guide, Hort Innovation. Table 1.
 *
 *   Rating          Chill Portions   Chill Hours
 *   Low             20–40            300–500
 *   Low–moderate    40–50            500–750
 *   Moderate–high   50–60            750–1000
 *   High            60–80            1000–1500
 *
 * The table maps rating bands, not exact equivalents, and the true ratio varies by site and
 * season, so converted requirements are always flagged as converted (indicative) in the app.
 * Below 300 h we scale linearly to zero; above 1500 h we continue the High-band slope.
 */

/** [chill hours, chill portions] anchor points from Brunt et al. (2017) Table 1. */
export const CONVERSION_ANCHORS: readonly (readonly [number, number])[] = [
  [0, 0],
  [300, 20],
  [500, 40],
  [750, 50],
  [1000, 60],
  [1500, 80],
];

export const CONVERSION_SOURCE =
  'Converted from chill hours using Brunt et al. (2017), Australian Cherry Production Guide (Hort Innovation), Table 1';

function interpolate(x: number, from: 0 | 1, to: 0 | 1): number {
  const pts = CONVERSION_ANCHORS;
  if (!Number.isFinite(x) || x <= 0) return 0;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    if (x <= b[from]) return a[to] + ((x - a[from]) / (b[from] - a[from])) * (b[to] - a[to]);
  }
  // Beyond the last anchor: continue the final segment's slope.
  const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]];
  return b[to] + ((x - b[from]) / (b[from] - a[from])) * (b[to] - a[to]);
}

export function hoursToPortions(hours: number): number {
  return interpolate(hours, 0, 1);
}

export function portionsToHours(portions: number): number {
  return interpolate(portions, 1, 0);
}
