import { useEffect, useId, useState } from 'react';
import { hoursToPortions } from '../../shared/chillConversion';
import { groupForRegion, type RegionCrops } from '../../shared/regionCrops';
import type { CropEvaluation, SeasonVerdict } from '../../shared/seasons';
import { describeSeason, requirementText, SEASON_LABEL } from '../lib/seasonRows';

/*
 * Results for a location: what the district grows today (and how it fares), what else could suit,
 * and what struggles. `ranked` must already be in rankCrops order (shared/ranking.ts); nothing here
 * re-sorts, so the screen, PDF and saved reports always agree.
 */

export const VERDICT_UI: Record<SeasonVerdict, { label: string; chip: string; dot: string }> = {
  viable: { label: 'Good fit', chip: 'bg-leaf-soft text-leaf', dot: 'bg-leaf' },
  'at-risk': { label: 'Risky', chip: 'bg-sun-soft text-sun-ink', dot: 'bg-sun' },
  'not-viable': { label: 'Poor fit', chip: 'bg-ember-soft text-ember', dot: 'bg-ember' },
  'no-data': { label: 'Not scored', chip: 'bg-paper text-muted', dot: 'bg-line' },
};

export interface VarietyControl {
  /** The grower's chill-hours figure for this crop */
  hours: number;
  /** The crop's default figure (middle of its range) */
  defaultHours: number;
  onChange: (hours: number) => void;
}

