# Code Review — User-added crops (Part B)

- Project folder: `/Users/duynguyen/side_project/Hackathon/Paddock`
- Branch: `feature/crop-db-ranking`
- Mode: **review-only** (nothing modified)
- Design reference: `docs/design-user-added-crops.md`
- Reviewer: Code Reviewer Agent

---

## 0. Build / Test evidence

### `npm run lint` (`tsc --noEmit`)
```
> Paddock-orchard-planner@1.0.0 lint
> tsc --noEmit
```
Exit status 0. No type errors. (Note: "lint" is **tsc only** — there is no ESLint in this
project. See Minor-1 re: the `eslint-disable` comment.)

### `npm test` (`vitest run`)
```
 ✓ tests/appropriateCrops.test.ts (7 tests)   3ms
 ✓ tests/ranking.test.ts         (8 tests)   11ms
 ✓ tests/chill.test.ts           (9 tests)    7ms
 ✓ tests/userCropsFlow.test.ts   (4 tests)   10ms
 ✓ tests/crops.test.ts           (16 tests)   7ms
 ✓ tests/seasons.test.ts         (18 tests)   7ms
 ✓ tests/userCrops.test.ts       (8 tests)   19ms
 ✓ tests/savedReports.test.ts    (3 tests)   29ms

 Test Files  8 passed (8)
      Tests  73 passed (73)
```
All 73 tests pass, including the KNOWN-flaky `savedReports.test.ts 'keeps only the newest 30'`
(passed here, as expected in isolation).

---

## 1. Scope / "unchanged" confirmation (verified via `git diff HEAD`)

| File | Status |
|---|---|
| `src/lib/userCrops.ts` | NEW ✓ |
| `src/lib/useCombinedCrops.ts` | NEW ✓ |
| `src/components/AddCropForm.tsx` | NEW ✓ |
| `tests/userCrops.test.ts` | NEW ✓ |
| `tests/userCropsFlow.test.ts` | NEW ✓ |
| `src/components/OptionPicker.tsx` | CHANGED ✓ (prop + badge, §4.8) |
| `src/components/Planner.tsx` | CHANGED ✓ (hook wiring, mergeOptions, AddCropForm) |

**Confirmed UNCHANGED by this task (`git diff --quiet HEAD`):**
`shared/ranking.ts`, `shared/seasons.ts`, `shared/chill.ts`, `shared/types.ts`,
`shared/crops.data.json`, `shared/appropriateCrops.ts`, `src/components/OptionResults.tsx`,
`src/components/SeasonsPanel.tsx`, `src/components/LocationPicker.tsx`, `src/lib/seasonRows.ts`,
`src/lib/savedReports.ts`, `server/index.ts`, `server/analysis.ts`. All clean (zero diff).

**`shared/crops.ts` + `tsconfig.json`:** these show in the working tree but are the Part-A JSON-loader
migration (crops.ts: moving the catalogue to `crops.data.json` + zod loader; tsconfig: adding
`resolveJsonModule`). **This task (Part B) added nothing to them** — verified: `grep -n "user"
shared/crops.ts` returns nothing, and the crops.ts diff is entirely the loader rewrite with no
user-crop code. Confirmed PRE-EXISTING.

**`OptionResults` import removal from Planner:** this is a PRE-EXISTING Part-A/recommendation-slice
change (documented in `docs/review-crop-db-ranking.md` and `docs/review-crop-recommendation.md` — the
standalone `<OptionResults>` was already removed and the list rendering replaced). **Not introduced
by Part B.** `OptionResults.tsx` is zero-diff.

**`/api/explain` cap:** `server/index.ts:108` `.max(25)` — UNCHANGED. Client cap
`briefCrops = crops.slice(0, BRIEF_CROP_CAP=25)` (Planner.tsx:143) bounds the payload regardless of
user-crop count. ✓ (CRITICAL item 7 satisfied.)

---

## 2. Locked-decisions verification

1. **Single chill → tight `[v,v]`; form name+chill only.** ✓ `userCrops.ts:150` stores
   `chillHours: [parsed.chillHours, parsed.chillHours]`; `AddCropForm` has exactly two fields; no
   range/category picker.
2. **Category defaulted.** ✓ `DEFAULT_CATEGORY = 'stone fruit'` (userCrops.ts:33), applied in
   `toCropOption` (userCrops.ts:128). Not asked in the form.
