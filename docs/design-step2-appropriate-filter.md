# Design — Step 2 "appropriate crops" chill pre-filter (Version 1a UX rework)

Owner: appropriate-crops-filter slice
Status: Draft for review (design only — no code changes)
Project folder: `/Users/duynguyen/side_project/Hackathon/Paddock`. All paths below are relative to it.

Related docs: `docs/design-crop-recommendation.md` (recommendation/ranking UX, Huu), `docs/design-user-added-crops.md`
(user-added crops, the combined-list hook), `docs/crop-data-sources.md` (data contract).

This document covers **one** change: moving "appropriate crops" out of the Step‑3 results area and
turning it into a **lightweight, chill‑only pre‑filter on the Step‑2 crop picker**, driven by the
block's projected climate, while **gating the full Step‑3 analysis/ranking behind an explicit
"Check my block" request**. It touches no ranking, no verdict maths, no server.

---

## 1. Problem Overview

### 1.1 The intended flow (Version 1a)

1. The grower picks a **location** in Step 1.
   - **Preset district** (`PickedLocation.presetId` present, climate pre‑cached): the app fetches the
     block's climate (cache hit → instant, no live API cost). That climate is used to **filter Step 2**
     ("What are you weighing up?") so the picker shows **only the crops appropriate for this block**.
     It must **not** render the full Step‑3 analysis/ranking yet.
   - **Manual coordinates / "Use my location"** (no `presetId`): **no fetch on select**. The grower must
     press **"Check my block"** first; only then is climate known and Step 2 can filter.
2. **"Appropriate"** here is a **lightweight chill‑only pre‑filter**, *not* the full per‑crop verdict:
   keep a crop iff the block's **future (2026–2045) median chill hours ≥ the crop's minimum chill need**
   (`crop.winter.chillHours[0]`). It must **not** run `evaluateCrop` or `rankCrops`.
3. Pressing **"Check my block"** runs the **full analysis + ranking** (ranking is a teammate's work and
   **out of scope** here).

### 1.2 Current behaviour (verified against the code on disk)

- **Preset select auto‑renders Step 3.** `src/components/Planner.tsx` has a *hybrid auto‑run* effect
  keyed on `presetKey` (`presetId` + rounded coords). Selecting a preset calls `run(location)`, which
  `fetchClimate(...)` → `setAnalysis(...)`. Step 3 is rendered by `{analysis && (…<Step n={3}…/>…)}`,
  so **as soon as `analysis` is set, the whole Step‑3 results/ranking block appears**. There is no
  separate "the user asked for the full analysis" flag — `analysis != null` *is* the gate today.
  Manual coords do **not** auto‑run (the effect early‑returns when `!location?.presetId`); they rely on
  the "Check my block" button calling `run()`. ✔ matches change (a).
- **Step 2 lists ALL crops.** `<OptionPicker crops={combined} … />` where
  `combined = [...CROP_OPTIONS, ...userCrops]` from `useCombinedCrops()`. `OptionPicker` maps the full
  `crops` prop; there is no climate‑based filtering. ✔ matches change (b).
- **A separate "appropriate crops" name+verdict list lives in Step 3.** In `Planner.tsx`:
  `const appropriate = useMemo(() => appropriateCrops(crops), [crops])` and a
  `<section aria-labelledby="appropriate-heading">` ("Crops that suit this block") renders each
  `appropriate` crop with a "Good fit"/"Risky" chip. This is **post‑verdict** (it filters the ranked
  `CropEvaluation[]`), i.e. it depends on `evaluateCrop` + `rankCrops`. ✔ matches change (c).
- **Data path confirmed.** `analysis.future.summary.chillHours.median` is valid:
  `ClimateAnalysis.future: PeriodClimate & {…}` (`shared/types.ts`); `PeriodClimate.summary: SeasonSummary`
  (`shared/seasons.ts`); `SeasonSummary.chillHours: Summary`; `Summary.median: number` (`shared/chill.ts`).
  `summarise([])` returns `{ p10: NaN, median: NaN, p90: NaN, mean: NaN }` — so **`median` can be `NaN`**
  for a sparse location, which the filter must handle.
- **Crop min chill confirmed.** `CropOption.winter.chillHours: [number, number]` (required on every
  crop, built‑in and user); `chillHours[0]` is the minimum. User crops store `[v, v]`
  (`design-user-added-crops.md` §4.4), so their min is simply `v`.
- **Rate limit confirmed.** `server/index.ts` `/api/climate` is `rateLimit({ windowMs: 60_000, limit: 30 })`
  and sets `Cache-Control: public, max-age=86400`; preset coords are pre‑cached under `data/cache/`,
  so preset fetches are effectively free. Manual coords must stay behind the button to respect the limit.

### 1.3 The key separation this design introduces

Today a single fact — `analysis != null` — means **two** different things at once: "we have climate
data" **and** "show the full results". Version 1a needs those pulled apart:

- **"Climate fetched (for filtering)"** — we have a `ClimateAnalysis` and can read
  `future.summary.chillHours.median` to pre‑filter Step 2. True after a **preset auto‑fetch** *or* after
  a manual **"Check my block"**.
- **"Full analysis requested"** — the grower has explicitly pressed **"Check my block"** and wants the
  Step‑3 ranking/results. For a preset, this is **false** immediately after select even though climate
  is already fetched.

The whole design is: **keep the fetch‑on‑preset‑select, but make the Step‑3 render depend on an explicit
request flag rather than on `analysis != null`, and feed the fetched climate's future‑median chill into
a pure chill‑only filter that narrows the Step‑2 picker.**

---

## 2. Scope / Constraints / Goals

### 2.1 Goals (success criteria)

- G1. A new **pure, unit‑tested** `filterAppropriateByChill(crops: CropOption[], futureMedianChillHours: number): CropOption[]`
  in `shared/` keeps a crop iff `futureMedianChillHours >= crop.winter.chillHours[0]`. Pure,
  runtime‑agnostic, no dependency on `evaluateCrop`/`rankCrops`.
- G2. When the block's climate is known, **Step 2 shows only appropriate crops** (future median chill ≥
  crop min chill), applied uniformly to **built‑in and user‑added** crops.
- G3. Selecting a **preset** still fetches climate (to drive the filter) but **does not render Step 3**;
  Step 3 appears only after an explicit **"Check my block"**. Selecting **manual coords** fetches nothing
  on select.
- G4. The **separate Step‑3 "appropriate crops" list** (the `appropriate-heading` section + the
  `appropriate` memo) is **removed** from `Planner.tsx` (its concept now lives in the Step‑2 filter). The
  Step‑3 area becomes purely the ranking owner's territory.
- G5. **NaN / unavailable** future median chill is defined: show **all** crops (never a mysteriously empty
  picker), with a short note.
