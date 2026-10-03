# Water: irrigation today and the change ahead

Each district's results include a **Water** section:

1. **Today (ABS):** orchard area, the share irrigated, and irrigation applied per irrigated hectare,
   plus vineyards, from *Water Use on Australian Farms, 2020–21* (LGA data cube
   `WUAFDCLGA202021.xlsx`, Table 1). A bar chart compares orchard ML/ha across the districts.
2. **Ahead (our projection):** the yearly gap between reference evaporation (Hargreaves) and rainfall,
   1995–2014 vs 2026–2045, and that change expressed as ML/ha (1 mm over 1 ha = 0.01 ML), with its
   share of today's orchard use.

```bash
npm run import:abs-water -- path/to/WUAFDCLGA202021.xlsx   # regenerates shared/regionWater.data.json
```

The LGA for each district is in `data/abs/districts.json`. The importer matches ABS item codes
(`AGWATRFRUTAML_F` etc.), fails loudly on a missing LGA, and withholds ML/ha below 50 irrigated ha
(Bacchus Marsh / Moorabool). Logic: `shared/absWaterImport.ts`, `shared/regionWater.ts`,
wording shared by screen and PDF: `src/lib/waterText.ts`. Tests: `tests/water.test.ts`.

## What it shows (real data)

| District (LGA) | Orchard irrigation, 2020–21 | Shortfall, then → 2026–45 | Rough extra |
|---|---|---|---|
| Wandin (Yarra Ranges) | 2.1 ML/ha | 32 → 117 mm | +0.9 ML/ha, ~41% of today |
| Harcourt (Mount Alexander) | 3.9 ML/ha | 568 → 624 mm | +0.6 ML/ha, ~14% |
| Shepparton (Greater Shepparton) | 4.8 ML/ha | 657 → 690 mm | +0.3 ML/ha, ~7% |
| Cobram (Moira) | 7.1 ML/ha | 760 → 800 mm | +0.4 ML/ha, ~6% |
| Swan Hill | 8.2 ML/ha | 956 → 987 mm | +0.3 ML/ha, ~4% |

The cool, wet Yarra Valley shifts the most in relative terms, from close to rain-fed towards needing
real irrigation. Swan Hill already irrigates heavily, so the change there is proportionally small.

## Limits (stated in the app)

- **2020–21 was not a typical year.** The ABS describes it as wetter and cooler, so typical irrigation
  is likely higher than these figures.
- **The extra-water figure is indicative.** It uses reference evaporation minus rainfall; real orchard
  needs depend on crop, canopy, soil and how much rain is effective.
- **LGA figures are concorded from SA2 estimates**, and the ABS zeroed confidential cells first, so
  small figures can be understated.
