# Code Review — "Crops that suit this block" (feature/crop-db-ranking)

Reviewed against `docs/design/design-crop-recommendation.md` (§4.2 band table, §3.2 cut line) and the three locked decisions.
Review-only; nothing modified.

## Verdict: APPROVE

Lint clean, all 75 tests pass, every locked decision and checklist item verified against source. No Blockers or Majors. A handful of Nitpicks only.

---

## Build & Test Evidence

`npm run lint` (`tsc --noEmit`, strict + noUnusedLocals + noUnusedParameters):
```
LINT_EXIT=0   (no output, clean)
```

`npm test` (`vitest run`):
```
✓ tests/climateCharacter.test.ts (21 tests)
✓ tests/chill.test.ts (9)   ✓ tests/ranking.test.ts (8)   ✓ tests/crops.test.ts (16)
✓ tests/seasons.test.ts (18) ✓ tests/savedReports.test.ts (3)
Test Files 6 passed (6) | Tests 75 passed (75)
```
The known-flaky `savedReports.test.ts 'keeps only the newest 30'` passed this run. That file has zero diff vs origin/dev (`git diff --name-only origin/dev -- ...` empty), so this task did not affect it.

---

## Scope / untouched-file verification

- `git diff --name-only origin/dev` for shared/ranking.ts, shared/seasons.ts, shared/chill.ts, shared/types.ts, shared/crops.data.json, src/components/OptionResults.tsx, src/components/SeasonsPanel.tsx, src/lib/seasonRows.ts, server/ → **empty**. All confirmed UNTOUCHED.
- `OptionResults.tsx` diff vs origin/dev → **empty** (zero diff). Reused as-is. ✓
- Pre-existing (item-1/2/3) changes `shared/crops.ts`, `src/components/OptionPicker.tsx`, `tsconfig.json` are present but this task added nothing crop-recommendation-specific to them (crops.ts/OptionPicker are data-layer/ranking work; tsconfig has the single prior line). ✓
- `server/` diff empty → brief cap is client-side only; `/api/explain` `.max(25)` at `server/index.ts:108` unchanged. ✓

---

## Locked-decision verification

1. **Bands.** `CLIMATE_BANDS` (`shared/climateCharacter.ts:62-104`) is the single exported const holding every breakpoint. Winter warm `<400` / mild `400–699` / cold `>=700` on `chillHours.median` matches §4.2 exactly. Summer `5/15` + extreme `>=3`, water `0/400`, frost `1/5` all match the §4.2 v1 table. `appDefined: true` is a literal type on `ClimateCharacter` and always set (`:197`). ✓
2. **Cut line.** `SUITED_VERDICTS = Set(['viable','at-risk'])` (`:212-215`) is the single source of truth; `partitionBySuitability` branches solely on `SUITED_VERDICTS.has(crop.overall)` (`:231`). `not-viable` and `no-data` fall to `notSuited`. Since `SeasonVerdict = Verdict | 'no-data'` (seasons.ts:174), no-data is correctly excluded from suited. ✓
3. **Placement/purity.** `partitionBySuitability` lives in `shared/climateCharacter.ts`; `CropRecommendation` is a new file; brief cap top-25 client-side, no server edit; `climateSentence` is pure; winter/summer/water use `.median`, frost uses `.mean`. ✓

---

## Checklist findings

### 1. Purity & runtime-safety — PASS
- No `fs`/Node imports; only a type-only import from `./seasons` (`:21`). Pure arithmetic. Compatible with Vite/esbuild/tsx/vitest (lint under tsc clean; tests run under vitest).
- Every axis guards `Number.isFinite` before classifying (`:150,159,174,183`) and returns `null` for that axis — never throws. Verified by the "sparse" and "all-NaN" tests (test lines 171-212).
- `partitionBySuitability` builds two fresh arrays via push; no sort/splice on the argument. "does not mutate its input" test (test:287-292) confirms.

### 2. Band correctness — PASS
- Correct field+stat per axis: winter `chillHours.median` (:149), summer `hotDays.median` + `extremeDays.median>=3` override (:157-166), water `waterDeficitMm.median` (:172), frost `springFrostDays.mean` (:181). Field names match `SeasonSummary` (seasons.ts:39-52).
- Boundary determinism: comparisons use `v < low ? … : v >= high ? … : mid`. 700→cold, 699→mild, 5→warm, 0→moderate — all asserted (test:72-75, 100-102, 125-127) and pass.
- Extreme override only fires when `extremeDays` is itself finite (`:163`), so a dropped extreme stat cannot spuriously escalate — asserted (test:109-112).
- No magic numbers duplicated outside `CLIMATE_BANDS`; every classifier destructures from it.