- G6. **OptionState is preserved** for filtered‑out crops (toggles/requirements aren't lost); "consider all
  crops" default, `mergeOptions`, saved reports, PDF, brief (top‑25) all keep working.
- G7. StrictMode‑safe: no double‑fetch, no effect/render loops; the manual‑coords button path and the
  30/min rate‑limit behaviour are preserved.

### 2.2 Explicitly OUT of scope

- **The full Step‑3 analysis + ranking.** `shared/ranking.ts` (`rankCrops`) and the per‑crop verdict card
  `src/components/OptionResults.tsx` are **not edited**. The filter must not call `evaluateCrop`/`rankCrops`.
- **The recommendation reframe** in `docs/design-crop-recommendation.md` (suited/not‑suited partition,
  `classifyClimate`, `CropRecommendation.tsx`). That is Huu's Step‑3 work; this doc only *removes* the
  interim Part‑A list from Step 3 so it doesn't collide.
- **The seasons / climate engine & server.** `shared/seasons.ts`, `shared/chill.ts`, `server/**`,
  `/api/climate` — untouched. No new thresholds in `evaluateCrop`.
- **`shared/appropriateCrops.ts`** — left as‑is (it operates on post‑verdict `CropEvaluation[]`; see §3.2
  for why the new filter is a *distinct* module). `shared/crops.ts`, `shared/crops.data.json`,
  `shared/seasons.ts`, `shared/types.ts` unchanged.
- **`LocationPicker.tsx`** — unchanged (`presetId` already exists on `PickedLocation`).
- **The user‑added‑crops feature** itself — unchanged mechanism; user crops simply pass through the same
  chill filter.

### 2.3 Constraints

- C1. The new filter lives in `shared/` and must run under Vite / esbuild / tsx / vitest — pure array
  work, no `fs`, no Node builtins.
- C2. `strict`, `noUnusedLocals`, `noUnusedParameters` on; fully typed.
- C3. No change to `OptionState`'s shape (`Record<id, {selected, requirement}>`), to `ClimateAnalysis`/
  `SeasonSummary`, or to any storage schema.
- C4. The filter must **not** depend on `evaluateCrop` or `rankCrops` — it is a pre‑verdict, chill‑only
  gate over `CropOption[]` + a number.
- C5. Preset fetches may hit `/api/climate` (cached, free); manual coords must stay behind "Check my block"
  so the 30/min limit is never pressured by on‑select fetches.

---

## 3. High Level Design

Two decisions need options: **(i)** how to gate Step‑3 behind an explicit "Check my block" request while
*still* fetching on preset‑select for the filter, and **(ii)** where the chill filter lives and how
`OptionPicker` receives the appropriate subset.

### 3.1 Decision (i) — Separating "climate fetched for filtering" from "full analysis requested"

Today `analysis != null` is overloaded (data‑present **and** show‑results). We must split it so a preset
can have `analysis` set for filtering while Step 3 stays hidden until the button is pressed.

**Option (i)-A — Add an explicit `resultsRequested` boolean flag; keep one `analysis` state (recommended).**
Keep the single `analysis` state (set by both preset auto‑fetch and manual "Check my block"). Add a new
boolean `resultsRequested` (or `showResults`). Rules:
- Preset auto‑fetch: `setAnalysis(…)` but **do not** set `resultsRequested` → Step 2 filters, Step 3 hidden.
- "Check my block" button (any location): set `resultsRequested = true` (and fetch if needed) → Step 3 shows.
- Step‑3 render condition changes from `{analysis && …}` to `{analysis && resultsRequested && …}`.
- The Step‑2 filter uses `analysis?.future.summary.chillHours.median` regardless of `resultsRequested`.

- Pros: Minimal, explicit, one new boolean; the two meanings are now named and independent. The filter
  reads `analysis` the moment it exists (preset or manual); Step 3 reads the extra flag. Easy to reason
  about StrictMode (flag is plain state set in event handlers / the existing effect, not a fetch trigger).
  Saved‑report open can set both `analysis` and `resultsRequested = true` so reopening shows results as
  today.
- Cons: Must remember to set/reset the flag on the right transitions (new location select should reset it;
  see §4.4). One more piece of state to keep consistent.

**Option (i)-B — Two separate climate states: `filterAnalysis` (for Step 2) and `resultsAnalysis` (for Step 3).**
Preset select sets `filterAnalysis`; "Check my block" sets `resultsAnalysis` (copying/َrefetching).
Step 2 reads `filterAnalysis`; Step 3 reads `resultsAnalysis`.

- Pros: The two concerns are *physically* separate states; impossible to accidentally show Step 3 from the
  filter fetch.
- Cons: Duplicates the climate object and the fetch bookkeeping; risks the two drifting (preset filtered on
  one fetch, results on another); more churn to `run()`, `save`, `openSaved`, `downloadSaved`, the
  auto‑run effect, and the stale‑results banner (`showingStale`) which all currently key off one `analysis`.
  Larger blast radius for no real gain over a single boolean.

**Recommendation: (i)-A.** One `analysis` + one `resultsRequested` flag is the smallest change that cleanly
expresses the required separation, keeps all existing consumers of `analysis` (save/download/stale‑banner)
working unchanged, and keeps the fetch logic single‑sourced. (i)-B's dual‑state duplication adds drift risk
and touches far more code for no behavioural benefit.

### 3.2 Decision (ii) — Where the chill filter lives & how `OptionPicker` gets the subset

The filter is a pure function `(CropOption[], number) → CropOption[]`. Two sub‑questions: **module home**
and **application point** (Planner vs OptionPicker).

**Module home.** The existing `shared/appropriateCrops.ts` operates on **post‑verdict `CropEvaluation[]`**
(it filters `overall ∈ {viable, at-risk}`). The new filter operates on **pre‑verdict `CropOption[]` + a
chill number**. These are different inputs, different stages, different dependencies. **Recommendation: a
NEW module `shared/chillFilter.ts`.** Rationale: keeping it separate preserves each module's single
responsibility, avoids importing `CropOption`/climate concepts into a module that is deliberately
verdict‑only, and prevents confusion between "appropriate (post‑verdict)" and "appropriate (chill‑only
pre‑filter)". (Extending `appropriateCrops.ts` with a second, differently‑typed `filterAppropriateByChill`
would overload one file with two unrelated stage concepts and two input shapes — rejected.)

**Application point.**

**Option (ii)-A — Filter in `Planner.tsx`; pass the already‑filtered list to `OptionPicker` (recommended).**
Planner computes `futureMedianChill = analysis?.future.summary.chillHours.median` and
`visibleCrops = analysis ? filterAppropriateByChill(combined, futureMedianChill) : combined`, then renders
`<OptionPicker crops={visibleCrops} value={options} onChange={setOptions} />`. `OptionPicker` is unchanged
in logic — it still just maps the `crops` prop. OptionState for hidden crops stays in `options` because
Planner keeps passing the *full* `options` map; only the *rendered* list shrinks (OptionPicker already reads
`value[c.id]` per rendered crop and never deletes other keys).