function VarietyAdjust({ cropId, label, v }: { cropId: string; label: string; v: VarietyControl }) {
  const id = useId();
  const edited = v.hours !== v.defaultHours;
  // Typing edits a draft; results re-rank only on Apply/Enter, so the card doesn't jump mid-typing.
  const [draft, setDraft] = useState(String(v.hours));
  useEffect(() => setDraft(String(v.hours)), [v.hours]);
  const parsed = Math.max(0, Math.min(2000, Math.round(Number(draft))));
  const valid = draft.trim() !== '' && Number.isFinite(Number(draft));
  const dirty = valid && parsed !== v.hours;

  const commit = (hours: number) => {
    v.onChange(hours);
    // The crop may move to a new rank; bring it back into view once the list re-renders.
    requestAnimationFrame(() => document.getElementById(`crop-${cropId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  return (
    <details className="mt-2 rounded-lg bg-paper px-3 py-2 text-sm" open={edited}>
      <summary className="cursor-pointer font-bold text-muted">
        {edited ? `Using your variety: ${v.hours} chill hours` : 'Adjust for my variety'}
      </summary>
      <form
        className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) commit(parsed);
        }}
      >
        <label htmlFor={id} className="text-muted">Chill hours your nursery lists</label>
        <input id={id} type="number" inputMode="numeric" min={0} max={2000} step={10} value={draft}
          aria-describedby={`${id}-hint`}
          onChange={(e) => setDraft(e.target.value)}
          className="w-24 rounded-md border border-line bg-card px-2 py-1.5 text-right tabular" />
        <button type="submit" disabled={!dirty} className="rounded-md bg-frost px-3 py-1.5 font-bold text-white disabled:opacity-40">
          Apply
        </button>
        <span id={`${id}-hint`} className="text-muted">
          {valid ? `about ${Math.round(hoursToPortions(parsed))} chill portions` : 'Enter a number of hours'}
        </span>
        {edited && (
          <button type="button" onClick={() => commit(v.defaultHours)} className="font-bold text-frost underline"
            aria-label={`Reset ${label} to the usual figure`}>
            Reset to usual ({v.defaultHours} h)
          </button>
        )}
      </form>
    </details>
  );
}

export function CropCard({ c, rank, variety }: { c: CropEvaluation; rank?: number; variety?: VarietyControl }) {
  return (
    <li id={`crop-${c.id}`} className="scroll-mt-24 rounded-xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-baseline gap-3">
          {rank != null && (
            <span className="font-display text-xl font-extrabold text-leaf/50 tabular" aria-label={`Rank ${rank}`}>{rank}</span>
          )}
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
      {variety && <VarietyAdjust cropId={c.id} label={c.label} v={variety} />}
    </li>
  );
}

function Section({ id, title, blurb, children }: { id: string; title: string; blurb?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="space-y-1">
        <h3 id={id} className="text-xl font-bold">{title}</h3>
        {blurb && <div className="max-w-[62ch] text-muted">{blurb}</div>}
      </div>
      {children}
    </section>
  );
}

function CardList({ crops, varietyFor }: { crops: CropEvaluation[]; varietyFor: (c: CropEvaluation) => VarietyControl | undefined }) {
  return (
    <ul className="space-y-3">
      {crops.map((c, i) => <CropCard key={c.id} c={c} rank={i + 1} variety={varietyFor(c)} />)}
    </ul>
  );
}

const VERDICT_GROUPS: { verdict: SeasonVerdict; title: string }[] = [
  { verdict: 'viable', title: 'Good fits' },
  { verdict: 'at-risk', title: 'Risky' },
  { verdict: 'not-viable', title: 'Poor fits' },
  { verdict: 'no-data', title: 'Not enough data to score' },
];

interface Props {
  /** All evaluated crops, in rankCrops order */
  ranked: CropEvaluation[];
  region: RegionCrops | null;
  /** Short place name for headings, e.g. "Shepparton" */
  placeName: string;
  varietyFor: (c: CropEvaluation) => VarietyControl | undefined;
}

export function CropResults({ ranked, region, placeName, varietyFor }: Props) {
  if (ranked.length === 0) return null;
  const g = groupForRegion(ranked, region);
  const anyIndicative = ranked.some((c) => c.seasons.some((s) => s.indicative && s.verdict !== 'no-data'));
  const note = (
    <p className="text-sm text-muted">
      Ranked on climate fit only, not prices, markets or your setup. Each crop is judged on the season that troubles it most.
      {anyIndicative && ' “Indicative” means a threshold was converted between chill measures or comes from a non-Australian source.'}
    </p>
  );

  // Not near a district we have a crop list for: one ranked list, grouped by verdict.
  if (!region) {
    return (
      <div className="space-y-6">
        <Section id="results-all" title={`How each crop fares at ${placeName}`}
          blurb="We don’t have a list of what’s grown around this spot yet, so here’s every crop in our database, best fit first.">
          <div className="space-y-5">
            {VERDICT_GROUPS.map(({ verdict, title }) => {
              const items = ranked.filter((c) => c.overall === verdict);
              return items.length ? (
                <div key={verdict} className="space-y-2">
                  <h4 className="font-display text-lg font-bold">{title} <span className="text-muted">({items.length})</span></h4>
                  <CardList crops={items} varietyFor={varietyFor} />
                </div>
              ) : null;
            })}
          </div>
        </Section>
        {note}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <Section id="results-grown" title={`Grown around ${placeName} today`}
        blurb={
          <>
            <p>How the crops this district grows now hold up in the climate a tree planted today will crop in.</p>
            {region.indicative && (
              <p className="mt-1 text-sm">Preliminary list of local crops, to be replaced with ABS farm census figures.</p>
            )}
          </>
        }>
        {g.grownToday.length > 0 ? (
          <CardList crops={g.grownToday} varietyFor={varietyFor} />
        ) : (
          <p className="rounded-lg bg-paper px-4 py-3 text-muted">None of the main local crops are in our climate database yet.</p>
        )}
        {g.grownNoData.length > 0 && (
          <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm">
            <span className="font-bold">Also grown here: </span>
            {g.grownNoData.join(', ')}.{' '}
            <span className="text-muted">We don’t have climate thresholds for {g.grownNoData.length === 1 ? 'it' : 'these'} yet, so {g.grownNoData.length === 1 ? 'it isn’t' : 'they aren’t'} scored.</span>
          </p>
        )}
      </Section>

      <Section id="results-could" title="Could also suit this area"
        blurb="Crops not commonly grown here whose climate fit still works through 2045, best fit first.">
        {g.couldSuit.length > 0 ? (
          <CardList crops={g.couldSuit} varietyFor={varietyFor} />
        ) : (
          <p className="rounded-lg bg-paper px-4 py-3 text-muted">No other crop in our database is a good or risky fit here.</p>
        )}
      </Section>

      {g.struggles.length > 0 && (
        <details className="rounded-xl border border-line bg-card">
          <summary className="cursor-pointer px-4 py-3">
            <span className="text-xl font-bold">Struggles here ({g.struggles.length})</span>
            <span className="block text-sm text-muted">Crops a typical future year here doesn’t suit, with the reason.</span>
          </summary>
          <div className="border-t border-line p-4">
            <CardList crops={g.struggles} varietyFor={varietyFor} />
          </div>
        </details>
      )}
      {note}
    </div>
  );
}
