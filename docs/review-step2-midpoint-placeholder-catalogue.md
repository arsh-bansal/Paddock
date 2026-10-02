# Code Review — Step-2 crop-flow slice (midpoint rule, no-location placeholder, Crop-data tab)

- **Project:** `/Users/duynguyen/side_project/Hackathon/Paddock`
- **Branch:** `feature/crop-db-ranking`
- **Mode:** Review-only (nothing modified).
- **Spec:** `docs/design-step2-appropriate-filter.md` §1–§5 + Addendum (A2 midpoint, A3 placeholder, A4 catalogue).
- **Scope reviewed:** NEW `src/components/CropCatalogue.tsx`; CHANGED `shared/chillFilter.ts`, `tests/chillFilter.test.ts`, `src/components/OptionPicker.tsx`, `src/components/Planner.tsx`, `src/App.tsx`.

## Build / Test evidence

- `npm run lint` (= `tsc --noEmit`) → **exit 0, clean** (no type errors; strict/noUnusedLocals/noUnusedParameters satisfied).
- `npm test` (= `vitest run`) → **90 passed / 91**, 9 files. `tests/chillFilter.test.ts` = **18/18 green**.
- The single failure — `tests/savedReports.test.ts > keeps only the newest 30` (`expected 'Block 31' to be 'Block 32'`) — is the KNOWN pre-existing Date.now()-ms flake. Verified it **passes in isolation** (`npx vitest run tests/savedReports.test.ts` → 3/3 pass). This task touches neither `savedReports.ts` nor its test. Ignored per context.

## Scope / unchanged-file confirmation

- `git diff --name-only HEAD` over the "must be unchanged" set (`shared/ranking.ts shared/seasons.ts shared/chill.ts shared/types.ts shared/appropriateCrops.ts OptionResults.tsx SeasonsPanel.tsx LocationPicker.tsx seasonRows.ts savedReports.ts userCrops.ts useCombinedCrops.ts server/`) → **empty**. None modified vs last commit.
- `shared/appropriateCrops.ts` is untracked (`??`) from an earlier uncommitted slice; not touched here. The post-verdict appropriate filter is intact.
- **`shared/crops.ts` + `tsconfig.json`:** `git diff` shows ONLY the JSON-loader migration (zod schema, `rawCrops` import, `resolveJsonModule:true`). THIS task added nothing to them — confirmed, consistent with the pre-modification note.
- **Caveat (not a defect):** the working tree is entirely uncommitted since merge `61952fd`, so `git diff` for the tracked files `Planner.tsx`/`OptionPicker.tsx`/`App.tsx` conflates THREE slices (user-added-crops, hybrid-autorun, and this Step-2 slice). I reviewed against the *current file contents*, isolating this slice's deltas. The `resultsRequested` gate and preset auto-run effect belong to the already-reviewed hybrid-autorun slice and are not re-touched here.

---

## Findings by severity

### Blocker
None.

### Major
None.

### Minor

