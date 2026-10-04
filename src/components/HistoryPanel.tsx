import { changeWord, historyFor, pctChange } from '../../shared/history';
import type { ClimateAnalysis } from '../../shared/types';
import { fmtValue, SEASON_METRICS } from '../lib/seasonSeries';

const WORD = { less: 'less', more: 'more' } as const;

function compare(pct: number | null, vs: readonly [number, number]): string {
  const w = changeWord(pct);
  if (w === 'unknown') return `not comparable with ${vs[0]}–${vs[1]}`;
  if (w === 'same') return `about the same as ${vs[0]}–${vs[1]}`;
  return `${Math.abs(pct!)}% ${WORD[w]} than ${vs[0]}–${vs[1]}`;
}

/** Two real 20-year periods side by side with the projection, for every season measure. */
export function HistoryPanel({ analysis, placeName }: { analysis: ClimateAnalysis; placeName: string }) {
  const history = historyFor(analysis.observed);
  if (!history) return null; // e.g. a report saved before the record went back to 1985
  const { early, recent } = history;
  const future = analysis.future;

  const chill = (p: { summary: typeof future.summary }) => p.summary.chillPortions.median;
  const heat = (p: { summary: typeof future.summary }) => p.summary.hotDays.median;
  const chillPast = pctChange(chill(early), chill(recent));
  const chillAhead = pctChange(chill(recent), chill(future));
  const heatPast = pctChange(heat(early), heat(recent));
  const pastLooksStable = changeWord(chillPast) === 'same';
  const dropAhead = changeWord(chillAhead) === 'less';

  const cols = [
    { label: `${early.period[0]}–${early.period[1]}`, tag: 'Real', summary: early.summary },
    { label: `${recent.period[0]}–${recent.period[1]}`, tag: 'Real', summary: recent.summary },
    { label: `${future.period[0]}–${future.period[1]}`, tag: 'Projected', summary: future.summary },
  ];

  return (
    <section aria-labelledby="history-heading" className="space-y-3">
      <div>
        <h3 id="history-heading" className="text-xl font-bold">40 years of real weather, then the next 20</h3>
        <p className="text-sm text-muted">Typical (median) year at {placeName} in two real 20-year periods, and projected</p>
      </div>

      <div className="rounded-xl border border-frost/30 bg-frost-soft/40 p-4">
        <p className="max-w-[62ch]">
          Winter chill in {recent.period[0]}–{recent.period[1]} was <strong>{compare(chillPast, early.period)}</strong>.
          {' '}For {future.period[0]}–{future.period[1]} it is projected to be <strong>{compare(chillAhead, recent.period)}</strong>.
          {changeWord(heatPast) === 'more' &&
            ` Summers have already changed: a typical summer had ${fmtValue(heat(early))} days of 35 °C or hotter in ${early.period[0]}–${early.period[1]}, and ${fmtValue(heat(recent))} in ${recent.period[0]}–${recent.period[1]}.`}
        </p>
        {pastLooksStable && dropAhead && (
          <p className="mt-2 max-w-[62ch] font-bold">The winters growers remember are not a safe guide to the ones a new tree will grow through.</p>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <caption className="sr-only">Typical year by season in {cols.map((c) => c.label).join(', ')}</caption>
          <thead>
            <tr className="border-b border-line text-sm text-muted">
              <th scope="col" className="px-4 py-2 font-normal">Measure</th>
              {cols.map((c) => (
                <th key={c.label} scope="col" className="whitespace-nowrap px-4 py-2 text-right font-normal">
                  <span className="block text-xs">{c.tag}</span>{c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SEASON_METRICS.map((m) => (
              <tr key={m.key} className="border-t border-line first:border-t-0">
                <th scope="row" className="px-4 py-2 font-normal">
                  <span className="font-bold" style={{ color: m.colour }}>{m.tab}</span>
                  <span className="block text-sm text-muted">{m.subtitle}</span>
                </th>
                {cols.map((c, i) => (
                  <td key={c.label} className={`tabular whitespace-nowrap px-4 py-2 text-right ${i === 2 ? 'font-bold' : ''}`}>
                    {fmtValue(c.summary[m.summaryKey].median)} <span className="text-sm font-normal text-muted">{m.unit}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
