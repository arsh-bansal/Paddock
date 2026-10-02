# Design — Crop Recommendation by Climate Character (Item-1 UX rework)

Owner: Huu
Status: Draft for review (design only — no code changes)
Supersedes: the **item-1 UX only** of `docs/design-crop-db-ranking.md`. Items 2 and 3 (JSON crop
DB + zod loader; expanded crop catalogue) and the `rankCrops()` ordering mechanism are **unchanged
and already implemented** on `feature/crop-db-ranking`. This document reframes only how the ranked
output is *presented and selected*.
Related docs: `docs/design-crop-db-ranking.md` (prior approved design), `docs/crop-data-sources.md`
(data contract).

Project folder: `/Users/duynguyen/side_project/Hackathon/Paddock`. All paths below are relative to
it.

---

## 1. Problem Overview

### 1.1 What was built (verified against the code on `feature/crop-db-ranking`)

The implemented item-1 flow (design-crop-db-ranking §3.3 Option C2) is a **single flat ranked
list of every crop**:

- `src/components/Planner.tsx`:
  - `evaluateAll(analysis, options)` evaluates each *considered* crop with `evaluateCrop(...)` using
    `analysis.baseline.years` and `analysis.future.years`, then returns `rankCrops(evaluated)` — one
    array, best-to-worst, every crop in it.
  - `const crops = useMemo(() => analysis ? evaluateAll(analysis, options) : [], ...)`.
  - That one `crops` array is handed to `<OptionResults crops={crops} />`, `<ChillChart>`,
    `<Brief crops={briefCrops}>` (`briefCrops = crops.slice(0, 25)`), `<AdaptationNotes>` and the PDF.
