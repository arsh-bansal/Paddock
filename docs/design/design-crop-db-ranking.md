# Design — Crop Database File, More Tree-Fruit Crops, and Location → Ranked Best-Fit Crops

Owner: Huu
Status: Draft for review (design only — no code changes)
Scope: Paddock orchard planner. Three related features, one developer.
Related docs: `docs/crop-data-sources.md` (data contract), `docs/seasons-and-reports.md`.

This document is the single source of truth for three features that share one surface
(`shared/crops.ts` and `src/components/Planner.tsx`):

- **Item 2 (anchor):** turn the hardcoded `CROP_OPTIONS` array into a dynamic data file + a
  zod-validated loader, preserving the current exported API.
- **Item 3:** add more tree-fruit crops — mostly data entry into the new file, once Item 2 lands.
- **Item 1:** replace the manual crop picker with a **location → ranked list of best-fit crops**,
  implemented as a pure ranking function in `shared/` plus UI integration that *composes with* the
  existing per-crop card rendering (not an overwrite).

---

## 1. Problem Overview

### 1.1 Context (verified against the code)
- Crops live today as a hardcoded TypeScript array `CROP_OPTIONS: CropOption[]` in
  `shared/crops.ts`, together with the `CropOption`/`Sourced` interfaces and three helpers:
  `cropLabel(c)`, `defaultRequirement(c)`, `hasIndicativeData(c)`.
- Crop evaluation is **client-side**. `GET /api/climate` returns a `ClimateAnalysis`
  (`schemaVersion: 2`) with per-year `YearStat[]`. **Crops are never sent to that endpoint.**
- `shared/seasons.ts` exposes `evaluateCrop(crop, label, baseYears, futureYears, chillRequirement)`
  → `CropEvaluation { id, label, overall, seasons[], heatNote, chillRequirement }`, with verdicts
  `'viable' | 'at-risk' | 'not-viable' | 'no-data'`.
- `src/components/Planner.tsx`:
  - `evaluateAll(analysis, options)` filters `CROP_OPTIONS` by `options[c.id].selected` and maps
    `evaluateCrop` over the selection.
  - Already has a `RANK` map and a `topCrop()` helper (verdict-only ranking for the saved-report
    "best crop" label).
  - Renders `OptionResults`, `ChillChart`, `SeasonsPanel`, `AdaptationNotes`, `Brief`, `Methods`.
  - Has `mergeOptions(saved)` that back-fills `OptionState` for crops added since a report was saved.
- `src/components/OptionPicker.tsx` holds `OptionState = Record<id, { selected, requirement }>`
  and `initialOptionState()` (four crops pre-ticked). The grower can type a per-crop cultivar chill
  figure (`requirement`).
- `src/components/OptionResults.tsx` already sorts crops by verdict and renders a per-crop card. Its
  header comment states it will be **replaced by Anuj's four-season report card (task 6)**.
- The only server contract touching crops is `POST /api/explain` (optional AI brief). Its
  `explainSchema` in `server/index.ts` allows **max 25 crops**, each with **max 3 seasons** and the
  exact `CropEvaluation` shape.
- Saved reports (`src/lib/savedReports.ts`) persist `OptionState` + the full `ClimateAnalysis` in
  IndexedDB, gated by `RECORD_VERSION = 1` and `analysis.schemaVersion === 2`.
- Tests in `tests/seasons.test.ts` import `CROP_OPTIONS` and `type CropOption` from `shared/crops`.

### 1.2 Problem statement
1. Adding a crop today means editing code (`CROP_OPTIONS`). The goal is "**add a crop by adding a
   data entry, not by editing code**."
2. The crop catalogue is too small; the season schema already supports winter/spring/summer and
   should hold at least the 10 crops documented in `docs/crop-data-sources.md`, and be extensible.
3. The grower must manually tick crops. We want "**where's my block → here are the best-fit crops,
   ranked**," while still letting the grower enter their own cultivar chill figure and while leaving
   the per-crop card rendering free for Anuj's report card to drop in.

### 1.3 Runtime fan-out that constrains every option (important)
`shared/` is consumed by **four** runtimes, so any loader/data decision must work in all of them:
- **Vite client build** (`vite build`, React app).
- **esbuild server bundle** (`esbuild server/index.ts --bundle --platform=node --format=esm
  --packages=external`).
