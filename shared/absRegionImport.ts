/**
 * Turn ABS Agricultural Commodities rows into "grown here today" crop lists per district.
 *
 * Source: ABS, Agricultural Commodities, Australia, 2020-21, data cube "Agricultural commodities,
 * Australia and state/territory and ASGS regions" (AGCDCASGS202021.xlsx), Table 1. The 2020-21
 * Agricultural Census was the last the ABS will run, so this is the newest regional crop data.
 *
 * Pure: no file or network access, so it is unit-tested directly. The xlsx reading lives in
 * scripts/import-abs-region-crops.ts.
 */

/** One row of ABS Table 1. */
export interface AbsRow {
  regionCode: string;
  regionLabel: string;
  description: string;
  estimate: number | null;
  /** ABS reliability marker in the RSE column: '', '^', '*', '**' (or a number) */
  rse: string;
}

/**
 * ABS reliability, from the table footnotes:
 *   no marker  relative standard error under 10%
 *   ^          10% to under 25%, use with caution
 *   *          25% to 50%, use with caution
 *   **         over 50%, too unreliable for general use
 */
export type Reliability = 'good' | 'caution' | 'unreliable';

export function reliabilityOf(rse: string): Reliability {
  const r = rse.trim();
  if (r === '**') return 'unreliable';
  if (r === '^' || r === '*') return 'caution';
  return 'good';
}

/** How an ABS commodity maps onto our crop database. cropId null = shown by name, not scored. */
export interface CommodityMap {
  key: string;
  name: string;
  cropId: string | null;
  unit: 'trees' | 'ha';
  /** Description fragments (ABS Table 1) summed for the total. */
  total: string[];
  /** Fragments for the not-yet-bearing part (new plantings). */
  notBearing: string[];
}

export const COMMODITIES: CommodityMap[] = [
  { key: 'apples', name: 'Apples', cropId: 'apple-mainstream', unit: 'trees',
    total: ['Other orchard fruit - Apples - Total trees'], notBearing: ['Other orchard fruit - Apples - Trees not yet of bearing age'] },
  { key: 'pears', name: 'Pears', cropId: 'pear', unit: 'trees',
    total: ['Pears (including Nashi) - Total trees'], notBearing: ['Pears (including Nashi) - Trees not yet of bearing age'] },
  { key: 'cherries', name: 'Cherries', cropId: 'cherry-standard', unit: 'trees',
    total: ['Stone fruit - Cherries - Total trees'], notBearing: ['Stone fruit - Cherries - Trees not yet of bearing age'] },
  { key: 'peaches', name: 'Peaches and nectarines', cropId: 'peach-standard', unit: 'trees',
    total: ['Stone fruit - Peaches - Total trees', 'Stone fruit - Nectarines - Total trees'],
    notBearing: ['Stone fruit - Peaches - Trees not yet of bearing age', 'Stone fruit - Nectarines - Trees not yet of bearing age'] },
  { key: 'other-stone', name: 'Other stone fruit (apricots, plums)', cropId: null, unit: 'trees',
    total: ['Stone fruit - All other stone fruit - Total trees'], notBearing: ['Stone fruit - All other stone fruit - Trees not yet of bearing age'] },
  { key: 'almonds', name: 'Almonds', cropId: 'almond', unit: 'trees',
    total: ['Nuts - Almonds - Total trees'], notBearing: ['Nuts - Almonds - Trees not yet of bearing age'] },
  { key: 'other-nuts', name: 'Other nuts (e.g. walnuts, pistachios)', cropId: null, unit: 'trees',
    total: ['Nuts - All other nuts n.e.c. - Total trees'], notBearing: ['Nuts - All other nuts n.e.c. - Trees not yet of bearing age'] },
  { key: 'olives', name: 'Olives', cropId: null, unit: 'trees',
    total: ['Other orchard fruit - Olives - Total trees'], notBearing: ['Other orchard fruit - Olives - Trees not yet of bearing age'] },
  { key: 'oranges', name: 'Oranges', cropId: null, unit: 'trees',
    total: ['Citrus fruit - Oranges - Total trees'], notBearing: ['Citrus fruit - Oranges - Trees not yet of bearing age'] },
  { key: 'mandarins', name: 'Mandarins', cropId: null, unit: 'trees',
    total: ['Citrus fruit - Mandarins - Total trees'], notBearing: ['Citrus fruit - Mandarins - Trees not yet of bearing age'] },
  { key: 'other-orchard', name: 'Other orchard fruit', cropId: null, unit: 'trees',
    total: ['Other orchard fruit - All other orchard fruit n.e.c. - Total trees'], notBearing: ['Other orchard fruit - All other orchard fruit n.e.c. - Trees not yet of bearing age'] },
  { key: 'wine-grapes', name: 'Wine grapes', cropId: 'grape', unit: 'ha',
    total: ['Grapes for wine production - Total area'], notBearing: ['Grapes for wine production - Area not yet of bearing age'] },
  { key: 'other-grapes', name: 'Table and dried grapes', cropId: 'grape', unit: 'ha',
    total: ['Grapes for all other uses - Total area'], notBearing: ['Grapes for all other uses - Area not yet of bearing age'] },
  { key: 'strawberries', name: 'Strawberries', cropId: null, unit: 'ha',
    total: ['Berry fruit - Strawberries - Area of bearing age'], notBearing: [] },
  { key: 'other-berries', name: 'Other berries (e.g. blueberries, raspberries)', cropId: null, unit: 'ha',
    total: ['Berry fruit - All other berries - Total area'], notBearing: ['Berry fruit - All other berries - Area not yet bearing'] },
];

