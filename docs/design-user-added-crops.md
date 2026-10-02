# Design — User-added crops (Part B)

Owner: crop-data + appropriate-crops-filter slice
Status: Draft for review (design only — no code changes)
Project folder: `/Users/duynguyen/side_project/Hackathon/Paddock`. All paths below are relative to it.

Related docs: `docs/design-crop-db-ranking.md` (JSON crop DB + zod loader + `rankCrops`, already
implemented), `docs/design-crop-recommendation.md` (recommendation UX reframe), `docs/crop-data-sources.md`
(data contract).

This document covers **one** feature: letting a grower add their **own** crop (name + winter chill
figures from their own research) that is evaluated by the same engine and flows into the
appropriate-crops filter + ranking **exactly like a built-in crop**.

---

## 1. Problem Overview

### 1.1 Context (verified against the code)

- `shared/crops.ts` imports `shared/crops.data.json` at build time, validates it with a zod
  `cropsSchema`, and exports a **synchronous, `Object.freeze`-d `CROP_OPTIONS: CropOption[]`** plus
  the `CropOption`/`Sourced` interfaces and `cropLabel` / `defaultRequirement` / `hasIndicativeData`.
  Validation runs **once at module load** and throws loudly on bad data.
- `CropOption` shape (verified): `id`, `crop`, `type`, `category` (`'stone fruit' | 'pome fruit' |
  'cherry'`), `winter: Sourced & { chillHours: [number, number] }` (**required**), `spring: (Sourced
  & { floweringMonths, frostDamageC }) | null`, `summer: (Sourced & { hotDaysTolerated }) | null`,
  and `heatNote: string`. `Sourced = { indicative: boolean; source: string }`.
- `shared/seasons.ts`:
  - `evaluateWinter(base, fut, requirement, indicative)` — needs winter chill arrays; a crop with a
    valid `winter.chillHours` and a numeric requirement evaluates cleanly.
  - `evaluateSpring(base, fut, crop)` and `evaluateSummer(base, fut, crop)` **both return
    `{ verdict: 'no-data', … }` immediately when `crop.spring` / `crop.summer` is `null`** (verified:
    `if (!spec) return … 'no-data' …`). So a user crop with `spring: null, summer: null` already
    produces clean `no-data` seasons.
  - `overallVerdict` = worst season with data; `no-data` has `SEVERITY -1`, so a winter-only crop's
    overall verdict is driven entirely by its winter verdict. 
  - `evaluateCrop(crop, label, baseYears, futureYears, chillRequirement)` returns a `CropEvaluation`.
- `shared/appropriateCrops.ts` (**this user owns it**): pure `appropriateCrops(evaluations)` filter
  keeping `viable | at-risk`; no ordering, no I/O. Flows user crops through unchanged.
- `shared/ranking.ts` (**owned by someone else**): pure `rankCrops()`. Uses only `CropEvaluation`
  fields (`overall`, `seasons[].future/threshold/indicative`, `label`, `id`). A user crop that is a
  valid `CropEvaluation` ranks with no change to this file.
- `src/components/OptionPicker.tsx`: `OptionState = Record<id, { selected: boolean; requirement:
  number }>`. `initialOptionState()` already maps **every** `CROP_OPTIONS` entry to
  `{ selected: true, requirement: defaultRequirement(c) }` ("consider all crops" default). The picker
  renders `CROP_OPTIONS.map(...)` with a checkbox + per-variety chill number input.
- `src/components/Planner.tsx`:
  - `evaluateAll(analysis, options)` = `CROP_OPTIONS.filter(selected).map(evaluateCrop)` →
    `rankCrops(evaluated)`.
  - `appropriate = appropriateCrops(crops)` drives the "Crops that suit this block" list.
  - `briefCrops = crops.slice(0, 25)` already caps the `/api/explain` payload (server
    `explainSchema.crops` is `.max(25)`).
  - `mergeOptions(saved)` back-fills `OptionState` for ids added since save (defaults new ids to
    `selected: true`).
- `src/lib/savedReports.ts`: idb-keyval `createStore(dbName, storeName)` + `get/set/del/entries`,
  wrapped in a `guard()` that maps `QuotaExceededError` and missing `indexedDB` to friendly errors.
  `SavedReport` persists `{ id, version, savedAt, location, options, analysis, brief }` — it stores
  `OptionState` (ids + requirement + selected) and the `analysis`, **not the crop definitions**.
  `RECORD_VERSION = 1`; `loadReport` rejects records whose `version !== 1` or `schemaVersion !== 2`.
- Tests use `fake-indexeddb/auto` (see `tests/savedReports.test.ts`) and plain-literal fixtures.

### 1.2 Problem statement

Today a crop can only enter the catalogue by editing `shared/crops.data.json` (a repo change). A
grower who has their own chill figure for a variety the app doesn't list cannot evaluate it. We want
the grower to **add their own crop in the browser** (name + winter chill), have it evaluated by the
same `evaluateCrop` engine, and have it appear in the appropriate-crops filter and the ranked list
**indistinguishably in mechanism** from the built-in 10 — while being **visibly flagged** as *their
own figures* (not sourced/indicative built-in data).

