import type { CropEvaluation, SeasonVerdict } from '../../shared/seasons';
import { describeSeason, SEASON_LABEL } from '../lib/seasonRows';

/*
 * Interim per-crop display so the season engine is visible and testable.
 * Anuj's four-season report card (task 6) replaces this component.
 */

export const VERDICT_UI: Record<SeasonVerdict, { label: string; chip: string; dot: string }> = {
  viable: { label: 'Good fit', chip: 'bg-leaf-soft text-leaf', dot: 'bg-leaf' },
  'at-risk': { label: 'Risky', chip: 'bg-sun-soft text-sun-ink', dot: 'bg-sun' },
  'not-viable': { label: 'Poor fit', chip: 'bg-ember-soft text-ember', dot: 'bg-ember' },
  'no-data': { label: 'No data', chip: 'bg-paper text-muted', dot: 'bg-line' },
};

const RANK: Record<SeasonVerdict, number> = { viable: 0, 'at-risk': 1, 'not-viable': 2, 'no-data': 3 };

export function OptionResults({ crops }: { crops: CropEvaluation[] }) {
  const sorted = [...crops].sort((a, b) => RANK[a.overall] - RANK[b.overall]);
  const anyIndicative = crops.some((c) => c.seasons.some((s) => s.indicative));

  return (
    <section aria-labelledby="options-heading" className="space-y-3">
      <h3 id="options-heading" className="text-xl font-bold">How each option holds up</h3>
      <p className="max-w-[62ch] text-muted">Each crop is judged on the season that troubles it most, because one bad season can wreck a crop.</p>
      <ul className="space-y-3">
        {sorted.map((c) => (
          <li key={c.id} className="rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-bold">{c.label}</p>
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${VERDICT_UI[c.overall].chip}`}>{VERDICT_UI[c.overall].label}</span>
            </div>
            <ul className="mt-3 divide-y divide-line">
              {c.seasons.map((s) => (
                <li key={s.season} className="grid gap-x-3 py-2 sm:grid-cols-[9rem_1fr_auto] sm:items-baseline">
                  <span className="flex items-center gap-2 font-bold">
                    <span aria-hidden className={`size-2.5 rounded-full ${VERDICT_UI[s.verdict].dot}`} />
                    {SEASON_LABEL[s.season]}
                  </span>
                  <span>{describeSeason(s)}</span>
                  <span className="text-sm text-muted">{VERDICT_UI[s.verdict].label}{s.indicative ? ', indicative' : ''}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-muted"><span className="font-bold text-sun-ink">Heat risk.</span> {c.heatNote}</p>
          </li>
        ))}
      </ul>
      {anyIndicative && (
        <p className="text-sm text-muted">“Indicative” means the crop threshold is a rule of thumb still being replaced with a sourced figure.</p>
      )}
    </section>
  );
}
