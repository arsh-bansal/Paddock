# Demo day checklist and pitch

## Before demo day

- [ ] **Run `npm run snapshot` on good wifi** and commit `data/cache/`. The demo then works with no internet.
- [ ] **Sanity-check the Shepparton numbers.** Typical winter chill should look plausible against published Goulburn Valley figures. If it's wildly off, tell the team before the judges do.
- [ ] **Replace the indicative chill ranges** in `shared/crops.ts` with sourced figures and fill in `source`. This is the first thing an ag judge will poke at.
- [ ] **Get one real grower or adviser quote.** Message a Goulburn Valley grower, Fruit Growers Victoria, or an Agriculture Victoria horticulture officer. One line like "we're replanting next year and have no idea what chill to plan for" beats any slide.
- [ ] **Confirm Climathon's rules on prior work.** This is a rebuild of a June prototype; be upfront about what's new.
- [ ] Set `GEMINI_API_KEY` on the demo machine and test both AI features once.
- [ ] Verify the methods citations (Linvill 1990, Weinberger 1950, Fishman et al. 1987, Luedeling et al. 2009).

## 3-minute pitch outline

1. **Hook (20 s).** "A peach tree planted this winter is still cropping in 2045. What will winter look like then?"
2. **Problem (30 s).** Fruit trees need winter chill. Winters are warming. Growers replant blocks on 20-year bets using last decade's climate. Wrong call = years of patchy crops.
3. **Live demo (90 s).** Shepparton → tick standard peach, low-chill peach, cherry, apple → Check my block. Point at the chart: dots are real winters, band is 2026–2045. Read out one verdict. Hit "Write a summary". If time, show a photo check.
4. **Why it's credible (20 s).** Real reanalysis + 3 climate models, delta-change method, safe-winter-chill threshold from the research literature. Say the limitations.
5. **2035 impact (20 s).** Avoids stranded orchards, keeps Victorian fruit supply stable, and turns climate projections into a decision a farmer can make. Next steps: sourced cultivar data with Ag Vic, frost risk, other states.
