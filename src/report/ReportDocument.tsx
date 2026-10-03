import {
  Circle,
  Document,
  Line,
  Page,
  Polyline,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import type { CropEvaluation, SeasonVerdict } from "../../shared/seasons";
import type { ClimateAnalysis } from "../../shared/types";
import { adaptationNotes } from "../lib/adaptation";
import { describeGrown, groupForRegion, grownFor, type RegionCrops } from "../../shared/regionCrops";
import {
  changeTone,
  describeSeason,
  formatChange,
  requirementText,
  SEASON_LABEL,
  seasonRows,
  withUnit,
} from "../lib/seasonRows";

/*
 * One- to three-page grower report. Uses the PDF built-in Helvetica so it renders
 * identically on every device with no font downloads; text sticks to characters
 * that font supports (no ≥, ✓ or typographic minus).
 */

export interface ReportInput {
  analysis: ClimateAnalysis;
  /** All evaluated crops, in rankCrops order */
  crops: CropEvaluation[];
  brief: string | null;
  /** The district's crop list, or null when the block isn't near a district we have data for */
  region: RegionCrops | null;
  /** Short place name for headings, e.g. "Shepparton" */
  placeName: string;
}

const C = {
  bark: "#2a231c",
  muted: "#5b5e55",
  line: "#d8dbd0",
  paper: "#f7f8f3",
  leaf: "#2f5a3b",
  leafSoft: "#e3ece4",
  frost: "#3c6f8f",
  frostSoft: "#dfeaf1",
  sun: "#c9861b",
  sunInk: "#7c4f0b",
  sunSoft: "#f7ecd8",
  ember: "#9b2f23",
  emberSoft: "#f4e1dd",
};

const VERDICT: Record<
  SeasonVerdict,
  { label: string; fg: string; bg: string }
> = {
  viable: { label: "Good fit", fg: C.leaf, bg: C.leafSoft },
  "at-risk": { label: "Risky", fg: C.sunInk, bg: C.sunSoft },
  "not-viable": { label: "Poor fit", fg: C.ember, bg: C.emberSoft },
  "no-data": { label: "No data", fg: C.muted, bg: C.paper },
};

const s = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: C.bark,
  },
  // lineHeight is set per paragraph, never on the page or a wrapper: on the page it stops
  // page-number text rendering (react-pdf bug), and on a wrapper it inflates table rows.
  p: { fontSize: 9.5, lineHeight: 1.4 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", lineHeight: 1.15 },
  meta: { fontSize: 8.5, color: C.muted, marginTop: 4 },
  lead: { fontSize: 12, marginTop: 14, lineHeight: 1.45 },
  h2: {
    fontSize: 12.5,
    fontFamily: "Helvetica-Bold",
    marginTop: 18,
    marginBottom: 6,
  },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: C.muted },
  small: { fontSize: 8.5, color: C.muted, marginTop: 4, lineHeight: 1.35 },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
    paddingVertical: 3.5,
  },
  th: { fontSize: 8, color: C.muted },
  cSeason: { width: "14%" },
  cMeasure: { width: "41%" },
  cNum: { width: "15%", textAlign: "right" },
  card: {
    borderWidth: 0.75,
    borderColor: C.line,
    borderRadius: 4,
    padding: 9,
    marginBottom: 7,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  chip: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 8,
  },
  seasonRow: { flexDirection: "row", paddingVertical: 2 },
  seasonName: { width: 78, fontFamily: "Helvetica-Bold" },
  seasonText: { flex: 1 },
  seasonVerdict: { width: 70, textAlign: "right", fontSize: 8.5 },
  brief: { backgroundColor: C.frostSoft, padding: 10, borderRadius: 4 },
  noteGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  note: { width: "50%", paddingHorizontal: 4, marginBottom: 8 },
  footerRule: {
    position: "absolute",
    bottom: 38,
    left: 44,
    right: 44,
    borderTopWidth: 0.5,
    borderTopColor: C.line,
  },
  footerLeft: {
    position: "absolute",
    bottom: 24,
    left: 44,
    fontSize: 7.5,
    color: C.muted,
  },
  // react-pdf v4 drops page-number text that is absolutely positioned, so numbering lives in a running header.
  runHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: C.muted,
    marginBottom: 14,
    paddingBottom: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
  },
});

