import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { CropEvaluation } from '../../shared/seasons';
import type { ClimateAnalysis } from '../../shared/types';
import { fetchBrief, type WaterFacts } from '../lib/api';

export interface BriefState {
  text: string;
  /** The inputs the brief was written for; a brief for other inputs is stale and hidden. */
  signature: string;
}

export function briefSignature(analysis: ClimateAnalysis, crops: CropEvaluation[]): string {
  return JSON.stringify([analysis.location.lat, analysis.location.lon, analysis.generatedAt, crops.map((c) => [c.id, c.chillRequirement])]);
}

interface Props {
  analysis: ClimateAnalysis;
  crops: CropEvaluation[];
  /** Labels of the crops the district grows today, so the summary can lead with them */
  grownHere?: string[];
  /** Water facts for the summary (already computed and rounded) */
  water?: WaterFacts | null;
  aiEnabled: boolean;
  brief: BriefState | null;
  onBrief: (b: BriefState) => void;
}

export function Brief({ analysis, crops, grownHere = [], water = null, aiEnabled, brief, onBrief }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signature = briefSignature(analysis, crops);
  const text = brief?.signature === signature ? brief.text : null;

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      onBrief({ text: (await fetchBrief(analysis, crops, grownHere, water)).text, signature });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby="brief-heading" className="rounded-2xl border border-frost/30 bg-frost-soft/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="brief-heading" className="text-xl font-bold">In plain words</h3>
        <button type="button" onClick={run} disabled={!aiEnabled || loading}
          className="inline-flex items-center gap-2 rounded-lg bg-frost px-4 py-2 font-bold text-white disabled:opacity-50">
          <Sparkles size={18} aria-hidden /> {loading ? 'Writing…' : text ? 'Rewrite summary' : 'Write a summary'}
        </button>
      </div>
      <div aria-live="polite" className="mt-3">
        {!aiEnabled && !text && <p className="text-muted">Summaries need a Gemini key on the server. The numbers above don’t.</p>}
        {aiEnabled && !text && !error && !loading && (
          <p className="text-muted">Gemini turns the numbers above into a short explanation you could read out to a grower. It only uses figures shown on this page, and it’s included in the PDF report.</p>
        )}
        {error && <p role="alert" className="text-ember">{error}</p>}
        {text && <div className="max-w-prose space-y-3 whitespace-pre-line">{text}</div>}
      </div>
    </section>
  );
}
