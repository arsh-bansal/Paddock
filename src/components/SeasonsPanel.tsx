import type { ClimateAnalysis } from '../../shared/types';
import { changeTone, formatChange, seasonRows, withUnit } from '../lib/seasonRows';

const TONE = { good: 'text-leaf', bad: 'text-ember', neutral: 'text-muted' } as const;

/** Location-level climate, season by season. Not crop-specific. */
export function SeasonsPanel({ analysis }: { analysis: ClimateAnalysis }) {
  const rows = seasonRows(analysis);
  const [b0, b1] = analysis.baseline.period;
  const [f0, f1] = analysis.future.period;

  return (
    <section aria-labelledby="seasons-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="seasons-heading" className="text-xl font-bold">Season by season</h3>
        <p className="text-sm text-muted">Averages for this location, not any one crop</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <caption className="sr-only">Climate by season, {b0}–{b1} compared with projected {f0}–{f1}</caption>
          <thead>
            <tr className="border-b border-line text-sm text-muted">
              <th scope="col" className="px-4 py-2 font-normal">Season</th>
              <th scope="col" className="px-4 py-2 font-normal">What we measured</th>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-right font-normal">{b0}–{b1}</th>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-right font-normal">{f0}–{f1}</th>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-right font-normal">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const firstOfSeason = i === 0 || rows[i - 1].season !== r.season;
              return (
                <tr key={r.measure} className={firstOfSeason && i > 0 ? 'border-t border-line' : ''}>
                  <th scope="row" className="px-4 py-2 align-top font-bold">{firstOfSeason ? r.season : <span className="sr-only">{r.season}</span>}</th>
                  <td className="px-4 py-2">{r.measure}</td>
                  <td className="tabular whitespace-nowrap px-4 py-2 text-right">{withUnit(r.then, r.digits, r.unit)}</td>
                  <td className="tabular whitespace-nowrap px-4 py-2 text-right font-bold">{withUnit(r.projected, r.digits, r.unit)}</td>
                  <td className={`tabular whitespace-nowrap px-4 py-2 text-right ${TONE[changeTone(r)]}`}>{formatChange(r)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted">
        Frost figures come from a roughly 10–25 km weather grid, which smooths out cold nights, so they undercount frost. Treat them as a district estimate: frost hollows on your block can be much colder.
      </p>
    </section>
  );
}