const int = (n: number) => Math.round(n).toLocaleString("en-AU");
const period = (p: readonly [number, number]) => `${p[0]}–${p[1]}`;
const toneColour = { good: C.leaf, bad: C.ember, neutral: C.muted } as const;

function ChillChart({
  analysis,
  crops,
}: {
  analysis: ClimateAnalysis;
  crops: CropEvaluation[];
}) {
  const W = 507;
  const H = 170;
  const pad = { l: 34, r: 8, t: 8, b: 18 };
  const x0 = 1995;
  const x1 = analysis.future.period[1];
  const chill = analysis.future.summary.chillPortions;
  const obs = analysis.observed.flatMap((y) =>
    y.winter ? [[y.year, y.winter.chillPortions] as const] : [],
  );
  // Crops whose winter isn't scored have no chill line to draw.
  const lined = crops.filter((c): c is CropEvaluation & { chillPortionsRequirement: number } => c.chillPortionsRequirement != null);
  const reqs = lined.map((c) => c.chillPortionsRequirement);
  const raw = Math.max(chill.p90, ...reqs, ...obs.map(([, v]) => v)) * 1.08;
  const step =
    [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((st) => raw / st <= 5) ?? 1000;
  const yMax = Math.ceil(raw / step) * step;
  const x = (yr: number) =>
    pad.l + ((yr - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
  const [f0, f1] = analysis.future.period;

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {Array.from({ length: yMax / step + 1 }, (_, i) => i * step).map((v) => (
        <Line
          key={v}
          x1={pad.l}
          x2={W - pad.r}
          y1={y(v)}
          y2={y(v)}
          stroke={C.line}
          strokeWidth={0.5}
        />
      ))}
      {Array.from({ length: yMax / step + 1 }, (_, i) => i * step).map((v) => (
        <Text
          key={`l${v}`}
          x={pad.l - 4}
          y={y(v) + 2.5}
          style={{ fontSize: 7 }}
          fill={C.muted}
          textAnchor="end"
        >
          {int(v)}
        </Text>
      ))}
      {[1995, 2005, 2015, 2025, 2035, 2045]
        .filter((yr) => yr <= x1)
        .map((yr) => (
          <Text
            key={yr}
            x={x(yr)}
            y={H - 4}
            style={{ fontSize: 7 }}
            fill={C.muted}
            textAnchor="middle"
          >
            {String(yr)}
          </Text>
        ))}
      <Rect
        x={x(f0)}
        y={pad.t}
        width={x(f1) - x(f0)}
        height={H - pad.t - pad.b}
        fill={C.frostSoft}
      />
      <Rect
        x={x(f0)}
        y={y(chill.p90)}
        width={x(f1) - x(f0)}
        height={y(chill.p10) - y(chill.p90)}
        fill={C.frost}
        fillOpacity={0.25}
      />
      <Line
        x1={x(f0)}
        x2={x(f1)}
        y1={y(chill.median)}
        y2={y(chill.median)}
        stroke={C.frost}
        strokeWidth={1.2}
        strokeDasharray="4 3"
      />
      {lined.map((c) => {
        const v = c.seasons.find((t) => t.season === "winter")!.verdict;
        return (
          <Line
            key={c.id}
            x1={pad.l}
            x2={W - pad.r}
            y1={y(c.chillPortionsRequirement)}
            y2={y(c.chillPortionsRequirement)}
            stroke={VERDICT[v].fg}
            strokeWidth={0.9}
            strokeDasharray="1.5 2"
          />
        );
      })}
      <Polyline
        points={obs.map(([yr, v]) => `${x(yr)},${y(v)}`).join(" ")}
        stroke={C.frost}
        strokeWidth={0.9}
        fill="none"
      />
      {obs.map(([yr, v]) => (
        <Circle key={yr} cx={x(yr)} cy={y(v)} r={1.6} fill={C.frost} />
      ))}
    </Svg>
  );
}

/** One crop's result card (overall verdict + the three seasons). */
function CropCardPdf({ c, local }: { c: CropEvaluation; local?: string | null }) {
  return (
    <View style={s.card} wrap={false}>
            <View style={s.cardHead}>
              <Text
                style={s.bold}
              >{`${c.label}: ${requirementText(c)}`}</Text>
              <Text
                style={[
                  s.chip,
                  {
                    color: VERDICT[c.overall].fg,
                    backgroundColor: VERDICT[c.overall].bg,
                  },
                ]}
              >
                {VERDICT[c.overall].label}
              </Text>
            </View>
            {local && <Text style={[s.small, { marginTop: 0, marginBottom: 3, color: C.leaf }]}>{local}</Text>}
            {c.seasons.map((t) => (
              <View key={t.season} style={s.seasonRow}>
                <Text style={s.seasonName}>{SEASON_LABEL[t.season]}</Text>
                <Text style={s.seasonText}>{describeSeason(t)}</Text>
                <Text
                  style={[s.seasonVerdict, { color: VERDICT[t.verdict].fg }]}
                >{`${VERDICT[t.verdict].label}${t.indicative ? "*" : ""}`}</Text>
              </View>
            ))}
            <Text style={s.small}>{`Heat risk: ${c.heatNote}`}</Text>
          </View>
  );
}

export function ReportDocument({ analysis, crops, brief, region, placeName }: ReportInput) {
  const rows = seasonRows(analysis);
  // `crops` arrive already ranked by rankCrops (shared/ranking.ts); keep that order.
  const sorted = crops;
  const notes = adaptationNotes(analysis, crops);
  const b = analysis.baseline.summary.chillPortions.median;
  const f = analysis.future.summary.chillPortions.median;
  const change = Math.round(((f - b) / b) * 100);
  const loc = analysis.location;
  const generated = new Date(analysis.generatedAt).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const groups = groupForRegion(sorted, region);
  const best = (region ? groups.grownToday : sorted).find((c) => c.overall === "viable");
  const anyIndicative = crops.some((c) => c.seasons.some((t) => t.indicative));

  return (
    <Document
      title={`Paddock report: ${loc.label}`}
      author="Paddock"
      subject="Orchard climate report"
      language="en-AU"
    >
      <Page size="A4" style={s.page}>
        <View style={s.runHead} fixed>
          <Text style={{ fontFamily: "Helvetica-Bold", color: C.leaf }}>
            Paddock orchard climate report
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${loc.label}, page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
        <View style={s.footerRule} fixed />
        <Text style={s.footerLeft} fixed>
          Weather and climate data: Open-Meteo.com (CC BY 4.0), ERA5 and CMIP6
          HighResMIP.
        </Text>
        <Text style={s.title}>{loc.label}</Text>
        <Text style={s.meta}>
          {`Latitude ${loc.lat.toFixed(2)}, longitude ${loc.lon.toFixed(2)}${loc.elevation != null ? `, elevation ${Math.round(loc.elevation)} m` : ""}. Climate data prepared ${generated}.`}
        </Text>

        <Text style={s.lead}>
          {`A typical winter here gave about ${int(b)} chill portions (the Dynamic Model measure Australian fruit research uses) in ${period(analysis.baseline.period)}. For ${period(analysis.future.period)}, the years a tree planted now spends cropping, it is projected at about ${int(f)}${change < 0 ? `, ${Math.abs(change)}% less` : change > 0 ? `, ${change}% more` : ""}.`}
          {best
            ? region
              ? ` Best fit of the crops grown here today: ${best.label}.`
              : ` Best climate fit of the crops checked: ${best.label}.`
            : " None of the options checked is a good climate fit in every season."}
        </Text>

        <Text style={s.h2}>Season by season</Text>
        <View style={[s.tr, { borderBottomColor: C.bark }]}>
          <Text style={[s.th, s.cSeason]}>Season</Text>
          <Text style={[s.th, s.cMeasure]}>What we measured</Text>
          <Text style={[s.th, s.cNum]}>{period(analysis.baseline.period)}</Text>
          <Text style={[s.th, s.cNum]}>{period(analysis.future.period)}</Text>
          <Text style={[s.th, s.cNum]}>Change</Text>
        </View>
        {rows.map((r, i) => (
          <View key={r.measure} style={s.tr} wrap={false}>
            <Text style={[s.cSeason, s.bold]}>
              {i === 0 || rows[i - 1].season !== r.season ? r.season : ""}
            </Text>
            <Text style={s.cMeasure}>{r.measure}</Text>
            <Text style={s.cNum}>{withUnit(r.then, r.digits, r.unit)}</Text>
            <Text style={[s.cNum, s.bold]}>
              {withUnit(r.projected, r.digits, r.unit)}
            </Text>
            <Text style={[s.cNum, { color: toneColour[changeTone(r)] }]}>
              {formatChange(r, "-")}
            </Text>
          </View>
        ))}
        <Text style={s.small}>
          Location averages, not crop-specific. Frost is a district estimate from
          a 10–25 km grid that undercounts cold nights; frost hollows get more.
        </Text>

        <View wrap={false}>
          <Text style={s.h2}>Winter chill portions, past and projected</Text>
          <ChillChart analysis={analysis} crops={crops} />
          <Text style={s.small}>
            {`Dots: real winters (chill portions, April to September). Shaded band: likely range of winters in ${period(analysis.future.period)} across ${analysis.future.models.length} climate models, with the dashed line the typical winter. Dotted lines: each crop's chill need, coloured by its winter result.`}
          </Text>
        </View>

        {region ? (
          <>
            <Text style={s.h2} break>{`Grown around ${placeName} today`}</Text>
            <Text style={[s.muted, { marginBottom: 6 }]}>
              {`How the crops this district grows now hold up through ${period(analysis.future.period)}. Each crop is judged on the season that troubles it most.${region.indicative ? " Preliminary list of local crops, to be replaced with ABS farm census figures." : " Local crops and amounts: ABS Agricultural Census 2020-21; small-area figures are estimates, so treat amounts as approximate."}`}
            </Text>
            {groups.grownToday.length > 0 ? (
              groups.grownToday.map((c) => {
                const items = grownFor(region, c.id).flatMap((g) => {
                  const d = describeGrown(g);
                  return d ? [grownFor(region, c.id).length > 1 ? `${g.name.toLowerCase()} ${d}` : d] : [];
                });
                return <CropCardPdf key={c.id} c={c} local={items.length ? `Grown here: ${items.join("; ")}.` : null} />;
              })
            ) : (
              <Text style={s.muted}>
                {region.grownToday.length === 0 && region.note ? region.note : "None of the main local crops are in our climate database yet."}
              </Text>
            )}
            {groups.grownNoData.length > 0 && (
              <Text style={[s.small, { marginBottom: 4 }]}>
                {`Also grown here, not yet scored (no climate thresholds yet): ${groups.grownNoData
                  .map((x) => (describeGrown(x) ? `${x.name} (${describeGrown(x)})` : x.name))
                  .join(", ")}.`}
              </Text>
            )}
            <View wrap={false}>
              <Text style={s.h2}>Could also suit this area</Text>
              <Text style={[s.muted, { marginBottom: 6 }]}>Crops not commonly grown here whose climate fit still works, best fit first.</Text>
              {groups.couldSuit[0] ? <CropCardPdf c={groups.couldSuit[0]} /> : <Text style={s.muted}>No other crop in our database is a good or risky fit here.</Text>}
            </View>
            {groups.couldSuit.slice(1).map((c) => <CropCardPdf key={c.id} c={c} />)}
            {groups.struggles.length > 0 && (
              <View wrap={false}>
                <Text style={s.h2}>Struggles here</Text>
                {groups.struggles.map((c) => (
                  <View key={c.id} style={s.seasonRow}>
                    <Text style={[s.seasonText, s.bold]}>{c.label}</Text>
                    <Text style={[s.seasonVerdict, { width: 90, color: VERDICT[c.overall].fg }]}>{VERDICT[c.overall].label}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={s.h2} break>{`How each crop fares at ${placeName}`}</Text>
            <Text style={[s.muted, { marginBottom: 6 }]}>
              Best fit first. Each crop is judged on the season that troubles it most.
            </Text>
            {sorted.map((c) => <CropCardPdf key={c.id} c={c} />)}
          </>
        )}
        {anyIndicative && (
          <Text style={s.small}>
            * Indicative: the threshold was converted between chill measures or
            comes from a non-Australian source. Confirm with your nursery.
          </Text>
        )}

        {brief && (
          <View wrap={false}>
            <Text style={s.h2}>In plain words</Text>
            <View style={s.brief}>
              <Text style={s.p}>
                {brief.replace(
                  /[≥≤−✓]/g,
                  (ch) =>
                    ({ "≥": ">=", "≤": "<=", "−": "-", "✓": "" })[ch] ?? "",
                )}
              </Text>
            </View>
            <Text style={s.small}>
              Written by Gemini from the figures in this report only.
            </Text>
          </View>
        )}

        {notes.length > 0 && (
          <View wrap={false}>
            <Text style={s.h2}>Ways to reduce the risk</Text>
            <View style={s.noteGrid}>
              {notes.map((n) => (
                <View key={n.key} style={s.note}>
                  <Text style={s.bold}>{n.title}</Text>
                  {n.lines.map((l) => (
                    <Text key={l} style={[s.p, { marginTop: 2 }]}>
                      {l}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </View>
        )}

        <View wrap={false}>
          <Text style={s.h2}>How this was worked out</Text>
          <Text style={s.p}>
            {`Observed daily temperature and rainfall (${analysis.observed[0]?.year}–${analysis.observed.at(-1)?.year}) are ERA5 reanalysis from the Open-Meteo Historical Weather API. Future seasons apply each climate model's monthly change between ${period(analysis.baseline.period)} and ${period(analysis.future.period)} to the real ${period(analysis.baseline.period)} record (delta change), using ${analysis.future.models.length} CMIP6 HighResMIP models from the Open-Meteo Climate API: ${analysis.future.models.map((m) => m.model.replaceAll("_", "-")).join(", ")}.`}
          </Text>
          <Text style={[s.p, { marginTop: 4 }]}>
            Winter is scored in chill portions (Dynamic Model), from hourly
            temperatures rebuilt from daily min and max. Requirements published
            in chill hours are converted with Brunt et al. (2017, Hort
            Innovation) Table 1. A crop is a good winter fit if a poor winter
            (worst 1 in 10) meets its need, and a good spring fit if damaging
            frost at flowering happens in no more than 1 year in 10. Summer heat
            is reported but not scored until a published heat limit exists for
            the crop. Water shortfall uses Hargreaves evaporation minus rainfall.
          </Text>
          <Text style={[s.p, { marginTop: 4 }]}>
            Limits: three models and one emissions pathway do not cover every
            possible future; the 10–25 km grid smooths out cold nights, so spring
            frost is underestimated, especially in frost hollows; flowering dates are fixed and do not yet shift earlier with
            warming. These are projections to guide a decision, not a guarantee.
            Check variety choices with your nursery or an Agriculture Victoria
            adviser.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
