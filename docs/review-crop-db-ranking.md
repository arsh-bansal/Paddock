# Code Review — feature/crop-db-ranking

Project: `/Users/duynguyen/side_project/Hackathon/Paddock`
Branch: `feature/crop-db-ranking` (confirmed via `git branch --show-current`)
Reviewed against: `docs/design-crop-db-ranking.md`, `docs/crop-data-sources.md`
Scope: Item 2 (JSON data file + zod loader), Item 3 (10 crops transcribed), Item 1 (rankCrops + wiring)

## Verdict: APPROVE WITH MINOR CHANGES

The implementation is faithful to the design, the public API is preserved, lint is clean, and all
feature tests pass. The only failing test (`savedReports > keeps only the newest 30`) is a genuine
PRE-EXISTING flake in an unmodified file — confirmed by zero diff vs `origin/dev` and by reproducing
the intermittency. No Blockers. A small number of Minor/Nitpick items below.

---

## Verification evidence

**Lint — `npm run lint` (tsc --noEmit): PASS, exit 0.** No type errors (strict, noUnusedLocals,
noUnusedParameters all on).

**Tests — `npm test` (vitest run): 53/54 pass.** Feature suites all green:
- `tests/ranking.test.ts` — 8 passed
- `tests/crops.test.ts` — 16 passed
- `tests/seasons.test.ts` — 18 passed (public-API regression guard — unchanged, passes)
- `tests/chill.test.ts` — 9 passed
- `tests/savedReports.test.ts` — 2 passed, 1 FAILED intermittently (`keeps only the newest 30`)

**Changed vs `origin/dev` (git diff --stat):** `shared/crops.ts`, `src/components/OptionPicker.tsx`,
`src/components/Planner.tsx`, `tsconfig.json`. New/untracked: `shared/crops.data.json`,
`shared/ranking.ts`, `tests/crops.test.ts`, `tests/ranking.test.ts`.
**NOT modified (verified zero diff):** `src/lib/savedReports.ts`, `tests/savedReports.test.ts`,
`server/index.ts`, `src/components/OptionResults.tsx`.

---

## Checklist results

| # | Item | Result |
|---|------|--------|
| 1 | Public API preserved | PASS — `CropOption`, `Sourced`, `CROP_OPTIONS`, `cropLabel`, `defaultRequirement`, `hasIndicativeData` all exported with identical signatures. `defaultRequirement` = `Math.round((lo+hi)/2)` = winter midpoint. `tests/seasons.test.ts` imports unchanged and passes. |
| 2 | Loader correctness | PASS — `cropsSchema.parse(rawCrops)` runs at module load, `Object.freeze`'d, synchronous (no Promise). Schema matches design: id regex+max60+unique, category enum, chillHours tuple+min<=max refine, floweringMonths 1-12, summer int-or-band(high/med/low→5/10/15), source default ''. |
| 3 | No Node-only APIs in shared/ | PASS — only `zod` + static JSON import. No fs/path. |
| 4 | Data contract | PASS (one note, see M1) — 10 crops, ids stable; sourced/indicative flags match `crop-data-sources.md` and the stated contract. |
| 5 | rankCrops purity & rules | PASS — pure (`[...evaluations].sort`, no input mutation, test-verified), deterministic, correct comparator chain. |
| 6 | Item 1 wiring | PASS — `crops = rankCrops(evaluateAll(...))`; brief capped `.slice(0,25)` on all 3 call sites; server/index.ts & OptionResults.tsx untouched; topCrop correct. |
| 7 | mergeOptions | PASS — new ids default `selected:true`, saved selections verbatim for known ids, no schema bump. |
| 8 | initialOptionState defaults | PASS — all crops `selected:true`; run button requires only location. |
| 9 | Tests quality | PASS — assertions are meaningful (see detail below). |
| 10 | Regressions/edge cases | PASS — `rankCrops([])→[]`, empty-crops disables save/download gracefully, no stale old-shape imports, lint clean. |

---

## Findings by severity

### Blocker
None.

### Major
None.

### Minor

