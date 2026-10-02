import type { ClimateAnalysis, OptionEvaluation, Verdict } from '../../shared/types';
import { fmtInt } from '../lib/format';

const VERDICT: Record<Verdict, { label: string; chip: string }> = {
  viable: { label: 'Good fit', chip: 'bg-leaf-soft text-leaf' },
  'at-risk': { label: 'Risky', chip: 'bg-sun-soft text-sun-ink' },
  'not-viable': { label: 'Poor fit', chip: 'bg-ember-soft text-ember' },
};

function explain(o: OptionEvaluation): string {
  const missed = Math.round((100 - o.futurePctMet) / 10);
  if (o.verdict === 'viable') return 'Even a poor winter should give it enough chill.';
  if (o.verdict === 'at-risk') return `Expect about ${missed} in 10 winters to fall short of its chill need.`;
  return 'A typical winter won’t give it enough chill. Expect patchy flowering and uneven crops.';
}

function Bar({ value, tone }: { value: number; tone: 'past' | 'future' }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-paper" aria-hidden>
      <div className={`h-full rounded-full ${tone === 'past' ? 'bg-line' : 'bg-frost'}`} style={{ width: `${value}%` }} />
    </div>
  );
}

export function OptionResults({ analysis, options }: { analysis: ClimateAnalysis; options: OptionEvaluation[] }) {
  const sorted = [...options].sort((a, b) => b.futurePctMet - a.futurePctMet || a.requirement - b.requirement);
  const [b0, b1] = analysis.baseline.period;
  const [f0, f1] = analysis.future.period;

  return (
    <section aria-labelledby="options-heading" className="space-y-3">
      <h3 id="options-heading" className="text-xl font-bold">How each option holds up</h3>
      <ul className="space-y-3">
        {sorted.map((o) => (
          <li key={o.id} className="rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold">{o.label}</p>
                <p className="text-sm text-muted">Needs about {fmtInt(o.requirement)} chill hours</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${VERDICT[o.verdict].chip}`}>{VERDICT[o.verdict].label}</span>
            </div>
            <p className="mt-2">{explain(o)}</p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="flex justify-between text-muted"><span>Winters with enough chill, {b0}–{b1}</span><span className="tabular">{Math.round(o.baselinePctMet)}%</span></dt>
                <dd className="mt-1"><Bar value={o.baselinePctMet} tone="past" /></dd>
              </div>
              <div>
                <dt className="flex justify-between"><span>Projected, {f0}–{f1}</span><span className="tabular font-bold">{Math.round(o.futurePctMet)}%</span></dt>
                <dd className="mt-1"><Bar value={o.futurePctMet} tone="future" /></dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-muted"><span className="font-bold text-sun-ink">Heat risk.</span> {o.heatNote}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