- `src/components/OptionResults.tsx` re-sorts by verdict (`RANK`) and renders **all** crops as a flat
  list under the heading "How each option holds up" — viable, at-risk, not-viable and no-data crops
  interleaved in one `<ul>`. (Header comment: this is interim; Anuj's four-season card replaces it.)
- `shared/ranking.ts` `rankCrops()` orders by verdict bucket → worst-season comfort → fewer
  indicative → label/id. Verified pure, no I/O.
- `shared/seasons.ts` `evaluateCrop()` returns `CropEvaluation { id, label, overall, seasons[],
  heatNote, chillRequirement }`; `overall ∈ viable|at-risk|not-viable|no-data`.
- `shared/types.ts`: `ClimateAnalysis` (`schemaVersion: 2`) carries `baseline` and `future`
  `PeriodClimate`, each with a `summary: SeasonSummary` and `period: [number, number]`.
  `FUTURE_PERIOD = [2026, 2045]`, `BASELINE_PERIOD = [1995, 2014]`.
- `shared/seasons.ts` `SeasonSummary` fields are each a `Summary { p10, median, p90, mean }`:
  `chillHours`, `chillPortions`, `springFrostDays`, `hotDays`, `extremeDays`, `longestHotSpell`,
  `autumnRainMm`, `autumnWarmDays`, `annualRainMm`, `annualEt0Mm`, `waterDeficitMm`.
- `src/components/SeasonsPanel.tsx` + `src/lib/seasonRows.ts` already render the location's climate
  season-by-season, baseline vs projected — the raw material for a plain-language character.
- `server/index.ts` `explainSchema.crops` is `.min(1).max(25)`; the client already caps
  `briefCrops` at 25. `shared/` is runtime-agnostic (Vite / esbuild / tsx / vitest).

### 1.2 What the user wants instead

The headline output should read as a **recommendation**, not a leaderboard: *"here are the crops
that suit this block"*, led by a plain-language description of the block's **climate character**
(warm/hot/cold, wet/dry) **derived from the already-computed Open-Meteo numbers** in the future
`SeasonSummary`. Poor-fit crops stay visible, demoted to a secondary "not suited to this block"
section. The recommendation is based on the **projected future climate (2026–2045)**, with **today
(baseline) shown for contrast**, because the premise is planting for the climate the tree grows into.

This is a **presentation and selection reframe**. It is **not** new climate science, **not** a new
data source (no external climate-zone / hardiness API), and **not** a rewrite of the data or seasons
layer. The verdict maths in `evaluateCrop()` and the ordering in `rankCrops()` stay exactly as they
are; we add (a) a pure classifier that turns a `SeasonSummary` into words, and (b) a pure partition
that splits the already-ranked list into "suited" and "not suited", and we re-arrange the Planner UI
to present those two groups with a character sentence on top — reusing the existing per-crop card
renderer (`OptionResults`) by composition, without editing it.

### 1.3 Why this preserves the project principle

"Everything computed from real data, nothing hardcoded" is preserved: the character comes from the
computed Open-Meteo `SeasonSummary`. The **only** hardcoded part is the set of human-chosen
**classification thresholds** (what chill-hour count counts as a "mild" winter, etc.). Those are
treated exactly like the indicative crop thresholds already in the app: a small, documented,
defensible band set grounded in horticultural norms and **clearly labelled an app-defined
assumption** in both the doc and the UI.

---

## 2. Scope / Constraints / Goals

### 2.1 Goals (success criteria)

- G1. A **pure, unit-tested** `classifyClimate(summary: SeasonSummary)` in a new
  `shared/climateCharacter.ts` turns the future `SeasonSummary` into a small typed structure the UI
  can render as a sentence (winter warmth, summer heat, water, frost), plus the band set as
  documented app-defined assumptions.
- G2. A **pure, unit-tested** recommendation partition splits the already-ranked `CropEvaluation[]`
  into a "Suited to this block" group and a secondary "Not suited / risky by 2045" group, preserving
  `rankCrops` order within each group, with precise, documented rules for every verdict including
  `no-data`.
- G3. `Planner.tsx` presents a **headline recommendation panel** ("Crops that suit this block") above
  the detailed results: the climate-character sentence as its lead (future, with today for contrast),
  the suited group's cards, and the secondary not-suited group **collapsed** below.
- G4. The existing per-crop card renderer `OptionResults.tsx` is **reused by composition** — each
  group's list is passed to it — with **no edit** to that file.
- G5. The existing `OptionPicker` remains as the **optional refine** control (unchanged behaviour).
- G6. The `/api/explain` top-25 cap and saved-report behaviour from the prior design **still hold**;
  any interaction (e.g. does the brief now summarise the suited set?) is stated explicitly.
- G7. All new code lives in `shared/` (runtime-agnostic — no `fs`; works under Vite / esbuild / tsx /
  vitest) and `src/`; new tests run under vitest.

### 2.2 Explicitly OUT of scope

- **The data layer.** `shared/crops.ts`, `shared/crops.data.json`, and the zod loader are unchanged.
- **`rankCrops` internals.** `shared/ranking.ts` is reused verbatim as the within-group ordering; no
  comparator change.
- **The seasons / climate engine.** `shared/seasons.ts`, `shared/chill.ts`, `server/analysis.ts`,
  `server/openMeteo.ts`, `/api/climate` — untouched. No new thresholds inside `evaluateCrop`.
- **`OptionResults.tsx` rewrite.** Anuj's territory. It is reused as-is (fed each group's list). We
  must not rename, move, or change its props/behaviour.
- **Teammate / server files.** `server/index.ts`, `server/gemini.ts`, `src/components/StressCheck.tsx`,
  the report renderer, etc. are not modified. (The `/api/explain` cap is only *confirmed* here, §4.7 —
  no server edit is proposed.)
- **New climate science or external APIs.** No hardiness zones, no third-party climate classification.
- **Changing `ClimateAnalysis` / `SeasonSummary` shape** or `schemaVersion`. Saved-report storage
  schema is untouched.

### 2.3 Constraints

- C1. `shared/climateCharacter.ts` must compile and run under all four runtimes — no Node-only APIs,
  no JSON `fs` reads. It is a pure function over an in-memory `SeasonSummary`.
- C2. `strict`, `noUnusedLocals`, `noUnusedParameters` are on; everything fully typed.
- C3. No new dependencies. (zod is available but the classifier needs none — it is arithmetic.)
- C4. The character must degrade gracefully when a `Summary` field is `NaN`/missing (some locations
  drop seasons when data is incomplete — see `summariseYears` and the `seasonRows` `Number.isFinite`
  filter). The classifier must never throw on a sparse `SeasonSummary`.
- C5. The partition must accept the **already-ranked** array and return two arrays whose
  concatenation is a permutation of the input (no crop lost, none duplicated), preserving input order
  within each group so `rankCrops` ordering is retained.

---

## 3. High Level Design

Two decisions need options: **(i)** the climate-character band design, and **(ii)** the
suited/not-suited cut line. A cross-cutting risk — that classification thresholds are subjective —
is addressed under each.

### 3.1 Decision (i) — Climate-character band design

