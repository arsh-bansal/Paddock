# Timeline and "Will it pay?"

Added after mentor feedback: growers decide on money, and trees take years to start cropping.

## Timeline (every crop card)

"Plant 2026, first crop around 2030 (usually 2-5 years), full crop around …", from each crop's
`bearing` entry in `shared/crops.data.json` (years to first crop and to full production, with a
source on every crop). Where no source gives full-production timing (most pome and stone fruit),
the app assumes full crop 3 years after first crop and **says so**.

| Crop | First crop (years) | Full crop (years) | Source |
|---|---|---|---|
| Apple, apricot | 2-5 | not sourced | Kansas State University Extension (US general guidance) |
| Peach / nectarine | 2-4 | 6-10 | K-State; Cummins Nursery (peak years 6-10) |
| Plum | 3-6 | not sourced | K-State |
| Pear | 4-6 | not sourced | K-State |
| Sweet cherry | 4-7 | not sourced | K-State |
| Almond | 3-4 | 7-8 | The Farmer Magazine (Australian industry); AgWest Farm Credit |
| Pistachio | 5-7 | 10-14 | AgWest Farm Credit; Wikifarmer |
| Walnut | 4-6 | 11-12 | NSW DPIRD |
| Blueberry | 3-4 | 5-7 | UC Small Farms Network; University of Maine Extension |
| Grapes | 3 | 5-6 | Oregon State University Extension |

The fruit-tree figures are general US guidance, often for home orchards; modern high-density
Australian orchards on dwarfing rootstocks can bear earlier. They're marked indicative and growers
can change the years in the money panel.

## Will it pay? (optional, per crop)

The grower enters **their own** price ($/kg), full-crop yield (t/ha), planting cost and yearly
running cost ($/ha), and how much of a crop they'd lose in a bad year (default 50%, their estimate).
Paddock supplies no prices, yields or costs: they vary too much by variety, district and market.

Per hectare, planting year 2026 to 2045:
- Costs: planting cost in year 0, running cost every year.
- Income: none before first crop, ramping evenly to full crop, then full yield x price.
- **With climate risk:** income x (1 - chance of a bad year x loss share). The chance of a bad year
  comes from the crop's projected results: winter chill falls short, or damaging frost at
  flowering (treated as independent; unscored seasons don't count).

Shows the pay-back year with and without climate risk, the running total by 2045, and a chart.
It's a planning sketch: no tax, interest, inflation or price changes, and frost risk may be
understated (district estimate). Figures are saved with reports and included in the PDF.

Code: `shared/finance.ts` (pure, tested in `tests/finance.test.ts`), wording shared by screen and
PDF in `src/lib/moneyText.ts`, UI in `src/components/MoneyPanel.tsx`.

## Replanting framing

The start screen and the PDF now speak to growers replanting after fire, flood, drought, disease or
old trees: the moment a grower can actually change crops.
