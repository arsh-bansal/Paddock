/**
 * Crop database (interim). Huu owns the sourced version of this file.
 *
 * IMPORTANT — DATA CREDIBILITY
 * Every threshold below is an INDICATIVE PLACEHOLDER (indicative: true, source: '') so the
 * season engine can be built and demoed. They are crop-class rules of thumb, not cultivar
 * figures. Replace each with a sourced value (nursery catalogues, Agriculture Victoria,
 * Hort Innovation, university extension), set indicative: false and fill in `source`.
 * If a value can't be sourced, set that season to null: the app shows "no data" instead of guessing.
 *
 * Placeholder rules used here:
 *  - spring.frostDamageC = -2 °C for every crop: a common rule-of-thumb critical temperature
 *    for open flowers. Real values differ by crop and bloom stage.
 *  - summer.hotDaysTolerated: app-defined bands by heat sensitivity (high 5, medium 10, low 15
 *    days ≥35 °C per summer). These are NOT published crop tolerances.
 */

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
    /** chill-hour range for this class (Weinberger 0–7.2 °C model) */
    chillHours: [number, number];
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

const PLACEHOLDER: Sourced = { indicative: true, source: '' };
const HEAT = { high: 5, medium: 10, low: 15 } as const;

export const CROP_OPTIONS: CropOption[] = [
  {
    id: 'peach-standard', crop: 'Peach / nectarine', type: 'Standard-chill varieties', category: 'stone fruit',
    winter: { chillHours: [600, 900], ...PLACEHOLDER },
    spring: { floweringMonths: [8, 9], frostDamageC: -2, ...PLACEHOLDER },
    summer: { hotDaysTolerated: HEAT.medium, ...PLACEHOLDER },
    heatNote: 'Very hot days during fruit development can reduce fruit size and quality.',
  },
  {
    id: 'peach-low', crop: 'Peach / nectarine', type: 'Low-chill varieties', category: 'stone fruit',
    winter: { chillHours: [200, 400], ...PLACEHOLDER },
    spring: { floweringMonths: [7, 8], frostDamageC: -2, ...PLACEHOLDER },
    summer: { hotDaysTolerated: HEAT.medium, ...PLACEHOLDER },
    heatNote: 'Low-chill types can flower early, which raises spring frost exposure.',
  },
  {
    id: 'apricot', crop: 'Apricot', type: 'Standard varieties', category: 'stone fruit',
    winter: { chillHours: [500, 900], ...PLACEHOLDER },
    spring: { floweringMonths: [8], frostDamageC: -2, ...PLACEHOLDER },
    summer: { hotDaysTolerated: HEAT.medium, ...PLACEHOLDER },
    heatNote: 'Flowers early, so spring frost is often a bigger risk than summer heat.',
  },
  {
    id: 'plum-japanese', crop: 'Plum', type: 'Japanese types', category: 'stone fruit',
    winter: { chillHours: [400, 800], ...PLACEHOLDER },
    spring: { floweringMonths: [8, 9], frostDamageC: -2, ...PLACEHOLDER },
    summer: { hotDaysTolerated: HEAT.low, ...PLACEHOLDER },
    heatNote: 'Generally more heat tolerant than European plums.',
  },
  {
    id: 'plum-european', crop: 'Plum', type: 'European / prune types', category: 'stone fruit',
    winter: { chillHours: [800, 1100], ...PLACEHOLDER },
    spring: { floweringMonths: [9], frostDamageC: -2, ...PLACEHOLDER },
    summer: { hotDaysTolerated: HEAT.medium, ...PLACEHOLDER },
    heatNote: 'Higher chill need makes these the first to struggle as winters warm.',
  },
  {
    id: 'cherry-standard', crop: 'Sweet cherry', type: 'Standard varieties', category: 'cherry',
    winter: { chillHours: [800, 1200], ...PLACEHOLDER },
    spring: { floweringMonths: [9, 10], frostDamageC: -2, ...PLACEHOLDER },
    summer: { hotDaysTolerated: HEAT.high, ...PLACEHOLDER },
    heatNote: 'Hot weather around flowering and fruit set is a key risk, and hot summers can cause doubled fruit the next season.',
  },
  {
    id: 'cherry-low', crop: 'Sweet cherry', type: 'Low-chill varieties', category: 'cherry',
    winter: { chillHours: [300, 500], ...PLACEHOLDER },
    spring: { floweringMonths: [8, 9], frostDamageC: -2, ...PLACEHOLDER },
    summer: { hotDaysTolerated: HEAT.high, ...PLACEHOLDER },
    heatNote: 'Newer low-chill lines; check local trial results before committing.',
  },
  {
    id: 'apple-mainstream', crop: 'Apple', type: 'Mainstream varieties', category: 'pome fruit',
    winter: { chillHours: [600, 1000], ...PLACEHOLDER },
    spring: { floweringMonths: [9, 10], frostDamageC: -2, ...PLACEHOLDER },
    summer: { hotDaysTolerated: HEAT.high, ...PLACEHOLDER },
    heatNote: 'Fruit sunburn risk rises with more days at or above 35 °C; netting is common.',
  },
  {
    id: 'apple-low', crop: 'Apple', type: 'Low-chill varieties', category: 'pome fruit',
    winter: { chillHours: [200, 400], ...PLACEHOLDER },
    spring: { floweringMonths: [8, 9], frostDamageC: -2, ...PLACEHOLDER },
    summer: { hotDaysTolerated: HEAT.high, ...PLACEHOLDER },
    heatNote: 'Same sunburn exposure as other apples; market demand may differ.',
  },
  {
    id: 'pear', crop: 'European pear', type: 'Standard varieties', category: 'pome fruit',
    winter: { chillHours: [700, 1100], ...PLACEHOLDER },
    spring: { floweringMonths: [9], frostDamageC: -2, ...PLACEHOLDER },
    summer: { hotDaysTolerated: HEAT.medium, ...PLACEHOLDER },
    heatNote: 'Heat stress and sunburn risk in hot summers.',
  },
];

export function cropLabel(c: CropOption): string {
  return `${c.crop}, ${c.type.toLowerCase()}`;
}

/** Default chill requirement used for scoring: the middle of the class range. */
export function defaultRequirement(c: CropOption): number {
  return Math.round((c.winter.chillHours[0] + c.winter.chillHours[1]) / 2);
}

export function hasIndicativeData(c: CropOption): boolean {
  return c.winter.indicative || Boolean(c.spring?.indicative) || Boolean(c.summer?.indicative);
}