The character is derived from the **future** `SeasonSummary`. Four axes map cleanly onto fields the
engine already computes:

- **Winter warmth** from `chillHours` (lower chill ⇒ warmer/milder winter).
- **Summer heat** from `hotDays` (≥35 °C) with `extremeDays` (≥40 °C) as an escalator.
- **Water** from `waterDeficitMm` (ET0 − rain; higher ⇒ drier) with `annualRainMm` as context.
- **Frost** from `springFrostDays` (Aug–Oct days ≤0 °C).

Which `Summary` statistic to read, and how many bands, is the design choice.

**Option (i)-A — Median-driven, few bands, per-axis independent thresholds (recommended).**
Classify each axis from the **median** of its field (`.median`), into 3–4 named bands with fixed
numeric breakpoints chosen from horticultural norms (table in §4.2). Winter: `cold | mild | warm`.
Summer: `mild | warm | hot | extreme` (extreme triggered by `extremeDays`). Water: `wet | moderate |
dry`. Frost: `low | some | high`. Each axis is independent; the sentence is a fixed template.

- Pros: Simplest to explain, test and defend; median is the stat growers already see in SeasonsPanel
  ("typical winter"); each breakpoint is one documented number; trivially pure and unit-testable;
  stable across the FUTURE period's spread.
- Cons: Hard breakpoints create boundary sensitivity (a block one chill-hour either side of 600 flips
  "mild"/"cold"). Mitigated by (a) wording the bands as ranges in the UI, (b) choosing breakpoints in
  gaps between common Victorian values, (c) the "near a boundary" note in §5.

**Option (i)-B — Percentile-aware bands using `p10`/`median`/`p90` for a "variability" nuance.**
Same axes, but use multiple `Summary` stats to add a reliability qualifier, e.g. "mild winters but
one winter in ten dips cold" when `p10` crosses into the colder band.

- Pros: Richer, communicates year-to-year risk the single-median view hides; uses data already there.
- Cons: More thresholds (two per axis), a combinatorial sentence grammar, more edge cases and more
  tests; higher subjectivity surface (now two breakpoints per axis to defend); harder to keep the
  lead sentence short. The nuance it adds is already visible in SeasonsPanel's p10 row.

**Recommendation: (i)-A.** It is the smallest defensible step that delivers the requested
plain-language character, keeps the subjective surface minimal (one documented breakpoint per band
edge), and is easy to unit-test exhaustively. The variability nuance of (i)-B is better served by the
existing SeasonsPanel (which already shows p10 "poor winter" and mean rows) sitting directly beneath
the recommendation. We keep a single optional p10 escalator for **frost only** (frost is the sharpest
plant-killer and SeasonsPanel already frames it as district risk) — see §4.2 note — but otherwise use
medians. **Subjectivity is handled** by: (1) sourcing every breakpoint to a stated horticultural
norm, (2) marking the whole band set `appDefined: true` in the returned structure and badging it in
the UI as "our rule of thumb", exactly like indicative crop data, and (3) listing the bands in the
Methods/assumptions area so a reviewer can challenge any single number without touching logic.

### 3.2 Decision (ii) — Suited / not-suited cut line