3. **Full CRUD incl. EDIT.** ✓ `addUserCrop`, `listUserCrops`, `updateUserCrop`, `deleteUserCrop`
   all present; `editCrop` wired through the hook and `AddCropForm` (in-place edit).
4. **Design defaults.** ✓ React-state overlay (`useCombinedCrops`), per-id idb-keyval store
   (`createStore('Paddock-user-crops','crops')`), `user-<uuid>` ids, zod validation, provenance via
   `winter.source='Your own figure'` + `indicative:true` + `user-` prefix + "Your figures" badge,
   silent dangling-id handling, no SavedReport schema bump, no shared `CropOption` change. All
   verified individually below.

---

## 3. Critical-area findings

### 3.1 Sync/async merge (CRITICAL #1) — PASS

- **Synchronous baseline preserved.** `combined = dedupeById(CROP_OPTIONS, userCrops)`
  (useCombinedCrops.ts:88) with `userCrops` initialised to `[]`. First paint = all 10 built-ins,
  synchronously, before any IndexedDB resolve. `OptionPicker` receives `combined` and never sees
  `undefined` (guarded read `value[c.id] ?? {…}` at OptionPicker.tsx:38). ✓
- **Dedupe, built-ins win.** `dedupeById` seeds the `seen` set from `base` (built-ins) first, so a
  user crop whose id somehow collided with a built-in is dropped (built-in wins). ✓
- **StrictMode double-invoke → NO double-insert.** The load effect uses an `alive` cleanup flag
  (useCombinedCrops.ts:60,73) AND `setUserCrops(cs)` **REPLACES** from the authoritative
  `listUserCrops()` result (not append) — a second dev invoke just reloads the same list.
  `addCrop` additionally dedupes by id (`cs.some(c => c.id === created.id) ? cs : [...]`,
  useCombinedCrops.ts:91). `addUserCrop` is an onClick handler, not an effect, so StrictMode does not
  double-invoke it. ✓
- **No render loop from the back-fill effect** (Planner.tsx:124–138). The effect depends on
  `[combined]`. `combined` is a fresh array reference each render, so the effect body re-runs each
  render — **but** `setOptions` has a `sameKeys` no-op guard that returns the previous object
  reference when nothing changed, so React bails the state update and there is no re-render loop. See
  Minor-2 for the harmless extra effect-run cost.

### 3.2 IndexedDB store (CRITICAL #2) — PASS

- CRUD correct, per-id store, modelled on `savedReports.ts` (`guard()` + `StorageUnavailableError`
  copied verbatim — acceptable per design §5.8). ✓
- **Corrupt/stale/foreign-version records SKIPPED, not thrown.** `listUserCrops`/`updateUserCrop`
  use `storedUserCropSchema.safeParse` + `.filter(r => r.success)` (userCrops.ts:175,186). Verified by
  `tests/userCrops.test.ts` "skips corrupt / stale records on load" (garbage + `schemaVersion:2` both
  skipped). ✓
- **QuotaExceeded handling** present (userCrops.ts:107), same mapping as savedReports. ✓
- **Loader-invariant compliance.** `user-<uuid>` from `crypto.randomUUID()` = lowercase hex +
  hyphens, so matches `^[a-z0-9-]+$`; length `user-` (5) + 36 = 41 ≤ 60. **No uppercase.** Verified
  by test asserting `id.toMatch(/^[a-z0-9-]+$/)` and `length <= 60`. ✓
- **chill `[v,v]` min<=max; spring/summer null.** `toCropOption` (userCrops.ts:124) sets
  `spring:null, summer:null`; `storedUserCropSchema` enforces `min<=max`. ✓
- **Engine handles the shape.** Cross-checked `shared/seasons.ts`: `evaluateSpring`/`evaluateSummer`
  return `no-data` immediately on `null` spec (seasons.ts:243, 272); `overallVerdict` ignores
  `no-data` (SEVERITY -1), so overall = winter verdict. Confirmed by `userCropsFlow.test.ts`. ✓

### 3.3 Validation (CRITICAL #3) — PASS