### 1.3 The central design problem: one unified model, but sync built-ins vs async user crops

The **key insight** (locked decision 3): a built-in crop and a user crop are **the same thing** — a
`CropOption`. The built-in 10 are just pre-populated reference entries. The app should work with
**one combined crop list**, not two parallel concepts. A user crop is a `CropOption` with a
provenance marker.

The **tension** that every option below must reconcile:

- `CROP_OPTIONS` is **build-time, zod-validated, `Object.freeze`-d, and synchronously available**.
  Many consumers read it synchronously at render/module time: `initialOptionState()`
  (`CROP_OPTIONS.map`), `OptionPicker` render (`CROP_OPTIONS.map`), `Planner.evaluateAll`
  (`CROP_OPTIONS.filter`), `tests/*` imports.
- User crops are **runtime + async**: they live in IndexedDB and resolve via a Promise after first
  paint.

So "one combined list" cannot simply replace `CROP_OPTIONS` with an async value without rippling
async/loading state through every synchronous consumer. The design must deliver the *unified-model
developer experience* (consumers see one `CropOption[]`) while keeping the *synchronous built-in
baseline* intact and layering user crops on top via React state once they load.

---

## 2. Scope / Constraints / Goals

### 2.1 Goals (success criteria)

- G1. A grower can **add** a crop with just a **name** + **winter chill** figure; it persists in
  IndexedDB and survives refresh.
- G2. User crops are modelled as `CropOption`s (unified model) with `spring: null, summer: null`, so
  they flow through `evaluateCrop` → `appropriateCrops` → `rankCrops` **with no change** to
  `seasons.ts`, `appropriateCrops.ts`, or `ranking.ts`.
- G3. The combined list (built-in + user) is what the picker, evaluation and appropriate-crops filter
  operate on — one list, not two parallel paths — while **built-ins remain the synchronous baseline**
  and user crops extend the list via React state after an async load. Loading / empty / error states
  are defined.
- G4. User crops carry a **provenance marker** and are **visibly flagged "your figures"** in the UI,
  distinct from sourced/indicative built-in data.
- G5. User-crop input is **zod-validated** (reusing the crop schema shape where possible): name
  non-empty + length-capped, chill numeric + in-range + `min <= max`. Bad input is rejected and can
  never produce a `CropOption` that breaks `evaluateCrop` or the loader invariants.
- G6. User-crop **ids are unique, stable, and cannot collide** with built-in ids or each other.
- G7. v1 CRUD = **add + list + delete** (edit decision in §5). A saved report that references a
  later-deleted user crop **degrades gracefully** (no crash, dangling id handled).
