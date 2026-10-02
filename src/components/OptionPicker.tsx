import { CROP_OPTIONS, defaultRequirement } from '../../shared/crops';

export type OptionState = Record<string, { selected: boolean; requirement: number }>;

export function initialOptionState(): OptionState {
  const defaults = new Set(['peach-standard', 'peach-low', 'cherry-standard', 'apple-mainstream']);
  return Object.fromEntries(
    CROP_OPTIONS.map((c) => [c.id, { selected: defaults.has(c.id), requirement: defaultRequirement(c) }]),
  );
}

interface Props {
  value: OptionState;
  onChange: (next: OptionState) => void;
}

export function OptionPicker({ value, onChange }: Props) {
  const update = (id: string, patch: Partial<OptionState[string]>) => onChange({ ...value, [id]: { ...value[id], ...patch } });

  return (
    <div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
        {CROP_OPTIONS.map((c) => {
          const s = value[c.id];
          const inputId = `req-${c.id}`;
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <label className="flex min-w-[15rem] flex-1 cursor-pointer items-start gap-3">
                <input type="checkbox" checked={s.selected} onChange={(e) => update(c.id, { selected: e.target.checked })}
                  className="mt-1 size-5 accent-leaf" />
                <span>
                  <span className="block font-bold">{c.crop}</span>
                  <span className="block text-sm text-muted">{c.type}, usually {c.chillHours[0]}–{c.chillHours[1]} chill hours</span>
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
        Class ranges are indicative. If your nursery lists a chill requirement for the exact variety, type it in.
      </p>
    </div>
  );
}