`evaluateCrop` yields `overall ∈ viable | at-risk | not-viable | no-data` (future-based, because the
verdict's percentile tests read the future years). The question is where the "suited" line sits.

**Option (ii)-A — Suited = `viable` only; secondary = everything else.**
- Pros: Cleanest "these will work" promise; no ambiguity.
- Cons: Hides `at-risk` crops that are often the *interesting* planting decisions (plantable with
  adaptation). For many Victorian blocks under warming, few crops stay strictly `viable`, so the
  suited group could be near-empty — poor UX and contrary to the "recommendation" framing.

**Option (ii)-B — Suited = `viable` + `at-risk`; secondary = `not-viable` + `no-data` (recommended).**
Suited group contains `viable` then `at-risk` (in `rankCrops` order, so viable naturally sort above
at-risk inside the group). Secondary group contains `not-viable` then `no-data`. Within the suited
group, `at-risk` crops are visually flagged "with care" using the existing verdict chip the card
already renders.
- Pros: Matches how growers plan (a warming district rarely leaves anything strictly safe; "suited
  with care" is the honest, useful recommendation); keeps the suited group non-empty for realistic
  Victorian climates; `rankCrops` already orders viable-above-at-risk so no extra sorting; the card's
  existing chip communicates the viable-vs-at-risk distinction for free.
- Cons: "Suited" now includes crops with a real risk; must be labelled carefully so it is not read as
  "guaranteed". Handled by the group subtitle and the per-card "Risky" chip (already rendered by
  `OptionResults`).

**Recommendation: (ii)-B**, with `no-data` explicitly placed in the **secondary** group (and labelled
"not enough crop data" rather than "won't grow", since no-data is an evidence gap, not a verdict).
This gives a useful, honest recommendation and leverages the existing chip to distinguish `viable`
from `at-risk` inside the suited group without new UI. **Subjectivity note:** the cut line itself is
a product decision, not a climate threshold; it is documented here and trivially adjustable in one
constant (`SUITED_VERDICTS`) in the partition module.

---

## 4. Low Level Design

### 4.1 File list (new / changed)

New:
- `shared/climateCharacter.ts` — pure `classifyClimate()` + the app-defined band table + the
  partition helper `partitionBySuitability()` (both are small, pure, runtime-agnostic, and belong
  together as the "recommendation" layer sitting on top of `seasons`/`ranking`). *Alternatively* the
  partition can live in `shared/ranking.ts` next to `rankCrops`; this doc keeps it in
  `climateCharacter.ts` so `ranking.ts` stays a pure ordering module. Either is fine; see §5 Q4.
- `tests/climateCharacter.test.ts` — band classification + partition unit tests.

Changed (Huu-owned, in scope):
- `src/components/Planner.tsx` — compute `classifyClimate` for future and baseline summaries; derive
  `{ suited, notSuited }` via `partitionBySuitability(crops)`; render the new
  `<CropRecommendation …>` headline panel above the existing detail blocks; feed each group to the
  reused `OptionResults`.

New UI (small, Huu-owned, does **not** touch `OptionResults`):
- `src/components/CropRecommendation.tsx` — presentational wrapper: renders the character sentence
  (future + today-for-contrast), the "Suited to this block" heading, `<OptionResults crops={suited}>`,
  and a collapsed `<details>` "Not suited / risky by 2045" containing `<OptionResults crops={notSuited}>`.
  This is pure composition over the existing card; it is a *new* file so it cannot collide with Anuj's
  `OptionResults` rewrite. (If preferred, this JSX can live inline in `Planner.tsx` instead of a new
  file — see §5 Q5.)
- `src/lib/climateSentence.ts` (optional) — turns the `ClimateCharacter` structure into the display
  string. Kept in `src/lib` (not `shared/`) because it is presentation copy, not domain logic, and
  need not be runtime-agnostic. Could also be a function inside `CropRecommendation.tsx`.

Explicitly NOT changed: `shared/crops.ts`, `shared/crops.data.json`, `shared/ranking.ts`,
`shared/seasons.ts`, `shared/chill.ts`, `shared/types.ts`, `src/components/OptionResults.tsx`,
`src/components/SeasonsPanel.tsx`, `src/lib/seasonRows.ts`, `server/**`.

### 4.2 `classifyClimate` — signature, output structure, and bands

```ts
// shared/climateCharacter.ts
import type { SeasonSummary } from './seasons';

export type WinterBand = 'cold' | 'mild' | 'warm';
export type SummerBand = 'mild' | 'warm' | 'hot' | 'extreme';
export type WaterBand  = 'wet' | 'moderate' | 'dry';
export type FrostBand  = 'low' | 'some' | 'high';

export interface AxisReading<B extends string> {
  band: B;
  /** The computed value the band was derived from (for UI/debug/tests). */
  value: number | null;    // null when the underlying Summary field is NaN/missing
  /** Which SeasonSummary field + stat drove it, e.g. 'chillHours.median'. */
  basis: string;
}

export interface ClimateCharacter {
  winter: AxisReading<WinterBand> | null;   // null if chillHours unavailable
  summer: AxisReading<SummerBand> | null;
  water:  AxisReading<WaterBand>  | null;
  frost:  AxisReading<FrostBand>  | null;
  /** Always true: these bands are a human-set rule of thumb, not computed from the location. */
  appDefined: true;
}

/** Pure. Classifies a block's character from ONE SeasonSummary (callers pass the FUTURE summary). */
export function classifyClimate(summary: SeasonSummary): ClimateCharacter;
```

Rules (each axis reads one `Summary` stat; `null` when the stat is `NaN`/non-finite, satisfying C4):

- **Winter** from `summary.chillHours.median` (chill hours, Weinberger 0–7.2 °C — the engine's model).
- **Summer** from `summary.hotDays.median`, escalated to `extreme` when
  `summary.extremeDays.median >= EXTREME_TRIGGER`.
- **Water** from `summary.waterDeficitMm.median` (ET0 − rain; higher = drier).
- **Frost** from `summary.springFrostDays.mean` (Aug–Oct days ≤0 °C; `.mean` matches the stat the
  SeasonsPanel frost row already shows). Optional p10 escalator deferred (see §3.1); v1 uses mean.

**App-defined band table (v1 proposal — every number is an assumption to be reviewed, not a
computed result).** Breakpoints chosen to sit in gaps between the catalogue's class chill ranges in
`crop-data-sources.md` (low-chill ~200–400, mid ~400–600, standard ~600–900+) and Victorian norms.

| Axis | Field (future) | Band | Breakpoint (inclusive lower unless noted) | Horticultural rationale |
|------|----------------|------|-------------------------------------------|-------------------------|
| Winter | `chillHours.median` (h) | `warm`  | `< 400` | Below the low-chill class floor; only low-chill cultivars reliably break dormancy. |
|        |                | `mild`  | `400–699` | Covers low-to-mid chill; many stone fruit and low-chill pome/cherry sit here. |
|        |                | `cold`  | `>= 700` | Meets standard-chill pome/pear/standard cherry needs. |
| Summer | `hotDays.median` (days ≥35 °C) | `mild` | `< 5` | Few heat-stress days; fruit set/finish largely unstressed. |
|        |                | `warm` | `5–14` | Matches the catalogue's "medium" heat tolerance band (`HEAT.medium = 10`). |
|        |                | `hot`  | `15–24` | Beyond the "low tolerance" band (`HEAT.low = 15`); sunburn/size risk climbs. |
|        | `extremeDays.median` (days ≥40 °C) | `extreme` | `>= 3` (overrides to `extreme`) | Repeated ≥40 °C days cause acute damage regardless of ≥35 °C count. |
| Water | `waterDeficitMm.median` (mm, ET0−rain) | `wet` | `< 0` | Rain meets/exceeds evaporative demand; irrigation rarely limiting. |
|        |                | `moderate` | `0–399` | Modest deficit; supplementary irrigation typical for orchards. |
|        |                | `dry`  | `>= 400` | Large deficit; irrigation strongly limiting for tree fruit. |
| Frost | `springFrostDays.mean` (days ≤0 °C, Aug–Oct) | `low` | `< 1` | Under ~1 frost day/yr in flowering window → low district frost exposure. |
|        |                | `some` | `1–4` | Occasional flowering-window frost; site/variety timing matters. |
|        |                | `high` | `>= 5` | Frequent flowering-window frost → serious frost-pocket risk. |

These constants live as a single exported `const CLIMATE_BANDS = { … } as const` in
`climateCharacter.ts` so a reviewer can retune any number in one place, and so the test file can
import them rather than hard-coding magic numbers. All breakpoints are flagged `appDefined` and will
be surfaced in the UI/Methods as "our rule of thumb" (§4.5).

Boundary/edge handling (addresses §5): bands are evaluated with simple inclusive-lower comparisons in
a fixed order; a value exactly on a breakpoint resolves deterministically (documented in the test).
When a field is non-finite, that axis is `null` and the sentence omits it (e.g. a block that dropped
its water balance for data gaps simply won't mention water).

### 4.3 `partitionBySuitability` — signature and rules

```ts
// shared/climateCharacter.ts (or shared/ranking.ts — see §4.1 / §5 Q4)
import type { CropEvaluation, SeasonVerdict } from './seasons';

export interface SuitabilitySplit {
  suited: CropEvaluation[];     // viable then at-risk, input order preserved
  notSuited: CropEvaluation[];  // not-viable then no-data, input order preserved
}

/** Verdicts that count as "suited to this block". Single source of truth for the cut line. */
export const SUITED_VERDICTS: ReadonlySet<SeasonVerdict> = new Set(['viable', 'at-risk']);

/**
 * Pure. Splits an ALREADY-RANKED list (output of rankCrops) into suited vs not-suited, preserving
 * the incoming order within each group so rankCrops ordering is retained. Concatenating the two
 * groups is a permutation of the input (no crop added, dropped, or duplicated).
 */
export function partitionBySuitability(ranked: CropEvaluation[]): SuitabilitySplit;
```

Rules (Decision (ii)-B):
- `overall === 'viable'` → `suited`.
- `overall === 'at-risk'` → `suited` (flagged "with care" by the card's existing "Risky" chip).
- `overall === 'not-viable'` → `notSuited`.
- `overall === 'no-data'` → `notSuited`, but the UI labels this subgroup/line "not enough crop data"
  rather than "won't grow" (it is an evidence gap). The partition itself does no further splitting;
  the card already shows the "No data" chip, so no-data crops are visually distinct inside the
  secondary group without extra logic.
- Order preserved: a single pass filter (`ranked.filter(...)`) for each group guarantees stability and
  the permutation property (C5). Because the input is already `rankCrops`-ordered, `suited` is
  "viable…then at-risk…" and `notSuited` is "not-viable…then no-data…" automatically.

### 4.4 Planner.tsx integration points

No change to data flow upstream of rendering — `crops = rankCrops(evaluateAll(...))` stays. Added:

```ts
// in Planner, after `const crops = useMemo(... evaluateAll ...)`
const futureCharacter   = useMemo(() => analysis ? classifyClimate(analysis.future.summary)   : null, [analysis]);
const baselineCharacter = useMemo(() => analysis ? classifyClimate(analysis.baseline.summary) : null, [analysis]);
const { suited, notSuited } = useMemo(() => partitionBySuitability(crops), [crops]);
```

Render order inside Step 3 (`<div className="reveal space-y-8">`), **replacing** the single
`<OptionResults crops={crops} />` line:

1. The existing chill-hours lead paragraph (unchanged).
2. **NEW** `<CropRecommendation future={futureCharacter} baseline={baselineCharacter} suited={suited}
   notSuited={notSuited} />` — the headline recommendation, placed **above** SeasonsPanel/ChillChart.
3. `<SeasonsPanel analysis={analysis} />` (unchanged — now reads as the detailed backing for the
   character sentence directly above it).
4. `<ChillChart analysis={analysis} crops={crops} />` (unchanged — still gets the full ranked list).
5. `<Brief … crops={briefCrops} />` (unchanged; see §4.7).
6. `<AdaptationNotes analysis={analysis} crops={crops} />` (unchanged — full list).
7. `<Methods analysis={analysis} />` (unchanged; optionally add the band table — §4.5).

The `OptionPicker` in Step 2 and the "Check my block" button are unchanged — the picker remains the
optional refine control (G5). `crops`, `briefCrops`, `topCrop`, `save`, `download`, `mergeOptions`
are all unchanged — the recommendation panel is a pure *view* over the same `crops` array, so saved
reports, PDF and brief all keep working untouched.

### 4.5 `CropRecommendation.tsx` — composition over `OptionResults` (no edit to it)

```tsx
// src/components/CropRecommendation.tsx  (NEW — presentational only)
import type { CropEvaluation } from '../../shared/seasons';
import type { ClimateCharacter } from '../../shared/climateCharacter';
import { OptionResults } from './OptionResults';          // REUSED AS-IS, not modified
import { climateSentence } from '../lib/climateSentence';  // or inline

export function CropRecommendation({
  future, baseline, suited, notSuited,
}: {
  future: ClimateCharacter | null;
  baseline: ClimateCharacter | null;
  suited: CropEvaluation[];
  notSuited: CropEvaluation[];
}) {
  return (
    <section aria-labelledby="recommend-heading" className="space-y-4">
      <h3 id="recommend-heading" className="text-2xl font-bold">Crops that suit this block</h3>
      {/* Lead: future character, with today for contrast */}
      {future && <p className="max-w-[62ch] text-xl leading-snug">{climateSentence(future, '2045')}</p>}
      {baseline && <p className="max-w-[62ch] text-muted">Today, for contrast: {climateSentence(baseline, 'today')}</p>}
      <p className="text-sm text-muted">
        “Suited” is our rule of thumb from this block’s projected climate, not a guarantee. The bands we
        use are app-defined — see Methods.
      </p>

      {/* Suited group — the existing card renderer, fed only the suited list */}
      {suited.length > 0
        ? <OptionResults crops={suited} />
        : <p className="rounded-lg bg-sun-soft px-4 py-3 text-sun-ink">
            No crop in our list is a clear fit for this block by {`2045`}. See the options below and the
            season detail to weigh trade-offs.
          </p>}

      {/* Secondary group — collapsed, still visible, same card renderer */}
      {notSuited.length > 0 && (
        <details className="rounded-xl border border-line bg-card p-2">
          <summary className="cursor-pointer px-2 py-1 font-bold">
            Not suited / risky by 2045 ({notSuited.length})
          </summary>
          <div className="pt-2"><OptionResults crops={notSuited} /></div>
        </details>
      )}
    </section>
  );
}
```

Key points:
- `OptionResults` is **imported and called with a subset list**. It already re-sorts by verdict and
  renders cards; handing it a pre-filtered list changes nothing in its own logic, so **no edit** is
  needed (G4). When Anuj swaps in his four-season card, as long as it keeps the
  `{ crops: CropEvaluation[] }` prop it drops straight into both call sites.
- The character sentence is the lead; today's character is shown directly beneath for the required
  "with today for contrast". `climateSentence` is pure string assembly over the typed structure, e.g.
  future `{winter:'mild', summer:'hot', water:'dry', frost:'some'}` → *"By 2045 this block has mild
  winters and hot summers, a growing water deficit, and some flowering-window frost."* Null axes are
  omitted. Exact copy is a wording detail, not logic; it has no tests beyond a smoke render.
- The secondary group uses native `<details>` (collapsed by default) — no JS state, keyboard- and
  screen-reader-accessible, meeting the "collapsed/secondary, not hidden" requirement (locked
  decision 2).
- Empty-suited fallback handles the "no crop is suited" edge (§5): the panel still renders a sentence
  and the full not-suited list rather than an empty section.
- `appDefined` bands are surfaced here ("our rule of thumb … see Methods") and optionally echoed as a
  small table in `Methods.tsx` (optional, additive; not required for the feature).

### 4.6 Baseline-vs-future contrast

- The **recommendation groups** are driven by the **future** verdicts (as today — `evaluateCrop`'s
  percentile tests already read `analysis.future.years`). This satisfies locked decision 3 (plant for
  the climate the tree grows into).
- The **character sentence** shows **future first** (`classifyClimate(analysis.future.summary)`) with
  **today** (`classifyClimate(analysis.baseline.summary)`) as a contrast line beneath it.
- The deeper numeric baseline-vs-future contrast already exists immediately below in `SeasonsPanel`
  (its table has explicit `{b0}–{b1}` vs projected `{f0}–{f1}` columns and a Change column). The
  recommendation sentence is the plain-language gloss; SeasonsPanel is the evidence. No change to
  SeasonsPanel.

### 4.7 `/api/explain` cap & saved-report behaviour (confirmed, no change)

Verified in `server/index.ts`: `explainSchema.crops` is `.min(1).max(25)`. Verified in `Planner.tsx`:
`briefCrops = crops.slice(0, BRIEF_CROP_CAP)` with `BRIEF_CROP_CAP = 25`, and `<Brief crops={briefCrops}>`.

- The brief still receives `crops.slice(0, 25)` — the **top-25 of the full ranked list**, which under
  the suited/not-suited framing is "the 25 best-fit crops, suited ones first" (because `rankCrops`
  puts viable→at-risk→not-viable→no-data in order, the slice is suited-first automatically). So the
  brief **does** now effectively summarise the suited set first, then fills remaining slots with the
  best of the not-suited — which is the right content for a summary and needs **no code change**.
  Optional future tweak (not in this scope): send `suited.slice(0, 25)` to focus the brief purely on
  suited crops; flagged as §5 Q6, not proposed now.
- Saved reports: `save`/`loadReport`/`mergeOptions`/`briefSignature` are unchanged. The recommendation
  is a pure view over `crops`; it is **not** persisted. Reopening a saved report rebuilds `crops` from
  the stored `analysis` + `options`, then re-derives character and partition on the fly — identical to
  a fresh run. No storage schema bump, `SavedReport.version`/`schemaVersion` untouched. The PDF
  (`downloadReport`) still receives the full `crops` list and is unaffected.

### 4.8 New unit tests (`tests/climateCharacter.test.ts`)

`classifyClimate` (bands):
- Each axis: a value in each band maps to the expected band (winter cold/mild/warm; summer
  mild/warm/hot; water wet/moderate/dry; frost low/some/high).
- Summer `extreme` override: `hotDays.median` in `warm`/`hot` but `extremeDays.median >= 3` ⇒ `extreme`.
- Boundary values resolve deterministically (e.g. `chillHours.median === 700` ⇒ `cold`;
  `=== 699` ⇒ `mild`; `hotDays.median === 5` ⇒ `warm`; `waterDeficitMm.median === 0` ⇒ `moderate`).
- `NaN`/non-finite field ⇒ that axis is `null`, no throw (sparse `SeasonSummary` from §C4).
- `appDefined === true` always; `basis` strings name the right field+stat; `value` echoes the input.
- Bands import `CLIMATE_BANDS` so breakpoint numbers aren't duplicated in the test.

`partitionBySuitability`:
- `viable` and `at-risk` → `suited`; `not-viable` and `no-data` → `notSuited`.
- Order within each group preserved (input already ranked → assert `suited`/`notSuited` are stable
  sub-sequences of the input).
- Permutation property: `suited.length + notSuited.length === input.length`; the multiset of ids is
  unchanged (C5).
- Empty input ⇒ both groups empty. All-not-viable input ⇒ empty `suited`, full `notSuited` (drives the
  empty-suited UI fallback).

Test fixtures build `SeasonSummary`/`CropEvaluation` objects directly (plain literals), so the tests
are pure and need no climate run — consistent with the existing `tests/ranking.test.ts` style and
runtime-agnostic under vitest (G7).

---

## 5. Risks & Open Questions

1. **Subjectivity of the bands (primary risk).** Every breakpoint in §4.2 is a human judgement. Two
   reviewers may disagree whether 400 or 450 chill hours is the warm/mild line. Mitigations in the
   design: breakpoints are (a) all in one `CLIMATE_BANDS` constant, (b) each sourced to a stated
   rationale tied to the catalogue's own class ranges and Victorian norms, (c) flagged `appDefined`
   and badged "our rule of thumb" in the UI, (d) covered by tests that reference the constant so
   retuning is a one-line change plus a test-fixture update. **Open:** does the user accept the v1
   numbers in §4.2, or want specific breakpoints adjusted?

2. **Does `at-risk` count as "suited"? (Decision (ii)-B).** Recommended yes, labelled "with care" via
   the existing chip, because warming Victoria rarely leaves crops strictly `viable` and the
   recommendation would otherwise be near-empty. **Open:** confirm, or prefer (ii)-A (suited =
   `viable` only, at-risk demoted). This is a one-constant change (`SUITED_VERDICTS`).

3. **Phrasing for edge/boundary climates.** A block whose values straddle band edges (e.g. median
   chill 699 vs 701) flips winter wording with no real-world difference. The sentence states a single
   band; it does not express "borderline". **Options:** (a) accept it (v1); (b) add a "near the X/Y
   line" qualifier when a value is within a small margin of a breakpoint (adds grammar + thresholds —
   defer). SeasonsPanel's numbers directly below give the grower the actual figure, which softens
   this. **Open:** accept v1 single-band wording?

4. **Where does `partitionBySuitability` live?** Proposed in `shared/climateCharacter.ts` to keep
   `shared/ranking.ts` a pure ordering module. Alternative: co-locate with `rankCrops` in
   `ranking.ts`. Both are pure and runtime-agnostic. **Open:** confirm file placement (no behavioural
   difference).

5. **New `CropRecommendation.tsx` vs inline JSX in `Planner.tsx`.** A new component keeps Planner lean
   and the composition explicit, and cannot collide with Anuj's `OptionResults`. Inline would avoid a
   new file but bloat Planner. **Open:** confirm a new component is acceptable (recommended).

6. **Should the brief summarise only the suited set?** Today's `crops.slice(0, 25)` already yields
   suited-first content with no change (§4.7). A stricter `suited.slice(0, 25)` would exclude
   not-suited crops from the brief entirely. Recommended: **no change** for this rework (keep the cap
   behaviour identical). **Open:** confirm, or request the suited-only brief as a follow-up.

7. **"No crop is suited" state.** Handled by the empty-`suited` fallback in §4.5 (a sentence + the full
   not-suited list, no empty section). Confirm the fallback copy direction ("No crop is a clear fit by
   2045 — weigh the trade-offs below").

8. **Which `Summary` stat per axis.** v1 uses `.median` for winter/summer/water and `.mean` for frost
   (to match the stat SeasonsPanel already displays for each). This is defensible but another small
   judgement. **Open:** accept the median/mean mix, or standardise on one stat across all axes?

9. **Frost `p10` escalator deferred.** §3.1 keeps a single-stat frost band for v1 and notes a possible
   p10 "one year in ten dips cold" escalator later. Flagged, not built. No code risk.