- G8. No edits required to `shared/ranking.ts`, `src/components/OptionResults.tsx` (Anuj's card), or
  `server/**`. The `/api/explain` max(25) cap is already satisfied by the existing client-side
  top-25 slice (confirmed, §4.9).

### 2.2 Explicitly OUT of scope

- **Ranking internals** — `shared/ranking.ts` is reused verbatim; user crops rank because they are
  valid `CropEvaluation`s.
- **The detailed per-crop card** — `src/components/OptionResults.tsx` (Anuj) is untouched; it receives
  user crops as ordinary `CropEvaluation`s.
- **Server** — `server/**` unchanged. No new API; crop evaluation stays client-side.
- **Re-sourcing / editing built-in crop data** — `shared/crops.data.json` is not modified.
- **Full multi-season user input in v1** — spring and summer are `null` for user crops (engine shows
  "no data"). Keep the model expandable for later, but v1 is **name + winter chill only**.
- **The seasons/climate engine** — `shared/seasons.ts`, `shared/chill.ts`, `/api/climate` unchanged.
- **Cross-device sync / export of user crops** — local IndexedDB only (same as saved reports).

### 2.3 Constraints

- C1. `CROP_OPTIONS` must stay a **synchronous, build-time-validated** value (its many sync consumers
  depend on it). User crops must not force async into those call sites.
- C2. `shared/` stays runtime-agnostic (Vite / esbuild / tsx / vitest) — no `fs`, no Node builtins.
  **The user-crop store belongs in `src/lib/` (browser-only), not `shared/`**, because it uses
  IndexedDB — mirroring where `savedReports.ts` already lives.
- C3. `strict`, `noUnusedLocals`, `noUnusedParameters` on; fully typed. zod already a dependency;
  idb-keyval already a dependency.
- C4. User crops must satisfy the same `cropSchema` invariants the loader guarantees, so a user crop
  is substitutable for a built-in anywhere a `CropOption` is expected.
- C5. Ids key `OptionState`, saved reports, and chart series — they must be stable strings matching
  the loader's id rule (`^[a-z0-9-]+$`, max 60) so a user crop is indistinguishable in mechanism.

---

## 3. High Level Design

Two decisions need options: **(i)** how async user crops combine with the synchronous built-in list
(the central sync-vs-async reconciliation), and **(ii)** the persistence store shape.

### 3.1 Decision (i) — Merging async user crops with the synchronous built-in list

This is the central design problem (§1.3).

**Option (i)-A — Make the whole crop list async (replace `CROP_OPTIONS` consumers with a Promise /
async source).** `CROP_OPTIONS` becomes (or is wrapped by) an async loader that reads built-ins +
user crops together; every consumer awaits it.

- Pros: Conceptually "one list" from a single source; no "built-in vs overlay" split in the data
  layer.
- Cons: Breaks C1 and has a **large blast radius**. `initialOptionState()`, `OptionPicker` render,
  `Planner.evaluateAll`, and the tests all read `CROP_OPTIONS` **synchronously** today. Making it
  async forces loading/empty states, Suspense or `useEffect`+state into all of them, changes the
  signature of `initialOptionState()` (currently returns `OptionState` synchronously), and breaks
  `tests/seasons.test.ts` / `tests/crops.test.ts` which import `CROP_OPTIONS` synchronously. High
  cost, high regression risk, for a feature that only *adds a few* entries.

**Option (i)-B — React-state overlay: built-ins are the synchronous baseline; user crops load async
and extend the in-memory list via React state (recommended).** `CROP_OPTIONS` is unchanged (sync,
frozen, validated). A new hook `useCombinedCrops()` holds `combined: CropOption[]` in React state,
initialised **synchronously** to `CROP_OPTIONS` (so first paint and SSR-free render show built-ins
immediately), then on mount loads user crops from IndexedDB and sets `combined = [...CROP_OPTIONS,
...userCrops]`. The hook also exposes `addCrop`, `deleteCrop`, `status` (`'loading' | 'ready' |
'error'`). `Planner` and `OptionPicker` consume `combined` from this hook/context instead of
importing `CROP_OPTIONS` directly.

- Pros: **Preserves C1** — `CROP_OPTIONS` stays synchronous; nothing in `shared/` changes. Initial
  render shows the built-in 10 instantly; user crops appear once loaded (a brief, graceful fill-in,
  not an empty-screen spinner). The "one combined list" DX is delivered at the React layer: consumers
  see a single `CropOption[]`. Loading/empty/error states are localised to the hook. `shared/` stays
  runtime-agnostic (store is browser-only in `src/lib/`). Tests that import `CROP_OPTIONS` keep
  working; the hook is tested with `fake-indexeddb`.
- Cons: Two *sources* behind one *list* (built-in module + user store); the hook must concatenate and
  dedupe. The picker's crop set changes after mount, so `OptionState` must be back-filled when user
  crops arrive (handled in §4.6, reusing the existing `mergeOptions` pattern).

**Recommendation: (i)-B (React-state overlay).** It is the only option that delivers the unified
single-list model to consumers *without* breaking the synchronous `CROP_OPTIONS` contract that
`initialOptionState`, the picker, `evaluateAll`, and the tests depend on. The built-ins are the
guaranteed-present baseline; user crops are an async extension layered in via state. This keeps the
blast radius inside a new hook + minimal Planner/OptionPicker wiring, with `shared/` untouched.

### 3.2 Decision (ii) — Persistence store shape

Both options reuse idb-keyval exactly as `savedReports.ts` does: `createStore(dbName, storeName)`
plus `get/set/del/entries`, wrapped in the same `guard()`-style error mapping.

**Option (ii)-A — One record per crop, keyed by crop id (recommended).** A dedicated store
`createStore('Paddock-user-crops', 'crops')`. Each user crop is `set(crop.id, storedCrop, store)`;
list via `entries(store)`; delete via `del(id, store)`. `storedCrop` is the minimal persisted shape
(§4.3), re-validated and expanded to a full `CropOption` on load.

- Pros: Mirrors the saved-reports data-store pattern (per-id records); delete is a single `del(id)`;
  no read-modify-write race when adding/deleting; `entries()` gives the full list in one call;
  scales fine for the handful of crops a grower adds.
- Cons: Listing reads all records (trivial at this volume — far smaller than saved reports' analyses).

**Option (ii)-B — Single array under one key.** Store the whole `UserCrop[]` under one key
(`set('all', crops)`), read-modify-write on add/delete.

- Pros: One key; whole list in one `get`.
- Cons: Read-modify-write add/delete is race-prone and loses the clean per-id delete; diverges from
  the established per-id saved-reports pattern; no real benefit at this scale.

**Recommendation: (ii)-A (one record per crop id).** It mirrors the existing `savedReports.ts` store
pattern (per-id `set`/`del`, `entries` to list), avoids read-modify-write races, and makes delete a
one-liner keyed by the same id used everywhere else. Validation on load (§4.4) means a corrupt or
stale record is skipped, not fatal.

---

## 4. Low Level Design

### 4.1 File list (new / changed)

New:
- `src/lib/userCrops.ts` — the user-crop IndexedDB store (idb-keyval, modeled on `savedReports.ts`):
  `addUserCrop`, `listUserCrops`, `deleteUserCrop`, the `UserCropInput` zod schema, the id scheme,
  and the stored→`CropOption` expansion. Browser-only (uses IndexedDB), so it lives in `src/lib`, not
  `shared/`.
- `src/lib/useCombinedCrops.ts` — React hook (or small context provider) that holds the combined
  `CropOption[]` (built-ins baseline + async user overlay) plus `status`, `addCrop`, `deleteCrop`.
- `src/components/AddCropForm.tsx` — the add/list/delete UI (name + chill inputs, user-crop list with
  delete buttons, "your figures" flag). Rendered inside Step 2, near `OptionPicker`.
- `tests/userCrops.test.ts` — store round-trip, validation rejects bad input, id uniqueness/no
  collision, stored→CropOption expansion, dangling-id graceful handling. Uses `fake-indexeddb/auto`.
- `tests/userCropsFlow.test.ts` (or an addition to an existing flow test) — a user crop flows through
  `evaluateCrop` → `appropriateCrops` (and ranks via `rankCrops`) identically to a built-in.

Changed (this user's slice, in scope — minimal):
- `src/components/Planner.tsx` — source the crop list from `useCombinedCrops()` instead of importing
  `CROP_OPTIONS` directly in `evaluateAll`; render `<AddCropForm>` in Step 2; extend `mergeOptions`
  to cover user-crop ids and dangling ids (§4.6). (Scope of change spelled out in §4.7.)
- `src/components/OptionPicker.tsx` — accept the combined crop list as a prop instead of importing
  `CROP_OPTIONS` directly, so the picker renders built-in + user crops uniformly. (Minimal, §4.8.)

Explicitly NOT changed:
- `shared/crops.ts`, `shared/crops.data.json`, `shared/seasons.ts`, `shared/chill.ts`,
  `shared/ranking.ts`, `shared/appropriateCrops.ts`, `shared/types.ts`.
- `src/components/OptionResults.tsx` (Anuj), `server/**`, `src/lib/savedReports.ts`.

### 4.2 Unified model: the user crop IS a `CropOption`

A user crop is constructed as a full, schema-valid `CropOption` with:

```ts
// Conceptual shape produced by the store's expansion step (not a new type — it IS a CropOption).
{
  id: 'user-<uuid>',                 // §4.5 id scheme
  crop: <user name>,                 // the grower's crop name
  type: 'Your figures',              // short type label; also drives the provenance badge (see §4.6)
  category: 'stone fruit',           // see §5 open question — a required enum; v1 picks a default
  heatNote: '',                      // no heat data for user crops (heatNote is a string; '' is fine)
  winter: {
    chillHours: [min, max],          // the grower's figure (single value → [v, v], §4.4)
    indicative: true,                // user figures are self-asserted, not app-sourced
    source: 'Your own figure',       // provenance text (see §4.6)
  },
  spring: null,                      // engine returns 'no-data' for null — verified in seasons.ts
  summer: null,                      // engine returns 'no-data' for null — verified in seasons.ts
}
```

Why this satisfies the engine (verified against `shared/seasons.ts`):
- `evaluateWinter` needs a numeric `requirement` + `winter.indicative` and the climate arrays — a
  valid `winter.chillHours` + `defaultRequirement(c)` (or the grower's figure) works.
- `evaluateSpring(_, _, crop)` returns `no-data` immediately because `crop.spring` is `null`
  (`if (!spec) return … 'no-data'`). Same for `evaluateSummer` with `crop.summer === null`.
- `overallVerdict` = worst season with data; `no-data` seasons (SEVERITY -1) are ignored, so a
  user crop's overall verdict is its **winter** verdict — exactly the intended behaviour.
- Therefore `evaluateCrop(userCrop, cropLabel(userCrop), base, fut, requirement)` returns a valid
  `CropEvaluation`, which `appropriateCrops` filters and `rankCrops` orders with no special-casing.

Note on `category`: it is a **required enum** on `CropOption` (`'stone fruit' | 'pome fruit' |
'cherry'`). v1 does not ask the grower for it (minimal fields = name + chill). The store defaults it
(see §5, open question — default to `'stone fruit'` or add an optional category picker). It only
affects grouping/labels, never evaluation.

### 4.3 Persisted shape (minimal) vs runtime `CropOption`

Keep IndexedDB records **minimal and future-proof**; expand to a full `CropOption` on load. This
means adding fields later (spring/summer) doesn't invalidate old records.

```ts
// src/lib/userCrops.ts — the PERSISTED record (minimal)
interface StoredUserCrop {
  id: string;                 // 'user-<uuid>'
  schemaVersion: 1;           // bump if the stored shape changes; old records skipped on load
  name: string;               // the grower's crop name (-> CropOption.crop)
  chillHours: [number, number];
  createdAt: string;          // ISO, for stable list ordering
  // category?: Category       // optional; see §5. If absent, expansion defaults it.
}
```

### 4.4 Validation (zod, reusing the loader's shape)

Reuse the same field rules the loader enforces so a user crop is substitutable for a built-in. The
**input** schema validates what the form collects; the stored record and the expanded `CropOption`
inherit those guarantees.

```ts
// src/lib/userCrops.ts
import { z } from 'zod';

const NAME_MAX = 60;              // matches crop/type string sanity; keep labels short
const CHILL_MAX = 2000;           // matches OptionPicker's existing requirement input cap (0..2000)

export const userCropInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter a crop name').max(NAME_MAX),
  // Accept EITHER a single value (tight range) OR an explicit [min,max]. Design picks single-value
  // UX for v1 (cleaner): one "winter chill hours" number -> [v, v]. (See §5 if a range is preferred.)
  chillHours: z
    .number({ invalid_type_error: 'Enter chill hours as a number' })
    .int()
    .min(0)
    .max(CHILL_MAX),
  // If a range form is chosen instead:
  // chillHours: z.tuple([z.number().int().min(0).max(CHILL_MAX),
  //                      z.number().int().min(0).max(CHILL_MAX)])
  //   .refine(([lo, hi]) => lo <= hi, 'min must be <= max'),
});

// Stored-record schema used on LOAD to reject corrupt/stale records (never throw the whole app).
const storedUserCropSchema = z.object({
  id: z.string().regex(/^user-[a-z0-9-]+$/).max(60),
  schemaVersion: z.literal(1),
  name: z.string().trim().min(1).max(NAME_MAX),
  chillHours: z
    .tuple([z.number().int().min(0).max(CHILL_MAX), z.number().int().min(0).max(CHILL_MAX)])
    .refine(([lo, hi]) => lo <= hi, 'chillHours must be [min, max] with min <= max'),
  createdAt: z.string(),
});
```

**Decision — single value vs explicit range (locked decision 1 asks us to choose the cleaner UX):**
v1 collects **one "winter chill hours" number** and stores it as a **tight range `[v, v]`**. This is
the cleaner UX (one field, matches how a nursery usually quotes a single figure), still satisfies
`winter.chillHours: [number, number]`, and `defaultRequirement` returns `v` (the midpoint of
`[v, v]`). An optional "±tolerance / range" affordance is a trivial later extension (§5).

Rejection behaviour: the form calls `userCropInputSchema.safeParse`; on failure it shows the zod
message inline and does **not** write. Because the schema caps and type-checks every field, a
malformed crop can never reach the store, the loader invariants, or `evaluateCrop`.

### 4.5 Id scheme — unique, stable, no collision

```ts
const newUserCropId = () =>
  `user-${
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }`;
```

- Prefix `user-` guarantees **no collision with built-in ids** (built-ins are `peach-standard`,
  `apple-mainstream`, etc. — none start with `user-`). It also makes provenance detectable from the
  id alone as a cheap fallback.
- UUID guarantees **no collision between user crops**.
- The id matches the loader's id rule (`^[a-z0-9-]+$`, max 60 — `crypto.randomUUID()` is lowercase
  hex + hyphens, and `user-` + 36 chars = 41 ≤ 60), so a user crop's id is a valid `CropOption` id
  everywhere (OptionState key, saved-report reference, chart series key). Reuses the exact id pattern
  `savedReports.ts` already uses for report ids.

### 4.6 Provenance — "your figures"

Fit the existing `Sourced { indicative, source }` model plus a cheap origin signal:

- `winter.indicative = true` — user figures are self-asserted, not app-sourced. This reuses the
  existing "indicative" badge pathway (`hasIndicativeData` already returns true for them), so user
  crops get the existing indicative treatment for free.
- `winter.source = 'Your own figure'` — a distinct, human-readable provenance string. The built-ins
  use citations or `''`; `'Your own figure'` is unmistakably different and is what the UI surfaces.
- **Origin detection without a new `CropOption` field:** the `user-` id prefix is an unambiguous,
  zero-schema-change origin marker. A tiny helper `isUserCrop(id) => id.startsWith('user-')` lets any
  UI distinguish user crops. (The `type: 'Your figures'` label reinforces this in the picker.)

Why not add `origin: 'user' | 'builtin'` to `CropOption`? That would change the shared type and ripple
into the loader/schema and `shared/`. The `user-` id prefix + `source: 'Your own figure'` +
`indicative: true` achieve the same visible distinction with **no change to `shared/`** — preferred.
(If a first-class `origin` field is wanted later, it's an additive optional field; flagged in §5.)

UI distinction (credibility is judged, so this must be visible):
- In the picker (`AddCropForm` list and `OptionPicker` row): a small badge **"Your figures"** next to
  user crops, visually distinct from the built-in "indicative" badge (e.g. a different colour /
  outline). Wording is a §5 open question.
- In results, user crops already render with the existing indicative styling; because `source` reads
  "Your own figure", any tooltip/caption that shows the source makes the distinction explicit.

### 4.7 `useCombinedCrops()` hook + Planner integration

```ts
// src/lib/useCombinedCrops.ts
import { useEffect, useState, useCallback } from 'react';
import { CROP_OPTIONS } from '../../shared/crops';
import type { CropOption } from '../../shared/crops';
import { addUserCrop, deleteUserCrop, listUserCrops, type UserCropInput } from './userCrops';

type Status = 'loading' | 'ready' | 'error';

export function useCombinedCrops() {
  // Built-ins are the SYNCHRONOUS baseline: first render already has the 10 built-ins.
  const [userCrops, setUserCrops] = useState<CropOption[]>([]);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let alive = true;
    listUserCrops()
      .then((cs) => { if (alive) { setUserCrops(cs); setStatus('ready'); } })
      .catch(() => { if (alive) setStatus('error'); }); // built-ins still usable on error
    return () => { alive = false; };
  }, []);

  const combined: CropOption[] = [...CROP_OPTIONS, ...userCrops]; // one list; built-ins first

  const addCrop = useCallback(async (input: UserCropInput) => {
    const created = await addUserCrop(input);      // validates + persists, returns the CropOption
    setUserCrops((cs) => [...cs, created]);
    return created;
  }, []);

  const removeCrop = useCallback(async (id: string) => {
    await deleteUserCrop(id);
    setUserCrops((cs) => cs.filter((c) => c.id !== id));
  }, []);

  return { combined, userCrops, status, addCrop, removeCrop };
}
```

- **Sync baseline preserved (C1):** `combined` always starts with the full built-in 10 synchronously;
  user crops append once the async load resolves. Initial render is never empty.
- **Loading state:** `status === 'loading'` → built-ins render immediately; the user-crop *section*
  can show a tiny "loading your crops…" line. No blocking spinner over the whole picker.
- **Empty state:** no user crops → the add form shows with an empty list ("You haven't added any
  crops yet").
- **Error state:** `status === 'error'` (IndexedDB blocked / private browsing) → built-ins still fully
  usable; the add form shows a non-fatal notice ("Can't save crops on this device — private browsing
  may be blocking storage.") reusing the `StorageUnavailableError` message style from
  `savedReports.ts`. The app never crashes; built-ins are the guaranteed baseline.

In `Planner.tsx`, `evaluateAll` sources the list from the hook instead of importing `CROP_OPTIONS`:

```ts
// before: CROP_OPTIONS.filter(...).map(...)
// after:  combined.filter((c) => options[c.id]?.selected).map((c) => evaluateCrop(c, cropLabel(c), ...))
```

`crops`, `appropriate = appropriateCrops(crops)`, `briefCrops = crops.slice(0,25)`, `rankCrops`
ordering, PDF, Brief — all unchanged; they just operate over the combined list. Scope of the Planner
edit: thread `combined`/`status`/`addCrop`/`removeCrop` from the hook, pass `combined` to
`OptionPicker` and `AddCropForm`, and update the two `evaluateAll` call sites (render memo + saved
`openSaved`/`downloadSaved`) to take the combined list.

**OptionState handling when user crops arrive.** `initialOptionState()` builds state from
`CROP_OPTIONS` at mount (before user crops load). When user crops resolve (or are added), their ids
are missing from `OptionState`. Reuse the existing back-fill pattern: whenever `combined` changes,
back-fill any missing id with `{ selected: true, requirement: defaultRequirement(c) }` (user crops
default to **selected**, consistent with the "consider all crops" default, and `requirement` = their
own chill figure since `defaultRequirement([v,v]) = v`). This is the same mechanism `mergeOptions`
already uses for crops added since a report was saved — generalise it to run on combined-list change.

### 4.8 Minimal `OptionPicker` change

Currently `OptionPicker` imports `CROP_OPTIONS` and maps it. The minimal change is to **accept the
crop list as a prop** (`crops: CropOption[]`) so it renders the combined list uniformly, and to show
the "Your figures" badge for user crops (via `isUserCrop(c.id)`), `initialOptionState()` stays in
`OptionPicker.tsx` but should also accept an optional crop-list argument so callers can seed state
from the combined list; defaulting to `CROP_OPTIONS` keeps the existing test
(`tests/savedReports.test.ts` calls `initialOptionState()` with no args) working. This is the only
`OptionPicker` edit; it does not change `OptionState`'s shape.

The **add/list/delete UI** lives in a **new** `AddCropForm.tsx` rendered in Step 2 beside the picker,
so the picker edit stays minimal and the CRUD UI can't collide with other work on `OptionPicker`.

### 4.9 Saved reports: dangling-id handling (deleted user crop)

Saved reports store `OptionState` (ids + requirement + selected) and the `analysis`, **not** crop
definitions (verified in `savedReports.ts`). So a report saved while a user crop existed stores that
crop's id in `OptionState`, but the crop's **definition** lives only in the user-crop store. If the
grower later deletes that user crop, reopening the report yields a **dangling id**: an `OptionState`
entry whose id is in neither `CROP_OPTIONS` nor the loaded user crops.

Graceful handling (no crash, no phantom crop):
- `evaluateAll` already iterates the **crop list** and looks up `options[c.id]` — it never iterates
  `OptionState` keys. So a dangling `OptionState` entry simply has **no matching crop** and is
  silently ignored during evaluation. The deleted crop just doesn't appear — correct degradation.
- `mergeOptions` must not resurrect it: keep merging over the **combined crop list's ids** (as it does
  over `initialOptionState()`'s keys today), so dangling ids in the saved `OptionState` are dropped,
  not re-added. (Current `mergeOptions` maps over `Object.keys(defaults)` = built-in ids; generalise
  `defaults` to the combined list so user crops present *now* are included and ids absent *now* —
  including deleted ones — are excluded.)
- No new user-facing error is needed; the report still loads and shows every crop that currently
  exists. Optionally, a subtle note ("A crop you'd added was removed and isn't shown") — flagged §5,
  not required.

**No `SavedReport.version` / `schemaVersion` bump needed.** `OptionState`'s type is unchanged
(`Record<id, {selected, requirement}>`); user-crop ids are just more keys of the same shape. Old
reports load under `RECORD_VERSION = 1` / `schemaVersion = 2` exactly as before. Reports never stored
crop definitions, so nothing in the stored schema changes.

### 4.10 `/api/explain` max(25) interaction (confirmed)

Confirmed: `briefCrops = crops.slice(0, 25)` in `Planner.tsx` already caps the payload, and the
server `explainSchema.crops` is `.max(25)`. Adding user crops only grows `crops`; the existing top-25
slice still bounds the request. **No server change and no new cap are needed** — the existing
client-side slice already covers user crops.

### 4.11 Store API (idb-keyval, modeled on `savedReports.ts`)

```ts
// src/lib/userCrops.ts
import { createStore, del, entries, set, type UseStore } from 'idb-keyval';
import type { CropOption } from '../../shared/crops';

export type UserCropInput = z.infer<typeof userCropInputSchema>; // { name, chillHours }

let store: UseStore | null = null;
function db(): UseStore {
  if (typeof indexedDB === 'undefined') throw new StorageUnavailableError();
  store ??= createStore('Paddock-user-crops', 'crops');  // NEW store, same lib as savedReports
  return store;
}
// Reuse the same guard() QuotaExceeded / unavailable mapping as savedReports.ts (copy or share).

export async function addUserCrop(input: UserCropInput): Promise<CropOption> {
  const parsed = userCropInputSchema.parse(input);        // throws on bad input (form pre-validates)
  const rec: StoredUserCrop = {
    id: newUserCropId(),
    schemaVersion: 1,
    name: parsed.name,
    chillHours: [parsed.chillHours, parsed.chillHours],   // single value -> tight range
    createdAt: new Date().toISOString(),
  };
  return guard(async () => {
    await set(rec.id, rec, db());
    return toCropOption(rec);                              // expansion to full CropOption
  });
}

export async function listUserCrops(): Promise<CropOption[]> {
  return guard(async () => {
    const all = await entries<string, unknown>(db());
    return all
      .map(([, v]) => storedUserCropSchema.safeParse(v))   // skip corrupt/stale records, don't throw
      .filter((r): r is { success: true; data: StoredUserCrop } => r.success)
      .map((r) => r.data)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(toCropOption);
  });
}

export async function deleteUserCrop(id: string): Promise<void> {
  return guard(async () => { await del(id, db()); });
}

/** Expand a stored record into a full, schema-valid CropOption (the unified model, §4.2). */
function toCropOption(rec: StoredUserCrop): CropOption {
  return {
    id: rec.id,
    crop: rec.name,
    type: 'Your figures',
    category: 'stone fruit',               // default; see §5
    heatNote: '',
    winter: { chillHours: rec.chillHours, indicative: true, source: 'Your own figure' },
    spring: null,
    summer: null,
  };
}
```

- `StorageUnavailableError` + `guard()` are the exact pattern in `savedReports.ts`. To avoid
  duplication, factor them into a tiny shared `src/lib/idbGuard.ts` and import from both, or copy
  verbatim (copy is acceptable for v1; flagged §5).
- `listUserCrops` uses `safeParse` + filter so a corrupt/old-schema record is **skipped**, never
  fatal — the built-in baseline and the rest of the user crops survive.

### 4.12 Tests

`tests/userCrops.test.ts` (uses `fake-indexeddb/auto`, plain fixtures — matches `savedReports.test.ts`):
- **Round-trip:** `addUserCrop({ name:'Mango', chillHours:100 })` then `listUserCrops()` returns one
  crop with `id` starting `user-`, `crop:'Mango'`, `winter.chillHours:[100,100]`, `spring:null`,
  `summer:null`, `winter.source:'Your own figure'`, `winter.indicative:true`. Survives a fresh
  `listUserCrops()` call (persistence).
- **Validation rejects bad input:** empty name → throws/`safeParse` fails; name > 60 chars → fails;
  chill negative → fails; chill > 2000 → fails; non-numeric chill → fails; (range form) `min>max` →
  fails. None of these write a record.
- **Id uniqueness / no collision:** two `addUserCrop` calls get distinct ids; no id equals any
  built-in `CROP_OPTIONS` id; every id matches `^user-[a-z0-9-]+$` and `^[a-z0-9-]+$` (loader rule).
- **Expansion correctness:** `toCropOption` output satisfies the `CropOption` shape the engine needs
  (winter present, spring/summer null).
- **Dangling-id graceful load:** add a crop, build `OptionState` including its id, delete the crop,
  then `mergeOptions`/evaluate over the combined list → the dangling id is dropped, no throw, output
  contains only existing crops. (Can live here or in the flow test.)
- **Corrupt record skipped:** `set('user-x', {garbage})` then `listUserCrops()` returns `[]` (or only
  the valid ones), no throw.

`tests/userCropsFlow.test.ts` (pure, literal `YearStat[]` fixtures like `tests/ranking.test.ts` /
`tests/seasons.test.ts`):
- A user crop (`spring:null, summer:null`, a given `winter.chillHours`) run through
  `evaluateCrop(userCrop, cropLabel(userCrop), base, fut, requirement)` yields a `CropEvaluation`
  whose spring/summer seasons are `no-data` and whose overall verdict equals its winter verdict.
- That evaluation passed to `appropriateCrops([...])` is included iff its winter verdict is
  `viable`/`at-risk` — i.e. it flows through the filter **identically to a built-in**.
- `rankCrops([...builtins, userEval])` places the user crop in the correct bucket (no special-casing;
  confirms the unified model holds through ranking without editing `ranking.ts`).

Existing tests unaffected: `initialOptionState()` keeps its no-arg call signature (default
`CROP_OPTIONS`), so `tests/savedReports.test.ts` is untouched.

### 4.13 Implementation order (for the implementer)
1. `src/lib/userCrops.ts` (store + schema + id + expansion) and `tests/userCrops.test.ts`. Run tests.
2. `src/lib/useCombinedCrops.ts` hook.
3. `src/components/AddCropForm.tsx` (add/list/delete + "Your figures" badge).
4. Wire `Planner.tsx` (source list from hook, render `AddCropForm`, generalise `mergeOptions`/
   back-fill over the combined list) and the minimal `OptionPicker.tsx` prop change.
5. `tests/userCropsFlow.test.ts`. Full `npm run lint && npm test`; manual smoke: add a crop → it
   appears in the picker and ranked list → refresh → still there → delete → gone → reopen a report
   that referenced it → loads cleanly without it.

---

## 5. Risks & Open Questions

1. **Sync→async blast radius (primary risk).** The whole design hinges on **not** making
   `CROP_OPTIONS` async. Option (i)-B keeps built-ins synchronous and overlays user crops via React
   state, so `initialOptionState()`, `OptionPicker`, `evaluateAll`, and all `CROP_OPTIONS`-importing
   tests keep working. The only behavioural change is the picker's crop set growing after mount, which
   the existing `mergeOptions`/back-fill pattern already handles. **Open:** confirm the React-state
   overlay (vs a fully-async crop source) is acceptable.

2. **Single value vs explicit range for chill (locked decision 1 left the UX to us).** v1 collects a
   single number, stored as `[v, v]`. Cleaner UX, satisfies the `[number, number]` type, and
   `defaultRequirement` returns `v`. **Open:** accept single-value v1, or expose min/max from the
   start? (The store already persists a range, so moving to a range later needs only a form change.)

3. **`category` for user crops.** `CropOption.category` is a required enum but minimal fields are
   name + chill only. v1 defaults it to `'stone fruit'` (affects only grouping/labels, never
   evaluation). **Open:** accept the default, or add an optional category dropdown in `AddCropForm`?

4. **Provenance representation.** Design uses `winter.source = 'Your own figure'` + `indicative:true`
   + the `user-` id prefix (via `isUserCrop`) rather than adding an `origin` field to the shared
   `CropOption` type — so `shared/` is untouched. **Open:** is the id-prefix + source-string approach
   enough, or is a first-class optional `origin: 'user' | 'builtin'` field wanted (additive, but
   touches the shared type/schema)?

5. **Provenance UI wording.** Proposed badge "Your figures" and source text "Your own figure".
   Credibility is judged, so the wording matters. **Open:** confirm the copy, and whether the badge
   should be visually stronger than the built-in "indicative" badge.

6. **Include edit in v1?** Scope is add + list + delete. Edit is implementable as delete + re-add, or
   as an `updateUserCrop(id, input)` (`set` over the same id — trivial with the per-id store). **Open:**
   include a lightweight edit, or defer? Recommendation: **defer** (delete + re-add covers it) to keep
   v1 tight; the per-id store makes adding edit later a one-function change.

7. **Dangling-id user note.** Deleted-crop references degrade silently (the crop just doesn't appear).
   **Open:** is silent degradation fine, or should a reopened report show a subtle "a crop you added
   was removed" note? Recommendation: silent for v1 (the simplest correct behaviour).

8. **Guard/StorageUnavailableError duplication.** The store reuses the `guard()`/
   `StorageUnavailableError` logic from `savedReports.ts`. **Open:** factor into a shared
   `src/lib/idbGuard.ts` (cleaner) vs copy (faster, acceptable for v1). Recommendation: extract to a
   shared module to avoid drift — but it is a `savedReports.ts` touch, so confirm that small refactor
   is acceptable, otherwise copy.

9. **Store schema evolution.** `StoredUserCrop.schemaVersion = 1`; `listUserCrops` skips records that
   fail `storedUserCropSchema` (incl. future-version records). This means a user who downgrades loses
   newer-schema crops from the list (they remain in IndexedDB, just not shown). Acceptable for a local
   planning tool; flagged for awareness.
