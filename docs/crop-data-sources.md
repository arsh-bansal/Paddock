# Crop data sources — chill, frost & heat requirements

**Purpose.** Authoritative, sourced reference for the crop thresholds in `shared/crops.ts`
(`interface CropOption`). The Paddock app compares a crop's requirements against computed local
climate (now vs projected 2026–2045) for Victorian orchards.

**The chill model that matters.** The app accumulates **Chill Hours on the Weinberger basis =
hours with temperature between 0 °C and 7.2 °C (32–45 °F)**. Chill figures reported in **Utah Chill
Units** or **Dynamic-model Chill Portions (CP)** are *not* interchangeable with Chill Hours. Every
chill value below records which model the source used, and mismatches are flagged explicitly in the
Caveats section.

> **Integrity note.** Several figures below could only be reached through a search snippet or a
> model-conversion table, not by reading the full primary table. Those are marked and listed under
> "needs human verification". Nothing in this document is invented; where no credible figure exists
> (notably spring `frostDamageC` on an Australian basis, and summer `hotDaysTolerated`) that is
> stated plainly rather than guessed.

---

## Reference table

| # | Crop | Category | Chill hours [min–max] | Chill MODEL used by source | Flowering months (Vic) | Frost damage °C (open bloom) | Hot days tolerated ≥35 °C | Source citation(s) | Confidence |
|---|------|----------|-----------------------|----------------------------|------------------------|------------------------------|---------------------------|--------------------|------------|
| 1 | Peach / nectarine, standard-chill | stone fruit | 400–800 | Mixed: 400 = Chill Hours 0–7.2 °C **net** (Chill Hours Tracker, "mid-chill stone fruit"); 600–800 cross-check = Chill Hours (US extension) | Aug (central Vic) | −2.8 (27 °F, full bloom 10% kill) | **UNSOURCED** | Chill Hours Tracker (AU); Mississippi State P3067 / Purdue (US); USU/WSU frost table (US); Grow Great Fruit (Vic) | Medium (chill); medium (frost, US); unsourced (heat) |
| 2 | Peach / nectarine, low-chill | stone fruit | 200–400 | Chill Hours 0–7.2 °C **net** (Chill Hours Tracker, "low-chill stone fruit" ~200 h; "mid-chill" ~400 h) | Jul–Aug (earlier than standard) | −2.8 (27 °F, full bloom 10% kill) | **UNSOURCED** | Chill Hours Tracker (AU); USU/WSU frost table (US) | Medium (chill); medium (frost, US); unsourced (heat) |
| 3 | Apricot, standard | stone fruit | 300–600 | Mixed: lower bound ~300 approximate; 500–600 = Chill Hours (US extension, Purdue). **No Australian Chill-Hour figure located** | Aug (central Vic) | −2.8 (27 °F, full bloom 10% kill) | **UNSOURCED** | Purdue/Mississippi State (US); USU/WSU frost table (US); Grow Great Fruit (Vic) | Low–medium (chill, non-AU); medium (frost, US); unsourced (heat) |
| 4 | Plum, Japanese types | stone fruit | 118–685 | Chill Hours (CH, 0–7.2 °C basis) — Fadón et al. 2020 cultivar range | Aug–Sep (central Vic) | −2.8 (27 °F, full bloom 10% kill) | **UNSOURCED** | Fadón et al. 2020 (ES/review, via figure caption — see caveat); USU/WSU frost table (US); Grow Great Fruit (Vic) | Medium (chill, non-AU, snippet-sourced); medium (frost, US); unsourced (heat) |
| 5 | Plum, European / prune types | stone fruit | 579–1323 | Chill Hours (CH, 0–7.2 °C basis) — Fadón et al. 2020 cultivar range | Sep (central Vic) | −2.8 (27 °F, full bloom 10% kill) | **UNSOURCED** | Fadón et al. 2020 (ES/review, via figure caption — see caveat); USU/WSU frost table (US) | Medium (chill, non-AU, snippet-sourced); medium (frost, US); unsourced (heat) |
| 6 | Sweet cherry, standard | cherry | **[600, 800] shipped** (brackets the ~700 net point figure); cross-model alt 1000–1500 (Chill-Hours equivalent of "High/Very high" Dynamic rating) | **DECISION: app ships [600, 800] Chill Hours (0–7.2 °C Weinberger basis).** This deliberately brackets the ~700 h point figure from the Chill Hours Tracker (net 0–7.2 °C model). The 1000–1500 h figure is the Chill-Hours band Hort Innovation maps to its High/Very-high Dynamic rating (60–80+ CP); the app follows the Tracker's 0–7.2 °C basis instead — see decision note below | Sep–Oct (Vic) | −2.2 (28 °F, full bloom 10% kill) | **UNSOURCED** | Hort Innovation Cherry Production Guide 2017 (AU); Chill Hours Tracker (AU); Darbyshire et al. 2014 (AU, Dynamic model — see caveat); USU/WSU frost table (US) | Medium–high (chill, AU, but model spread — see caveat); medium (frost, US); unsourced (heat) |
| 7 | Sweet cherry, low-chill | cherry | 300–500 | Chill Hours 0–7.2 °C **net** (Chill Hours Tracker, Stella/Lapin "low-chill cherries" ~500 h); 300–500 also matches Hort Innovation "Low" Dynamic rating (20–40 CP) converted to Chill Hours | Aug–Sep (earlier) | −2.2 (28 °F, full bloom 10% kill) | **UNSOURCED** | Chill Hours Tracker (AU); Hort Innovation Cherry Production Guide 2017 Table 1 (AU); USU/WSU frost table (US) | Medium (chill); medium (frost, US); unsourced (heat) |
| 8 | Apple, mainstream | pome fruit | 550 (net) to ~1000 (cross-check) | 550 = Chill Hours 0–7.2 °C **net** (Chill Hours Tracker, Pink Lady/Gala); 400–1000 cross-check = Chill Hours (US extension) | Sep–Oct (Vic) | −2.2 (28 °F, full bloom 10% kill) | **UNSOURCED** (sunburn qualitative only) | Chill Hours Tracker (AU); Purdue/Mississippi State (US); UniMelb Pursuit 2016 (AU, sunburn context); USU/WSU frost table (US) | Medium (chill); medium (frost, US); unsourced (heat) |
| 9 | Apple, low-chill | pome fruit | 200–400 | Chill Hours 0–7.2 °C basis (US extension "low-chill" apple classes); **no specific AU low-chill apple Chill-Hour figure located** | Aug–Sep (earlier) | −2.2 (28 °F, full bloom 10% kill) | **UNSOURCED** | Mississippi State P3067 (US); USU/WSU frost table (US) | Low–medium (chill, non-AU); medium (frost, US); unsourced (heat) |
| 10 | European pear, standard | pome fruit | 700 (net) to ~900 (cross-check) | 700 = Chill Hours 0–7.2 °C **net** (Chill Hours Tracker, "most dessert varieties"); 600–900 cross-check = Chill Hours (US extension) | Sep (Vic) | −2.2 (28 °F, full bloom 10% kill) | **UNSOURCED** | Chill Hours Tracker (AU); Purdue/Mississippi State (US); USU/WSU frost table (US) | Medium (chill); medium (frost, US); unsourced (heat) |

