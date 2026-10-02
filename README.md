 # Paddock

**A tree planted this winter is still cropping in 2045.** Paddock shows Victorian orchardists how winter chill and summer heat are changing at their block, and which crops will still fit the climate they'll actually grow in.

Built for Climathon 2026, theme *Build for 2035*, COP31 priority: **Awareness Across All Areas** (helping farmers adapt to a changing climate and making climate knowledge accessible).

## The problem

Stone fruit, cherries, apples and pears need a certain amount of winter cold ("chill") to flower and fruit properly. Winters are warming. A grower replanting a block today is making a 20-year bet on a climate they can't see, and the wrong variety means patchy flowering and poor crops for the life of the trees. Climate projections exist, but not in a form that answers "what should I plant on this block?"

## What it does

1. **Pick the block.** Preset orchard districts (Shepparton, Cobram, Harcourt, Wandin North, Bacchus Marsh, Swan Hill), phone location, or coordinates.
2. **Pick the options.** Crop types with indicative chill needs, or the exact figure from the nursery.
3. **Get the answer.**
   - Real winter chill for every year 1995–2025, and the projected range for 2026–2045.
   - A verdict per option (good fit, risky, poor fit) and the share of winters with enough chill, then and now.
   - Hot days (≥35 °C) per summer, then and projected.
   - A plain-English summary written by Gemini from the computed numbers only.
   - Practical ways to reduce the risk.
4. **Check a tree.** Photo triage for heat, water stress, pests and disease using Gemini vision.

Everything is computed from real data at request time. Nothing is hardcoded.

## How it works

| Step | Method | Source |
|---|---|---|
| Observed daily min/max, 1995–2025 | ERA5 reanalysis | Open-Meteo Historical Weather API |
| Projected warming to 2026–2045 | 3 CMIP6 HighResMIP models (EC-Earth3P-HR, MPI-ESM1-2-XR, MRI-AGCM3-2-S) | Open-Meteo Climate API |
| Future winters | Delta change: each model's monthly warming added to the real 1995–2014 record | — |
| Hourly temperatures | Linvill (1990) day-length method, as in the chillR package | — |
| Chill | Chill Hours (0–7.2 °C) for scoring, Chill Portions (Dynamic Model) as a cross-check | — |
| Verdict | "Safe winter chill": the 10th percentile of winters (Luedeling et al. 2009) | — |

The chill engine is in `shared/chill.ts` and covered by unit tests in `tests/`.

**Check the citations above before using them in the pitch.** They were written from memory without a database lookup.

## Architecture

```
Browser (React 19 + Tailwind 4 + Recharts)
   │  /api/*
   ▼
Express 5 server (Node 20+)
   ├─ /api/climate   → Open-Meteo (archive + climate) → chill/heat analysis
   │                    disk + memory cache in data/cache/
   ├─ /api/explain   → Gemini (plain-English brief, numbers supplied by us)
   ├─ /api/diagnose  → Gemini vision (JSON schema, validated with zod)
   └─ serves dist/ in production
```

The Gemini key never reaches the browser. Inputs are validated with zod, AI and climate endpoints are rate limited, and photos are downscaled in the browser before upload.

## Running it

```bash
npm install
cp .env.example .env        # add GEMINI_API_KEY (optional: the planner works without it)
npm run dev                 # web on :3000, API on :8787
```

Production:

```bash
npm run build
npm start                   # serves app + API on :8787
```

Other scripts: `npm test`, `npm run lint`, `npm run snapshot` (pre-fetch climate data for all preset districts into `data/cache/` so the demo works offline).

## Limitations (say these out loud, judges respect it)

- Three models and one emissions pathway (HighResMIP future runs follow a high-emissions pathway; verify this) don't span the full range of futures.
- The grid is roughly 10–25 km, so frost hollows, slopes and aspect on a specific block can differ.
- **Crop chill ranges in `shared/crops.ts` are indicative classes, not sourced cultivar figures.** Replace them before demo day.
- Chill Hours is a crude model in warm climates; Chill Portions are shown as a cross-check.
- The photo check is triage, not diagnosis.

## Licence and data

Weather and climate data from [Open-Meteo.com](https://open-meteo.com/) under CC BY 4.0 (attribution is in the app footer). Check Open-Meteo's terms if this ever goes commercial. Add a licence for this code before public release.
