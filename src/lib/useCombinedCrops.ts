/**
 * `useCombinedCrops` — the React-state overlay that delivers the unified single crop list to
 * consumers while keeping the synchronous built-in baseline intact (design §3.1 option (i)-B, §4.7).
 *
 * Built-ins (`CROP_OPTIONS`) are the synchronous, frozen, validated baseline: the very first render
 * already has all 10, so the picker is never empty. User crops live in IndexedDB and resolve async;
 * once loaded they are appended via React state, producing `combined = [...CROP_OPTIONS, ...userCrops]`.
 *
 * StrictMode safety: React 19 dev double-invokes effects. We (a) use an `alive` flag so a torn-down
 * effect never sets state, and (b) REPLACE (not append) the user-crop state from the authoritative
 * `listUserCrops()` result, and dedupe `combined` by id — so a double-run can never insert a crop
 * twice. The CRUD mutators also key off the store result / id, never blind concatenation of stale
 * state.
 */
import { useCallback, useEffect, useState } from 'react';
import { CROP_OPTIONS, type CropOption } from '../../shared/crops';
import {
  addUserCrop,
  deleteUserCrop,
  listUserCrops,
  updateUserCrop,
  type UserCropInput,
} from './userCrops';

export type CombinedCropsStatus = 'loading' | 'ready' | 'error';

export interface UseCombinedCrops {
  /** One list: built-ins first, then user crops. De-duplicated by id. */
  combined: CropOption[];
  /** The user-added crops only (for the manage list in the form). */
  userCrops: CropOption[];
  status: CombinedCropsStatus;
  /** Non-null when IndexedDB is unavailable or errored; built-ins still work. */
  error: string | null;
  addCrop: (input: UserCropInput) => Promise<CropOption>;
  editCrop: (id: string, input: UserCropInput) => Promise<CropOption>;
  removeCrop: (id: string) => Promise<void>;
}

/** Append `extra` to `base`, dropping any entry whose id already appears (built-ins win). */
function dedupeById(base: CropOption[], extra: CropOption[]): CropOption[] {
  const seen = new Set(base.map((c) => c.id));
  const merged = [...base];
  for (const c of extra) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      merged.push(c);
    }
  }
  return merged;
}

export function useCombinedCrops(): UseCombinedCrops {
  const [userCrops, setUserCrops] = useState<CropOption[]>([]);
  const [status, setStatus] = useState<CombinedCropsStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listUserCrops()
      .then((cs) => {
        if (!alive) return;
        // REPLACE (not append) from the authoritative store result — StrictMode's second run just
        // reloads the same list, so no crop is ever double-inserted.
        setUserCrops(cs);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Could not load your crops.');
      });
    return () => {
      alive = false;
    };
  }, []);

  const combined = dedupeById(CROP_OPTIONS, userCrops);

  const addCrop = useCallback(async (input: UserCropInput) => {
    const created = await addUserCrop(input);
    setUserCrops((cs) => (cs.some((c) => c.id === created.id) ? cs : [...cs, created]));
    return created;
  }, []);

  const editCrop = useCallback(async (id: string, input: UserCropInput) => {
    const updated = await updateUserCrop(id, input);
    setUserCrops((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    return updated;
  }, []);

  const removeCrop = useCallback(async (id: string) => {
    await deleteUserCrop(id);
    setUserCrops((cs) => cs.filter((c) => c.id !== id));
  }, []);

  return { combined, userCrops, status, error, addCrop, editCrop, removeCrop };
}