- Pros: `OptionPicker` needs **no edit** (it already renders whatever `crops` it's given); the filter lives
  at the one place that owns both `combined` and `analysis`; OptionState is naturally preserved (full map
  passed down, subset rendered); the "consider all crops" default and `mergeOptions` keep operating over the
  full `combined` list, so evaluation (`evaluateAll` filters `combined` by `options[c.id].selected`) is
  unaffected by what Step 2 happens to render. Testing is a pure‑function test plus the unchanged picker.
- Cons: Planner holds one more derived value (`visibleCrops`). (Trivial.)

**Option (ii)-B — Pass `futureMedianChill` into `OptionPicker` and let it filter internally.**
`<OptionPicker crops={combined} futureMedianChill={…} … />`; the picker calls `filterAppropriateByChill`
itself before mapping.

- Pros: Planner stays slightly thinner; the "what to show" rule is encapsulated in the picker.
- Cons: Requires **editing `OptionPicker`** (new prop + filter call + the NaN/empty note UI), enlarging the
  component's responsibility and the diff; the picker would need to know about climate/median semantics,
  which is a Planner‑level concern. The NaN "showing all" note and the "pick a location first" message are
  flow‑level copy that sits more naturally in Planner.

**Recommendation: (ii)-A** with the filter in **`shared/chillFilter.ts`**. Planner computes the visible
subset and passes it down; `OptionPicker` stays a dumb list renderer (no edit needed beyond what already
exists). This keeps OptionState preservation automatic and the filter trivially unit‑testable in isolation.
The only nuance — the empty/NaN note and the "before a location" message — is handled in Planner around the
picker (§4.5), where the climate/flow context lives.

> **Reconciliation note (updated after implementation):** The "no edit to `OptionPicker`" recommendation
> above was **superseded** by the Addendum (§A3). The final implementation **does** make a small, intentional
> edit to `OptionPicker`: it gained a `filterState: 'pre-location' | 'filtered'` prop so the picker can render
> the three display states (no-location placeholder / filtered-empty note / filtered list) itself, rather than
> Planner wrapping it with that flow copy. The filter itself still lives in the pure `shared/chillFilter.ts`
> and OptionState is still preserved by passing the full `options` map down — only the empty/placeholder
> **copy** moved into the picker. See §A3 for the final three-state spec and the approved locked decision.

### 3.3 What Step 2 shows before any location/climate is known

Before a location is chosen (`analysis == null`), there is no median chill. **Recommendation: show all
crops** (the current behaviour) with a one‑line hint that the list narrows once a block is chosen (e.g.
"Pick a district above to see the crops suited to your block."). Rationale: the picker is never empty or
mysterious, the grower can still browse/untick, and `initialOptionState` already selects all. (Alternative —
show an instruction and an empty/placeholder list until a location is picked — rejected: it hides useful
content and makes Step 2 feel broken before Step 1 is touched.)

---

## 4. Low Level Design

### 4.1 File list (new / changed)

New:
- `shared/chillFilter.ts` — the pure `filterAppropriateByChill(crops, futureMedianChillHours)` + a tiny
  `isAppropriateByChill(crop, futureMedianChillHours)` predicate it reuses. Runtime‑agnostic, no I/O, no
  `evaluateCrop`/`rankCrops`.
- `tests/chillFilter.test.ts` — unit tests (boundary, below, NaN, user crops, purity/order).

Changed (this slice, in scope — minimal):
- `src/components/Planner.tsx`:
  - add `resultsRequested` state and gate Step 3 on `analysis && resultsRequested` (§4.3–4.4);
  - make preset auto‑fetch set `analysis` **without** requesting results; make "Check my block" set
    `resultsRequested = true` (§4.4);
  - compute `futureMedianChill` + `visibleCrops` and pass `visibleCrops` to `OptionPicker` (§4.5);
  - **remove** the Part‑A Step‑3 `appropriate` memo and the `appropriate-heading` section, and drop the now
    unused `appropriateCrops` import (§4.6).

Explicitly NOT changed:
- `src/components/OptionPicker.tsx` (keeps rendering its `crops` prop; Planner passes the filtered subset),
  `src/components/LocationPicker.tsx`, `src/components/OptionResults.tsx`, `src/components/AddCropForm.tsx`,
  `src/lib/useCombinedCrops.ts`, `src/lib/userCrops.ts`.
- `shared/appropriateCrops.ts`, `shared/ranking.ts`, `shared/crops.ts`, `shared/crops.data.json`,
  `shared/seasons.ts`, `shared/chill.ts`, `shared/types.ts`, `server/**`.

> Note: `shared/appropriateCrops.ts` and `tests/appropriateCrops.test.ts` remain in the tree. The *module*
> is still correct and tested; this change only stops `Planner` from using it in Step 3. (Whether to delete
> the now‑unused module is an open question — §5 Q4 — but deletion is **not** required by this design.)

### 4.2 The pure filter — signature, rule, NaN handling

```ts
// shared/chillFilter.ts
import type { CropOption } from './crops';

/**
 * Pre‑verdict, chill‑only "appropriate for this block" predicate.
 * A crop is appropriate iff the block's FUTURE median chill meets the crop's MINIMUM chill need.
 * `winter.chillHours[0]` is the low end of the crop's class range (its minimum requirement).
 * When the future median is NaN/non‑finite (sparse location → `summarise([])` yields NaN), we treat
 * EVERY crop as appropriate, so the picker is never mysteriously empty (caller shows a note — §4.5).
 */
export function isAppropriateByChill(crop: CropOption, futureMedianChillHours: number): boolean {
  if (!Number.isFinite(futureMedianChillHours)) return true;      // unavailable → keep all
  return futureMedianChillHours >= crop.winter.chillHours[0];
}

/**
 * Pure. Returns only the crops whose minimum chill need is met by the block's future median chill,
 * preserving input order (output is a subsequence of the input — none added, reordered, duplicated).
 * NaN/unavailable median → the full input list unchanged (show all). No I/O; does not call
 * evaluateCrop or rankCrops; works identically under Vite / esbuild / tsx / vitest.
 */
export function filterAppropriateByChill(
  crops: CropOption[],
  futureMedianChillHours: number,
): CropOption[] {
  if (!Number.isFinite(futureMedianChillHours)) return crops.slice(); // show all; copy keeps it pure
  return crops.filter((c) => c.winter.chillHours[0] <= futureMedianChillHours);
}
```

Rule summary (the single cut line):

| future median chill | crop min (`chillHours[0]`) | kept? |
|---|---|---|
| `median >= min` (incl. `median === min`) | — | **yes** (included) |
| `median < min` | — | no (excluded) |
| `NaN` / non‑finite | any | **yes** — all crops kept (show‑all fallback) |

- **Boundary:** `median === crop.min` → **included** (`>=`). `median === min - 1` → excluded.
- **Pure:** `filter`/`slice` never mutate the input; output order equals input order.
- **No verdict coupling:** reads only `crop.winter.chillHours[0]` and a number; no `evaluateCrop`/`rankCrops`.

### 4.3 Where the future median chill comes from

```ts
const futureMedianChill = analysis ? analysis.future.summary.chillHours.median : NaN;
```

- Path verified: `ClimateAnalysis.future.summary: SeasonSummary` → `.chillHours: Summary` → `.median: number`
  (`shared/types.ts`, `shared/seasons.ts`, `shared/chill.ts`). `summarise([])` → `median: NaN`, so a sparse
  location naturally yields `NaN`, which the filter maps to "show all".
- It requires a **climate fetch**, which is exactly why Version 1a fetches on preset‑select (cached/free) and
  gates manual coords behind the button: without a fetch there is no median and Step 2 shows all crops (§3.3).

### 4.4 Planner state changes — the `resultsRequested` gate and fetch behaviour

Add one state:

```ts
const [resultsRequested, setResultsRequested] = useState(false);
```

Transitions (Decision (i)-A):

1. **Location change (Step 1 `onChange`).** When a *new* location is picked, reset the gate so a prior
   preset's/manual run doesn't leak Step 3 for the new block:
   - Wrap `setLocation` so selecting a location also `setResultsRequested(false)` (and, for a brand‑new
     location, we may clear/replace `analysis` on the next fetch). For a **preset**, the existing auto‑run
     effect then fetches climate (filter‑only). For **manual coords**, nothing fetches until the button.
   - *Implementation note:* pass an `onChange={(loc) => { setLocation(loc); setResultsRequested(false); }}`
     to `LocationPicker` (no change to `LocationPicker` itself — it already calls `onChange(loc)`).
2. **Preset auto‑fetch (existing effect).** Unchanged except in meaning: it still calls `run(location)` which
   sets `analysis`. It must **not** set `resultsRequested`. (It already doesn't — we simply don't add it.)
   Result: `analysis` present → Step 2 filters; `resultsRequested` false → Step 3 hidden.
3. **"Check my block" button.** `onClick={() => { setResultsRequested(true); run(); }}`. `run()` fetches if
   needed and sets `analysis`. For a **preset** whose climate is already fetched, see §5 Q5 (re‑fetch is
   cache‑cheap; simplest is to let `run()` run — a cache hit — or short‑circuit if
   `analysis.location.label === location.label`). For **manual coords**, this is the only fetch path.
4. **Open saved report (`openSaved`).** Set `setResultsRequested(true)` alongside the existing
   `setAnalysis(r.analysis)` so a reopened report shows Step 3 immediately, as it does today. (One‑line add.)
5. **Step‑3 render guard.** Change `{analysis && (…Step 3…)}` to `{analysis && resultsRequested && (…Step 3…)}`.
   The `resultsRef`/scroll‑into‑view and `showingStale` banner stay keyed on `analysis` as now.

StrictMode & loops: `resultsRequested` is plain state set only in **event handlers** (`onChange`, button
click, `openSaved`) — never inside the fetch effect — so it cannot create a fetch loop. The auto‑run effect
is unchanged (still keyed on `presetKey`, still guarded by `autoRanPresetKey` ref), so no double‑fetch.

### 4.5 Step 2 picker: filtered list + copy

In Step 2, compute and pass the visible subset; keep the full `options` map flowing:

```ts
const futureMedianChill = analysis ? analysis.future.summary.chillHours.median : NaN;
const visibleCrops = useMemo(
  () => (analysis ? filterAppropriateByChill(combined, futureMedianChill) : combined),
  [analysis, combined, futureMedianChill],
);
```

Render:

```tsx
<OptionPicker crops={visibleCrops} value={options} onChange={setOptions} />
```

Copy around the picker (Planner‑level, flow context):
- **No location yet** (`!analysis`): show the current "rank every crop… refine below" intro plus a hint:
  *"Pick a district above to narrow this to the crops suited to your block."* (§3.3 — show all.)
- **Climate known, median finite, subset non‑empty:** optionally a line
  *"Showing crops whose minimum chill (≈ {fmtInt(futureMedianChill)} h projected median) your block can
  meet."* (copy detail, not logic).
- **Climate known but median NaN** (sparse block): filter returns all; show a note
  *"We couldn't read a reliable chill figure for this block, so we're showing every crop."* (G5 — never a
  mysteriously empty picker).
- **Climate known, finite median, but subset empty** (very warm block below every crop's min chill): see
  §5 Q1 — show a *"No crop in our list has a low enough chill need for this block — showing all so you can
  weigh trade‑offs"* note and fall back to `combined`, **or** show the empty list with that note. Recommended:
  show the note and fall back to all crops (consistent with the NaN fallback; the picker is never empty).

### 4.6 Removing the Part‑A Step‑3 "appropriate crops" list

In `Planner.tsx`:
- Delete the memo `const appropriate = useMemo(() => appropriateCrops(crops), [crops]);`.
- Delete the entire `<section aria-labelledby="appropriate-heading"> … </section>` block (the
  "Crops that suit this block" list with the Good fit/Risky chips and the empty‑state paragraph).
- Remove the now‑unused `import { appropriateCrops } from "../../shared/appropriateCrops";`
  (otherwise `noUnusedLocals`/lint fails).
- Leave the rest of Step 3 (`SeasonsPanel`, `ChillChart`, `Brief`, `AdaptationNotes`, `Methods`, the PDF/save
  bar, the chill‑hours lead paragraph) untouched — that is the ranking owner's area and Huu's recommendation
  panel will land there (`design-crop-recommendation.md`). This removal just clears the interim Part‑A list
  so there is no duplicate "appropriate" concept and no collision with Huu's work.

Nothing else references `appropriate`; `appropriateCrops` and its test remain in the tree (unused by Planner).

### 4.7 OptionState interaction when the visible set is filtered

- **Hidden crops keep their state.** Planner passes the full `options` map to `OptionPicker` and only shrinks
  the rendered `crops`. `OptionPicker.update` does `onChange({ ...value, [id]: … })`, i.e. it only ever
  *adds/updates* the toggled id and never deletes other keys. So a crop that is filtered out of the view
  retains its `{selected, requirement}` in `options`; if the block changes and it becomes visible again, its
  prior toggle/requirement is intact. (Decision: **keep state for hidden crops**, don't exclude — simplest and
  least surprising.)
- **Evaluation is independent of the filter.** `evaluateAll(combined, analysis, options)` filters `combined`
  by `options[c.id]?.selected` — it uses the **full** `combined` list, not `visibleCrops`. So the Step‑2
  chill filter only affects **what the picker displays**, not what the (teammate‑owned) Step‑3 ranking
  evaluates. This is deliberate: the chill pre‑filter is a browse aid, while the full verdict is the ranking
  owner's richer judgement. If the product later wants Step 3 to consider only chill‑appropriate crops, that
  is a ranking‑owner decision, not this slice's (flagged §5 Q6).
- **"Consider all crops" default & `mergeOptions`** keep operating over `combined` (back‑fill effect in
  Planner already reconciles `options` against `combined`), so filtered‑out, still‑selected crops remain
  selected and are still evaluated — the visible subset being smaller doesn't silently deselect anything.
- **Brief top‑25 / PDF / save** read `crops` (from `combined`), unaffected by `visibleCrops`.

### 4.8 Tests (`tests/chillFilter.test.ts`)

Fixtures build minimal `CropOption` literals (like `tests/crops.test.ts` style) — only `id` and
`winter.chillHours` matter to the filter; other required fields set to trivial valid values. Pure, no climate
run, runtime‑agnostic under vitest.

Cases:
- **Boundary — included.** `futureMedian === crop.min` (e.g. median 500, crop min 500) → crop **kept**.
- **Below — excluded.** `futureMedian < crop.min` (median 499, min 500) → crop **dropped**.
- **Above — included.** median 700, min 500 → kept.
- **Mixed list filters correctly & preserves order.** crops with mins `[300, 600, 450, 800]`, median 500 →
  keeps `[300, 450]` in input order; excludes `[600, 800]`.
- **NaN → all kept.** `filterAppropriateByChill(crops, NaN)` returns all crops, same order; also `+Infinity`
  keeps all, `-Infinity`/`NaN` handled (only NaN/non‑finite triggers show‑all; `-Infinity` is finite so would
  exclude all — assert that `Number.isFinite(-Infinity) === false` path → show‑all, documenting the chosen
  rule; use `NaN` as the canonical "unavailable").
- **User crops filtered by the same rule.** a crop with `id` starting `user-` and `winter.chillHours:[v,v]`
  is kept iff `median >= v` — proves user crops obey the identical cut line (no special‑casing).
- **Purity / no mutation.** input array and its elements unchanged after the call; returned array is a new
  array (not the same reference) even in the show‑all/NaN path.
- **`isAppropriateByChill` predicate** matches the array filter per crop (boundary, below, NaN).

(No new tests are required for `Planner`/`OptionPicker` beyond manual smoke, since the picker is unchanged and
the gate is UI state; the pure filter carries the logic coverage. A light React test could assert "preset
select → Step 2 filtered, Step 3 hidden; Check my block → Step 3 shown" — optional, §5 Q7.)

### 4.9 Implementation order (for the implementer)
1. `shared/chillFilter.ts` + `tests/chillFilter.test.ts`; run `npm test` (filter green in isolation).
2. `Planner.tsx`: add `resultsRequested`; gate Step 3; wrap `LocationPicker.onChange` to reset the gate;
   set the gate `true` in the "Check my block" handler and in `openSaved`.
3. `Planner.tsx`: compute `futureMedianChill` + `visibleCrops`; pass `visibleCrops` to `OptionPicker`; add the
   Step‑2 notes (no‑location / NaN / empty‑subset).
4. `Planner.tsx`: remove the Part‑A `appropriate` memo, the `appropriate-heading` section, and the
   `appropriateCrops` import.
5. `npm run lint && npm test`; manual smoke per §4.4/§4.5 (preset → filtered Step 2, no Step 3; Check my block
   → Step 3; manual coords → no fetch on select, fetch on button; refresh/open saved report → Step 3 shows;
   warm/sparse block → non‑empty picker with the note).

---

## 5. Risks & Open Questions

1. **Empty picker on a very warm block (primary UX risk).** If the future median chill is below *every*
   crop's minimum (a hot, low‑chill block), the strict filter yields an empty Step 2. **Recommendation
   (§4.5):** detect `visibleCrops.length === 0 && Number.isFinite(futureMedianChill)` and fall back to showing
   **all** crops with a note *"No crop in our list has a low enough chill need for this block — showing all so
   you can weigh trade‑offs."* This mirrors the NaN fallback so Step 2 is never empty. **Open:** is a non‑empty
   "showing all + note" preferred, or is an intentionally empty Step 2 with just the note acceptable?

2. **What Step 2 shows before a location is chosen.** Recommended: **all crops** + a hint to pick a district
   (§3.3). **Open:** confirm, vs. an instruction‑only placeholder (rejected here).

3. **Does the Step‑2 filter also constrain Step‑3 evaluation?** No — the chill filter only narrows the
   *display*; `evaluateAll` still evaluates the full `combined` selected set (§4.7). This keeps the lightweight
   pre‑filter and the full verdict/ranking cleanly separated (ranking is the teammate's). **Open:** confirm the
   product wants the full ranking to still consider chill‑"inappropriate" crops (so a grower can see *why*
   something is a poor fit), rather than hiding them from Step 3 too.

4. **Delete the now‑unused `shared/appropriateCrops.ts`?** After §4.6, `Planner` no longer imports it, but the
   module + `tests/appropriateCrops.test.ts` are still valid and green. **Recommendation:** leave them (no
   dead‑import, nothing broken) unless a cleanup pass wants them gone — deletion would also touch the test
   suite and is out of this slice's necessity. **Open:** keep or remove?

5. **Does pressing "Check my block" for a preset re‑fetch?** The climate was already fetched on select. The
   `/api/climate` response is cached (`max-age=86400`) and preset coords are pre‑cached on disk, so a re‑fetch
   is effectively free. **Recommendation:** keep `run()` simple (let it fetch — a cache hit) **or** short‑circuit
   when `analysis?.location.label === location.label` to avoid even the cache round‑trip. Either preserves the
   30/min limit. **Open:** short‑circuit, or accept the cache‑cheap re‑fetch?

6. **Future: should the filter use `p10` instead of `median`?** The brief specifies **median** (median ≥ min).
   A stricter `p10 ≥ min` (the "safe winter" idea `evaluateWinter` uses) would be more conservative but is
   explicitly **not** this task's rule and would blur into verdict territory. Flagged, not built.

7. **React test for the gate.** The logic risk sits in the pure filter (fully tested). A light component test
   asserting the preset‑vs‑button render behaviour would guard the `resultsRequested` wiring. **Open:** add a
   minimal Planner render test, or rely on manual smoke per §4.9?

8. **`resultsRequested` reset on location change.** Resetting the gate when the location changes prevents a
   stale Step 3 from showing for a newly‑picked block before its own "Check my block". The existing
   `showingStale` banner handles the *analysis‑mismatch* case for the manual flow; the reset ensures a *preset*
   switch doesn't instantly show Step 3 from the auto‑fetch. **Open:** confirm reset‑on‑location‑change is the
   desired behaviour (recommended), vs. keeping Step 3 visible across preset switches.

---

# Addendum: midpoint rule, no-location placeholder, and a full-catalogue reference view

Status: Draft for review (design only — no code changes). Appended after a round of user testing of
the shipped Version 1a. All paths relative to `/Users/duynguyen/side_project/Hackathon/Paddock`.

This addendum extends §1–§5 above. It changes **one line of the filter rule**, **re-specifies the
Step-2 pre-location UX**, and **adds a brand-new read-only reference view**. It touches only the four
in-scope files (`shared/chillFilter.ts` + its test, `src/components/OptionPicker.tsx`,
`src/components/Planner.tsx`) plus one NEW component (`src/components/CropCatalogue.tsx`) and a small
mount edit in `src/App.tsx` (verified editable — not on the forbidden list). No other source changes.

---

## A1. Recap of the problem

Version 1a shipped a chill-only Step-2 pre-filter that keeps a crop iff
`futureMedianChill >= crop.winter.chillHours[0]` — the crop's **bare minimum** chill need. Three
problems surfaced in use:

1. **The min rule is too permissive.** The highest minimum in the catalogue is **700** (European
   pear). Most Victorian districts' *projected future* median chill still exceeds ~700, so the filter
   keeps **all 10 crops at nearly every location** — Step 2 looks identical whether the block is warm
   or cold, defeating the whole point of a "crops that suit this block" filter.
2. **The no-location state shows the full list.** With `analysis == null` the picker renders every
   crop under a "Pick a location…" hint (`filterState='pre-location'`). The user wants Step 2 to show
   **nothing but a placeholder** until a block's climate is known — the crop list should be a
   *result* of picking a location, not a thing you can browse before choosing one.
3. **No way to see the whole dataset.** Growers (and hackathon judges assessing data credibility)
   want to browse the **complete catalogue with its sourcing** somewhere, without that full dump
   polluting the Step-2 decision flow.

The user confirmed three changes, specified below. All stay **display-only**: `evaluateAll` still runs
over the full `combined` set, and the Step-3 ranking gate (`resultsRequested`) is **unchanged**.

---

## A2. Change 1 — midpoint rule

### A2.1 New rule, signature, formula

Replace the minimum comparison with a **midpoint** comparison: a crop is appropriate iff the block's
future median chill reaches the **midpoint of the crop's `[min, max]` chill range**.

```ts
// shared/chillFilter.ts — the only logic change is the comparison target.

/** The midpoint of a crop's [min, max] chill range — the chosen "appropriate" cut-point.
 *  For a user crop stored as [v, v] this is exactly v (so user-crop behaviour is unchanged). */
function chillMidpoint(crop: CropOption): number {
  return (crop.winter.chillHours[0] + crop.winter.chillHours[1]) / 2;
}

export function isAppropriateByChill(crop: CropOption, futureMedianChillHours: number): boolean {
  if (!Number.isFinite(futureMedianChillHours)) return true;      // unavailable → keep all
  return futureMedianChillHours >= chillMidpoint(crop);           // was: >= crop.winter.chillHours[0]
}

export function filterAppropriateByChill(
  crops: CropOption[],
  futureMedianChillHours: number,
): CropOption[] {
  if (!Number.isFinite(futureMedianChillHours)) return crops.slice(); // show all; copy keeps it pure
  return crops.filter((crop) => isAppropriateByChill(crop, futureMedianChillHours));
}
```

- **Signatures are unchanged** (`isAppropriateByChill(crop, number) → boolean`,
  `filterAppropriateByChill(crops, number) → CropOption[]`). Only the comparison target moves from
  `chillHours[0]` to `(chillHours[0] + chillHours[1]) / 2`. The `chillMidpoint` helper is a small
  private function in the same module (not exported — no public-API change, no new import for callers).
- **Purity preserved:** `filter`/`slice` still never mutate; output order equals input order; still no
  `evaluateCrop`/`rankCrops`, no I/O — runtime-agnostic under Vite/esbuild/tsx/vitest.

> Note: this is deliberately a *different* figure from `defaultRequirement(c)` in `shared/crops.ts`,
> which also returns the range middle but `Math.round`-ed. The filter must **not** import or depend on
> `defaultRequirement` (that lives in a forbidden file and is a per-crop scoring default, not a display
> cut-point). We compute the raw (un-rounded) midpoint locally so a `.5` midpoint keeps exact boundary
> semantics (see A2.3). Keeping the two independent avoids coupling the display filter to scoring code.

### A2.2 NaN / non-finite handling (unchanged)

Identical to Version 1a: `!Number.isFinite(futureMedianChillHours)` (covers `NaN`, `±Infinity`) →
**keep ALL crops** (`filterAppropriateByChill` returns `crops.slice()`). A sparse location yields
`summarise([]) → median: NaN`, which still shows the full appropriate set rather than an empty picker.
The caller still surfaces the "couldn't read a reliable chill figure" note (see A3). Only a *finite*
median ever filters anything out.

### A2.3 Boundary semantics

| future median chill vs midpoint `m = (min+max)/2` | kept? |
|---|---|
| `median > m` | **yes** |
| `median === m` (exact equality) | **yes** (`>=`) |
| `median < m` (even by 1) | no |
| `NaN` / non-finite median | **yes** — all crops (show-all fallback) |

- `median === midpoint` → **included**. `median === midpoint - 1` → **excluded**.
- Because several real midpoints are non-integers (e.g. plum-japanese 401.5, plum-european 951),
  computing the raw midpoint (no rounding) keeps the `===` boundary meaningful; e.g. a median of
  **401** excludes plum-japanese (401 < 401.5) while **402** includes it.
- **User crop `[v, v]` → midpoint = v**, so `median >= v` — **identical to the old min rule for user
  crops** (confirmed: `(v+v)/2 === v`). No behaviour change for user-entered figures; only built-ins
  with a genuine `[min, max]` spread shift.

### A2.4 Midpoints from the real catalogue (`shared/crops.data.json`)

| id | crop / type | chill `[min, max]` | **midpoint** |
|---|---|---|---|
| `peach-standard` | Peach/nectarine, standard | [400, 800] | **600** |
| `peach-low` | Peach/nectarine, low-chill | [200, 400] | **300** |
| `apricot` | Apricot, standard | [300, 600] | **450** |
| `plum-japanese` | Plum, Japanese | [118, 685] | **401.5** |
| `plum-european` | Plum, European/prune | [579, 1323] | **951** |
| `cherry-standard` | Sweet cherry, standard | [600, 800] | **700** |
| `cherry-low` | Sweet cherry, low-chill | [300, 500] | **400** |
| `apple-mainstream` | Apple, mainstream | [550, 1000] | **775** |
| `apple-low` | Apple, low-chill | [200, 400] | **300** |
| `pear` | European pear, standard | [700, 900] | **800** |

### A2.5 Worked example — warm block vs cold block

Using the midpoints above, with two representative future-median figures. "Kept?" is `median >= midpoint`.

| crop | midpoint | **Cold block ~1000** | **Warm block ~500** |
|---|---|---|---|
| peach-low | 300 | ✅ kept | ✅ kept |
| apple-low | 300 | ✅ kept | ✅ kept |
| cherry-low | 400 | ✅ kept | ✅ kept |
| plum-japanese | 401.5 | ✅ kept | ✅ kept |
| apricot | 450 | ✅ kept | ✅ kept |
| peach-standard | 600 | ✅ kept | ❌ dropped |
| cherry-standard | 700 | ✅ kept | ❌ dropped |
| apple-mainstream | 775 | ✅ kept | ❌ dropped |
| pear | 800 | ✅ kept | ❌ dropped |
| plum-european | 951 | ✅ kept | ❌ dropped |
| **total kept** | | **10 of 10** | **5 of 10** |

- **Cold block (~1000 h):** all 10 kept (1000 ≥ every midpoint, the largest being plum-european's 951).
- **Warm block (~500 h):** exactly the **five low-/mid-chill crops** survive (midpoints ≤ 450); the five
  standard/high-chill crops (midpoints 600–951) drop out. Step 2 now **visibly differs** between warm
  and cold blocks — the whole goal of the change.
- Contrast with the **old min rule** at ~500: it kept every crop whose *minimum* ≤ 500 — that's 8 of 10
  (only pear min 700 and plum-european min 579 dropped), so warm vs cold barely differed. The midpoint
  rule roughly halves the warm-block list and makes the distinction legible.

Sanity points on the boundary at other medians: a **~600** block keeps peach-standard (600 ≥ 600,
boundary-included) but still drops cherry-standard (600 < 700); a **~700** block adds cherry-standard
(700 ≥ 700) and pear is still out until **800**.

### A2.6 Agronomic justification + honesty caveat

- **Why the midpoint, not the minimum.** The `[min, max]` range spans a crop class from its
  lowest-chill cultivars to its highest. The bare minimum only guarantees that the *easiest* cultivar
  in the class *might* break dormancy; it says little about whether the class as a whole will crop
  reliably. The **midpoint better reflects where the typical cultivar in that class actually
  performs** — i.e. the chill at which a grower picking a "normal" variety of that crop has a fair
  chance of success. This matches the data doc's own framing: the winter character bands (§"Winter
  climate-character bands") are drawn at **class edges**, and the midpoint sits a crop in the middle of
  its documented class rather than at its extreme optimistic edge.
- **Still a heuristic display filter, not the verdict.** This is explicitly **not** the authoritative
  per-crop judgement. The real verdict (`evaluateCrop`/`rankCrops`, Step 3) uses `p10`-style safe-winter
  logic and the grower's own entered variety requirement. The midpoint rule is a **browse aid** to make
  Step 2 responsive to location; it intentionally errs toward *showing fewer, better-matched* crops.
  The honest caveat (surface in copy / methods, not invented precision): *"We shortlist crops whose
  typical chill need your block's projected winter can meet. It's a guide to narrow the list — the full
  check below weighs each crop properly."*
- **Model caveat inherited:** chill figures mix net-model AU sources and plain-model US cross-checks
  (see the data doc caveats); the midpoint is therefore an approximate central value, not a precise
  threshold. Consistent with treating this as a heuristic.

### A2.7 Test updates (`tests/chillFilter.test.ts`)

The existing suite asserts the **min** rule; update fixtures/expectations to the **midpoint** rule.
Keep the same structure (minimal `CropOption` literals, only `id` + `winter.chillHours` meaningful).

- **Boundary — included (exact midpoint).** crop `[400, 800]` (midpoint 600), median **600** → kept.
- **Below midpoint — excluded.** same crop, median **599** → dropped (even though 599 ≥ min 400 — this
  is the case that *changes* vs the old rule; assert it to lock in the new semantics).
- **Above midpoint — included.** median **601** → kept.
- **Non-integer midpoint boundary.** crop `[118, 685]` (midpoint 401.5): median **401** → dropped,
  **402** → kept, **401.5** → kept. Proves raw (un-rounded) midpoint boundary.
- **User crop `[v, v]` unchanged.** crop `[500, 500]` (midpoint 500): median **500** → kept, **499** →
  dropped — identical to the old min rule; assert midpoint === v for the degenerate range.
- **Warm/cold worked example (integration-style).** Build the 10 real crops' `[min,max]`; assert
  `filterAppropriateByChill(all, 1000)` keeps all 10 (order preserved) and
  `filterAppropriateByChill(all, 500)` keeps exactly `[peach-low, apple-low, cherry-low, plum-japanese,
  apricot]`-equivalent ids (the five midpoints ≤ 450), in input order. This pins the headline behaviour
  to the real data.
- **NaN / non-finite → all kept** (unchanged); **purity / no mutation / new array ref** (unchanged);
  **`isAppropriateByChill` predicate matches the array filter** (update to midpoint).

No `Planner`/`OptionPicker` logic test changes are required for this rule change (the picker still just
renders what it's given); the pure filter carries the coverage.

---

## A3. Change 2 — no-location placeholder

### A3.1 The three OptionPicker states

Today `filterState` has two values and `'pre-location'` renders the **full list + hint**. Re-specify
so the picker expresses **three** display states. `filterState` keeps the same two-value type; the
behaviour of `'pre-location'` changes to *placeholder-only*:

| state | when | what renders |
|---|---|---|
| **(a) no-location placeholder** | `analysis == null` → `filterState='pre-location'` | **A single placeholder message. NO crop list. NO chill-requirement inputs. NO "we rank every crop" footer.** |
| **(b) filtered-empty** | climate known, filter left `crops.length === 0` → `filterState='filtered'` | The existing empty-state **note** (no list). |
| **(c) filtered-nonempty** | climate known, `crops.length > 0` → `filterState='filtered'` | The crop **list** (checkboxes + requirement inputs) + the "we rank every crop…" footer. |

The change is confined to branch (a): previously it rendered the list under a hint; now it is
message-only and returns early *before* the `<ul>`.

### A3.2 Exact copy

- **(a) no-location placeholder:** `Pick a location above to see which crops suit your block.`
- **(b) filtered-empty:** keep the current wording: `No crop in the list needs this little winter chill.`
- **(c) filtered-nonempty:** unchanged list + the existing footer paragraph (`We rank every crop by
  default. Untick any you don't want…`).

### A3.3 What renders in OptionPicker (revised control flow)

```tsx
export function OptionPicker({ crops = CROP_OPTIONS, value, onChange,
                               filterState = 'pre-location' }: Props) {
  const update = (id, patch) => onChange({ ...value, [id]: { ...value[id], ...patch } });

  // (a) No location/climate yet → placeholder MESSAGE ONLY. No list, no inputs, no footer.
  if (filterState === 'pre-location') {
    return (
      <p className="rounded-lg bg-paper px-4 py-3 text-muted">
        Pick a location above to see which crops suit your block.
      </p>
    );
  }

  // (b) Climate known but the chill filter left nothing → NOTE (unchanged).
  if (crops.length === 0) {
    return (
      <p className="rounded-lg bg-sun-soft px-4 py-3 text-sun-ink">
        No crop in the list needs this little winter chill.
      </p>
    );
  }

  // (c) Climate known, non-empty → the list + footer (unchanged from today, minus the old
  //     'pre-location' hint paragraph, which no longer renders here).
  return (/* existing <ul> of crops + the "we rank every crop…" footer */);
}
```

- The old `{filterState === 'pre-location' && <hint/>}` paragraph inside the list is **removed** (its
  job is now the whole-branch placeholder in (a); the list only ever renders in the `'filtered'` state).
- `Props`/`filterState` type is **unchanged** (`'pre-location' | 'filtered'`), so Planner's existing
  `filterState={analysis ? 'filtered' : 'pre-location'}` wiring already selects the right branch — no
  Planner prop change needed for this. Only the *rendering* of `'pre-location'` changes.

### A3.4 Planner wiring + the Step-2 intro copy

- Keep `filterState={analysis ? 'filtered' : 'pre-location'}` and `crops={visibleCrops}` as-is.
- **The Step-2 intro paragraph** currently above the picker (`We rank every crop for your block… Refine
  the list below…`) assumes a list is present. Pre-location there is no list, so gate/adjust it:
  - When `!analysis`: either hide that intro or soften it so it doesn't promise a list that isn't shown
    (e.g. show just the step heading; the placeholder itself tells the grower what to do). Recommended:
    render the "we rank every crop… refine the list below" intro **only when `analysis` is set**, so
    pre-location Step 2 is simply the heading + placeholder (+ AddCropForm + button, see A3.5).
  - When `analysis` is set: keep the current intro.
- The NaN / sparse-block case still falls into `'filtered'` (because `analysis != null`) and
  `filterAppropriateByChill` returns all crops; so branch (c) renders the full list. If a dedicated
  "we couldn't read a reliable chill figure" note is wanted it stays a Planner-level line above the
  picker (optional, as in §4.5); it is not part of the three OptionPicker branches.

### A3.5 AddCropForm and "Check my block" button handling

Both live in Step 2 around the picker in `Planner.tsx`.

- **AddCropForm — keep visible pre-location (recommended).** Adding a crop is independent of knowing the
  block's climate: a grower may want to register their nursery's variety figures before (or without)
  picking a location, and user crops persist in IndexedDB. Hiding the form pre-location would block a
  legitimate, climate-independent action and make Step 2 feel inert. So render `AddCropForm`
  unconditionally; only the **pick-list** is placeholder-gated. (Justification: the placeholder is about
  "which existing crops suit *this block*" — a question that genuinely needs a location — whereas
  managing your own crop figures does not.)
- **"Check my block" button — keep visible, keep disabled logic.** It already `disabled={!location ||
  loading}` and shows "Pick a district first." when `!location`. Leave as-is: pre-location it's the
  disabled call-to-action that drives the user to Step 1, which is exactly the desired nudge.

So pre-location Step 2 is: heading → **placeholder message** (no list) → **AddCropForm** → **disabled
"Check my block"** button + "Pick a district first." Post-climate it becomes: heading → intro →
**filtered list (or empty-note)** → AddCropForm → enabled button.

### A3.6 OptionState safety (confirm nothing breaks)

- Pre-location, **no OptionState pick-list is rendered**, but `options` state still exists and is seeded
  by `initialOptionState` at mount (and back-filled by the `mergeOptions` effect as `combined`
  resolves). Nothing reads a rendered checkbox to populate `options`; the state is independent of what
  the picker draws. ✔ confirmed: not rendering the list cannot drop or corrupt `options`.
- When a location is later chosen and the list renders (branch c), every rendered crop reads
  `value[c.id] ?? {selected:true, requirement:defaultRequirement(c)}` — already guarded — so even a crop
  whose entry hasn't arrived yet renders safely.
- `evaluateAll(combined, analysis, options)` runs over the **full `combined`** list regardless of what
  Step 2 renders, so the full-results path (Step 3) is unaffected by the placeholder. ✔
- No change to `OptionState` shape, `initialOptionState`, `mergeOptions`, saved-report load, or the
  `resultsRequested` gate. The placeholder is purely a render branch.

---

## A4. Change 3 — full-catalogue reference view

A **read-only** view listing the complete built-in catalogue (and optionally user crops) with name,
type, category, chill range, and **provenance** (indicative flag + source string). This directly
serves the hackathon's data-credibility criterion by surfacing sourcing honestly. It must **reuse**
existing data (`CROP_OPTIONS`, `cropLabel`, `hasIndicativeData` from `shared/crops.ts`), must **not**
duplicate or edit crop data, and must stay read-only (CRUD remains in `AddCropForm`).

### A4.1 Placement options

**Option (3)-A — Collapsible `<details>` "See all crops & data sources" at the foot of the planner.**
A `<details><summary>` disclosure rendered by `Planner.tsx` below Step 3 (or at the foot of Step 2),
containing `<CropCatalogue/>`.

- Pros: Zero navigation/routing; discoverable right where crops are discussed; collapsed by default so
  it never clutters the decision flow; `<details>` is natively keyboard-accessible and needs no JS
  state. Mounts with a one-line add in an already-in-scope file (`Planner.tsx`).
- Cons: Lives inside the planner tabpanel, so it's "below the task" rather than a first-class
  destination; a long table at the page foot can feel buried.

**Option (3)-B — A top-level "Crop data" tab/panel in `App.tsx`.**
Add a third tab alongside "Replant planner" / "Check a tree" whose tabpanel renders `<CropCatalogue/>`.

- Pros: A clear, first-class place to "look at the full dataset somewhere else" — exactly the user's
  phrasing; fully separate from the Step-2 flow; reuses the existing accessible tablist pattern already
  in `App.tsx`; easy to deep-link/point judges at.
- Cons: Touches `App.tsx` (editable, allowed) and adds a nav item; slightly more wiring than a
  `<details>`. The catalogue needs its own crop source — simplest is to call `useCombinedCrops()` (or
  just use `CROP_OPTIONS`) inside `CropCatalogue` so `App.tsx` needn't thread data through.

**Option (3)-C — Modal/dialog opened from a link.** A "Crop data & sources" link that opens a modal.
- Pros: Overlay, no layout cost.
- Cons: Needs focus-trap/escape/scroll-lock to be accessible — the most a11y work for least benefit;
  rejected in favour of A or B.

### A4.2 Recommendation

**Primary: Option (3)-B (a top-level "Crop data" tab).** It best matches the user's intent ("look at
the full dataset *somewhere else*") by giving the catalogue its own destination cleanly separated from
the planning flow, reuses the existing, already-accessible tablist in `App.tsx`, and is the easiest
thing to point data-credibility judges at. `App.tsx` is editable and not forbidden, so the mount is in
scope.

**Acceptable fallback: Option (3)-A (`<details>` at the foot of Step 2/planner)** if we'd rather avoid
any `App.tsx` change — it mounts entirely within `Planner.tsx`. The component contract below is
identical either way; only the mount site differs, so we can start with A and promote to B later with
no change to `CropCatalogue`.

### A4.3 Component contract — `src/components/CropCatalogue.tsx` (NEW)

```ts
import {
  CROP_OPTIONS,
  cropLabel,
  hasIndicativeData,
  type CropOption,
} from "../../shared/crops";

interface Props {
  /** Crops to list. Defaults to built-ins so it works with zero wiring; pass the combined list
   *  (built-ins + user crops) to also show user figures. Read-only — never mutated. */
  crops?: CropOption[];
  /** Whether to visually separate / label user crops. Default true. */
  showUserCrops?: boolean;
}

export function CropCatalogue({ crops = CROP_OPTIONS, showUserCrops = true }: Props) { /* … */ }
```

- **Data source:** `CROP_OPTIONS` (default) or a passed `crops` list; **no new data, no edits to
  `shared/*`**. It only *reads* the frozen catalogue and the `Sourced` fields already present.
- **Columns (read-only table):** Crop (`cropLabel(c)` or `c.crop`), Type (`c.type`), Category
  (`c.category`), Chill range (`${c.winter.chillHours[0]}–${c.winter.chillHours[1]} h`), **Provenance**.
- **Provenance cell (honest sourcing):**
  - User crop (`isUserCrop(c.id)`): render **"Your figures"** (same badge wording as the picker).
  - Built-in with `c.winter.indicative === true`: render an **"App assumption"** / "indicative" flag
    plus the `c.winter.source` string if non-empty. Use `hasIndicativeData(c)` to decide whether to
    also flag that spring/summer fields are indicative (optional secondary flag — see A6 open question).
  - Built-in with `c.winter.indicative === false`: render the `c.winter.source` citation string as the
    source of record.
  - Empty `source` with `indicative:true`: show just the "App assumption" flag (no fake citation).
- **Link out:** optionally a line/footer linking to `docs/crop-data-sources.md` as the canonical data
  contract (static text/anchor; the file isn't bundled, so link as documentation reference or inline a
  short "full sourcing notes live in the project's crop-data-sources doc").
- **Read-only guarantee:** no `onAdd`/`onEdit`/`onDelete` props, no inputs, no mutation of `crops`; it
  renders text only. CRUD stays exclusively in `AddCropForm`. The component imports nothing from
  `userCrops.ts` except possibly `isUserCrop` (a pure id check — allowed; `userCrops.ts` is forbidden
  for *edits*, but importing its existing pure helper is a read, not an edit — if even that is to be
  avoided, detect user crops via a passed flag or an `id.startsWith('user-')` check documented inline).

### A4.4 Where it mounts

- **Option B (recommended):** in `App.tsx`, add a third `View` value `"crops"`, a third `tab("crops",
  "Crop data")`, and a third `<div role="tabpanel" id="panel-crops" aria-labelledby="tab-crops"
  hidden={view!=="crops"}><CropCatalogue/></div>`. `CropCatalogue` can call `useCombinedCrops()` itself
  (read-only use of its `combined`/`userCrops`) so `App.tsx` passes no data. This reuses the existing
  accessible tablist markup already in `App.tsx` — only additive edits, no forbidden file touched.
- **Option A (fallback):** in `Planner.tsx`, below Step 3 (or Step 2), render
  `<details className="…"><summary>See all crops & data sources</summary><CropCatalogue
  crops={combined} /></details>` passing the already-available `combined`. One additive block, no new
  state.

### A4.5 Accessibility

- **Headings:** the view has a single `<h2>`/`<h3>` ("Crop data & sources") above the table; in Option B
  it sits inside the labelled tabpanel; in Option A the `<summary>` is the accessible toggle label.
- **Table semantics:** a real `<table>` with `<caption>`, `<thead>` + `<th scope="col">` for each
  column, `<tbody>` rows. Provenance flags are text (not colour-only); the "App assumption"/"Your
  figures" badges include a text label, not just a dot.
- **Disclosure (Option A):** native `<details>/<summary>` is keyboard-reachable and toggles on
  Enter/Space with no custom JS. (Option B reuses the existing keyboard-operable tab buttons.)
- No images-as-data, no reliance on hover; source strings are selectable text.

### A4.6 Read-only guarantee (restated)

`CropCatalogue` has no mutating props and renders no form controls; it cannot add/edit/delete crops.
It imports only read helpers (`CROP_OPTIONS`, `cropLabel`, `hasIndicativeData`, optionally the pure
`isUserCrop`). It does **not** edit or duplicate `shared/crops.ts` / `shared/crops.data.json`. All CRUD
remains in `AddCropForm`.

---

## A5. Risks & open questions

1. **Does the midpoint make the list feel too empty on marginal blocks?** On a mid-chill block (~500 h)
   the list drops from ~8 to 5 crops; on a genuinely warm block (<300 h projected) it could drop to the
   two 300-midpoint crops or fewer, and a very warm block below 300 would hit the **filtered-empty**
   note (A3.1 b). That empty-state is now intended behaviour (honest: "no crop's typical chill need is
   met"), but if it feels too austere we could (a) keep the empty note as designed, or (b) revisit the
   §5-Q1 "show-all-with-note" fallback. **Recommendation:** keep the honest empty note; it's the point
   of the stricter rule. **Open:** confirm empty-note (not show-all) is preferred under the midpoint rule.
2. **Should user crops appear in the full-catalogue view?** Recommended **yes**, clearly flagged "Your
   figures", because the catalogue is "the whole dataset" and the grower's own crops are part of it —
   and provenance honesty is the goal. Easily toggled via `showUserCrops`/the `crops` prop. **Open:**
   include user crops by default, or built-ins only?
3. **Should the catalogue also show the summer/frost indicative flags?** The data doc marks
   `spring.frostDamageC` and `summer.hotDaysTolerated` as indicative/unsourced for most crops.
   `hasIndicativeData(c)` already aggregates winter|spring|summer. **Options:** (i) show only the winter
   chill provenance (the only figure the filter uses) to keep the table focused; (ii) add a small
   "other fields indicative" flag via `hasIndicativeData`; (iii) a per-season provenance sub-table.
   **Recommendation:** (ii) — one chill-source column plus a compact "spring/summer figures are app
   assumptions" flag where `hasIndicativeData` is true — honest without a sprawling table. **Open:**
   confirm the provenance granularity.
4. **`defaultRequirement` vs the filter midpoint.** Both compute the range middle, but
   `defaultRequirement` rounds and lives in a forbidden file. The filter computes its own un-rounded
   midpoint to preserve exact boundary semantics and avoid importing scoring code. **Open:** accept the
   intentional (tiny) divergence on `.5` midpoints, or round the filter midpoint to match
   `defaultRequirement`? (Recommendation: keep un-rounded; boundary clarity > matching a rounded default.)
5. **Catalogue data source in Option B.** If `CropCatalogue` calls `useCombinedCrops()` itself, it runs
   a second IndexedDB load (independent of Planner's). Harmless (read-only, StrictMode-safe hook) but a
   duplicate fetch. **Open:** accept the independent hook call, or pass `combined` down from a shared
   parent? (For a hackathon, the independent hook is simplest and fine.)
6. **Linking to `docs/crop-data-sources.md`.** The markdown isn't bundled into the app, so an in-app
   hyperlink won't resolve in production. **Open:** inline a short sourcing note / link to the repo
   doc, or omit the link and rely on the per-row source strings (which already carry the citations)?
