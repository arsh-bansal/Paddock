import { useMemo, useState } from 'react';
import { CROP_OPTIONS, cropLabel } from '../../shared/crops';
import { pctMet, verdictFor } from '../../shared/evaluate';
import type { ClimateAnalysis, OptionEvaluation } from '../../shared/types';
import { fetchClimate } from '../lib/api';
import { fmtInt, pctChange } from '../lib/format';
import { AdaptationNotes } from './AdaptationNotes';
import { Brief } from './Brief';
import { ChillChart } from './ChillChart';
import { LocationPicker, type PickedLocation } from './LocationPicker';
import { Methods } from './Methods';
import { initialOptionState, OptionPicker, type OptionState } from './OptionPicker';
import { OptionResults } from './OptionResults';

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`} className="grid gap-4 sm:grid-cols-[3rem_1fr]">
      <span aria-hidden className="font-display text-4xl font-extrabold leading-none text-leaf/40">{n}</span>
      <div className="space-y-4">
        <h2 id={`step-${n}`} className="text-2xl font-bold">{title}</h2>
        {children}
      </div>
    </section>
  );
}

export function Planner({ aiEnabled }: { aiEnabled: boolean }) {
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [options, setOptions] = useState<OptionState>(initialOptionState);
  const [analysis, setAnalysis] = useState<ClimateAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = CROP_OPTIONS.filter((c) => options[c.id].selected);

  const evaluations: OptionEvaluation[] = useMemo(() => {
    if (!analysis) return [];
    return selected.map((c) => {
      const req = options[c.id].requirement;
      return {
        id: c.id,
        label: cropLabel(c),
        requirement: req,
        baselinePctMet: pctMet(analysis.baseline.chillHoursByYear, req),
        futurePctMet: pctMet(analysis.future.chillHoursPooled, req),
        verdict: verdictFor(analysis.future.chillHoursPooled, req),
        heatNote: c.heatNote,
      };
    });
  }, [analysis, options, selected]);

  const run = async () => {
    if (!location) return;
    setLoading(true);
    setError(null);
    try {
      setAnalysis(await fetchClimate(location.lat, location.lon, location.label));
    } catch (e) {
      setAnalysis(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const showingStale = analysis && location && (analysis.location.label !== location.label);
  const change = analysis ? pctChange(analysis.baseline.chillHours.median, analysis.future.chillHours.median) : 0;

  return (
    <div className="space-y-12">
      <Step n={1} title="Where’s the block?">
        <LocationPicker value={location} onChange={setLocation} />
      </Step>

      <Step n={2} title="What are you weighing up?">
        <OptionPicker value={options} onChange={setOptions} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={run} disabled={!location || selected.length === 0 || loading}
            className="rounded-xl bg-leaf px-6 py-3 text-lg font-bold text-white shadow-sm hover:bg-leaf/90 disabled:opacity-40">
            {loading ? 'Checking 50 years of climate…' : 'Check my block'}
          </button>
          {!location && <span className="text-muted">Pick a district first.</span>}
          {location && selected.length === 0 && <span className="text-muted">Tick at least one option.</span>}
        </div>
        {error && <p role="alert" className="rounded-lg bg-ember-soft px-4 py-3 text-ember">{error}</p>}
      </Step>

      {analysis && (
        <Step n={3} title="What the next 20 winters look like">
          <div className="reveal space-y-8" aria-live="polite">
            {showingStale && (
              <p className="rounded-lg bg-sun-soft px-4 py-3 text-sun-ink">
                These results are for {analysis.location.label}. Press “Check my block” to update for {location!.label}.
              </p>
            )}
            <p className="max-w-[62ch] text-xl leading-snug">
              At {analysis.location.label}, a typical winter gave about{' '}
              <strong className="tabular">{fmtInt(analysis.baseline.chillHours.median)}</strong> chill hours in{' '}
              {analysis.baseline.period[0]}–{analysis.baseline.period[1]}. For {analysis.future.period[0]}–{analysis.future.period[1]}, the years a tree
              planted now spends cropping, it’s projected at about{' '}
              <strong className="tabular">{fmtInt(analysis.future.chillHours.median)}</strong>
              {change < 0 ? `, ${Math.abs(change)}% less.` : change > 0 ? `, ${change}% more.` : ', about the same.'}
            </p>
            <ChillChart analysis={analysis} options={evaluations} />
            <OptionResults analysis={analysis} options={evaluations} />
            <Brief analysis={analysis} options={evaluations} aiEnabled={aiEnabled} />
            <AdaptationNotes analysis={analysis} options={evaluations} />
            <Methods analysis={analysis} />
          </div>
        </Step>
      )}
    </div>
  );
}