`userCropInputSchema` (userCrops.ts:46): `name` trim+min(1)+max(60); `chillHours` number+int+
min(0)+max(2000). Tested exhaustively in `userCrops.test.ts`: empty, whitespace, >60, -1, 2001,
10.5 (float), NaN all rejected; trims valid name. `AddCropForm.parseFields` coerces `''`→`NaN`
(AddCropForm.tsx:48) for a friendly message rather than `Number('')===0`. `addUserCrop` calls
`.parse` (throws) so a malformed crop never reaches the store or `evaluateCrop`. ✓

### 3.4 OptionPicker change (CRITICAL #4) — PASS

- `crops?: CropOption[]` defaults to `CROP_OPTIONS`; `initialOptionState(crops = CROP_OPTIONS)` keeps
  the no-arg signature so `tests/savedReports.test.ts` stays green (verified: it passes). ✓
- Guarded read `value[c.id] ?? { selected:true, requirement: defaultRequirement(c) }`
  (OptionPicker.tsx:38) handles user ids not yet in OptionState. ✓
- "Your figures" badge via `isUserCrop(c.id)`. ✓
- `OptionState` shape unchanged. ✓
- **BEHAVIOURAL CHANGE (not a defect, but flag):** `initialOptionState` changed from
  `selected: defaults.has(c.id)` (a 4-crop allow-list) to `selected: true` for **all** crops. This is
  the intended "consider all crops by default" reframe (consistent with the recommendation slice and
  the picker's copy change), but it is a semantics change to the pre-existing default-selection
  behaviour. Confirmed intentional per design (§4.7 "user crops default to selected, consistent with
  the 'consider all crops' default"). No test asserted the old 4-crop default, so nothing breaks.

### 3.5 Dangling id / saved reports (CRITICAL #5) — PASS

- `mergeOptions(crops, saved)` (Planner.tsx:92) maps over the **current combined crop list** and
  reads `saved[c.id] ?? default`. A saved id with no matching current crop is **not** iterated →
  dropped, never resurrected. ✓
- `evaluateAll` iterates the **crop list** and looks up `options[c.id]` (Planner.tsx:60), never
  iterates OptionState keys → a dangling OptionState entry is silently ignored. ✓
- **No schema bump.** `SavedReport.version` (`RECORD_VERSION=1`) and the `analysis.schemaVersion===2`
  gate in `loadReport` are UNCHANGED (savedReports.ts zero-diff). Old reports still load. ✓
- **User crops persisted independently** of reports (separate `Paddock-user-crops` store); a report
  stores only `OptionState` + analysis, not crop definitions → deleting a user crop then reopening a
  report degrades gracefully (crop simply absent), does not resurrect it. ✓
- The `userCrops.test.ts` round-trip + `userCropsFlow.test.ts` cover the mechanism; a dedicated
  "reopen report after delete" assertion is **not** present as an integration test (see Minor-3).

### 3.6 Provenance / credibility (CRITICAL #6) — PASS

User crops carry `winter.source='Your own figure'`, `winter.indicative=true`, `type='Your figures'`,
`user-` id prefix. Badge "Your figures" renders in both `AddCropForm` and `OptionPicker`.
`hasIndicativeData` (crops.ts) returns `true` for them because `winter.indicative` is true — so they
are treated as indicative and never masquerade as sourced built-ins. ✓

### 3.7 Tests quality (CRITICAL #8) — PASS

`userCrops.test.ts`: round-trip, update-in-place, delete, exhaustive validation, id
uniqueness/no-collision/regex/length, corrupt+stale-version skip, expansion invariants. Meaningful,
asserts concrete values (not trivially passing). Uses `fake-indexeddb/auto`. ✓
`userCropsFlow.test.ts`: user crop → `evaluateCrop` (spring/summer no-data, overall=winter) →
`appropriateCrops` (included when viable, excluded when not-viable) → `rankCrops` (ranks in a mixed
list, deterministic tie-break). Confirms the unified model holds end-to-end with no special-casing. ✓

### 3.8 Strictness / regressions (CRITICAL #9) — PASS

`strict`, `noUnusedLocals`, `noUnusedParameters` on; `tsc --noEmit` clean. No leftover references to
removed Part-A symbols (the old `RANK` const and `selectedCount` were removed cleanly; lint would
have failed on an unused local otherwise). Part-A appropriate-crops list still works and now includes
qualifying user crops (flows through `appropriateCrops(crops)` where `crops` is over `combined`). ✓

---

## 4. Severity-tagged findings

### Blocker
None.

### Major
None.

### Minor

- **Minor-1 — Dead `eslint-disable` comment.** `Planner.tsx:224`
  `// eslint-disable-next-line react-hooks/exhaustive-deps`. There is no ESLint in this project (lint
  = `tsc` only), so this suppression is inert. It is harmless and documents intent, but it implies an
  ESLint gate that does not exist. *Fix:* either add `eslint-plugin-react-hooks` to actually enforce
  hook deps (preferred — it would legitimately catch the intentional `[presetKey]`-only dep on the
  auto-run effect), or drop the misleading comment. This is pre-existing (auto-run slice), not new to
  Part B — noting for completeness.

- **Minor-2 — Back-fill effect re-runs every render (wasteful, not a loop).** `useCombinedCrops`
  returns a freshly-built `combined` array on every render (`dedupeById` is called in the hook body,
  not memoised). `Planner`'s back-fill effect `useEffect(…, [combined])` therefore re-runs on every
  Planner render. It is **correct** (the `sameKeys` no-op guard prevents any state update / loop), but
  it does needless work and defeats the dependency array's purpose. The `crops` `useMemo`
  (`[combined, analysis, options]`) similarly recomputes every render for the same reason. *Fix:*
  memoise `combined` in the hook: `const combined = useMemo(() => dedupeById(CROP_OPTIONS, userCrops),
  [userCrops]);` — then both the effect and the memo only fire when `userCrops` actually changes.
  Low impact at this data volume, but it is the cleaner, intention-revealing form.

- **Minor-3 — No integration test for the reopen-report-after-delete path.** The dangling-id handling
  is correct by construction (mergeOptions over the combined list, evaluateAll over the crop list),
  and `userCrops.test.ts`/`userCropsFlow.test.ts` cover the units, but the design (§4.12) listed a
  "dangling-id graceful load" test (add crop → build OptionState with its id → delete → mergeOptions
  → id dropped, no throw). That specific assertion is not present. *Fix:* add a small test exercising
  `mergeOptions(combinedWithoutDeletedCrop, savedOptionStateWithDeletedId)` and assert the dangling id
  is absent and no throw. Mechanism is sound; this is test-coverage completeness, not a defect.

### Nitpick

- **Nitpick-1 — `updateUserCrop` read-modify-write is O(n) via `entries()`.** It lists all records to
  find one by id before `set`. At the handful-of-crops scale this is fine and avoids a separate
  `get`, but a direct `get(id, db())` would be simpler and avoids re-validating every record on each
  edit. Optional.

- **Nitpick-2 — `storedUserCropSchema.id` max is a literal `60`**, while `NAME_MAX`/`CHILL_MAX` are
  named constants. Minor consistency: hoist the id length cap to a named constant to match the
  loader's documented "max 60" invariant and keep a single source of truth.

- **Nitpick-3 — Badge markup duplicated.** The "Your figures" badge classes are inlined in both
  `OptionPicker.tsx` and `AddCropForm.tsx` (`YourFiguresBadge`). Harmless, but a shared tiny component
  would prevent visual drift between the two badges (design §4.6 wants them consistent).

- **Nitpick-4 — `AddCropForm` number input `step={10}`** nudges values by 10, yet validation accepts
  any integer 0–2000; a grower typing a non-multiple-of-10 is fine (keyboard entry is unrestricted),
  so this is purely a stepper-UX choice. No action needed.

---

## 5. Verdict

**APPROVE.** 

The implementation faithfully realises the approved design and all locked decisions. The two
highest-risk areas — the sync/async overlay with StrictMode double-insert safety, and the
dangling-id/saved-report degradation — are both correct: the built-in list is the synchronous
first-paint baseline, user crops are replaced (not appended) from the authoritative store under an
`alive`-guarded effect with id-dedupe, and dangling ids are dropped by reconciling over the current
combined crop list while evaluation iterates the crop list (never OptionState keys). No
`SavedReport`/`schemaVersion` bump; no `shared/` type change; `/api/explain` cap intact; all declared
"unchanged" files verified zero-diff. `tsc --noEmit` is clean and all 73 tests pass.

No Blockers or Majors. The Minor items (memoise `combined`; add the dangling-id integration test;
resolve the inert `eslint-disable`) are quality/robustness improvements that can land as follow-ups
and do not gate merge.
