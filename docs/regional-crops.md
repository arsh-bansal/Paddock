# Regional crops: "what's grown here today"

Picking a location goes straight to results, split into:

1. **Grown around <place> today**: the district's current crops, each with its 2026–2045 verdict.
   Crops we have no climate thresholds for are listed by name ("Also grown here: almonds…").
2. **Could also suit this area**: other crops in the database that are a good or risky fit.
3. **Struggles here** (collapsed): other crops that are a poor fit or can't be scored.

A location more than 25 km from every district centre shows one ranked list instead and says we
don't have a local crop list. The app never guesses a district.

## Data: `shared/regionCrops.data.json`

**The current lists are placeholders** (`"indicative": true`), compiled from general knowledge of
each district. The app says so on screen and in the PDF. Replace them with ABS data:

- Source: ABS Agricultural Census 2020–21 / Agricultural Commodities, fruit and nut trees by region
  (area or number of trees per commodity). Pick the region level that best matches each district.
- List each district's main tree crops. Order doesn't affect results: crops are always shown in
  climate-ranking order.
- `cropId` must match an `id` in `shared/crops.data.json`. Use `null` for crops we have no climate
  thresholds for yet; they're shown by name as "not yet scored".
- Fill `source` with the ABS table and region, and set `indicative` to `false`.

The loader validates the file on startup: unknown preset ids, duplicate districts or links to crops
that don't exist fail loudly (tests in `tests/regionCrops.test.ts`).

## Adding a district

1. Add the preset (name, lat/lon) to `shared/regions.ts`.
2. Add its entry to `shared/regionCrops.data.json`.
3. Run `npm run snapshot` to cache its climate data for offline demos.

## ABS data: which file

The ABS **Agricultural Commodities, Australia, 2020–21** release has a **Local Government Area**
data cube (`AGCDCLGA202021.xlsx`), which maps cleanly onto the preset districts. The ABS says the
2020–21 Agricultural Census was the last one it will run, so this is the newest regional data there
will be. The file is a spreadsheet the app's tooling can't fetch directly: download it from the ABS
release page. An importer that turns it into `regionCrops.data.json` is the next step (it needs the real file to check the sheet layout).

## Crops in the lists

Almonds and grapes are now in the crop database and scored. Olives and the Yarra Valley's berries
(mostly strawberries and raspberries) are listed by name but not scored; see
`docs/crop-data-sources.md` for why olives aren't in the database.
