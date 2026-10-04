import { CROP_OPTIONS, defaultRequirement, type CropOption } from '../../shared/crops';
import type { FinanceInputs } from '../../shared/finance';

/**
 * Per-crop settings: whether the crop is included, and the chill-hours figure the grower uses for
 * their variety (defaults to the middle of the crop's range), plus their own money figures if they
 * entered any. Saved with reports; `finance` is optional so older saved reports still load.
 */
export type OptionState = Record<string, { selected: boolean; requirement: number; finance?: FinanceInputs }>;

/** Every crop included, each with its default chill-hours figure. */
export function initialOptionState(crops: CropOption[] = CROP_OPTIONS): OptionState {
  return Object.fromEntries(crops.map((c) => [c.id, { selected: true, requirement: defaultRequirement(c) }]));
}