### 3 / 3b. Partition correctness & ordering — PASS
- viable+at-risk→suited, not-viable+no-data→notSuited; single-pass filter preserves input order (stable subsequence). Tests cover grouping (test:255-263), order preservation (test:265-276), and the permutation/id-multiset property with `suited.length+notSuited.length===input.length` (test:278-285).
- Relies on input `rankCrops` order; performs no re-sort. The doc comment (`:218-226`) and code confirm.

### 4. Composition / no-edit — PASS
- `CropRecommendation` imports `OptionResults` and feeds it each subset (`CropRecommendation.tsx:52, 68`). OptionResults zero-diff.
- Secondary group uses native `<details>`/`<summary>` (`:64-67`), keyboard-usable by default.
- Empty-suited fallback renders a sentence (no empty section) (`:54-57`).
- Accessibility: `<section aria-labelledby="recommend-heading">` with matching `<h3 id>` (`:34-37`).

### 5. Planner wiring — PASS
- `futureCharacter`/`baselineCharacter` useMemo deps `[analysis]`; `{suited,notSuited}` useMemo dep `[crops]` (Planner.tsx:120-133). Correct deps.
- `<CropRecommendation>` placed above `<SeasonsPanel>` (Planner.tsx, render block). ✓
- Old standalone `<OptionResults crops={crops}/>` removed and its import removed (diff shows `-import { OptionResults }` and `-<OptionResults crops={crops} />`). Lint clean → no unused-import error.
- ChillChart & AdaptationNotes still receive full `crops`; Brief receives `briefCrops` (top-25). `crops`/`briefCrops`/`topCrop`/`save`/`download`/`mergeOptions` logic intact. No stale references (lint clean).

### 6. climateSentence — PASS
- Pure string assembly; null axes omitted via `if (character.winter)` guards (`climateSentence.ts:63-66`).
- Grammatical for all-present and partial cases via Oxford-comma `joinClauses` (`:48-53`).
- All-null character returns a graceful fallback sentence — no `undefined`/garbage (`:70-72`): "By 2045 there isn't enough seasonal data to describe this block's climate." / "Today …". ✓
- Future label `"2045"` → "By 2045 …"; baseline label `"today"` → "Today …" (CropRecommendation.tsx:42,47). Matches design intent.

### 7. Tests quality — PASS
- Per-band cases for all 4 axes, extreme override (incl. non-override below trigger and on NaN), exact boundaries (700→cold, 699→mild, 5→warm, 0→moderate, -1→wet), NaN→null-no-throw, appDefined true, basis strings, value echo.
- Partition: both groupings, order preservation, permutation/id-multiset, empty, all-not-viable, no-mutation.
- Fixtures are plain literals. Tests import `CLIMATE_BANDS` and derive expectations from it (e.g. `warmMax-1`) rather than hardcoding — so a band change can't silently pass. Not trivially passing.

### 8. Edge cases / regressions — PASS
- Whole season missing → that axis null → sentence omits it; if all null → fallback sentence. Partition unaffected.
- suited empty + notSuited non-empty → fallback paragraph + the `<details>` list renders. ✓
- Both empty → `future`/`baseline` may still render (if analysis present), suited fallback paragraph shows, `<details>` not rendered (`notSuited.length > 0` guard). No crash. Note: Planner only mounts `<CropRecommendation>` when `analysis` is truthy, and the Save/PDF buttons already guard `crops.length === 0`.
- TS strict: lint clean.
- PDF/report path unchanged: `download`/`downloadReport` still pass full `crops` (Planner.tsx download call uses `crops`), report renderer untouched.

---

## Minor
None material.

## Nitpick
- N1. `shared/climateCharacter.ts:143-146` — the generic `reading()` helper re-checks `Number.isFinite(value)` even though each `classify*` already guards the driving value and returns early on non-finite. The guard is therefore dead on the happy path (never reached with a non-finite value). Harmless and arguably good defensive depth, but it's redundant; could be a plain constructor. No action required.
- N2. Design §4.2 typed `AxisReading.value` as `number | null`; the implementation narrows it to `number` because a null-driving-value collapses the whole `AxisReading` to `null` at the axis level instead. This is cleaner than the doc's shape and fully type-safe — just a (beneficial) deviation from the doc's illustrative snippet, worth noting so the doc can be reconciled later.
- N3. `CropRecommendation.tsx` uses curly quotes/dashes in copy ("Suited", "app-defined — see Methods"). Consistent with the rest of the app's copy; purely stylistic.

---

## Summary
The feature is a clean, well-tested, runtime-agnostic addition. The pure layer (`climateCharacter.ts`) centralises every breakpoint in one const matching the locked §4.2 values, never throws on sparse data, and preserves rank order in a provable permutation. The UI composes the untouched `OptionResults` without modifying it, degrades gracefully, and is accessible. Planner wiring is correct with proper memo deps and no stale references. Lint and the full suite (75 tests) pass. **APPROVE.**
