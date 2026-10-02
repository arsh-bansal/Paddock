import { CROP_OPTIONS, defaultRequirement, type CropOption } from '../../shared/crops';
import { hoursToPortions } from '../../shared/chillConversion';
import { chillPortionsMidpoint } from '../../shared/chillFilter';
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
   *  - 'pre-location' (default): no block climate yet → a hint to pick a location.
   *  - 'filtered': climate known; `crops` are the ones that suit and `struggling` the ones that don't.
   * This is a DISPLAY concern only; it never changes which crops are passed in.
   */
  filterState?: 'pre-location' | 'filtered';
  /** Crops a typical future winter here can't satisfy. Shown separately with the reason, never hidden. */
  struggling?: CropOption[];
  /** Typical future winter chill (portions) at the block, for the "struggles here" explanation. */
  futureMedianPortions?: number;
}

export function OptionPicker({
  crops = CROP_OPTIONS,
  value,
  onChange,
  filterState = 'pre-location',
  struggling = [],
  futureMedianPortions,
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

  const row = (c: CropOption) => {
    // A user crop's OptionState entry may not have arrived yet (async overlay); guard the read.
    const s = value[c.id] ?? { selected: true, requirement: defaultRequirement(c) };
    const inputId = `req-${c.id}`;
    const userCrop = isUserCrop(c.id);
    const edited = s.requirement !== defaultRequirement(c);
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
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-2">
            <label htmlFor={inputId} className="text-sm text-muted">Your variety needs</label>
            <input id={inputId} type="number" min={0} max={2000} step={10} value={s.requirement}
              disabled={!s.selected}
              onChange={(e) => update(c.id, { requirement: Math.max(0, Math.min(2000, Number(e.target.value) || 0)) })}
              className="w-24 rounded-md border border-line px-2 py-1.5 text-right tabular disabled:bg-paper disabled:text-muted" />
            <span className="text-sm text-muted">h</span>
          </div>
          {s.selected && edited && (
            <span className="text-xs text-muted">scored as about {Math.round(hoursToPortions(s.requirement))} chill portions</span>
          )}
        </div>
      </li>
    );
  };

  // (b) Climate known: crops that suit, then the ones that struggle (with the reason).
  return (
    <div className="space-y-4">
      {crops.length > 0 ? (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">{crops.map(row)}</ul>
      ) : (
        <p className="rounded-lg bg-sun-soft px-4 py-3 text-sun-ink">
          A typical future winter here is too mild for every crop in the list. They’re all shown below with the reason.
        </p>
      )}
      {struggling.length > 0 && (
        <details className="rounded-xl border border-line bg-card" open={crops.length === 0}>
          <summary className="cursor-pointer px-4 py-3">
            <span className="font-bold">Struggles here ({struggling.length})</span>
            <span className="block text-sm text-muted">Not enough winter chill in a typical future winter</span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {struggling.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <p className="font-bold">{c.crop} <span className="font-normal text-muted">({c.type.toLowerCase()})</span></p>
                <p className="text-sm text-muted">
                  Needs about {Math.round(chillPortionsMidpoint(c))} chill portions; a typical winter here in 2026–2045 gives about{' '}
                  {futureMedianPortions != null && Number.isFinite(futureMedianPortions) ? Math.round(futureMedianPortions) : '?'}.
                  It’s still included in your results so you can see the detail.
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-sm text-muted">
        We rank every crop by default. Untick any you don’t want in the list, and if your nursery
        lists a chill requirement for the exact variety, type it in.
      </p>
    </div>
  );
}
