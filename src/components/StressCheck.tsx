import { useState } from 'react';
import { Camera, RotateCcw } from 'lucide-react';
import type { StressDiagnosis } from '../../shared/types';
import { fetchDiagnosis, prepareImage } from '../lib/api';

const CATEGORY_LABEL: Record<StressDiagnosis['category'], string> = {
  heat: 'Heat damage',
  water: 'Water stress',
  pest: 'Pest',
  disease: 'Disease',
  nutrient: 'Nutrition',
  healthy: 'Looks healthy',
  unclear: 'Not sure',
};

const CROPS = ['Peach / nectarine', 'Apricot', 'Plum', 'Sweet cherry', 'Apple', 'Pear', 'Other'];

export function StressCheck({ aiEnabled }: { aiEnabled: boolean }) {
  const [crop, setCrop] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<StressDiagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('That file isn’t a photo. Choose a JPEG or PNG.');
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const img = await prepareImage(file);
      setPreview(img.preview);
      setResult(await fetchDiagnosis(img.base64, img.mimeType, crop || undefined));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setPreview(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <div className="max-w-[62ch] space-y-2">
        <h2 className="text-2xl font-bold">Check a tree for heat or water stress</h2>
        <p className="text-muted">
          Take a photo of leaves or fruit. You’ll get a first read on whether it looks like sunburn, water stress, a pest or a disease,
          and what to do next. It’s a triage tool, so confirm anything serious with an agronomist.
        </p>
      </div>

      {!aiEnabled && (
        <p className="rounded-lg bg-sun-soft px-4 py-3 text-sun-ink">Photo checks need a Gemini key on the server.</p>
      )}

      <label className="flex max-w-xs flex-col gap-1">
        <span className="font-bold">What’s in the photo? <span className="font-normal text-muted">(optional)</span></span>
        <select value={crop} onChange={(e) => setCrop(e.target.value)} className="rounded-md border border-line bg-card px-3 py-2">
          <option value="">Not sure</option>
          {CROPS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>

      {!preview ? (
        <label className={`flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line bg-card p-8 text-center hover:border-leaf ${!aiEnabled ? 'pointer-events-none opacity-50' : ''}`}>
          <Camera size={36} className="text-leaf" aria-hidden />
          <span className="text-lg font-bold">Take or choose a photo</span>
          <span className="text-sm text-muted">Close-up, in daylight, one problem per photo works best.</span>
          <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={!aiEnabled}
            onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_1fr]">
          <div className="space-y-3">
            <img src={preview} alt="Your uploaded photo" className="w-full rounded-xl border border-line object-cover" />
            <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-4 py-2 font-bold hover:border-leaf">
              <RotateCcw size={16} aria-hidden /> Check another photo
            </button>
          </div>
          <div aria-live="polite">
            {loading && <p className="text-lg">Looking at the photo…</p>}
            {result && (
              <div className="reveal space-y-4 rounded-2xl border border-line bg-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-leaf-soft px-3 py-1 text-sm font-bold text-leaf">{CATEGORY_LABEL[result.category]}</span>
                  <span className="text-sm text-muted">{result.confidence} confidence</span>
                </div>
                <p className="text-xl font-bold leading-snug">{result.likelyIssue}</p>
                {result.signs.length > 0 && (
                  <div>
                    <p className="font-bold">What it’s seeing</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">{result.signs.map((s) => <li key={s}>{s}</li>)}</ul>
                  </div>
                )}
                {result.actions.length > 0 && (
                  <div>
                    <p className="font-bold">What to do</p>
                    <ol className="mt-1 list-decimal space-y-1 pl-5">{result.actions.map((s) => <li key={s}>{s}</li>)}</ol>
                  </div>
                )}
                {result.climateLink && <p className="rounded-lg bg-frost-soft px-4 py-3">{result.climateLink}</p>}
                {result.seeAdvisor && <p className="font-bold text-sun-ink">Get this confirmed by an agronomist or a lab before acting on it.</p>}
              </div>
            )}
          </div>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg bg-ember-soft px-4 py-3 text-ember">{error}</p>}
    </div>
  );
}