Frost °C are conversions of the WSU/USU full-bloom **10% bud-kill** temperatures (30-minute
exposure): 27 °F = −2.8 °C, 28 °F = −2.2 °C. "10% kill" is a convention; growers of cherries often
need far higher bud survival, so the effective planning threshold for cherry may be warmer than the
10%-kill figure.

---

## Sources

**Primary (Australian / local — preferred):**

1. **Darbyshire, R., et al. (2014).** "Climate, Winter Chill, and Decision-making in Sweet Cherry
   Production." *HortScience* 49(3): 254–259.
   <https://journals.ashs.org/view/journals/hortsci/49/3/article-p254.xml>
   — Australian sweet-cherry chill study. Uses the **Dynamic model (Chill Portions)**, not Chill
   Hours. *The article page/PDF requires JavaScript or returns an HTML gate for automated access, so
   the specific cultivar Chill-Portion figures were not read directly from this source for this
   document; see the Hort Innovation guide (below), which draws on the same author/method family and
   was readable.*

2. **Brunt, C., Darbyshire, R., Nissen, R., Chapman, S. (2017).** "Chill and heat requirements: from
   dormancy to flowering." *Australian Cherry Production Guide 2017*, Hort Innovation.
   <https://brendanh62.sg-host.com/wp-content/uploads/2024/10/170614_Chill_Chapter_Production_Manual_Final.pdf>
   — Read in full (17 pp). Uses the **Dynamic model (Chill Portions)**. Its **Table 1** gives a
   cross-model mapping used here:

   | Chill rating | Chill Portions (Dynamic) | Chill Units (Utah) | **Chill Hours** |
   |--------------|--------------------------|--------------------|-----------------|
   | Low | 20–40 | 600–800 | **300–500** |
   | Low–moderate | 40–50 | 800–1000 | **500–750** |
   | Moderate–high | 50–60 | 1000–1200 | **750–1000** |
   | High | 60–80 | 1200–1400 | **1000–1500** |
   | Very high | >80 | >1400 | **>1500** |

   Named cultivars (Table 2, in Chill Portions): Bing/Summit/Sylvia = High–Very high; Lapins ≈ 45–66
   CP (low-mod to mod-high); Stella = moderate-high; Rainier ≈ 45 CP; Kordia ≈ 67 CP.

