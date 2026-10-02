/**
 * AddCropForm — the Step-2 UI to add, list, edit and delete the grower's OWN crops (Part B).
 *
 * The form collects exactly two fields (locked decisions 1 & 2): a crop NAME and a single winter
 * CHILL-HOURS number. No category picker, no min/max range. Validation reuses `userCropInputSchema`
 * so bad input is rejected inline and never persisted. Each user crop renders with a "Your figures"
 * badge (provenance, design §4.6) and in-place Edit / Delete controls.
 *
 * Loading / empty / error states are driven by the `useCombinedCrops` hook: built-ins always work;
 * if IndexedDB is unavailable the form shows a non-fatal notice and disables saving.
 */
import { useRef, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import type { CropOption } from '../../shared/crops';
import { userCropInputSchema } from '../lib/userCrops';
import type { CombinedCropsStatus } from '../lib/useCombinedCrops';
import type { UserCropInput } from '../lib/userCrops';

interface Props {
  userCrops: CropOption[];
  status: CombinedCropsStatus;
  /** Hook error (e.g. IndexedDB unavailable); the form stays visible but can't save. */
  loadError: string | null;
  onAdd: (input: UserCropInput) => Promise<CropOption>;
  onEdit: (id: string, input: UserCropInput) => Promise<CropOption>;
  onDelete: (id: string) => Promise<void>;
}

/** Validate the raw form fields, returning either the parsed input or the first error message. */
function parseFields(name: string, chill: string): { ok: true; value: UserCropInput } | { ok: false; error: string } {
  // Treat an empty chill box as "not a number" so the message is friendly rather than NaN.
  const chillNum = chill.trim() === '' ? Number.NaN : Number(chill);
  const result = userCropInputSchema.safeParse({ name, chillHours: chillNum });
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? 'Please check the crop details' };
}

/** The "Your figures" provenance badge, visually distinct from the built-in "indicative" badge. */
function YourFiguresBadge() {
  return (
    <span className="rounded-full border border-sun bg-sun-soft px-2.5 py-0.5 text-xs font-bold text-sun-ink">
      Your figures
    </span>
  );
}

export function AddCropForm({ userCrops, status, loadError, onAdd, onEdit, onDelete }: Props) {
  const [name, setName] = useState('');
  const [chill, setChill] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Id of the crop being edited in place, or null when adding a new one. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const storageBlocked = status === 'error';
  const heading = editingId ? 'Edit your crop' : 'Add your own crop';

  const resetForm = () => {
    setName('');
    setChill('');
    setEditingId(null);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFields(name, chill);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editingId) await onEdit(editingId, parsed.value);
      else await onAdd(parsed.value);
      resetForm();
      nameRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the crop.');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (c: CropOption) => {
    setEditingId(c.id);
    setName(c.crop);
    // Stored as a tight range [v, v]; show the single value the grower typed.
    setChill(String(c.winter.chillHours[0]));
    setError(null);
    nameRef.current?.focus();
  };

  const remove = async (id: string) => {
    // If we're editing the crop being deleted, drop out of edit mode.
    if (editingId === id) resetForm();
    try {
      await onDelete(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the crop.');
    }
  };

  return (
    <section aria-labelledby="add-crop-heading" className="space-y-4 rounded-xl border border-line bg-card p-4">
      <div className="space-y-1">
        <h3 id="add-crop-heading" className="text-lg font-bold">
          {heading}
        </h3>
        <p className="max-w-[62ch] text-sm text-muted">
          Got a fruit tree variety we don’t list? Add it with its winter chill hours (from your nursery)
          and we’ll rank it alongside the rest. It’s judged on winter chill only, because we don’t know its
          frost or heat limits. Your crops stay on this device.
        </p>
      </div>

      {storageBlocked && (
        <p role="alert" className="rounded-lg bg-ember-soft px-4 py-3 text-sm text-ember">
          {loadError ?? "Can’t save crops on this device — private browsing may be blocking storage."}
        </p>
      )}

      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <label htmlFor="user-crop-name" className="text-sm font-bold text-muted">
            Crop name
          </label>
          <input
            id="user-crop-name"
            ref={nameRef}
            type="text"
            value={name}
            maxLength={60}
            disabled={storageBlocked || busy}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Fuji apple"
            className="rounded-md border border-line px-3 py-2 disabled:bg-paper disabled:text-muted"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="user-crop-chill" className="text-sm font-bold text-muted">
            Winter chill hours
          </label>
          <input
            id="user-crop-chill"
            type="number"
            min={0}
            max={2000}
            step={10}
            inputMode="numeric"
            value={chill}
            disabled={storageBlocked || busy}
            onChange={(e) => setChill(e.target.value)}
            placeholder="e.g. 400"
            className="w-32 rounded-md border border-line px-3 py-2 text-right tabular disabled:bg-paper disabled:text-muted"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={storageBlocked || busy}
            className="inline-flex items-center gap-2 rounded-lg bg-leaf px-4 py-2 font-bold text-white hover:bg-leaf/90 disabled:opacity-40"
          >
            {editingId ? <Pencil size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
            {editingId ? 'Save changes' : 'Add crop'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 font-bold hover:border-leaf"
            >
              <X size={16} aria-hidden /> Cancel
            </button>
          )}
        </div>
      </form>

      {error && (
        <p role="alert" className="rounded-lg bg-ember-soft px-4 py-2 text-sm text-ember">
          {error}
        </p>
      )}

      <div aria-live="polite">
        {status === 'loading' ? (
          <p className="text-sm text-muted">Loading your crops…</p>
        ) : userCrops.length === 0 ? (
          <p className="text-sm text-muted">You haven’t added any crops yet.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {userCrops.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{c.crop}</span>
                  <YourFiguresBadge />
                  <span className="text-sm text-muted">{c.winter.chillHours[0]} chill hours</span>
                </span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    disabled={busy}
                    aria-label={`Edit ${c.crop}`}
                    className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-sm font-bold hover:border-leaf disabled:opacity-40"
                  >
                    <Pencil size={14} aria-hidden /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    disabled={busy}
                    aria-label={`Delete ${c.crop}`}
                    className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-sm font-bold text-ember hover:border-ember disabled:opacity-40"
                  >
                    <Trash2 size={14} aria-hidden /> Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