**M1 — cherry-standard chill `[600,800]` is a third, undocumented value (data/provenance).**
`shared/crops.data.json` sets `cherry-standard.winter.chillHours = [600,800]`, `indicative:false`.
The data contract `docs/crop-data-sources.md` (#6) documents only two sourced conventions for
standard sweet cherry — net model `[700,1000]` (Chill Hours Tracker ~700h) or
`[1000,1500]` (Hort Innovation High/Very-high) — and notes the old placeholder was `[800,1200]`.
`[600,800]` matches none of these. The attached review checklist *does* specify `[600,800]` + the
Chill Hours Tracker source, and `tests/crops.test.ts` asserts exactly `[600,800]`, so this is
internally consistent with the task instruction — but it is marked `indicative:false` ("sourced")
while the source string cites "~700h", so the stored `[600,800]` is not strictly what the cited
source gives (700 is the point estimate, not an upper bound of 800). Suggested fix: either (a) align
to the documented net range `[700,1000]` and update the test, or (b) if `[600,800]` is a deliberate
product decision, record that decision + rationale in `crop-data-sources.md` so the data file and the
contract don't silently diverge. The season engine is unaffected either way; this is a
data-provenance/traceability issue, not a logic bug.
Ref: `shared/crops.data.json` (cherry-standard block), `docs/crop-data-sources.md` row 6,
`tests/crops.test.ts` ("applies decision 1").

**M2 — Pre-existing flaky test confirmed; left unfixed per instruction (assessment below).**
`tests/savedReports.test.ts:39` "keeps only the newest 30" fails intermittently (observed: FAIL,
PASS, PASS, FAIL, PASS across 5 isolated runs). Root cause confirmed by reading the code:
`saveReport` stamps `savedAt: new Date().toISOString()` (millisecond resolution) and `listReports`
sorts by `b.savedAt.localeCompare(a.savedAt)` with **no secondary tie-breaker**
(`src/lib/savedReports.ts:95` and `:107`). The test's tight loop saves 33 reports with no delay, so
multiple records collide on the same millisecond; their relative order is then non-deterministic
(depends on IndexedDB `entries()` insertion/iteration order), which makes both the "newest 30"
pruning and `list[0].label` non-deterministic.
**Assessment: the flake is genuinely pre-existing and unrelated to this change.** Evidence:
`git diff origin/dev` shows `src/lib/savedReports.ts` and `tests/savedReports.test.ts` are byte-for-byte
unchanged (zero diff); last commit touching them is `fd579bc`, before this branch's work. The one
plausible interaction — `initialOptionState()` now selecting 10 crops instead of 4 (used by the
test's `input()` builder) — only enlarges each saved record; it does not touch `savedAt` or the sort,
so it does not introduce the race. It could marginally change save latency and thus the *frequency*
of ms-collisions, but the defect (missing deterministic tie-break on equal timestamps) exists
independently. Not fixing here, as instructed. Recommended future fix (separate PR, owner of
savedReports): add a monotonic tie-break to the sort (e.g. secondary sort by `id`, or append a
counter/high-resolution component to `savedAt`), and/or have the test advance time between saves.

**M3 — `topCrop` double-ranks an already-ranked array.**
`Planner.tsx` computes `crops = evaluateAll(...)` which already returns `rankCrops(...)`. `topCrop`
then calls `rankCrops(crops)[0]` again (`Planner.tsx` ~line 78). `rankCrops` is idempotent so the
result is correct, but the re-sort is wasted work and slightly misleading. Suggested fix: `topCrop`
can take the already-ranked list and use `crops[0]` directly, or document that it defensively
re-ranks. Harmless; cosmetic.

### Nitpick

**N1 — Duplicated zod schema between loader and test.**
`tests/crops.test.ts` re-declares `sourced`/`cropSchema`/`cropsSchema` (and the `HEAT` map) verbatim
from `shared/crops.ts`. This is a deliberate choice (lets the test feed malformed inputs without
shipping broken JSON), but the two copies can drift. Consider exporting the schema from `crops.ts`
(e.g. `export const cropsSchema`) and importing it in the test so the validation rules have a single
source of truth. Minor maintainability.

**N2 — `seasonComfort` summer branch returns `null` when `threshold <= 0`.**
`shared/ranking.ts` skips the summer season in the worst-season min when `limit == null || limit<=0`.
Given the schema enforces `hotDaysTolerated` positive, `limit<=0` is unreachable for real data, but
the guard is reasonable defensive code. No change needed; noting for completeness.

**N3 — Brief cap recomputation in `openSaved`/`downloadSaved`.**
`openSaved` and `downloadSaved` recompute `evaluateAll(r.analysis, mergeOptions(r.options))` purely
to derive the brief signature, duplicating the memoized `crops` logic. Correct, but slightly
repetitive. Could be factored into a helper. Cosmetic.

---

## Detailed notes supporting the PASS marks

**Public API (item 1).** `shared/crops.ts` keeps hand-written `interface Sourced` and
`interface CropOption` (not `z.infer`), so downstream type identity is unchanged. `defaultRequirement`
body is `Math.round((chillHours[0]+chillHours[1])/2)`. `tests/seasons.test.ts` (18 tests) imports
`{ CROP_OPTIONS, type CropOption }` and passes untouched — strong regression evidence.

**Loader (item 2).** `CROP_OPTIONS` is a `const` initialised with `Object.freeze(cropsSchema.parse(...))`
at import — synchronous and frozen. `resolveJsonModule:true` added to `tsconfig.json`; `tsc --noEmit`
resolves the `import rawCrops from './crops.data.json'` with no error, and all four runtime shapes
(bundler moduleResolution) are satisfied by a static import. Vitest import also works (it loaded the
real catalogue in `tests/crops.test.ts`).

**Ranking (item 5).** Comparator order in `rankCrops`: (1) `VERDICT_BUCKET` viable<at-risk<not-viable
<no-data; (2) `worstSeasonComfort(b)-worstSeasonComfort(a)` → higher comfort first, computed as the
min comfort across data-bearing seasons (winter higher-better `future/100`; spring lower-better
`1-future/100`; summer lower-better `1-future/limit`; no-data/null skipped); (3) `indicativeSeasonCount`
fewer first; (4) `label` asc then `id` asc. Input copied with spread before sort — purity verified by
the test "does not mutate its input" and the seeded-shuffle determinism test (5 seeds → identical order).

**Wiring (item 6).** `crops` memo = `rankCrops(evaluateAll(...))`. `/api/explain` cap `BRIEF_CROP_CAP=25`
applied at: live (`briefCrops = crops.slice(0,25)`), `openSaved` (`evaluateAll(...).slice(0,25)` for the
signature), and `downloadSaved` (`savedCrops.slice(0,25)` for the signature). `server/index.ts`
`explainSchema.crops.max(25)` is unchanged (server not edited — design's belt-and-braces server bump
was optional; client cap alone keeps requests valid). `OptionResults.tsx` untouched and still re-sorts
by verdict only — a stable re-sort over the already-ranked list preserves within-bucket order (ranking
is a superset of the verdict sort, as designed).

**mergeOptions / initialOptionState (items 7, 8).** `initialOptionState` sets every crop
`selected:true`. `mergeOptions` keeps `saved[id]` verbatim for known ids and defaults unknown ids to
`{...defaults[id], selected:true}`. `SavedReport.version` stays `1`, `schemaVersion` stays `2` — no
storage bump. Run button: `run()` guards only `if (!location)`, button `disabled={!location||loading}`
— no `selectedCount` gate.

**Tests quality (item 9).** `tests/ranking.test.ts` asserts bucket order, within-bucket comfort,
worst-season (min) selection, indicative tie-break, deterministic shuffle (5 seeds), purity, and
empty/single edge cases — all meaningful. `tests/crops.test.ts` asserts real-catalogue load (>=10,
all 10 ids, unique), cherry decision, keyword→number expansion, helper behaviour, and the full set of
throw cases (dup id, min>max, floweringMonths out of range, bad category) plus numeric passthrough and
source default. Not trivially passing.

**Edge cases (item 10).** `rankCrops([])→[]` (tested). If all crops unticked, `evaluateAll` →
`rankCrops([])` → `[]`, and save/download/PDF buttons are `disabled` when `crops.length===0`;
`topCrop([])` → `rankCrops([])[0]` = undefined → returns `null`. No crash. No stale old-shape imports
found (grep over *.ts/*.tsx).