3. **Chill Hours Tracker** (Fresh Activations, "Dormancy Ledger"), Australian tool.
   <https://chill.freshactivations.com.au/>
   — Uses a **net Chill-Hours model on the 0–7.2 °C band** (each hour 0–7.2 °C adds one; each hour
   ≥15.5 °C subtracts one), counting from 1 May. Lists named-cultivar variety requirements:
   High-chill cherries (Bing, Sylvia, Summit) **700 h**; low-chill cherries (Stella, Lapin)
   **500 h**; apples (Pink Lady, Gala) **550 h**; pears (most dessert) **700 h**; mid-chill stone
   fruit (many peach/nectarine) **400 h**; low-chill stone fruit (warm-climate) **200 h**. The tool's
   own disclaimer notes this is a planning estimate, not the Richardson/Utah/Dynamic models used in
   formal chill forecasting.

4. **Hull, L. / Darbyshire, R., Fuentes, S., Goodwin, I., et al. (2016).** "Climate change: What it
   means for fruits." *Pursuit*, University of Melbourne (PICCC project).
   <https://pursuit.unimelb.edu.au/articles/climate-change-what-it-means-for-fruits>
   — Summer-heat / sunburn context. Royal Gala apple (matures Jan–Feb) is highly vulnerable to
   sunburn; **netting cuts sunburn-damage risk ≥50% at hot sites such as Shepparton (Vic) and Young
   (NSW)**; cooler Tasmanian sites remain low-risk to 2090. **No "number of days ≥35 °C tolerated"
   figure is given** — the article treats heat/sunburn as site- and variety-specific.

5. **USDA FAS GAIN — Stone Fruit Annual, Australia (AS2026-0018, Aug 2026).**
   <https://www.fas.usda.gov/data/gain-report/2026/08/Stone%20Fruit%20Annual_Canberra_Australia_AS2026-0018.pdf>
   — Documents a MY2026/27 Australian stone-fruit production decline driven by **above-average
   minimum winter temperatures / a deficit of chill hours** for some nectarine and peach varieties.
   Context for why chill shortfall matters in Victoria; not a cultivar chill-figure source.

