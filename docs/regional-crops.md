# Regional crops: "what's grown here today"

Picking a location goes straight to results, split into:

1. **Grown around <place> today**: the district's current crops from the ABS census, largest
   plantings first, each with its 2026–2045 verdict and how much is grown ("about 2.1 million
   trees, 11% newly planted"). Crops we have no climate thresholds for are listed with their
   amounts, unscored.
2. **Could also suit this area**: other crops in the database that are a good or risky fit.
3. **Struggles here** (collapsed): other crops that are a poor fit or can't be scored.

A location more than 25 km from every district centre shows one ranked list instead and says we
don't have a local crop list. The app never guesses a district.

## Data: real ABS figures

`shared/regionCrops.data.json` is **generated** from the ABS Agricultural Census 2020–21 by
`npm run import:abs`. Don't edit it by hand.

```bash
npm run import:abs -- path/to/AGCDCASGS202021.xlsx
```

- **Source file:** ABS *Agricultural Commodities, Australia, 2020–21*, data cube "Agricultural
  commodities, Australia and state/territory and ASGS regions" (`AGCDCASGS202021.xlsx`), Table 1.
  The ABS has said the 2020–21 Agricultural Census was its last, so this is the newest regional crop
  data there will be. The raw file isn't committed (about 4 MB); download it from the ABS release page.
- **Districts** are groups of Statistical Area 2 (SA2) regions, set in `data/abs/districts.json`
  (e.g. Shepparton = Shepparton Surrounds East and West + Mooroopna).
- **What counts as grown here:** at least 10,000 trees, or 20 ha for grapes and berries. Smaller
  plantings are left out.
- **Reliability:** the ABS marks small-area estimates. Figures marked `**` (relative standard error
  over 50%, "too unreliable") are dropped; `^` and `*` (10–50%, "use with caution") are kept and the
  app says amounts are approximate. Most district figures carry a caution marker.
- **Mapping to our crops** is in `shared/absRegionImport.ts` (`COMMODITIES`). Peaches and nectarines
  are combined. ABS groups apricots and plums as "other stone fruit" and walnuts/pistachios as
  "other nuts", so those can't be matched to one of our crops and are shown by name, unscored.
- **New plantings:** the share of trees not yet bearing is shown when it's 5% or more (e.g. 20% of
  cherry trees around Shepparton and in the Yarra Valley).

The importer validates the file: it fails if the header row moves or an SA2 code in
`districts.json` is missing from the file. Tests: `tests/absRegionImport.test.ts`.

### Bacchus Marsh

ABS 2020–21 records almost no commercial fruit in the Bacchus Marsh SA2s (the largest crop is under
1,000 apple trees), so the app shows a note instead of a crop list. Consider replacing this preset
with an active orchard district. To add one: add the preset to `shared/regions.ts`, its SA2 codes
to `data/abs/districts.json`, re-run the importer, and run `npm run snapshot` for its climate data.

## Crops in the lists

Apples, pears, cherries, peaches/nectarines, almonds and grapes are scored. Olives, citrus,
strawberries, other berries, "other stone fruit" and "other nuts" are listed by name with their
ABS amounts but not scored; see `docs/crop-data-sources.md` for why olives aren't in the database.
