import { CROP_OPTIONS, defaultRequirement, type CropOption } from '../../shared/crops';

/**
 * Per-crop settings: whether the crop is included, and the chill-hours figure the grower uses for
 * their variety (defaults to the middle of the crop's range). Saved with reports, so the shape is
 * stable: `{ selected, requirement }`.
 */
export type OptionState = Record<string, { selected: boolean; requirement: number }>;

/** Every crop included, each with its default chill-hours figure. */
export function initialOptionState(crops: CropOption[] = CROP_OPTIONS): OptionState {
  return Object.fromEntries(crops.map((c) => [c.id, { selected: true, requirement: defaultRequirement(c) }]));
}