6. **Agriculture Victoria — Dry-season management of stone fruit.**
   <https://agriculture.vic.gov.au/crops-and-horticulture/fruit-and-nuts/fruit/dry-season-management-stone-fruit>
   — Management context (not a numeric chill/frost source in this compilation).

7. **Grow Great Fruit** (central-Victoria orchard, observational) and **RACV** (cherry-blossom
   timing). Used only for Victorian **flowering months**: apricots/peaches/nectarines/plums in flower
   by **mid-August** in central Vic; **cherries September–October**.
   <https://growgreatfruit.com/what-normal-fruit-trees-look-like/what-healthy-fruit-tree-flowers-look-like/>,
   <https://www.racv.com.au/royalauto/travel/victoria/spring-cherry-blossom-season-victoria.html>

**International backstop (non-Australian — used only to fill gaps, labelled as such):**

8. **Fadón, E., Herrera, S., Guerrero, B.I., Guerra, M.E., Rodrigo, J. (2020).** "Chilling and Heat
   Requirements of Temperate Stone Fruit Trees (*Prunus* sp.)." *Agronomy* 10(3):409 (MDPI, open
   access). <https://www.mdpi.com/2073-4395/10/3/409>
   — Review reporting cultivar chilling in **Chilling Hours (CH, 0–7.2 °C basis)** among other models.
   Values used here (**European plum 579–1323 CH; Japanese plum 118–685 CH**) come from the paper's
   figure/table captions as surfaced in search results. *The MDPI full text (HTML/XML/PDF) returned
   403/captcha to automated access, so the peach, apricot and sweet-cherry CH ranges in this paper
   were NOT read directly and are not transcribed here — see "needs human verification".*

9. **AL Suwaid, I.J., Bucur, A., Butcaru, A.C., et al. (2023).** Apple & pear / peach-nectarine-
   apricot chilling and heat, USAMV Bucharest, *Scientific Papers. Series B, Horticulture*.
   <https://horticulturejournal.usamv.ro/pdf/2023/issue_2/Art13.pdf>
   — International backstop for pome/stone chill ranges (not individually transcribed here).

10. **Mississippi State University Extension P3067** (class ranges, US cross-check only): Apple
    200–1000, Peach 200–800, Pear 400–900, Plum 400–700 Chill Hours. Corroborated by Purdue/MRCC crop
    specs (Peach 600–800, Apricot 500–600, Pear-European 600–800, Apple 400–1000).

11. **Marion Murray / Washington State University — "Critical Temperatures for Frost Damage on Fruit
    Trees"**, Utah State University Extension IPM-012-11 (2020).
    <https://extension.usu.edu/productionhort/files/CriticalTemperaturesFrostDamageFruitTrees.pdf>
    — Full-bloom 10%/90% bud-kill temperatures (30-min exposure), WSU table. Full-bloom 10%-kill used
    here: Apple 28 °F, Pear 28 °F, Sweet cherry 28 °F, Apricot 27 °F, Peach/nectarine 27 °F, Plum
    27 °F. **US source — not Australian.**

---

## Caveats and model-mismatch notes

**Chill model mismatches (critical — app expects Chill Hours, 0–7.2 °C Weinberger):**

- **Hort Innovation guide & Darbyshire 2014 report in Chill Portions (Dynamic model), NOT Chill
  Hours.** All cherry figures taken from Hort Innovation that are expressed in Chill Hours here were
  converted via that guide's own Table 1 (reproduced above). Converted bands are coarse ranges, not
  precise equivalents — the guide itself states cross-model conversion carries uncertainty.
- **The Chill Hours Tracker uses a NET model** (hours 0–7.2 °C add, hours ≥15.5 °C subtract). The
  app's intended model is a simple accumulation of hours 0–7.2 °C without heat negation. Same
  temperature band, but **the net model yields lower seasonal totals in warm/variable winters.**
  Treat Tracker figures as lower-bound planning numbers.