**M1 — Filtered-empty copy is semantically stale under the midpoint rule.**
`src/components/OptionPicker.tsx:60` (branch b): `"No crop in the list needs this little winter chill."`
Under the OLD *minimum* rule this was literally true (nothing's minimum was low enough). Under the NEW *midpoint* rule a crop is dropped when the block's median is below the range **midpoint**, even though the crop's *minimum* may be well under the block's chill. So "needs this little winter chill" slightly misdescribes why the list is empty — the block isn't necessarily too *low*-chill for everything; it just doesn't reach the typical-cultivar midpoint of any crop. The Addendum A3.2 explicitly says to *keep* this wording, so this is spec-compliant and intentionally out of scope — flagging only for honesty/accuracy follow-up. In practice branch (b) is near-unreachable with the real catalogue (lowest midpoint 300; any finite median ≥300 keeps ≥1 crop, and NaN shows all), so impact is negligible. **No change required to satisfy the spec.**

### Nitpick

**N1 — CropCatalogue secondary indicative hint keys off `hasIndicativeData`, which includes winter.**
`src/components/CropCatalogue.tsx:118`: `{!isUserCrop(c.id) && hasIndicativeData(c) && <span>Spring/summer figures are app assumptions.</span>}`.
`hasIndicativeData` returns true if **winter OR spring OR summer** is indicative. For a built-in whose winter is indicative but whose spring/summer happen not to be, the fixed text "Spring/summer figures are app assumptions" could read slightly off. With the real JSON every crop's spring/summer are `indicative:true`, so the text is always accurate today; it's a latent wording coupling only. Honest and non-misleading as shipped.

**N2 — Second IndexedDB read in the Crop-data tab.** `CropCatalogue` calls `useCombinedCrops()` independently of the Planner's instance (two live subscriptions). This is explicitly accepted in the component doc-comment and A4; StrictMode-safe (same hook, `alive` guard, REPLACE-not-append, dedupe-by-id). No loop, no double-insert. Acceptable.

---

## Detailed verification against the critical scrutiny points

### #1 Midpoint correctness (shared/chillFilter.ts) — PASS

- Formula `chillMidpoint = (chillHours[0] + chillHours[1]) / 2`, **un-rounded**, private, **not exported**. Public signatures `isAppropriateByChill(crop, number)→boolean` and `filterAppropriateByChill(crops, number)→CropOption[]` unchanged. Imports only `type CropOption`. No `defaultRequirement` dependency (which rounds). ✔
- Pure: `filter`/`slice`, no mutation, new array ref on both paths, input order preserved (output is a subsequence). ✔ (and locked by the "is pure" + "NEW array reference even on NaN path" tests).
- Non-finite guard `!Number.isFinite(x)` covers NaN **and ±Infinity** → `crops.slice()` (copy, never empty). ✔ (tests cover NaN and +Infinity).
- Boundary `>=`: median === midpoint INCLUDED, just-below EXCLUDED. ✔
- **Independent recomputation of midpoints from `shared/crops.data.json`** — every value matches the test's claimed midpoints exactly:

| id | JSON chillHours | midpoint | test claim |
|---|---|---|---|
| peach-standard | [400,800] | 600 | 600 ✔ |
| peach-low | [200,400] | 300 | 300 ✔ |
| apricot | [300,600] | 450 | 450 ✔ |
| plum-japanese | [118,685] | **401.5** | 401.5 ✔ |
| plum-european | [579,1323] | **951** | 951 ✔ |
| cherry-standard | [600,800] | 700 | 700 ✔ |
| cherry-low | [300,500] | 400 | 400 ✔ |
| apple-mainstream | [550,1000] | 775 | 775 ✔ |
| apple-low | [200,400] | 300 | 300 ✔ |
| pear | [700,900] | 800 | 800 ✔ |

  Non-integer midpoints 401.5 and 951 are correctly NOT rounded, and the tests pin 401/402/401.5 and 950/951 boundaries. **No mismatch between the test's values and the real JSON.**
- Warm median **500** keeps exactly {peach-low 300, apricot 450, plum-japanese 401.5, cherry-low 400, apple-low 300} (midpoints ≤ 500) and drops {peach-standard 600, cherry-standard 700, apple-mainstream 775, pear 800, plum-european 951}. Arithmetic verified correct; the test's expected input-order array `[peach-low, apricot, plum-japanese, cherry-low, apple-low]` matches the JSON order. ✔
- Cold median **1000** ≥ max midpoint 951 → all 10 kept, order preserved. ✔
- Degenerate user crop `[v,v]` → midpoint v, identical to the old min rule. ✔ (test `[500,500]`).

### #2 Display-only invariant preserved — PASS

- `evaluateAll(combined, analysis, options)` still runs over the full **`combined`** set, then `rankCrops`. `visibleCrops = filterAppropriateByChill(combined, futureMedianChill)` is passed ONLY to `OptionPicker crops={visibleCrops}` — never to evaluation, ranking, or brief. (`Planner.tsx` `crops` memo and `briefCrops` derive from `evaluateAll`, not `visibleCrops`.) ✔
- Step-3 gate `{analysis && resultsRequested && (…)}` present and unchanged; the preset auto-run effect (keyed on `presetKey`, ref-guarded) is the already-reviewed hybrid-autorun code, not re-touched by this slice. ✔
- `briefCrops = crops.slice(0, BRIEF_CROP_CAP)`, `mergeOptions` reconciliation unaffected by the chill filter. ✔

### #3 OptionPicker three states — PASS

- `filterState` type still `'pre-location' | 'filtered'`; Planner passes `analysis ? 'filtered' : 'pre-location'`. ✔
- (a) pre-location is an **early return** of a single `<p>` placeholder — no `<ul>`, no number inputs, no footer; the OLD in-list hint paragraph is fully removed (grep: no dead markup, no unused vars — lint clean). No crop input is focusable pre-location. ✔
- (b) filtered && length 0 → the preserved empty-state note. ✔
- (c) filtered && length > 0 → list + "we rank every crop…" footer. Checkboxes, per-crop `req-${id}` number input, "Your figures" badge, and the user-crop guard `value[c.id] ?? { selected:true, requirement: defaultRequirement(c) }` all intact. ✔
- Placeholder a11y: plain `<p>`, fine. ✔

### #4 OptionState safety when list not rendered — PASS

- `options` seeded by `initialOptionState` at mount and back-filled by the `mergeOptions` effect on `[combined]` with a no-op guard (prevents re-render loop). Nothing reads a rendered checkbox to populate state, so not rendering the pick-list pre-location cannot drop/corrupt `options`. Pressing "Check my block" evaluates over full `combined` using retained selection state. ✔

### #5 App.tsx tab wiring (a11y) — PASS

All three tabs are produced by the **same `tab(id,label)` factory**, so ARIA symmetry is structural, not duplicated-by-hand:
`role="tab"`, `aria-selected={view===id}`, `aria-controls={`panel-${id}`}`, `id={`tab-${id}`}`. Each panel: `id="panel-${id}"`, `role="tabpanel"`, `aria-labelledby="tab-${id}"`, `hidden={view!==id}`. The new `crops` tab/panel is byte-for-byte parallel to `planner`/`stress`:
- `aria-controls="panel-crops"` ↔ panel `id="panel-crops"` ↔ `aria-labelledby="tab-crops"` ↔ tab `id="tab-crops"` — IDs unique, cross-refs consistent. ✔
- `hidden` logic identical; default/active tab `useState<View>("planner")` unchanged; switching to "Crop data" and back works. ✔
- Existing two tabs behaviourally unchanged (purely additive: one `View` union member, one `tab(...)` call, one panel `<div>`). ✔
- **Observation (pre-existing, NOT a regression):** the tablist uses plain `role="tab"` buttons with **no roving-tabindex / ArrowLeft-ArrowRight key handling** — all tabs are in the natural tab order with no `onKeyDown`. This deviates from the full WAI-ARIA Tabs keyboard pattern, but it already existed on the two prior tabs and the new tab mirrors it **exactly**, so there is **no asymmetry and no regression introduced by this task**. (If the team later wants full APG compliance, add roving tabindex + arrow handling to the shared `tab()` factory so all three stay symmetric.)

### #6 CropCatalogue.tsx (read-only + a11y + data) — PASS

- Semantic `<table>` with `<caption class="sr-only">`, `<th scope="col">` for all 5 column headers, and `<th scope="row">` for the crop name. Exactly one `<h2 id="crop-catalogue-heading">`. ✔
- Columns: Crop (`cropLabel`), Type, Category, Winter chill (`[0]–[1]`), Provenance. ✔
- Provenance is **TEXT, never colour-only**: `isUserCrop` → "Your figures"; `winter.indicative` → "App assumption"; else "Sourced"; plus the `source` detail text. Flags derived correctly, with `isUserCrop` checked **first** so user crops (which have `indicative:true`) correctly read "Your figures", not "App assumption". ✔
- Includes user crops via `useCombinedCrops().combined`. **No CRUD** (no inputs/onAdd/onEdit/onDelete, no mutation). Reuses `CROP_OPTIONS`/`cropLabel`/`hasIndicativeData`/`isUserCrop` — no data duplication, no `shared/*` edits. ✔
- Stable keys: `key={c.id}`. StrictMode-safe (same hook used elsewhere; no loop). ✔
- Provenance render check against real data:
  - sourced built-in (e.g. `peach-standard`, `winter.indicative:false`) → "Sourced" + its citation. ✔
  - indicative built-in (e.g. `apricot`, `winter.indicative:true`) → "App assumption" + its "needs human verification" source. ✔
  - user crop (`toCropOption` → `source:'Your own figure'`, `indicative:true`) → "Your figures" + "Your own figure". ✔

### #7 Strict / regressions — PASS

- `tsc --noEmit` clean → no unused imports/vars from the removed hint paragraph; no dead code; no leftover `OptionResults`/`RANK` references in Planner (grep: none). ✔
- All non-flaky tests green (90/91; chillFilter 18/18). `appropriateCrops.ts` untouched. ✔

### #8 Honesty / credibility — PASS

- Catalogue never presents indicative/app-assumption figures as sourced: the "App assumption" label is distinct from "Sourced", and the intro copy explains "App assumption" = rule-of-thumb placeholder. User crops clearly "Your figures". The provenance ordering (user → indicative → sourced) is correct. The one latent wording coupling (N1) is accurate for the current data. **Labelling is accurate and not misleading.** ✔

---

## Verdict

**APPROVE.** The slice implements the Addendum (A2 midpoint, A3 three-state placeholder, A4 Option-B Crop-data tab) faithfully. Lint is clean, the full suite is green except the documented pre-existing savedReports flake (passes in isolation), and chillFilter's 18 tests lock the midpoint semantics. The midpoint arithmetic was independently recomputed against `shared/crops.data.json` with **zero mismatches** against the test's claimed values, and the App.tsx tab ARIA is symmetric with the existing tabs with **no a11y regression**. The display-only invariant (evaluation/ranking/brief over full `combined`; Step-3 `resultsRequested` gate) is preserved. Only Minor/Nitpick items remain, none blocking: M1 (filtered-empty copy is spec-mandated but semantically loose under the midpoint rule — a near-unreachable branch) and N1/N2 (latent wording coupling and the accepted second IndexedDB read).