- **tsx scripts** (`scripts/snapshot.ts`, `dev:api`).
- **vitest** (`tests/**`).

`tsconfig.json` uses `moduleResolution: "bundler"`, `allowImportingTsExtensions: true`,
`isolatedModules: true`, and **does not currently set `resolveJsonModule`**. This matters for the
JSON-import option below.

---

## 2. Scope / Constraints / Goals

### 2.1 Goals (success criteria)
- G1. Crops are defined in a **data file**, not code. Adding/editing a crop is a data edit plus a
  validation pass — no change to logic.
- G2. The **public API of `shared/crops.ts` is unchanged**: `CropOption`, `Sourced`, `CROP_OPTIONS`,
  `cropLabel`, `defaultRequirement`, `hasIndicativeData` all keep their current signatures and
  types. Downstream imports (`Planner.tsx`, `OptionPicker.tsx`, `ChillChart.tsx`, `seasons.ts`,
  `tests/seasons.test.ts`) compile and pass unchanged.
- G3. Data is **zod-validated** on load; invalid data fails loudly (build/test/startup), never
  silently serves a partial catalogue.
- G4. The schema demonstrably holds **all 10 crops** from `docs/crop-data-sources.md`, keeps the
  per-season `Sourced { indicative, source }` credibility wrapper, and is extensible to more.
- G5. A **pure ranking function** in `shared/` orders all evaluated crops by fit, with deterministic
  tie-breaks and unit tests.
- G6. The planner offers a **location → ranked list** flow that **composes with** the existing
  per-crop card (Item 1 does not overwrite `OptionResults.tsx`; it feeds it an ordered list and adds
  a selection/entry affordance above it).
- G7. The grower keeps the ability to enter a **per-crop cultivar chill figure** (`requirement`).
- G8. `/api/explain`'s 25-crop limit is explicitly handled so auto-evaluating a grown catalogue
  cannot start failing the AI brief.
- G9. Saved reports remain loadable (backward compatible) across the `OptionState` change.

### 2.2 Explicitly OUT of scope
- **The seasonal-analysis engine.** `shared/seasons.ts`, `shared/chill.ts`, and the per-year
  `YearStat` maths already exist and are correct. We call `evaluateCrop` as-is; we do not touch
  scoring thresholds, verdict bands, or the chill model.
- **Anuj's four-season report card (task 6).** We must not rename, move, or rewrite
  `OptionResults.tsx` in a way that collides with his replacement. Item 1 produces the *ordered data*
  and a *selection/entry UX*; the per-crop card remains a separate, swappable renderer.
- **Teammate-owned files generally.** No edits outside Huu's surface except the two unavoidable,
  explicitly-scoped touches: the `/api/explain` cap in `server/index.ts` (Section 4.6) and
  `OptionState`/`mergeOptions` handling in `Planner.tsx`/`OptionPicker.tsx` (Section 4.7). Any change
  to `OptionResults.tsx` is limited to it accepting an already-ordered list (it already sorts, so it
  can stay untouched — see 4.5).
- **Sourcing the data values themselves.** Values and confidence come from `docs/crop-data-sources.md`.
  This design does not re-adjudicate citations; it carries the `indicative`/`source` flags through.
- **Server-side crop evaluation.** Evaluation stays client-side; `/api/climate` is unchanged.
- **Changing the chill model** (net vs plain Chill Hours) or resolving the cherry 700-vs-1000–1500
  question — surfaced as an open question for the user (Section 5), not decided here.

### 2.3 Constraints
- C1. Must compile and run under all four runtimes in 1.3 (no Node-only APIs like `fs` in `shared/`).
- C2. `strict`, `noUnusedLocals`, `noUnusedParameters` are on; the loader must be fully typed.
- C3. No new heavy dependencies. zod is already a dependency (`zod@^4`).
- C4. `CROP_OPTIONS` must stay a **synchronously available, build-time-validated** value because
  `OptionPicker.initialOptionState()` and `Planner` use it synchronously at render time.
- C5. Crop `id`s must stay stable strings — they key `OptionState`, saved reports, and chart series.

---

## 3. High Level Design

Three decisions need options: (A) data-file format, (B) how the file is loaded/validated, and
(C) the Item-1 UX. Items 2 and 3 are decisions A+B; Item 1 is decision C plus the ranking function.

