import { CROP_OPTIONS, defaultRequirement, type CropOption } from '../../shared/crops';
import { isUserCrop } from '../lib/userCrops';

export type OptionState = Record<string, { selected: boolean; requirement: number }>;

/**
 * Build the initial "consider all crops" state. Defaults to the built-in `CROP_OPTIONS` so existing
 * no-arg callers (and `tests/savedReports.test.ts`) keep working; pass the combined list to also seed
 * user-crop ids. Every crop is selected and seeded with its default chill requirement.
 */
export function initialOptionState(crops: CropOption[] = CROP_OPTIONS): OptionState {
  return Object.fromEntries(
    crops.map((c) => [c.id, { selected: true, requirement: defaultRequirement(c) }]),
  );
}

interface Props {
  /** The combined crop list (built-ins + user crops), already narrowed by the Step-2 chill filter when
   *  a block's climate is known. Defaults to built-ins for safety (no-arg callers/tests stay green). */
  crops?: CropOption[];
  value: OptionState;
  onChange: (next: OptionState) => void;
  /**
   * Why the given `crops` list looks the way it does, so the picker can show the right message:
   *  - 'pre-location' (default): no block climate yet → showing all crops + a hint to pick a location.
   *  - 'filtered': climate known and the chill filter has been applied; an empty list means no crop's
   *    minimum chill is low enough for this block (show the empty-state NOTE, not a blank picker).
   * This is a DISPLAY concern only; it never changes which crops are passed in.
   */
  filterState?: 'pre-location' | 'filtered';
}

export function OptionPicker({
  crops = CROP_OPTIONS,
  value,
  onChange,
  filterState = 'pre-location',
}: Props) {
  const update = (id: string, patch: Partial<OptionState[string]>) => onChange({ ...value, [id]: { ...value[id], ...patch } });

  // (a) No block climate yet → a PLACEHOLDER MESSAGE ONLY. No crop list, no chill-requirement inputs,
  // no footer paragraph. The crop list is a RESULT of picking a location, not something to browse
  // before one is chosen (addendum A3).
  if (filterState === 'pre-location') {
    return (
      <p className="rounded-lg bg-paper px-4 py-3 text-muted">
        Pick a location above to see which crops suit your block.
      </p>
    );
  }

  // (b) Climate known but the chill filter left nothing: show a NOTE instead of an empty picker.
  if (crops.length === 0) {
    return (
      <p className="rounded-lg bg-sun-soft px-4 py-3 text-sun-ink">
        No crop in the list needs this little winter chill.
      </p>
    );
  }

  // (c) Climate known, non-empty → the crop list + the "we rank every crop…" footer.
  return (
    <div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
        {crops.map((c) => {
          // A user crop's OptionState entry may not have arrived yet (async overlay); guard the read.
          const s = value[c.id] ?? { selected: true, requirement: defaultRequirement(c) };
          const inputId = `req-${c.id}`;
          const userCrop = isUserCrop(c.id);
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <label className="flex min-w-[15rem] flex-1 cursor-pointer items-start gap-3">
                <input type="checkbox" checked={s.selected} onChange={(e) => update(c.id, { selected: e.target.checked })}
                  className="mt-1 size-5 accent-leaf" />
                <span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{c.crop}</span>
                    {userCrop && (
                      <span className="rounded-full border border-sun bg-sun-soft px-2.5 py-0.5 text-xs font-bold text-sun-ink">
                        Your figures
                      </span>
                    )}
                  </span>
                  <span className="block text-sm text-muted">
                    {userCrop
                      ? `your figure: ${c.winter.chillHours[0]} chill hours`
                      : `${c.type}, usually ${c.winter.chillHours[0]}–${c.winter.chillHours[1]} chill hours`}
                  </span>
                </span>
              </label>
              <div className="flex items-center gap-2">
                <label htmlFor={inputId} className="text-sm text-muted">Your variety needs</label>
                <input id={inputId} type="number" min={0} max={2000} step={10} value={s.requirement}
                  disabled={!s.selected}
                  onChange={(e) => update(c.id, { requirement: Math.max(0, Math.min(2000, Number(e.target.value) || 0)) })}
                  className="w-24 rounded-md border border-line px-2 py-1.5 text-right tabular disabled:bg-paper disabled:text-muted" />
                <span className="text-sm text-muted">h</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-sm text-muted">
        We rank every crop by default. Untick any you don’t want in the list, and if your nursery
        lists a chill requirement for the exact variety, type it in.
      </p>
    </div>
  );
}