- **Standard sweet cherry has a genuine model-driven spread.** The Chill Hours Tracker lists
  Bing/Sylvia/Summit at **700 net Chill Hours**, while Hort Innovation rates the same cultivars
  High/Very-high, which its Table 1 maps to **1000–1500 Chill Hours**. These disagree because of
  model and method differences, not error. The developer must pick a convention and state it; this
  document flags both. **Decision taken: the app ships [600, 800] Chill Hours**, bracketing the
  Tracker's ~700 h net point figure on the 0–7.2 °C basis the engine uses (the Dynamic→Chill-Hour
  1000–1500 band was not chosen because it rests on a different model). See row 6 and the
  "Recommended per-crop values" entry 6 for the full rationale.
- **Fadón 2020 reports in Chilling Hours (CH) on the 0–7.2 °C basis** — this *does* match the app
  model, which is why the plum ranges are usable. But Fadón is a Spain-based review of mostly
  European/Mediterranean cultivars; absolute numbers may not map onto Victorian cultivars.
- **US extension cross-checks (Mississippi State, Purdue, WSU) use Chill Hours (32–45 °F = 0–7.2 °C)**,
  which matches the app's band, but they are **not Australian** and are class rules-of-thumb.

**Values that could NOT be sourced credibly:**

- **Spring `frostDamageC` on an Australian basis — UNSOURCED (left indicative).** The only readable
  full-bloom critical-temperature table is the **US WSU/USU table**. No Australian open-bloom kill-
  temperature dataset was located in this pass. The −2.2 / −2.8 °C figures are credible and
  well-established but **US-derived; verify against an Australian source before relying on them.**
- **Summer `hotDaysTolerated` (days ≥35 °C) — UNSOURCED for ALL 10 crops.** This is an app-defined
  metric. No source — Australian or international — publishes a "number of ≥35 °C days a crop
  tolerates before heat/sunburn risk climbs." The UniMelb Pursuit article confirms the *risk is real
  and site/variety specific* (Royal Gala sunburn, netting) but gives **no day-count threshold.**
  Leave the existing indicative bands (`heatNote` qualitative text is fine) and mark the numeric
  field as needing a human-defined assumption, not a citation.
- **Fadón 2020 peach / apricot / sweet-cherry CH ranges — NOT verified.** The MDPI full text blocked
  automated access; only the plum figures surfaced via search snippets. Do not transcribe
  peach/apricot/cherry numbers "from Fadón" until a human reads Tables 2–6 of the paper directly.
- **Apricot and low-chill apple Chill Hours have no located Australian figure.** The ranges given
  (apricot 300–600, low-chill apple 200–400) rest on US extension classes only. Low confidence.

**Flowering months:**

- Victorian flowering months are from **observational/horticultural sources** (central-Vic grower
  blog; RACV blossom guide), not peer-reviewed phenology. They are directionally reliable (stone
  fruit Aug; cherries/apples/pears Sep–Oct; low-chill types earlier) but should be confirmed against
  Agriculture Victoria or BOM-linked phenology if precision matters.

---

## Recommended per-crop values to transcribe

Format mirrors `CropOption`. `[SOURCED]` = backed by a cited figure (model noted);
`[INDICATIVE — needs human verification]` = no credible citation, keep as a human-set assumption.

1. **Peach / nectarine, standard-chill** (stone fruit)
   - `winter.chillHours`: **[400, 800]** `[SOURCED]` — 400 h = Chill Hours Tracker (AU, net 0–7.2 °C); upper 800 = US extension cross-check. *Model note: AU figure is net; US is plain Chill Hours.*
   - `spring.floweringMonths`: **[8]** `[SOURCED]` (central Vic, Aug) · `frostDamageC`: **−2.8** `[INDICATIVE — needs human verification]` (US WSU, non-AU)
   - `summer.hotDaysTolerated`: **[INDICATIVE — needs human verification]** (no source exists)

