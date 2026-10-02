/**
 * User-added crops (Part B) — a per-id IndexedDB store, modelled on `savedReports.ts`.
 *
 * A grower types ONE crop name + ONE winter chill-hours figure. We persist a MINIMAL record
 * (`StoredUserCrop`, schemaVersion 1) and EXPAND it to a full, schema-valid `CropOption` on load —
 * so a user crop is substitutable for a built-in anywhere a `CropOption` is expected (the unified
 * model, design §4.2). spring/summer are null (the engine returns `no-data` for those seasons), and
 * the single chill value is stored as a tight range `[v, v]` so `winter.chillHours: [number, number]`
 * and `defaultRequirement([v,v]) = v` both hold.
 *
 * Provenance (design §4.6): no new `CropOption` field. A user crop is detectable by its `user-` id
 * prefix (`isUserCrop`), carries `winter.source = 'Your own figure'`, `winter.indicative = true`, and
 * a `type: 'Your figures'` label that drives the UI badge.
 *
 * BROWSER-ONLY: this uses IndexedDB, so it lives in `src/lib/`, not `shared/` (which stays
 * runtime-agnostic). Reuses the exact `guard()` / `StorageUnavailableError` pattern from
 * `savedReports.ts`.
 */
import { createStore, del, entries, set, type UseStore } from 'idb-keyval';
import { z } from 'zod';
import type { CropOption } from '../../shared/crops';

/** Longest crop name we persist; matches the loader's string sanity caps. */
const NAME_MAX = 60;
/** Chill-hours cap; mirrors `OptionPicker`'s existing requirement input range (0..2000). */
const CHILL_MAX = 2000;

/** Default category for user crops. `category` only affects display grouping, never verdicts; the
 *  form never asks for it (locked decision 2). `'stone fruit'` is the design's neutral default. */
const DEFAULT_CATEGORY: CropOption['category'] = 'stone fruit';

/** Provenance strings — kept in one place so the UI badge and the stored data agree. */
export const USER_CROP_SOURCE = 'Your own figure';
export const USER_CROP_TYPE = 'Your figures';

/** Current stored-record schema version. Bump if the persisted shape changes; old/newer records are
 *  skipped on load (never fatal). */
const STORED_SCHEMA_VERSION = 1 as const;

/**
 * Input the add/edit form collects: a crop name + a SINGLE chill-hours number (locked decision 1).
 * Reuses the loader's field rules so a user crop can never break `evaluateCrop` or the loader
 * invariants.
 */
export const userCropInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter a crop name').max(NAME_MAX, `Keep the name under ${NAME_MAX} characters`),
  chillHours: z
    .number({ error: 'Enter chill hours as a number' })
    .int('Enter whole chill hours')
    .min(0, 'Chill hours can’t be negative')
    .max(CHILL_MAX, `Chill hours can’t exceed ${CHILL_MAX}`),
});

export type UserCropInput = z.infer<typeof userCropInputSchema>;

/** The MINIMAL persisted record. Expanded to a full `CropOption` on load (design §4.3). */
export interface StoredUserCrop {
  id: string;
  schemaVersion: typeof STORED_SCHEMA_VERSION;
  name: string;
  chillHours: [number, number];
  createdAt: string;
}

/**
 * Validates a stored record on LOAD so a corrupt/stale/foreign-version record is skipped (via
 * `safeParse`), never throwing the whole app. The expanded `CropOption` inherits these guarantees
 * (id regex, chill range min<=max) so it satisfies the same invariants the `crops.ts` loader enforces.
 */
const storedUserCropSchema = z.object({
  id: z
    .string()
    .regex(/^user-[a-z0-9-]+$/, 'user-crop id must be user-<lowercase-alphanumeric/hyphen>')
    .max(60),
  schemaVersion: z.literal(STORED_SCHEMA_VERSION),
  name: z.string().trim().min(1).max(NAME_MAX),
  chillHours: z
    .tuple([z.number().int().min(0).max(CHILL_MAX), z.number().int().min(0).max(CHILL_MAX)])
    .refine(([lo, hi]) => lo <= hi, 'chillHours must be [min, max] with min <= max'),
  createdAt: z.string(),
});

