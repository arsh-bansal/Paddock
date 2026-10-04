/**
 * Irrigation on orchards and vineyards per district, from the ABS water-use census.
 *
 * Source: ABS, Water Use on Australian Farms, 2020-21, data cube "Agricultural water use and
 * irrigation water sources estimates by 2021 Local Government Areas" (WUAFDCLGA202021.xlsx),
 * Table 1. The ABS produced these LGA figures by concording SA2 estimates, and zeroed cells it had
 * suppressed for confidentiality, so small figures can be understated.
 *
 * Pure: no file access, so it is unit-tested directly. scripts/import-abs-water.ts reads the xlsx.
 */

export interface WaterRow {
  regionCode: string;
  regionLabel: string;
  itemCode: string;
  estimate: number | null;
}

/** ABS item codes (stable across the data cube). */
export const WATER_ITEMS = {
  orchards: { area: 'AGFRUT_AHA_F', watered: 'AGWATRFRUTAHA_F', volume: 'AGWATRFRUTAML_F' },
  vines: { area: 'AGGRAPE_AHA_F', watered: 'AGWATRGRAPAHA_F', volume: 'AGWATRGRAPAML_F' },
} as const;

/** Below this many hectares watered, an ML/ha figure is too noisy to show. */
export const MIN_WATERED_HA = 50;

export interface IrrigationFigures {
  /** Total area grown, ha */
  areaHa: number;
  /** Area irrigated, ha */
  wateredHa: number;
  /** Irrigation water applied over the year, ML */
  volumeMl: number;
  /** Volume applied per irrigated hectare, ML/ha (null when the irrigated area is too small) */
  mlPerHa: number | null;
}

export interface DistrictWater {
  presetId: string;
  lga: string;
  source: string;
  /** Fruit trees, nut trees, plantation or berry fruits */
  orchards: IrrigationFigures | null;
  /** Grapevines */
  vines: IrrigationFigures | null;
}

export const WATER_SOURCE =
  'ABS, Water Use on Australian Farms, 2020-21 (WUAFDCLGA202021, Table 1), Local Government Areas';

function figures(rows: WaterRow[], items: { area: string; watered: string; volume: string }): IrrigationFigures | null {
  const get = (code: string) => {
    const r = rows.find((x) => x.itemCode === code);
    return r && r.estimate != null && Number.isFinite(r.estimate) ? r.estimate : null;
  };
  const area = get(items.area);
  const watered = get(items.watered);
  const volume = get(items.volume);
  if (area == null || watered == null || volume == null || area <= 0) return null;
  return {
    areaHa: Math.round(area),
    wateredHa: Math.round(watered),
    volumeMl: Math.round(volume),
    mlPerHa: watered >= MIN_WATERED_HA ? Math.round((volume / watered) * 10) / 10 : null,
  };
}

export function districtWater(rows: WaterRow[], presetId: string, lga: Record<string, string>): DistrictWater {
  const [code, name] = Object.entries(lga)[0];
  const mine = rows.filter((r) => r.regionCode === code);
  return {
    presetId,
    lga: name,
    source: `${WATER_SOURCE}: ${name}`,
    orchards: figures(mine, WATER_ITEMS.orchards),
    vines: figures(mine, WATER_ITEMS.vines),
  };
}