### 3.1 Decision A — Data-file format

**Option A1 — JSON data file (`shared/crops.data.json`) + zod loader.** Crops live as pure JSON.
`shared/crops.ts` imports the JSON, validates it with a zod schema, and re-exports the typed
`CROP_OPTIONS`. "Add a crop" = add a JSON object.
- Pros: Truest to the goal ("data entry, not code"); non-TypeScript contributors can edit it; the
  file is obviously data; natural fit for zod validation; trivially lintable/diffable.
- Cons: `resolveJsonModule` is not set in `tsconfig.json` today (one-line addition, low risk under
  `moduleResolution: bundler`); raw JSON can't hold the `PLACEHOLDER`/`HEAT` DRY constants, so the
  JSON is more verbose (every `indicative`/`source` written out). JSON has no comments, so the
  per-field sourcing rationale lives in `crop-data-sources.md` (already true).

**Option A2 — Reorganised TypeScript data module.** Keep a `.ts` file but move the array into
`shared/crops.data.ts` as a plain `const data = [...] as const` and validate it in `crops.ts`.
- Pros: No tsconfig change; keeps DRY constants (`PLACEHOLDER`, `HEAT`); editors give autocomplete.
- Cons: Still *code* — adding a crop edits a `.ts` file, which only half-meets the goal; easy to
  smuggle logic back in; the "data vs code" boundary is weaker.

**Recommendation: A1 (JSON + zod loader).** It is the only option that literally satisfies the
anchor goal ("add a crop by adding a data entry, not by editing code") and it pairs naturally with
the required zod validation. The verbosity cost is mechanical and the `resolveJsonModule` flag is a
safe one-line change given `moduleResolution: "bundler"`. We mitigate the lost DRY constants with
an **optional expansion step in the loader** (Section 4.3) so authors may omit `source` when
`indicative` is true, and may use heat-band keywords — keeping JSON entries terse.

### 3.2 Decision B — How the file is loaded/validated

**Option B1 — Build-time static import + validate-at-module-load.** `crops.ts` does
`import raw from './crops.data.json'` (A1) and runs `cropsSchema.parse(raw)` at module
initialisation, exporting the frozen result as `CROP_OPTIONS`.
- Pros: Keeps `CROP_OPTIONS` **synchronous** (satisfies C4); the bundler inlines the data so there
  is no runtime fetch and no extra network/file dependency on client or server; validation runs once
  per process and throws immediately on bad data (satisfies G3); works identically in all four
  runtimes.
- Cons: Data is baked into the bundle, so updating crops needs a rebuild/redeploy (acceptable — this
  is a planning catalogue, not live content; it already required a redeploy as a `.ts` array).

**Option B2 — Runtime fetch/read of the JSON.** Client `fetch('/crops.json')`; server reads the file
with `fs`.
- Pros: Crop data could be swapped without rebuilding the client.
- Cons: Breaks C4 — `CROP_OPTIONS` becomes async, forcing loading/error states into
  `initialOptionState()`, `Planner`, `OptionPicker`, `ChillChart`, and the tests; needs divergent
  code paths per runtime (`fetch` vs `fs`), which collides with C1; adds failure modes for a
  dataset that changes rarely. Large blast radius for little benefit.

**Recommendation: B1 (build-time import + validate-at-load).** It preserves the synchronous
`CROP_OPTIONS` contract (C4), keeps `shared/` runtime-agnostic (C1), and gives loud validation (G3)
with zero new failure modes. B2's only advantage (hot-swap data) is not a project requirement and
would ripple through the whole UI.

### 3.3 Decision C — Item 1 UX

**Option C1 — Replace the manual picker entirely with an auto-ranked list.** After the climate run,
auto-evaluate **all** crops and show them ranked; drop the checkboxes.
- Pros: Simplest "location → best crops" story; least UI.
- Cons: Loses the grower's ability to choose what to weigh up and to set a per-cultivar chill figure
  *before* running (G7); forces evaluating the entire catalogue every run (feeds the `/api/explain`
  cap, G8); a bigger behavioural change for saved reports (G9).

