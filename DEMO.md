# Demo day checklist and pitch

## Before demo day

- [x] Preset climate data is committed in `data/snapshot/` (re-run `npm run snapshot` if you add a district).
- [ ] **Host it** (`docs/deploy.md`) and put the link and a QR code on the pitch slide so judges can try it on their phones. Open it a few minutes before presenting.
- [ ] **Sanity-check the Shepparton numbers.** Typical winter chill should look plausible against published Goulburn Valley figures. If it's wildly off, tell the team before the judges do.
- [x] "Grown here today" lists come from the ABS Agricultural Census 2020–21 (`npm run import:abs`).
- [ ] **Decide on Bacchus Marsh:** ABS records almost no commercial fruit there. Swap it for an active district or leave it to show the app handling that honestly.
- [x] Almonds, pistachios, walnuts, blueberries and grapes added with sourced thresholds (olives stay unscored; see `docs/crop-data-sources.md`).
- [ ] **Know the headline finding before you pitch it:** on winter chill and spring frost, every crop still fits all six Victorian districts through 2045. The real difference is water: the Yarra Valley's yearly evaporation-minus-rain gap nearly quadruples (32 → 117 mm), about 40% on top of today's orchard irrigation, while Swan Hill's rises ~4% on an already heavy 8.2 ML/ha (`docs/water.md`). Say both plainly; they're real results.
- [ ] **Replace converted chill-portion figures** with direct ones where a source exists (`docs/crop-data-sources.md`).
- [ ] **Get one real grower or adviser quote.** Message a Goulburn Valley grower, Fruit Growers Victoria, or an Agriculture Victoria horticulture officer. One line like "we're replanting next year and have no idea what chill to plan for" beats any slide.
- [ ] **Confirm Climathon's rules on prior work.** This is a rebuild of a June prototype; be upfront about what's new.
- [ ] Set `GEMINI_API_KEY` on the demo machine and test both AI features once.
- [ ] Verify the methods citations (Linvill 1990, Weinberger 1950, Fishman et al. 1987, Luedeling et al. 2009).

## The idea in one line

When a grower has to replant, Paddock makes sure they plant for the climate their trees will actually live in.

## 3-minute pitch outline

1. **Hook (20 s).** A grower has lost a block (fire, flood, drought, or the trees are just old). Whatever they replant will crop for 20+ years, in a climate that's changing. What should they plant?
2. **Problem (30 s).** Fruit trees need winter chill. Winters are warming. Growers replant blocks on 20-year bets using last decade's climate. Wrong call = years of patchy crops.
3. **Live demo (90 s).** Pick Shepparton: results appear straight away. Walk through "Grown around Shepparton today" (pears, apples, stone fruit and how each holds up to 2045), then "Could also suit this area". Show a crop's timeline (when it first crops), then open "Will it pay?" with a grower's own figures: pay-back year with and without climate risk. Then "Thinking of switching?": pick the crop on the block now (e.g. standard cherries at Swan Hill) to show what holds up better, the cheapest ways to switch, and stay-vs-switch money. Show the chart (dots are real winters, band is 2026–2045) and "Write a summary". If time, switch to Swan Hill to show a different district, or do a photo check.
4. **Why it's credible (20 s).** Real reanalysis + 3 climate models, delta-change method, safe-winter-chill threshold from the research literature. Say the limitations.
5. **2035 impact (20 s).** Avoids stranded orchards, keeps Victorian fruit supply stable, and turns climate projections into a decision a farmer can make. Next steps: sourced cultivar data with Ag Vic, frost risk, other states.
