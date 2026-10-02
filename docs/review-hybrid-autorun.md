# Review — HYBRID auto-run (Option C) in `src/components/Planner.tsx`

- Project: `/Users/duynguyen/side_project/Hackathon/Paddock`
- Branch: `feature/crop-db-ranking`
- Scope: review-only, no files modified.

## Verdict: APPROVE WITH MINOR CHANGES

The effect is correct for the four hard requirements (single auto-run per preset, no
crop-refine fetch, StrictMode-safe single fetch, no effect loop). Two low-severity edges
exist around the deliberately-dropped `loading`/ref guard in `run()` and the error path.
Neither is a blocker for the hackathon demo; both are quick to tighten.

## Tooling output

### `npm run lint` (tsc --noEmit) — PASS
```
> tsc --noEmit
(exit 0, no output)
```

### `npm test` (vitest run) — 74/75 pass; 1 known-flaky
```
✓ tests/climateCharacter.test.ts (21)
✓ tests/ranking.test.ts (8)
✓ tests/chill.test.ts (9)
✓ tests/crops.test.ts (16)
✓ tests/seasons.test.ts (18)
❯ tests/savedReports.test.ts (3 | 1 failed)
   ✓ saves, lists newest first, loads and deletes
   × keeps only the newest 30   → expected 'Block 30' to be 'Block 32'
   ✓ refuses reports from an older data format
Test Files  1 failed | 5 passed (6)
     Tests  1 failed | 74 passed (75)
```
Isolation re-run: `npx vitest run tests/savedReports.test.ts` → **3/3 pass**.
This is the known pre-existing ms-granularity `Date.now` ordering flake in
`savedReports.test.ts:39`. It touches no code in this change and does NOT count against it.

## Requirements check

| # | Requirement | Result |
|---|---|---|
| 1 | Preset selected → auto-runs exactly once; switching presets re-runs for the new one | PASS |
| 2 | Manual coords / "Use my location" (no presetId) → no auto-run, button required | PASS |
| 3 | Crop refine (checkbox / chill requirement → `options`) → zero `/api/climate` fetches | PASS |
| 4 | No duplicate/concurrent fetch; StrictMode double-invoke → exactly ONE fetch | PASS |
| 5 | No effect loop; reopening a saved PRESET report does not refetch | PASS |
| 6 | "Check my block" still works for manual/geo; no double-fetch for presets | PASS (with low-sev edge, see M1) |

## Effect-correctness scrutiny

**(a) `analysisRef` assigned during render — SOUND.**
`src/components/Planner.tsx:106-107` creates the ref then writes
`analysisRef.current = analysis;` unconditionally in the render body on every render. It is
only *written* during render, never *read* during render; the effect reads
`analysisRef.current` later in the commit/effect phase, so it always observes the value
committed by the render that scheduled the effect. This is the standard React 19
"latest-value ref" pattern. No tearing, no stale-read, no read-before-write.

**(b) `autoRanPresetKey.current = presetKey` set BEFORE `void run(location)` — SOUND, single fetch.**
`Planner.tsx:184-188`. StrictMode mount sequence:
1. effect invoke #1: `autoRanPresetKey.current !== presetKey` → set ref = presetKey → `void run(location)` (fetch #1 starts).
2. cleanup: none registered.
3. effect invoke #2 (StrictMode): `autoRanPresetKey.current === presetKey` is now true → early `return`.
The ref is a persistent mutable object shared across both synchronous invocations and the
guard is checked *before* the async boundary, so exactly one fetch fires. Correct.

**(c) Can crop-refine / unrelated re-render change `presetKey` or re-enter `run()`? NO.**
`presetKey` (`Planner.tsx:175-177`) is derived solely from `location.presetId` + rounded
`lat`/`lon`. Effect deps are `[presetKey]`. `OptionPicker` (`OptionPicker.tsx:18`) routes
every checkbox and chill-requirement edit through `onChange` → `setOptions` only; it never
touches `location`. Verified the ONLY `fetchClimate` call site in `src/**` is
`Planner.tsx:157` inside `run`, and the ONLY effect referencing it is the auto-run at
`Planner.tsx:178`. `options`/`crops`/`analysis` are correctly excluded from the deps.

**(d) Dropped `loading` guard — see findings M1 and the A→B→A note below.**

**(e) `run(target?)` fallback — no stale-closure risk from the effect.**
The effect calls `void run(location)` passing the current `location` explicitly
(`Planner.tsx:187`), so the auto-run never relies on the `target ?? location` fallback and
cannot read a stale closure value. The button's `run()` (no arg, `Planner.tsx:321`) reads
`location` from the render in which it was clicked, which is current. Safe.