2. **Peach / nectarine, low-chill** (stone fruit)
   - `winter.chillHours`: **[200, 400]** `[SOURCED]` — Chill Hours Tracker (AU, net 0–7.2 °C)
   - `spring.floweringMonths`: **[7, 8]** `[INDICATIVE — needs human verification]` (earlier than standard; directional) · `frostDamageC`: **−2.8** `[INDICATIVE — needs human verification]` (US)
   - `summer.hotDaysTolerated`: **[INDICATIVE — needs human verification]**

3. **Apricot, standard** (stone fruit)
   - `winter.chillHours`: **[300, 600]** `[INDICATIVE — needs human verification]` — US extension (Purdue 500–600) only; no AU Chill-Hour figure located
   - `spring.floweringMonths`: **[8]** `[SOURCED]` (central Vic) · `frostDamageC`: **−2.8** `[INDICATIVE — needs human verification]` (US)
   - `summer.hotDaysTolerated`: **[INDICATIVE — needs human verification]**

4. **Plum, Japanese types** (stone fruit)
   - `winter.chillHours`: **[118, 685]** `[SOURCED — non-AU, snippet]` — Fadón 2020 (CH 0–7.2 °C). *Verify against the paper's table; wide range.* Consider narrowing to e.g. [150, 600] for app display.
   - `spring.floweringMonths`: **[8, 9]** `[SOURCED]` · `frostDamageC`: **−2.8** `[INDICATIVE — needs human verification]` (US)
   - `summer.hotDaysTolerated`: **[INDICATIVE — needs human verification]**

5. **Plum, European / prune types** (stone fruit)
   - `winter.chillHours`: **[579, 1323]** `[SOURCED — non-AU, snippet]` — Fadón 2020 (CH 0–7.2 °C). Very wide; consider [700, 1100] for display.
   - `spring.floweringMonths`: **[9]** `[SOURCED]` · `frostDamageC`: **−2.8** `[INDICATIVE — needs human verification]` (US)
   - `summer.hotDaysTolerated`: **[INDICATIVE — needs human verification]**

6. **Sweet cherry, standard** (cherry) — **SHIPPED DECISION: `winter.chillHours = [600, 800]`, `indicative: false`**
   - `winter.chillHours`: **[600, 800]** `[SOURCED]` — **the app ships [600, 800] Chill Hours (Weinberger basis: hours with temperature between 0 and 7.2 °C).** This is a deliberate range bracketing the sourced point figure of ~700 chill hours from the Chill Hours Tracker (freshactivations.com.au).
     - **MODEL NOTE:** the Tracker uses a **net** model (adds hours in 0–7.2 °C, subtracts hours ≥15.5 °C), whereas the Paddock engine counts chill hours in the **same 0–7.2 °C band without the heat-negation subtraction**. Same unit (chill hours, 0–7.2 °C basis), slightly different accounting — so 700 is treated as an approximate central value and [600, 800] brackets it.
     - **Alternative not chosen:** the Hort Innovation Dynamic-model figure converts to ~1000–1500 chill hours. [600, 800] follows the net-model Tracker source because it is on the same 0–7.2 °C temperature basis the app uses.
   - `spring.floweringMonths`: **[9, 10]** `[SOURCED]` (Vic) · `frostDamageC`: **−2.2** `[INDICATIVE — needs human verification]` (US; note cherries need high bud survival, so effective threshold may be warmer)
   - `summer.hotDaysTolerated`: **[INDICATIVE — needs human verification]**

7. **Sweet cherry, low-chill** (cherry)
   - `winter.chillHours`: **[300, 500]** `[SOURCED]` — Chill Hours Tracker (Stella/Lapin ~500, net) + Hort Innovation "Low" rating → 300–500 Chill Hours
   - `spring.floweringMonths`: **[8, 9]** `[INDICATIVE — needs human verification]` (earlier; directional) · `frostDamageC`: **−2.2** `[INDICATIVE — needs human verification]` (US)
   - `summer.hotDaysTolerated`: **[INDICATIVE — needs human verification]**