**Option C2 — Ranked list with optional manual override (recommended).** The default flow becomes:
pick a location → run → **see all crops auto-ranked best-fit-first**. The checkbox list becomes an
*optional "refine"* control: by default every crop is considered; the grower can narrow the set
and/or type a cultivar chill figure, then the ranked list updates. The ranked order is produced by
the new pure `rankCrops()`; the existing per-crop card (`OptionResults`) renders the ordered list
unchanged.
- Pros: Delivers the ranked-list headline while preserving manual control and the per-cultivar chill
  input (G7); composes with `OptionResults`/Anuj's card because it only changes *order + which crops
  are evaluated*, not the card (G6); keeps `OptionState` shape, so saved-report compatibility is a
  small `mergeOptions` tweak (G9); gives a natural hook to cap crops for `/api/explain` (G8).
- Cons: Slightly more UI than C1 (keep + restyle the picker as "refine").

**Recommendation: C2.** It satisfies G1/G6/G7 simultaneously and keeps the blast radius small. The
key reframing: today `selected` means "evaluate this crop"; after C2 the **default is "consider all
crops"** and the picker becomes a *filter + per-cultivar chill editor* rather than the gate for
being evaluated. See 4.7 for the exact `OptionState` semantics and migration.

---

## 4. Low Level Design

### 4.1 File list (new / changed)

New:
- `shared/crops.data.json` — the crop database (JSON). The single place to add/edit a crop.
- `shared/ranking.ts` — pure `rankCrops()` and its helpers (kept separate from `crops.ts` so the
  data loader and the ranking logic have distinct responsibilities and test files).
- `tests/crops.test.ts` — loader/validation tests (valid data parses; malformed data throws).
- `tests/ranking.test.ts` — `rankCrops()` ordering and tie-break tests.

Changed (Huu-owned, in scope):
- `shared/crops.ts` — becomes the **loader**: imports the JSON, validates with zod, re-exports the
  unchanged public API (`CropOption`, `Sourced`, `CROP_OPTIONS`, `cropLabel`, `defaultRequirement`,
  `hasIndicativeData`). Interfaces and helper bodies are preserved.
- `tsconfig.json` — add `"resolveJsonModule": true` (and keep everything else). One line.
- `src/components/Planner.tsx` — swap `evaluateAll` to evaluate the *considered* set and apply
  `rankCrops`; wire the "consider all / refine" state; cap crops sent to the brief (4.6);
  adjust `mergeOptions` default (4.7).
- `src/components/OptionPicker.tsx` — restyle as the optional "refine which crops / set your chill
  figure" control; change `initialOptionState()` default (4.7).

Changed (explicitly-scoped cross-team touch, flagged):
- `server/index.ts` — raise/clarify the `/api/explain` crop cap, or document the client-side cap
  (4.6). This is the one server edit; it is additive and backward compatible.

Explicitly NOT changed:
- `src/components/OptionResults.tsx` — left for Anuj. It already sorts by verdict and renders cards;
  it keeps working when handed an already-ordered list. (Item 1's ordering is a superset of its
  current verdict sort — see 4.5.)
- `shared/seasons.ts`, `shared/chill.ts`, `/api/climate`.

### 4.2 Data file JSON schema (`shared/crops.data.json`)

Shape mirrors `CropOption` exactly so the loader output is assignable to `CropOption[]`. Authoring
conveniences (optional `source`, heat keyword) are expanded by the loader (4.3), so the *stored*
JSON may be terser than the runtime type.

```jsonc
// shared/crops.data.json  (authoring form; comments shown for the doc only — JSON has none)
[
  {
    "id": "peach-standard",
    "crop": "Peach / nectarine",
    "type": "Standard-chill varieties",
    "category": "stone fruit",                 // "stone fruit" | "pome fruit" | "cherry"
    "heatNote": "Very hot days during fruit development can reduce fruit size and quality.",
    "winter": {
      "chillHours": [600, 900],
      "indicative": true                        // when true, "source" may be omitted (loader fills "")
    },
    "spring": {                                 // or null
      "floweringMonths": [8, 9],
      "frostDamageC": -2,
      "indicative": true
    },
    "summer": {                                 // or null
      "hotDaysTolerated": 10,                   // may be the number, OR a band keyword "high|medium|low"
      "indicative": true
    }
  }
  // ...one object per crop
]
```