/** A crop counts as "grown here" from this size up (commercial plantings, not a few backyard trees). */
export const MIN_TREES = 10_000;
export const MIN_HECTARES = 20;

export interface District {
  presetId: string;
  name: string;
  /** SA2 code -> SA2 name */
  sa2: Record<string, string>;
}

export interface GrownItem {
  cropId: string | null;
  name: string;
  amount: number;
  unit: 'trees' | 'ha';
  /** Share of the amount not yet bearing (new plantings), 0-1, or null if not published */
  newShare: number | null;
  /** true when any figure behind this item carries an ABS "use with caution" marker */
  caution: boolean;
}

export interface DistrictCrops {
  presetId: string;
  name: string;
  indicative: false;
  source: string;
  sa2: string[];
  grownToday: GrownItem[];
  /** Shown when the district has little or no commercial fruit growing */
  note?: string;
}

export const SOURCE =
  'ABS, Agricultural Commodities, Australia, 2020-21 (AGCDCASGS202021, Table 1), Statistical Area 2 regions';

/** Aggregate one district. Figures marked too unreliable (**) are left out entirely. */
export function districtCrops(rows: AbsRow[], d: District): DistrictCrops {
  const codes = new Set(Object.keys(d.sa2));
  const mine = rows.filter((r) => codes.has(r.regionCode));

  const sum = (fragments: string[]) => {
    let value = 0;
    let caution = false;
    let unreliable = false;
    let found = false;
    for (const f of fragments) {
      for (const r of mine) {
        if (!r.description.includes(f) || r.estimate == null || !Number.isFinite(r.estimate)) continue;
        found = true;
        const rel = reliabilityOf(r.rse);
        if (rel === 'unreliable') {
          unreliable = true;
          continue;
        }
        if (rel === 'caution') caution = true;
        value += r.estimate;
      }
    }
    return { value, caution, unreliable, found };
  };

  const items: GrownItem[] = [];
  for (const c of COMMODITIES) {
    const total = sum(c.total);
    const min = c.unit === 'trees' ? MIN_TREES : MIN_HECTARES;
    if (!total.found || total.value < min) continue;
    const nb = c.notBearing.length ? sum(c.notBearing) : null;
    items.push({
      cropId: c.cropId,
      name: c.name,
      amount: Math.round(total.value),
      unit: c.unit,
      newShare: nb && nb.found && total.value > 0 ? Math.min(1, nb.value / total.value) : null,
      caution: total.caution,
    });
  }
  // Largest first within each unit; tree crops before area crops.
  items.sort((a, b) => (a.unit === b.unit ? b.amount - a.amount : a.unit === 'trees' ? -1 : 1));

  return {
    presetId: d.presetId,
    name: d.name,
    indicative: false,
    source: `${SOURCE}: ${Object.values(d.sa2).join(', ')}`,
    sa2: Object.keys(d.sa2),
    grownToday: items,
    ...(items.length === 0
      ? { note: `ABS 2020-21 records little commercial fruit growing here (no crop over ${MIN_TREES.toLocaleString('en-AU')} trees or ${MIN_HECTARES} ha).` }
      : {}),
  };
}
