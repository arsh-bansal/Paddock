/** Preset orchard districts. Coordinates are approximate town centres. */
export interface RegionPreset {
  id: string;
  name: string;
  district: string;
  lat: number;
  lon: number;
}

export const REGION_PRESETS: RegionPreset[] = [
  { id: 'shepparton', name: 'Shepparton', district: 'Goulburn Valley', lat: -36.38, lon: 145.4 },
  { id: 'cobram', name: 'Cobram', district: 'Goulburn Valley', lat: -35.92, lon: 145.65 },
  { id: 'harcourt', name: 'Harcourt', district: 'Central Victoria', lat: -37.0, lon: 144.26 },
  { id: 'wandin', name: 'Wandin North', district: 'Yarra Valley', lat: -37.77, lon: 145.42 },
  { id: 'bacchus-marsh', name: 'Bacchus Marsh', district: 'Moorabool', lat: -37.67, lon: 144.44 },
  { id: 'swan-hill', name: 'Swan Hill', district: 'Northern Mallee', lat: -35.34, lon: 143.55 },
];

/** Bounding box the API accepts (mainland Australia + Tasmania). */
export const AU_BOUNDS = { latMin: -44, latMax: -10, lonMin: 112, lonMax: 154 };
