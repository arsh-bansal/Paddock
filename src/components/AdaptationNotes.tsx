import type { CropEvaluation } from '../../shared/seasons';
import type { ClimateAnalysis } from '../../shared/types';
import { adaptationNotes } from '../lib/adaptation';

const TONE = { winter: 'text-frost', spring: 'text-frost', summer: 'text-sun-ink', water: 'text-leaf' } as const;

export function AdaptationNotes({ analysis, crops }: { analysis: ClimateAnalysis; crops: CropEvaluation[] }) {
  const notes = adaptationNotes(analysis, crops);
  if (notes.length === 0) return null;
  return (
    <section aria-labelledby="adapt-heading" className="space-y-3">
      <h3 id="adapt-heading" className="text-xl font-bold">Ways to reduce the risk</h3>
      <div className={`grid gap-3 ${notes.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {notes.map((n) => (
          <div key={n.key} className="rounded-xl border border-line bg-card p-4">
            <p className={`font-bold ${TONE[n.key]}`}>{n.title}</p>
            {n.lines.map((l) => <p key={l} className="mt-1">{l}</p>)}
          </div>
        ))}
      </div>
      <p className="text-sm text-muted">Before you order trees, check the variety with your nursery or an Agriculture Victoria adviser.</p>
    </section>
  );
}