Field rules (enforced by zod, 4.3):
- `id`: non-empty, unique across the array, `^[a-z0-9-]+$`, max 60 chars (matches `/api/explain`'s
  `id` cap and keeps ids URL/DOM-safe).
- `crop`, `type`: non-empty strings.
- `category`: enum `"stone fruit" | "pome fruit" | "cherry"`.
- `heatNote`: non-empty string, max 300 (matches `/api/explain`).
- `winter.chillHours`: tuple `[min, max]`, both integers ≥ 0, `min <= max`.
- `spring`: object or `null`. When present: `floweringMonths` non-empty array of ints 1–12;
  `frostDamageC` a number (typically negative).
- `summer`: object or `null`. When present: `hotDaysTolerated` is a positive int **or** one of the
  band keywords `"high" | "medium" | "low"` (expanded to 5/10/15 by the loader to preserve today's
  `HEAT` constants).
- `indicative`: boolean on each present season block; `source`: optional string (loader defaults to
  `""` when omitted). This retains the `Sourced { indicative, source }` wrapper per season so the
  credibility flags survive into the UI's "indicative" badges.

### 4.3 Loader signature + validation approach (`shared/crops.ts`)

```ts
import rawCrops from './crops.data.json';
import { z } from 'zod';

// Unchanged public interfaces (kept verbatim so downstream types are identical).
export interface Sourced { indicative: boolean; source: string; }
export interface CropOption { /* …exactly as today… */ }

const HEAT = { high: 5, medium: 10, low: 15 } as const;

const sourced = z.object({
  indicative: z.boolean(),
  source: z.string().default(''),            // optional in JSON → '' at runtime
});

const cropSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).max(60),
  crop: z.string().min(1),
  type: z.string().min(1),
  category: z.enum(['stone fruit', 'pome fruit', 'cherry']),
  heatNote: z.string().min(1).max(300),
  winter: sourced.extend({
    chillHours: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])
      .refine(([lo, hi]) => lo <= hi, 'chillHours must be [min, max] with min <= max'),
  }),
  spring: sourced.extend({
    floweringMonths: z.array(z.number().int().min(1).max(12)).min(1),
    frostDamageC: z.number(),
  }).nullable(),
  summer: sourced.extend({
    hotDaysTolerated: z.union([
      z.number().int().positive(),
      z.enum(['high', 'medium', 'low']).transform((k) => HEAT[k]),
    ]),
  }).nullable(),
});

const cropsSchema = z.array(cropSchema).min(1)
  .refine((cs) => new Set(cs.map((c) => c.id)).size === cs.length, 'crop ids must be unique');

// Validate once at module load; throw loudly on bad data (fails build/test/startup, never silent).
export const CROP_OPTIONS: CropOption[] = Object.freeze(
  cropsSchema.parse(rawCrops),
) as CropOption[];

// Helpers unchanged in signature and behaviour:
export function cropLabel(c: CropOption): string { /* `${c.crop}, ${c.type.toLowerCase()}` */ }
export function defaultRequirement(c: CropOption): number { /* midpoint of winter.chillHours */ }
export function hasIndicativeData(c: CropOption): boolean { /* winter||spring?||summer? indicative */ }
```

Notes:
- `cropsSchema.parse()` runs at import time → synchronous `CROP_OPTIONS` (satisfies C4). On invalid
  data it throws a `ZodError`, which surfaces in `vitest`, `tsc`/build, server startup, and `tsx`.
- The zod *output* type is structurally identical to `CropOption`, so the `as CropOption[]` cast is
  a formality; we additionally keep the hand-written `CropOption`/`Sourced` interfaces as the public
  types (G2) rather than exporting `z.infer`, so no downstream type identity changes.