/** Same friendly error the saved-reports store surfaces when IndexedDB is unavailable. */
export class StorageUnavailableError extends Error {
  constructor() {
    super("This browser isn’t letting Paddock save crops. Private browsing often blocks it.");
  }
}

let store: UseStore | null = null;
function db(): UseStore {
  if (typeof indexedDB === 'undefined') throw new StorageUnavailableError();
  store ??= createStore('Paddock-user-crops', 'crops');
  return store;
}

/** Maps QuotaExceeded / missing-indexedDB to friendly errors (same pattern as `savedReports.ts`). */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StorageUnavailableError) throw err;
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      throw new Error('This device is out of storage space. Delete a crop and try again.');
    }
    throw new StorageUnavailableError();
  }
}

/** `user-<uuid>`: the prefix rules out any collision with built-in ids and marks provenance; the
 *  UUID rules out collisions between user crops. Matches the loader id rule `^[a-z0-9-]+$` (≤60). */
const newUserCropId = (): string =>
  `user-${
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }`;

/** True iff the id belongs to a user-added crop (cheap, zero-schema-change origin marker). */
export function isUserCrop(id: string): boolean {
  return id.startsWith('user-');
}

/** Expand a minimal stored record into a full, schema-valid `CropOption` (the unified model). */
function toCropOption(rec: StoredUserCrop): CropOption {
  return {
    id: rec.id,
    crop: rec.name,
    type: USER_CROP_TYPE,
    category: DEFAULT_CATEGORY,
    heatNote: '',
    winter: { chillHours: rec.chillHours, indicative: true, source: USER_CROP_SOURCE },
    spring: null,
    summer: null,
  };
}

/** Add a user crop. Validates the input (throws on bad input), persists a minimal record, and
 *  returns the expanded `CropOption`. */
export async function addUserCrop(input: UserCropInput): Promise<CropOption> {
  const parsed = userCropInputSchema.parse(input);
  const rec: StoredUserCrop = {
    id: newUserCropId(),
    schemaVersion: STORED_SCHEMA_VERSION,
    name: parsed.name,
    chillHours: [parsed.chillHours, parsed.chillHours], // single value -> tight range
    createdAt: new Date().toISOString(),
  };
  return guard(async () => {
    await set(rec.id, rec, db());
    return toCropOption(rec);
  });
}

/**
 * Update an existing user crop's name and/or chill figure in place (CRUD edit — locked decision 3).
 * Validates the input, preserves the id and `createdAt`, and overwrites the record under the same id.
 * Throws if the id is missing or not a user crop.
 */
export async function updateUserCrop(id: string, input: UserCropInput): Promise<CropOption> {
  if (!isUserCrop(id)) throw new Error('Not a user crop');
  const parsed = userCropInputSchema.parse(input);
  return guard(async () => {
    const all = await entries<string, unknown>(db());
    const existing = all
      .map(([, v]) => storedUserCropSchema.safeParse(v))
      .filter((r) => r.success)
      .map((r) => r.data)
      .find((r) => r.id === id);
    if (!existing) throw new Error('That crop no longer exists');
    const rec: StoredUserCrop = {
      ...existing,
      name: parsed.name,
      chillHours: [parsed.chillHours, parsed.chillHours],
    };
    await set(rec.id, rec, db());
    return toCropOption(rec);
  });
}

/** List all user crops as full `CropOption`s, oldest first. Corrupt/stale records are skipped. */
export async function listUserCrops(): Promise<CropOption[]> {
  return guard(async () => {
    const all = await entries<string, unknown>(db());
    return all
      .map(([, v]) => storedUserCropSchema.safeParse(v))
      .filter((r) => r.success)
      .map((r) => r.data)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(toCropOption);
  });
}

/** Delete a user crop by id. A no-op for unknown ids (idb-keyval `del` tolerates missing keys). */
export async function deleteUserCrop(id: string): Promise<void> {
  return guard(async () => {
    await del(id, db());
  });
}
