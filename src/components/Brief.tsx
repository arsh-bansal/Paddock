import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { ClimateAnalysis, OptionEvaluation } from '../../shared/types';
import { fetchBrief } from '../lib/api';

interface Props {
  analysis: ClimateAnalysis;
  options: OptionEvaluation[];
  aiEnabled: boolean;
}

export function Brief({ analysis, options, aiEnabled }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signature = JSON.stringify([analysis.location, options.map((o) => [o.id, o.requirement])]);

  // A brief written for different inputs is stale; clear it.
  useEffect(() => {
    setText(null);
    setError(null);
  }, [signature]);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setText((await fetchBrief(analysis, options)).text);
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
        {!aiEnabled && <p className="text-muted">Summaries need a Gemini key on the server. The numbers above don’t.</p>}
        {aiEnabled && !text && !error && !loading && (
          <p className="text-muted">Gemini turns the numbers above into a short explanation you could read out to a grower. It only uses figures shown on this page.</p>
        )}
        {error && <p role="alert" className="text-ember">{error}</p>}
        {text && <div className="max-w-prose space-y-3 whitespace-pre-line">{text}</div>}
      </div>
    </section>
  );
}