- `Object.freeze` protects the singleton from accidental mutation (the UI treats it as read-only).
- Because validation lives in `crops.ts`, `tests/seasons.test.ts`'s `import { CROP_OPTIONS, type
  CropOption } from '../shared/crops'` keeps working unchanged.

### 4.4 Item 3 — adding more crops / schema fit

- Item 3 is **data entry into `shared/crops.data.json`** once 4.1–4.3 land. No code change.
- The schema in 4.2/4.3 already represents every field the 10 documented crops use (chill range,
  flowering months, frost damage °C, heat band, per-season `indicative`/`source`, `heatNote`), so it
  **accommodates all 10 crops** in `docs/crop-data-sources.md` and is extensible: a new crop is one
  JSON object; a new category would be a one-word addition to the `category` enum.
- Data-credibility handling per `crop-data-sources.md`:
  - `summer.hotDaysTolerated` is **UNSOURCED for all crops** → keep `indicative: true`, `source: ""`
    (or omit `source`). The band keyword form keeps today's indicative bands.
  - `spring.frostDamageC` is **US-derived** → keep `indicative: true`; put the US citation in
    `source` if the grower wants it cited, otherwise leave `""` and indicative.
  - Chill values that "need human verification" (apricot, low-chill apple, Fadón-snippet plums) →
    `indicative: true` with a `source` note; sweet-cherry convention is an open question (Section 5).
- A short authoring note will live at the top of `crop-data-sources.md` (already the canonical
  per-field sourcing doc) pointing at the JSON. No logic depends on `source` text; it only drives the
  "indicative" UI badge via `indicative`.

### 4.5 Item 1 — `rankCrops()` signature and rules (`shared/ranking.ts`)

```ts
import type { CropEvaluation, SeasonVerdict } from './seasons';

