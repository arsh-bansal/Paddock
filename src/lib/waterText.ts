import { REGION_WATER, type DistrictWater, type WaterOutlook } from '../../shared/regionWater';

/*
 * Plain-English water wording, shared by the screen and the PDF so they can't disagree.
 * ASCII-safe (no ≥ or typographic minus) so it renders in the PDF's built-in fonts.
 */

const n0 = (v: number) => Math.round(v).toLocaleString('en-AU');
const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-AU', { maximumFractionDigits: 1 });
const roundHa = (v: number) => (v >= 1000 ? Math.round(v / 100) * 100 : Math.round(v / 10) * 10);

/** What farms here use today (ABS), or null when there's no local data worth showing. */
export function todayText(w: DistrictWater | null): string | null {
  const o = w?.orchards;
  if (!w || !o || o.mlPerHa == null) return null;
  const pct = o.areaHa > 0 ? Math.round((o.wateredHa / o.areaHa) * 100) : null;
  let text =
    `Orchards in ${w.lga} (fruit, nut and berry) cover about ${n0(roundHa(o.areaHa))} ha` +
    `${pct != null ? `, ${pct}% irrigated` : ''}, and applied about ${n1(o.mlPerHa)} ML of irrigation water per hectare in 2020-21.`;
  const v = w.vines;
  if (v && v.mlPerHa != null) text += ` Vineyards applied about ${n1(v.mlPerHa)} ML/ha across ${n0(roundHa(v.areaHa))} ha.`;
  return text;
}

/** How the climate's water shortfall changes, with the indicative ML/ha. */
export function outlookText(o: WaterOutlook, period: readonly [number, number]): string {
  const dir = o.shortfallChangeMm >= 0 ? 'grows' : 'shrinks';
  const change = Math.abs(o.shortfallChangeMm);
  let text =
    `The yearly gap between evaporation and rain ${dir} from about ${n0(o.shortfallThenMm)} mm to ${n0(o.shortfallFutureMm)} mm ` +
    `in ${period[0]}-${period[1]} (${o.shortfallChangeMm >= 0 ? '+' : '-'}${n0(change)} mm).`;
  if (o.shortfallChangeMm > 0) {
    text += ` If irrigation has to make that up, that's roughly ${n1(o.extraMlPerHa)} ML more per hectare each year`;
    text += o.shareOfOrchardUse != null ? `, about ${Math.round(o.shareOfOrchardUse * 100)}% on top of what orchards here use today.` : '.';
  }
  return text;
}

export const WATER_CAVEAT =
  'Irrigation figures are ABS estimates for 2020-21, a season the ABS describes as wetter and cooler than recent years, so typical use is likely higher. ' +
  'The extra-water figure is indicative: it uses a standard evaporation estimate minus rainfall, while real orchard needs depend on the crop, canopy and soil.';

/** Orchard irrigation (ML/ha) for every district with enough data, highest first, for comparison. */
export function districtComparison(): { presetId: string; lga: string; mlPerHa: number }[] {
  return REGION_WATER.flatMap((w) => (w.orchards?.mlPerHa != null ? [{ presetId: w.presetId, lga: w.lga, mlPerHa: w.orchards.mlPerHa }] : [])).sort(
    (a, b) => b.mlPerHa - a.mlPerHa,
  );
}