8. **Apple, mainstream** (pome fruit)
   - `winter.chillHours`: **[550, 1000]** `[SOURCED]` — 550 = Chill Hours Tracker (Pink Lady/Gala, net); upper 1000 = US extension cross-check
   - `spring.floweringMonths`: **[9, 10]** `[SOURCED]` (Vic) · `frostDamageC`: **−2.2** `[INDICATIVE — needs human verification]` (US)
   - `summer.hotDaysTolerated`: **[INDICATIVE — needs human verification]** (sunburn real per UniMelb Pursuit, but no day-count published)

9. **Apple, low-chill** (pome fruit)
   - `winter.chillHours`: **[200, 400]** `[INDICATIVE — needs human verification]` — US low-chill apple classes only; no AU figure located
   - `spring.floweringMonths`: **[8, 9]** `[INDICATIVE — needs human verification]` · `frostDamageC`: **−2.2** `[INDICATIVE — needs human verification]` (US)
   - `summer.hotDaysTolerated`: **[INDICATIVE — needs human verification]**

10. **European pear, standard** (pome fruit)
    - `winter.chillHours`: **[700, 900]** `[SOURCED]` — 700 = Chill Hours Tracker (most dessert varieties, net); upper 900 = US extension cross-check
    - `spring.floweringMonths`: **[9]** `[SOURCED]` (Vic) · `frostDamageC`: **−2.2** `[INDICATIVE — needs human verification]` (US)
    - `summer.hotDaysTolerated`: **[INDICATIVE — needs human verification]**

---

*Compiled from the pre-vetted source list. Australian sources (Hort Innovation cherry guide, Chill
Hours Tracker, UniMelb Pursuit, USDA GAIN) were preferred; US/EU sources are used only to fill gaps
and are labelled non-Australian. Where the full primary table could not be read by the compiler
(Darbyshire 2014, Fadón 2020 MDPI full text — both gated to automated access), that limitation is
stated and the affected values are marked for human verification rather than presented as confirmed.*

---

## Winter climate-character bands (sourced rationale)

**Up front — what is and isn't sourced here.** The app classifies a block's winter warmth from its
computed **median winter chill hours** (Weinberger model, hours 0–7.2 °C) into three bands: `warm`
(`< 400`), `mild` (`400–699`), and `cold` (`>= 700`). The **underlying crop chill requirements are
sourced** (they are the same figures compiled in the reference table above). The **two breakpoints
themselves — 400 and 700 — are APP-DEFINED CLASSIFICATION CUT-POINTS**, not numbers any publication
prints as "the warm/mild/cold boundary". No cited source states "below 400 chill hours = a warm
block". What the sources *do* give are crop-class chill ranges; the app draws its band edges at the
points where those classes start and stop overlapping. The ranges are sourced; the decision to cut
the lines at 400 and 700 is the app's. That distinction is stated plainly so the band set is not
mistaken for a published climate-zoning scheme.

**Why ~400 h is a defensible warm/mild edge.** 400 chill hours is the approximate **upper edge of
the low-chill cultivar class** in the compiled sources. Low-chill stone fruit sit at ~200–400 h
(row 2, Chill Hours Tracker AU: low-chill ~200 h, mid-chill ~400 h), low-chill sweet cherry at
300–500 h (row 7, Chill Hours Tracker + Hort Innovation "Low" rating), and low-chill apple at
200–400 h (row 9, Mississippi State P3067 class). A block whose median winter delivers **below ~400 h
can only reliably satisfy these low-chill cultivars** — standard-chill types will not consistently
break dormancy. For orchard purposes that is a "warm" winter, so the app labels it `warm`. The number
is anchored to the top of the documented low-chill band, not invented.

