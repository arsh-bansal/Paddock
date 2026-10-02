/**
 * Crop options and chill requirements.
 *
 * IMPORTANT — DATA CREDIBILITY:
 * These ranges are INDICATIVE chill-hour classes (Weinberger 0–7.2 °C model) for each crop type,
 * not cultivar-specific figures. Chill requirements vary a lot between cultivars and between
 * published sources. Before demo day, replace `chillHours` with sourced figures (nursery
 * catalogues, Agriculture Victoria, Hort Innovation reports) and fill in `source`.
 * Growers can also type their cultivar's exact requirement into the app.
 */

export interface CropOption {
  id: string;
  crop: string;
  type: string;
  /** Indicative chill-hour range for this class [low, high] */
  chillHours: [number, number];
  /** Heat-related risk worth flagging for this crop (general, non-numeric) */
  heatNote: string;
  /** Where the range came from. Empty string = not yet sourced. */
  source: string;
}

export const CROP_OPTIONS: CropOption[] = [
  {
    id: 'peach-standard',
    crop: 'Peach / nectarine',
    type: 'Standard-chill varieties',
    chillHours: [600, 900],
    heatNote: 'Very hot days during fruit development can reduce fruit size and quality.',
    source: '',
  },
  {
    id: 'peach-low',
    crop: 'Peach / nectarine',
    type: 'Low-chill varieties',
    chillHours: [200, 400],
    heatNote: 'Low-chill types can flower early, which raises spring frost exposure.',
    source: '',
  },
  {
    id: 'apricot',
    crop: 'Apricot',
    type: 'Standard varieties',
    chillHours: [500, 900],
    heatNote: 'Heat during flowering and fruit set can reduce set.',
    source: '',
  },
  {
    id: 'plum-japanese',
    crop: 'Plum',
    type: 'Japanese types',
    chillHours: [400, 800],
    heatNote: 'Generally more heat tolerant than European plums.',
    source: '',
  },
  {
    id: 'plum-european',
    crop: 'Plum',
    type: 'European / prune types',
    chillHours: [800, 1100],
    heatNote: 'Higher chill need makes these the first to struggle as winters warm.',
    source: '',
  },
  {
    id: 'cherry-standard',
    crop: 'Sweet cherry',
    type: 'Standard varieties',
    chillHours: [800, 1200],
    heatNote: 'Hot weather around flowering and fruit set is a key risk, and hot summers can cause doubled fruit the next season.',
    source: '',
  },
  {
    id: 'cherry-low',
    crop: 'Sweet cherry',
    type: 'Low-chill varieties',
    chillHours: [300, 500],
    heatNote: 'Newer low-chill lines; check local trial results before committing.',
    source: '',
  },
  {
    id: 'apple-mainstream',
    crop: 'Apple',
    type: 'Mainstream varieties',
    chillHours: [600, 1000],
    heatNote: 'Fruit sunburn risk rises with more days at or above 35 °C; netting is common.',
    source: '',
  },
  {
    id: 'apple-low',
    crop: 'Apple',
    type: 'Low-chill varieties',
    chillHours: [200, 400],
    heatNote: 'Same sunburn exposure as other apples; market demand may differ.',
    source: '',
  },
  {
    id: 'pear',
    crop: 'European pear',
    type: 'Standard varieties',
    chillHours: [700, 1100],
    heatNote: 'Heat stress and sunburn risk in hot summers.',
    source: '',
  },
];

export function cropLabel(c: CropOption): string {
  return `${c.crop}, ${c.type.toLowerCase()}`;
}

/** Default requirement used for scoring: the middle of the class range. */
export function defaultRequirement(c: CropOption): number {
  return Math.round((c.chillHours[0] + c.chillHours[1]) / 2);
}