/** Deterministic best-fit-first ordering of already-evaluated crops. Pure; no I/O. */
export function rankCrops(evaluations: CropEvaluation[]): CropEvaluation[];
```

Ranking rules (ordered comparators; first non-zero decides):

1. **Overall verdict bucket** (best first): `viable < at-risk < not-viable < no-data`. This matches
   the existing `RANK`/`SEVERITY` ordering in `Planner.tsx` and `OptionResults.tsx`, so the ranked
   order is a *superset* of today's verdict sort (Item 1 refines within a bucket; it never contradicts
   the card's own sort — this is why `OptionResults.tsx` can stay untouched; see G6/4.1).
2. **Within a bucket, worst-season margin** (safer first). Define a per-crop fit score from the
   `seasons[]` the crop already carries, using the engine's own numbers (no new thresholds):
   - winter season: higher `future` (% of winters meeting chill) is better.
   - spring season: lower `future` (% years with damaging frost) is better.
   - summer season: lower `future` (hot days vs tolerance) is better.
   Normalise each present season to a 0–1 "comfort" and rank by the **minimum** comfort across
   seasons (the crop is judged by its worst season, consistent with `overallVerdict`). Seasons with
   `null`/`no-data` are skipped in the min, matching the engine's "ignore missing" behaviour.
3. **Fewer indicative seasons first** (prefer crops whose verdict rests on sourced data over ones
   resting on placeholders) — a light credibility tie-break using the existing `indicative` flags.
4. **Stable final tie-break: `label` ascending** (then `id`), so ordering is fully deterministic and
   test-friendly regardless of input order.

Design points:
- `rankCrops` is **pure** and takes `CropEvaluation[]` (already computed by `evaluateCrop`), so it is
  trivially unit-testable and reusable by the PDF/report and `topCrop()` later.
- It does **not** call `evaluateCrop` or fetch anything; the Planner computes evaluations, then
  ranks. This keeps the ranking independent of how crops are selected or how climate is fetched.
- `topCrop()` in `Planner.tsx` can be re-expressed as `rankCrops(crops)[0]` filtered to `viable`
  (optional cleanup; not required for correctness).

### 4.6 `/api/explain` 25-crop limit — explicit handling (REQUIRED)

Problem: today `evaluateAll` only maps *selected* crops (≤10). Item 1 (C2) defaults to **considering
all crops**, and Item 3 **adds crops**, so the evaluated set can exceed the current catalogue of 10
and could pass **more than 25** `CropEvaluation`s to `POST /api/explain`, which rejects `>25`
(`.max(25)` in `explainSchema`). The AI brief would then start 400-ing.

Decision (recommend both, belt-and-braces):
- **Client cap (primary):** in `Planner.tsx`, cap the crops sent to the brief to the **top N ranked**
  crops, `N = 25`, via `rankCrops(crops).slice(0, 25)`. The brief is a summary, so sending the 25
  best-fit crops is the right content anyway. This keeps the request valid no matter how large the
  catalogue grows and needs no server change for correctness.
- **Server limit (clarify/raise):** bump `explainSchema.crops.max(25)` to a documented safe ceiling
  (e.g. `.max(60)`) so the contract matches a growing catalogue and the limit is a guardrail, not a
  silent truncation point. This is the single, additive, backward-compatible server edit.

Either alone fixes the break; doing both means the client never sends an invalid request **and** the
server contract is honest about catalogue size. The design calls out the number `N` and the new
server max as values for the user to confirm (Section 5).

### 4.7 Saved-report compatibility / `OptionState` migration (REQUIRED)

Current `OptionState = Record<id, { selected: boolean; requirement: number }>`;
`initialOptionState()` pre-selects four crops; `mergeOptions(saved)` back-fills missing ids with
`{ ...defaults[id], selected: false }`.

Semantic change under Item 1 (C2):
- The default becomes **"consider all crops"**. Concretely, `initialOptionState()` sets
  `selected: true` for **every** crop (not just four), so a fresh run evaluates and ranks all crops.
- The picker is restyled as an optional "refine" control: unticking removes a crop from the ranked
  list; the per-crop `requirement` number input is retained unchanged (G7).

Backward compatibility:
- **No storage schema bump needed.** `OptionState` keeps the exact same type (`Record<id, {selected,
  requirement}>`), so `SavedReport.version` stays `1` and `analysis.schemaVersion` stays `2` — old
  reports still load.
- `mergeOptions` already fills ids added since save. We adjust **only its default for unknown ids**:
  under C2 a crop that didn't exist when the report was saved should default to `selected: true`
  ("considered") so reopened reports still show the full ranked list, OR to `false` to preserve the
  exact saved selection. **Recommended:** keep the *saved* selections verbatim for known ids
  (unchanged behaviour) and default **new** ids to `selected: true` so a reopened old report gains
  newly-added crops in its ranking rather than hiding them. This is a one-line change to the default
  object in `mergeOptions`, fully backward compatible (it only affects crops not present at save
  time). This is called out as a user decision in Section 5 (preserve-exact vs include-new).
- `evaluateAll` keeps filtering by `options[c.id]?.selected`; with the new default-true semantics it
  evaluates the considered set, which is then passed through `rankCrops`.

### 4.8 Planner integration points (summary)

In `src/components/Planner.tsx`:
- `evaluateAll(analysis, options)` — unchanged logic (filter by `selected`, map `evaluateCrop`), but
  its result is now wrapped: `const ranked = rankCrops(evaluateAll(analysis, options))`.
- `crops` memo returns `ranked`. All existing consumers (`OptionResults`, `ChillChart`,
  `AdaptationNotes`, `Brief`, PDF) receive the ranked array; none need changes because they already
  accept `CropEvaluation[]`.
- Brief call sends `rankCrops(crops).slice(0, N)` (4.6).
- `topCrop(crops)` can delegate to `rankCrops` (optional).
- The Step 2 UI copy changes from "tick at least one" to "we'll rank every crop — refine below if you
  want"; the run button no longer requires `selectedCount > 0` (it requires a location only), since
  the default is "consider all". (If the user prefers to keep an explicit minimum, that's a Section-5
  decision.)

### 4.9 New / updated tests

New `tests/crops.test.ts` (loader/validation):
- Valid `crops.data.json` parses and `CROP_OPTIONS.length >= 10`; every documented id present.
- Duplicate id → `cropsSchema.parse` throws.
- `chillHours` with `min > max` → throws.
- `floweringMonths` out of 1–12 → throws.
- `summer.hotDaysTolerated` band keyword `"medium"` expands to `10`; numeric passes through.
- Omitted `source` on an `indicative` season defaults to `""`.
- `category` outside the enum → throws.
- Helper behaviour preserved: `cropLabel`, `defaultRequirement` (midpoint), `hasIndicativeData`.

New `tests/ranking.test.ts` (`rankCrops`):
- `viable` crops precede `at-risk` precede `not-viable` precede `no-data`.
- Within a bucket, the crop with the better worst-season comfort ranks first.
- Indicative-data tie-break: equal comfort → fewer indicative seasons first.
- Final deterministic tie-break by `label`/`id`; shuffled input yields identical output (purity +
  stability).
- Empty input → empty output; single crop → itself.

Updated:
- `tests/seasons.test.ts` — **no change required** (imports still resolve). Add one assertion only if
  desired: that `CROP_OPTIONS` now loads from JSON (`length` matches the file). Optional.
- `tests/savedReports.test.ts` — add a case: a report saved before new crops existed still loads and,
  after `mergeOptions`, includes the new crops per the chosen default (4.7).

### 4.10 Validation / rollout order (for the implementer)
1. Add `resolveJsonModule`; create `crops.data.json` from the current 10 entries; convert `crops.ts`
   to the loader. Run `npm run lint` + `npm test` — `tests/seasons.test.ts` must pass untouched (G2).
2. Add remaining Item-3 crops as JSON entries; run loader tests.
3. Add `shared/ranking.ts` + `tests/ranking.test.ts`.
4. Wire Item 1 into `Planner.tsx`/`OptionPicker.tsx`; apply the `/api/explain` cap and
   `mergeOptions` default; add/extend saved-report test.
5. Full `npm run lint && npm test`, then manual smoke of the location → ranked list flow.

---

## 5. Risks & Open Questions (for the user to decide)

1. **Sweet-cherry chill convention (700 vs 1000–1500).** `crop-data-sources.md` documents a genuine
   model-driven spread for standard sweet cherry: Chill Hours Tracker net model → ~700 h; Hort
   Innovation High/Very-high rating → 1000–1500 h; current placeholder is 800–1200. The data file
   must store one `[min, max]`. **Decision needed:** which convention (and `source`), or keep the
   800–1200 compromise flagged `indicative: true`? (The season engine is unaffected either way.)

2. **Does the ranked list fully replace manual selection?** Design recommends **C2** (ranked by
   default, picker demoted to an optional "refine" filter + per-cultivar chill input). Confirm this,
   vs **C1** (remove the picker entirely — simpler but loses pre-run per-cultivar chill editing), vs
   keeping the manual picker as the primary flow with ranking only as the result order.

3. **`/api/explain` cap value.** Confirm the client cap `N` (proposed `25` = top-ranked crops) and
   whether to also raise the server `explainSchema.crops.max` (proposed `60`). The server edit is the
   only cross-file touch outside Huu's surface — confirm Huu may make it, or hand it to the server
   owner.

4. **`mergeOptions` default for crops added after a report was saved.** Preserve the saved selection
   exactly (new crops hidden) vs include new crops in the ranking (`selected: true`). Design
   recommends **include new crops**. Confirm.

5. **`resolveJsonModule` + JSON import across esbuild/tsx/vitest.** Low risk under
   `moduleResolution: "bundler"`, but the implementer must verify the JSON import resolves in all
   four runtimes (esbuild server bundle in particular). Fallback if any runtime balks: Option **A2**
   (TS data module) with the identical zod loader — same architecture, no tsconfig change. Flagging
   as a known checkpoint, not a blocker.

6. **Heat-band keyword vs raw number in JSON.** The loader accepts both. If the user prefers the JSON
   to be fully explicit (no keyword expansion), drop the keyword union and store `5/10/15` directly —
   trivially simpler schema, slightly more opaque data. Default: keep both for authoring ergonomics.

7. **Run-button gating.** With "consider all" as default, the run button needs only a location.
   Confirm removing the current "tick at least one option" requirement is acceptable.

8. **Data values remain largely indicative.** Per `crop-data-sources.md`, summer heat is unsourced
   for all crops, frost °C is US-derived, and several chill figures need human verification. The
   schema carries these as `indicative: true` and the UI already badges them. No code risk, but the
   ranked list will order crops partly on indicative numbers — acceptable for a planning tool, worth
   the user's awareness.
```


---

## Git / ownership note: `shared/ranking.ts` is carried by this branch

`shared/ranking.ts` (the pure `rankCrops` best-fit-first ordering) is **a shared file consumed by
`Planner.tsx` (`import { rankCrops } from "../../shared/ranking"`)** and is conceptually owned by the
ranking workstream (Anuj). At the time this branch (`feature/crop-db-ranking`) was prepared, `ranking.ts`
was **not yet present on `dev`**, so this branch **includes it in its own dedicated commit** purely so the
branch compiles and its tests pass standalone.

**For reviewers / the merge:** this branch does **not** claim ownership of the ranking logic. If the ranking
workstream lands its own `shared/ranking.ts` separately, that commit on this branch can be dropped or
reconciled against the agreed version — it is intentionally isolated to make that trivial. No ranking logic
was modified here; the file is carried as-is.
