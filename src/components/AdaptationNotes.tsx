import type { ClimateAnalysis, OptionEvaluation } from '../../shared/types';
import { fmt1 } from '../lib/format';

export function AdaptationNotes({ analysis, options }: { analysis: ClimateAnalysis; options: OptionEvaluation[] }) {
  const chillShort = options.some((o) => o.verdict !== 'viable');
  const hotterSummers = analysis.future.hotDays.mean - analysis.baseline.hotDays.mean >= 1;

  return (
    <section aria-labelledby="adapt-heading" className="space-y-3">
      <h3 id="adapt-heading" className="text-xl font-bold">Ways to reduce the risk</h3>
      <div className={`grid gap-3 ${chillShort ? 'sm:grid-cols-2' : ''}`}>
        {chillShort && (
          <div className="rounded-xl border border-line bg-card p-4">
            <p className="font-bold text-frost">If chill is the problem</p>
            <p className="mt-1">Choosing a lower-chill variety of the same crop is usually the cheapest fix, because it keeps your packing and marketing setup.</p>
            <p className="mt-2">Rest-breaking sprays can partly make up for a short winter. Check current APVMA registrations and your packer’s rules before relying on them.</p>
          </div>
        )}
        <div className="rounded-xl border border-line bg-card p-4">
          <p className="font-bold text-sun-ink">If heat is the problem</p>
          <p className="mt-1">
            Hot days at or above 35 °C go from about {fmt1(analysis.baseline.hotDays.mean)} to {fmt1(analysis.future.hotDays.mean)} per summer here.
            {hotterSummers ? ' Shade or hail netting cuts fruit sunburn and is worth costing into a new block.' : ' That’s a small change, so heat is a lower priority than chill at this site.'}
          </p>
          {hotterSummers && <p className="mt-2">Solar-powered irrigation pumps keep water up to trees through heatwaves without diesel costs.</p>}
        </div>
      </div>
      <p className="text-sm text-muted">Before you order trees, check the variety with your nursery or an Agriculture Victoria adviser.</p>
    </section>
  );
}