**(f) Error path leaves the ref set — see finding M2.**

### A→B→A note (corrects the implementer's stated assumption)
The implementer's worry that "re-selecting A after B would NOT re-run because the ref still
holds A's key" is **not accurate**. `autoRanPresetKey` is a single-valued ref, overwritten on
every preset, not a set. After A→B the ref holds B's key, so returning to A yields
`ref (keyB) !== presetKey (keyA)` → A **does** re-run (once). This actually satisfies
requirement 1 ("switching presets re-runs for the new one") and is cheap because preset
climate is cached. No action needed — just recording that the behavior is correct and the
original rationale was based on a wrong mental model.

## Findings

### MINOR

**[M1 — low] Button can issue a second fetch for an already-auto-run preset.** `Planner.tsx:318-321`
The ref guard only protects the *effect* path; `run()` has no ref/loading check of its own.
During the auto-run the button is `disabled` (`disabled={!location || loading}`), which
blocks the in-flight race. But once the auto-run completes, pressing "Check my block" on the
same preset re-fetches it (bypassing `autoRanPresetKey`). This is user-initiated and the
climate is cached, so impact is minimal — but it is technically a duplicate fetch for the
"same selection" that requirement 6 calls out. Optional tightening: in `run`, early-return
when `loading`, or skip when the target is the preset whose key already matches
`autoRanPresetKey.current` and `analysisRef.current.location.label === loc.label`.

**[M2 — low] Failed preset auto-run leaves `autoRanPresetKey` wedged (no auto-retry).** `Planner.tsx:159-165, 186`
`autoRanPresetKey.current` is set *before* the fetch and is never reset in the `catch`/`finally`.
If the auto-run rejects, the effect will not retry that preset (the key still matches on any
subsequent render). Recovery is NOT fully blocked: the "Check my block" button calls `run()`
on the still-selected preset and bypasses the ref, so the user can retry manually. Still, a
transient network blip silently disables *automatic* retry until the preset is switched away
and back. Optional: reset `autoRanPresetKey.current = null` in the `catch` so a re-render or
re-selection can auto-retry. Keep this consistent with M1 if both are addressed.

### NIT

**[N1] `exhaustive-deps` is suppressed.** `Planner.tsx:189` The
`// eslint-disable-next-line react-hooks/exhaustive-deps` is intentional and the omitted deps
(`location`, `run`, `analysisRef`) are handled via explicit arg + ref-mirroring. The
suppression is justified; the adjacent comment block (`Planner.tsx:166-174`) documents why.
No change required — noting it so a future reader doesn't "fix" it by adding `options`.

## Strengths
- Correct use of a pre-set ref to absorb StrictMode's double-invoke — guard set before the
  async boundary (`Planner.tsx:186-187`) is the right ordering.
- `presetKey` derivation cleanly isolates auto-run from crop-refine; `options` is genuinely
  not reachable from the fetch path.
- Reopened saved-preset guard (`Planner.tsx:181-184`) matches on `location.label`, which the
  server sets verbatim into `analysis.location.label` (`server/analysis.ts:58`,
  `shared/types.ts:31`), so the equality holds and the redundant refetch is correctly skipped.
- `run(target?)` refactor + `onClick={() => run()}` (`Planner.tsx:321`) correctly prevents the
  `MouseEvent` from being passed as a `PickedLocation`.

## Scope check
`git diff --stat HEAD` shows 4 tracked files changed on the branch:
`shared/crops.ts`, `src/components/OptionPicker.tsx`, `src/components/Planner.tsx`,
`tsconfig.json`.
- `Planner.tsx` — the auto-run change (plus the crop-db-ranking UI wiring that is part of this
  branch's broader work: `rankCrops`, `CropRecommendation`, `BRIEF_CROP_CAP`, removal of
  `OptionResults`).
- `OptionPicker.tsx` (select-all default), `tsconfig.json` (`resolveJsonModule`), `crops.ts`
  (data rework) — confirmed via diff to be the pre-existing crop-db-ranking edits, NOT added
  by the auto-run task.
- `server/**`, `shared/**` (except the pre-existing `crops.ts`), `OptionResults.tsx`,
  `SeasonsPanel.tsx`, `LocationPicker.tsx` — unchanged by this task. (`OptionResults` import was
  removed from Planner but the file itself is untouched.)

Net: the auto-run behaviour change is confined to `Planner.tsx`, as required.
