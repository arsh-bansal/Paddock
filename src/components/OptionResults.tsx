import type { CropEvaluation, SeasonVerdict } from '../../shared/seasons';
import { describeSeason, requirementText, SEASON_LABEL } from '../lib/seasonRows';

/*
 * Ranked per-crop results, grouped by overall verdict. `crops` must already be ordered by
 * `rankCrops` (shared/ranking.ts); this component never re-sorts, so screen, PDF and saved
 * reports always agree. Anuj's report card (task 6) can replace the card body.
 */

export const VERDICT_UI: Record<SeasonVerdict, { label: string; chip: string; dot: string }> = {
  viable: { label: 'Good fit', chip: 'bg-leaf-soft text-leaf', dot: 'bg-leaf' },
  'at-risk': { label: 'Risky', chip: 'bg-sun-soft text-sun-ink', dot: 'bg-sun' },
  'not-viable': { label: 'Poor fit', chip: 'bg-ember-soft text-ember', dot: 'bg-ember' },
  'no-data': { label: 'Not scored', chip: 'bg-paper text-muted', dot: 'bg-line' },
};

const GROUPS: { verdict: SeasonVerdict; title: string; blurb: string }[] = [
  { verdict: 'viable', title: 'Good fits', blurb: 'Ordered by how much spare chill a poor winter leaves.' },
  { verdict: 'at-risk', title: 'Risky', blurb: 'A typical year works, but more than 1 in 10 won’t.' },
  { verdict: 'not-viable', title: 'Struggles here', blurb: 'A typical year falls short in at least one season.' },
  { verdict: 'no-data', title: 'Not enough data to score', blurb: 'No sourced thresholds for these crops yet.' },
];

function CropCard({ c, rank }: { c: CropEvaluation; rank: number }) {
  return (
    <li className="rounded-xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-xl font-extrabold text-leaf/50 tabular" aria-label={`Rank ${rank}`}>{rank}</span>
          <div>
            <p className="font-bold">{c.label}</p>
            <p className="text-sm text-muted">{requirementText(c)}{c.portionsConverted ? ', converted from hours' : ''}</p>
          </div>
        </div>
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
            <span className="text-sm text-muted">{VERDICT_UI[s.verdict].label}{s.indicative && s.verdict !== 'no-data' ? ', indicative' : ''}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-muted"><span className="font-bold text-sun-ink">Heat risk.</span> {c.heatNote}</p>
    </li>
  );
}

export function OptionResults({ crops }: { crops: CropEvaluation[] }) {
  if (crops.length === 0) return null;
  const rankOf = new Map(crops.map((c, i) => [c.id, i + 1]));
  const anyIndicative = crops.some((c) => c.seasons.some((s) => s.indicative && s.verdict !== 'no-data'));

  return (
    <section aria-labelledby="options-heading" className="space-y-4">
      <div className="space-y-1">
        <h3 id="options-heading" className="text-xl font-bold">Your crops, ranked</h3>
        <p className="max-w-[62ch] text-muted">
          Each crop is judged on the season that troubles it most. Ranked on climate fit only, not prices, markets or your setup.
        </p>
      </div>
      {GROUPS.map((g) => {
        const items = crops.filter((c) => c.overall === g.verdict);
        if (items.length === 0) return null;
        return (
          <div key={g.verdict} className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h4 className="font-display text-lg font-bold">{g.title} <span className="text-muted">({items.length})</span></h4>
              <p className="text-sm text-muted">{g.blurb}</p>
            </div>
            <ul className="space-y-3">
              {items.map((c) => <CropCard key={c.id} c={c} rank={rankOf.get(c.id)!} />)}
            </ul>
          </div>
        );
      })}
      {anyIndicative && (
        <p className="text-sm text-muted">
          “Indicative” means a threshold was converted between chill measures or comes from a non-Australian source. Confirm with your nursery.
        </p>
      )}
    </section>
  );
}