**Why ~700 h is a defensible mild/cold edge.** 700 chill hours is around the **lower edge of the
standard-chill class**. European pear (standard) is 700–900 h, with the **700 h figure coming
directly from the Chill Hours Tracker ("most dessert varieties")** (row 10); standard sweet cherry
rests on the Tracker's ~700 h net point figure for high-chill cultivars like Bing/Sylvia/Summit
(row 6, which is why the app ships [600, 800] bracketing it); and mainstream apple spans 550–1000 h
(row 8). A block at or above ~700 h **reliably meets the needs of standard-chill pome, pear, and
standard cherry** — i.e. it behaves as a genuinely cold-winter orchard site — so the app labels it
`cold`. Again the breakpoint is tied to a documented class edge (standard-chill lower bound), not
chosen arbitrarily.

**Why 400–699 is the "mild" middle.** This band is the overlap zone between the two classes. Blocks
here comfortably carry **mid-chill and low-chill cultivars** (mid-chill stone fruit ~400 h, apple at
its 550 h lower bound per row 8, low-chill cherry's 500 h upper bound per row 7) while **high-chill
and the upper standard-chill types become marginal** — a block at 500 h will not dependably satisfy a
700–900 h pear or a ~700 h standard cherry. Calling this range `mild` reflects that it is neither
clearly warm (low-chill-only) nor clearly cold (standard-chill-capable). The edges 400 and 699 fall
in the gaps between the documented class ranges rather than cutting through a single well-established
figure, which is what makes them defensible as cut-points.

| Band | Chill hours (median, 0–7.2 °C) | Crops this winter reliably supports | Source basis (rows in this doc) |
|------|-------------------------------|-------------------------------------|---------------------------------|
| `warm` | `< 400` | Low-chill cultivars only: low-chill stone fruit (~200–400 h), low-chill cherry (300–500 h), low-chill apple (200–400 h). Standard-chill types unreliable. | Rows 2, 7, 9 (Chill Hours Tracker AU; Hort Innovation Cherry Guide 2017 "Low"; Mississippi State P3067) |
| `mild` | `400–699` | Low-to-mid chill: mid-chill stone fruit (~400 h), apple at its 550 h lower bound, low-chill cherry upper bound (500 h). High-chill pome/pear/standard cherry become marginal. | Rows 1, 2, 7, 8 (Chill Hours Tracker AU; Mississippi State P3067 cross-check) |
| `cold` | `>= 700` | Standard-chill pome/pear/standard cherry: European pear (700–900 h), mainstream apple (550–1000 h), standard sweet cherry (~700 h net). | Rows 6, 8, 10 (Chill Hours Tracker AU "most dessert varieties" 700 h; Hort Innovation Cherry Guide 2017; US extension cross-check) |

**Model caveat (inherited).** The anchoring Chill Hours Tracker figures use a **net** model (hours
0–7.2 °C add, hours ≥15.5 °C subtract), whereas the app's winter character reads median chill hours
accumulated on the plain 0–7.2 °C band without heat negation (see the "Chill model mismatches" note
above). The breakpoints are therefore anchored to approximate class edges, not exact model-matched
thresholds — which is a further reason they are treated as app-defined cut-points rather than
published boundaries.

**Summer, water and frost bands are NOT sourceable — they are app-defined rules of thumb.** Unlike
the winter bands, the summer-heat, water and frost character bands cannot be tied to any publication:
**no source defines "X hot days ≥35 °C makes a block hot", "Y mm of water deficit makes it dry", or
"Z frost days makes it frost-prone".** These breakpoints are app-defined rules of thumb only,
consistent with how `summer.hotDaysTolerated` is handled for crops in this document — i.e. flagged as
having **no citable source** (see the "Values that could NOT be sourced credibly" caveat, where
`hotDaysTolerated` is marked UNSOURCED for all 10 crops, and the UniMelb Pursuit article is noted as
confirming heat/sunburn risk is real but publishing no day-count threshold). No sources are invented
for the summer/water/frost bands; they stand or fall as the app's own defensible judgement.
