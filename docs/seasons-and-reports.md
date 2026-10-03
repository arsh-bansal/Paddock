# Seasons engine + PDF report + saved reports (Arsh: tasks 4 and 9)

## What's new

**Task 4, all seasons.** Every metric is computed per year, so any period is just a filter.

| Season | Window | Metrics |
|---|---|---|
| Winter | 1 Apr – 30 Sep | chill hours, chill portions |
| Spring | Jul – Nov | frost days by month × threshold (0, -1, -2, -3, -4 °C) |
| Summer | Dec (prev. year) – Feb | days ≥35 °C, days ≥40 °C, longest hot spell |
| Autumn | Mar – May | rainfall, days ≥30 °C |
| Whole year | Jan – Dec | rainfall, evaporation (Hargreaves), water shortfall |

Per crop, winter (scored in **chill portions**), spring and summer each get a verdict; the overall verdict is the **worst season**. Summer is shown but not scored while no crop has a sourced heat limit. See `docs/crop-data-sources.md`, "Scoring model".
Rainfall projections use a monthly ratio (clamped 0.5–1.5×). Incomplete seasons are `null`, never under-counted.

**Task 9, report + local save.**
- "Download PDF report": 3-page A4 PDF generated in the browser (`@react-pdf/renderer`, lazy-loaded so it doesn't slow the app).
- "Save on this device": stored in IndexedDB, newest 30 kept, opens with no internet, PDF downloadable from the saved list.

## Contracts other tasks depend on

**Huu (crop database, ranking)** — the crop schema is `CropOption` in `shared/crops.ts`:
`winter.chillHours`, `spring.floweringMonths` + `spring.frostDamageC`, `summer.hotDaysTolerated`, each with `indicative` + `source`.
A season you can't source → set it to `null` and the app shows "No data".
Ranking: call `evaluateCrop()` (in `shared/seasons.ts`) for every crop and sort by `overall`, then by margin.

**Anuj (report card, comparison)** — render `CropEvaluation` (from `evaluateCrop`). `src/components/OptionResults.tsx` is an interim display; replace it.
`describeSeason()` and `SEASON_LABEL` in `src/lib/seasonRows.ts` give plain-English lines you can reuse.

**Sam (40 years)** — `yearlyStats()` works on any date range. To add 1985–2004 vs 2005–2024: widen `OBSERVED_PERIOD` in `shared/types.ts`,
bump `CACHE_VERSION` in `server/openMeteo.ts`, and add a `PeriodClimate` using `summariseYears()` on the filtered `observed` years.
If `ClimateAnalysis` changes shape, bump `schemaVersion` (saved reports check it).

## Placeholder data (must be replaced)

Crop thresholds now live in `shared/crops.data.json` (Huu). Still indicative:
- chill portions for every crop except sweet cherry are converted from hours (Brunt et al. 2017, Table 1),
- frost damage temperatures are from a US table (WSU/USU), and the frost count itself is a district estimate,
- no crop has a sourced heat limit, so summer is not scored.
The UI and PDF mark these.

## Known limits
- Frost is district-level (10–25 km grid). Frost hollows are colder.
- Flowering months are fixed; they don't yet shift earlier as winters warm.
- Hargreaves evaporation is a temperature-based estimate, fine for comparing periods, not a crop water budget.

## Tested
- 30 unit tests (chill, delta change incl. rainfall, ET0, every season metric, verdict rules, saved-report storage).
- Browser end-to-end: run check → download PDF → save → reload → open saved report with the API blocked → PDF from saved list → delete.
- Not yet run against the live Open-Meteo API (sandbox had no access). `npm run snapshot` first; it now prints frost, heat and rain as well as chill.
