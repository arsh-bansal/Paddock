import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FileDown, Save } from "lucide-react";
import { cropLabel, defaultRequirement, type CropOption } from "../../shared/crops";
import { badYearChance, emptyFinanceInputs, timelineFor } from "../../shared/finance";
import { rankCrops } from "../../shared/ranking";
import { regionForLocation, groupForRegion, type RegionCrops } from "../../shared/regionCrops";
import { waterForRegion, waterOutlook } from "../../shared/regionWater";
import { REGION_PRESETS } from "../../shared/regions";
import { evaluateCrop, type CropEvaluation } from "../../shared/seasons";
import type { ClimateAnalysis } from "../../shared/types";
import { fetchClimate } from "../lib/api";
import { fmtInt, pctChange } from "../lib/format";
import { initialOptionState, type OptionState } from "../lib/optionState";
import { loadReport, saveReport } from "../lib/savedReports";
import { useCombinedCrops } from "../lib/useCombinedCrops";
import { downloadReport } from "../report/download";
import { cropNotes } from "../lib/moneyText";
import { switchReport } from "../lib/switchText";
import { AdaptationNotes } from "./AdaptationNotes";
import { AddCropForm } from "./AddCropForm";
import { Brief, briefSignature, type BriefState } from "./Brief";
import { SeasonCharts } from "./SeasonCharts";
import { CropResults, type VarietyControl } from "./CropResults";
import type { FinanceControl } from "./MoneyPanel";
import { LocationPicker, type PickedLocation } from "./LocationPicker";
import { Methods } from "./Methods";
import { SavedReports } from "./SavedReports";
import { SeasonsPanel } from "./SeasonsPanel";
import { SwitchPanel } from "./SwitchPanel";
import { emptyOtherCrop, type OtherCrop } from "../../shared/switching";
import { WaterPanel } from "./WaterPanel";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`} className="grid gap-4 sm:grid-cols-[3rem_1fr]">
      <span aria-hidden className="font-display text-4xl font-extrabold leading-none text-leaf/40">
        {n}
      </span>
      <div className="min-w-0 space-y-4">
        <h2 id={`step-${n}`} className="text-2xl font-bold">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

/** Evaluate every included crop and order best-fit-first. */
function evaluateAll(crops: CropOption[], analysis: ClimateAnalysis, options: OptionState): CropEvaluation[] {
  const evaluated = crops
    .filter((c) => options[c.id]?.selected ?? true)
    .map((c) => {
      const hours = options[c.id]?.requirement ?? defaultRequirement(c);
      return evaluateCrop(c, cropLabel(c), analysis.baseline.years, analysis.future.years, {
        // Only an edited figure is an override; the untouched default scores on the crop's own
        // (possibly directly sourced) chill-portions requirement.
        chillHoursOverride: hours !== defaultRequirement(c) ? hours : undefined,
      });
    });
  return rankCrops(evaluated);
}

/** Same spot as the analysis? The server rounds coordinates to 2 dp (~1 km), so compare at that. */
function sameSpot(a: { lat: number; lon: number }, b: { lat: number; lon: number }): boolean {
  return a.lat.toFixed(2) === b.lat.toFixed(2) && a.lon.toFixed(2) === b.lon.toFixed(2);
}

/** Crops sent to the AI brief are capped to stay within /api/explain's max(25). */
const BRIEF_CROP_CAP = 25;
/** Lines drawn on the chill chart when the district has no crop list. */
const CHART_TOP_N = 5;

/** Each crop's money figures, for the PDF. */
function financeById(options: OptionState) {
  return Object.fromEntries(Object.entries(options).map(([id, o]) => [id, o.finance]));
}

/** The best overall crop, if it is a good fit. */
function topCrop(crops: CropEvaluation[]): string | null {
  const best = crops[0];
  return best && best.overall === "viable" ? best.label : null;
}

/**
 * Reconcile saved/previous settings with the CURRENT crop list (built-ins + user crops): known ids
 * keep their settings, new ids get defaults, ids no longer in the list are dropped.
 */
function mergeOptions(crops: CropOption[], saved: OptionState): OptionState {
  return Object.fromEntries(
    crops.map((c) => [c.id, saved[c.id] ?? { selected: true, requirement: defaultRequirement(c) }]),
  );
}

/** Short name for headings: the preset town, the nearest district's town, or the location label. */
function placeNameFor(loc: { lat: number; lon: number; label: string; presetId?: string }, region: RegionCrops | null): string {
  const preset = REGION_PRESETS.find((p) => p.id === (loc.presetId ?? region?.presetId));
  if (loc.presetId && preset) return preset.name;
  if (region && preset) return `your block (near ${preset.name})`;
  return loc.label === "Your block" ? "your block" : loc.label;
}

/** Crops whose chill need is drawn on the chart: the district's crops, else the top few. */
function chartCrops(ranked: CropEvaluation[], region: RegionCrops | null): CropEvaluation[] {
  const grown = groupForRegion(ranked, region).grownToday;
  return grown.length > 0 ? grown : ranked.slice(0, CHART_TOP_N);
}

export function Planner({ aiEnabled }: { aiEnabled: boolean }) {
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [options, setOptions] = useState<OptionState>(initialOptionState);
  const [analysis, setAnalysis] = useState<ClimateAnalysis | null>(null);
  const [brief, setBrief] = useState<BriefState | null>(null);
  const [currentCropId, setCurrentCropId] = useState<string | null>(null);
  const [compareCropId, setCompareCropId] = useState<string | null>(null);
  const [otherCrop, setOtherCrop] = useState<OtherCrop>(emptyOtherCrop);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [savedListKey, setSavedListKey] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  // The crop list: built-ins (synchronous) + the grower's own crops (async, from this device).
  const { combined, userCrops, status, error: cropsError, addCrop, editCrop, removeCrop } = useCombinedCrops();

  // Give crops that appear later (user crops loading or being added) default settings.
  useEffect(() => {
    setOptions((prev) => {
      const next = mergeOptions(combined, prev);
      const same =
        Object.keys(next).length === Object.keys(prev).length &&
        Object.keys(next).every(
          (id) => prev[id] && prev[id].selected === next[id].selected && prev[id].requirement === next[id].requirement,
        );
      return same ? prev : next;
    });
  }, [combined]);

  const ranked = useMemo(() => (analysis ? evaluateAll(combined, analysis, options) : []), [combined, analysis, options]);
  const briefCrops = useMemo(() => ranked.slice(0, BRIEF_CROP_CAP), [ranked]);

  // The location the results describe: the picked one when it matches, else the analysis's own.
  const resultLoc = analysis
    ? location && sameSpot(location, analysis.location)
      ? location
      : { ...analysis.location, presetId: undefined }
    : null;
  const region = useMemo(() => (resultLoc ? regionForLocation(resultLoc) : null), [resultLoc?.lat, resultLoc?.lon, resultLoc?.presetId]);
  const placeName = resultLoc ? placeNameFor(resultLoc, region) : "";
  const water = waterForRegion(region?.presetId);
  const outlook = analysis ? waterOutlook(analysis, water) : null;

  const signature = analysis ? briefSignature(analysis, briefCrops) : null;
  const currentBrief = brief && brief.signature === signature ? brief.text : null;
  const isSaved = signature != null && savedSignature === `${signature}|${currentBrief ?? ""}`;

  const run = async (target?: PickedLocation) => {
    const loc = target ?? location;
    if (!loc) return;
    setLoading(true);
    setError(null);
    try {
      setAnalysis(await fetchClimate(loc.lat, loc.lon, loc.label));
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setAnalysis(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Picking a preset district runs straight away (its climate is pre-cached, so no live API call).
  // A map pin, GPS or typed coordinates wait for "Check this location", because each new spot
  // costs live API calls. The ref absorbs StrictMode's double-invoke so a preset runs once.
  const autoRanPresetKey = useRef<string | null>(null);
  const analysisRef = useRef<ClimateAnalysis | null>(null);
  analysisRef.current = analysis;
  const presetKey = location?.presetId ? `${location.presetId}:${location.lat.toFixed(2)},${location.lon.toFixed(2)}` : null;
  useEffect(() => {
    if (!presetKey || !location?.presetId) return;
    if (autoRanPresetKey.current === presetKey) return;
    if (analysisRef.current && sameSpot(analysisRef.current.location, location)) {
      autoRanPresetKey.current = presetKey;
      return;
    }
    autoRanPresetKey.current = presetKey;
    void run(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey]);

  const varietyFor = (c: CropEvaluation): VarietyControl | undefined => {
    const crop = combined.find((x) => x.id === c.id);
    // No winter requirement (e.g. grapevines): there's no chill figure to adjust.
    if (!crop || !crop.winter) return undefined;
    const defaultHours = defaultRequirement(crop);
    return {
      hours: options[c.id]?.requirement ?? defaultHours,
      defaultHours,
      onChange: (hours) =>
        // Keep the crop's other settings (e.g. the grower's money figures) when changing chill hours.
        setOptions((prev) => ({
          ...prev,
          [c.id]: { ...(prev[c.id] ?? { selected: true, requirement: defaultHours }), requirement: hours },
        })),
    };
  };

  const financeFor = (c: CropEvaluation): FinanceControl | undefined => {
    const crop = combined.find((x) => x.id === c.id);
    if (!crop || !analysis) return undefined;
    const inputs = options[c.id]?.finance ?? emptyFinanceInputs();
    return {
      inputs,
      onChange: (next) =>
        setOptions((prev) => ({
          ...prev,
          [c.id]: { ...(prev[c.id] ?? { selected: true, requirement: defaultRequirement(crop) }), finance: next },
        })),
      timeline: timelineFor(crop, analysis.future.period[0], inputs),
      endYear: analysis.future.period[1],
      badYearChance: badYearChance(c),
    };
  };

  const download = async (
    input: {
      analysis: ClimateAnalysis;
      crops: CropEvaluation[];
      brief: string | null;
      region: RegionCrops | null;
      placeName: string;
      notes?: ReturnType<typeof cropNotes>;
      switching?: ReturnType<typeof switchReport>;
    },
    busyKey: string,
  ) => {
    setPdfBusy(busyKey);
    setActionError(null);
    try {
      await downloadReport(input);
    } catch (e) {
      console.error(e);
      setActionError("The PDF couldn’t be made. Try again, or save the report and download it later.");
    } finally {
      setPdfBusy(null);
    }
  };

  const save = async () => {
    if (!analysis || ranked.length === 0) return;
    setActionError(null);
    try {
      const loc = location && sameSpot(location, analysis.location) ? location : { ...analysis.location };
      await saveReport(
        { location: loc, options, analysis, brief: currentBrief ? brief : null, currentCropId, otherCrop },
        { topCrop: topCrop(ranked), cropCount: ranked.length },
      );
      setSavedSignature(`${signature}|${currentBrief ?? ""}`);
      setSavedListKey((k) => k + 1);
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const openSaved = async (id: string) => {
    setActionError(null);
    try {
      const res = await loadReport(id);
      if (!res.ok) {
        setActionError(
          res.reason === "outdated"
            ? "That report was saved by an older version of Paddock. Run the check again."
            : "That report is no longer on this device.",
        );
        setSavedListKey((k) => k + 1);
        return;
      }
      const r = res.report;
      const opts = mergeOptions(combined, r.options);
      setLocation(r.location);
      setOptions(opts);
      setAnalysis(r.analysis);
      setBrief(r.brief);
      setCurrentCropId(r.currentCropId ?? null);
      setOtherCrop(r.otherCrop ?? emptyOtherCrop());
      setCompareCropId(null);
      setError(null);
      const sig = briefSignature(r.analysis, evaluateAll(combined, r.analysis, opts).slice(0, BRIEF_CROP_CAP));
      setSavedSignature(`${sig}|${r.brief?.signature === sig ? r.brief.text : ""}`);
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const downloadSaved = async (id: string) => {
    try {
      const res = await loadReport(id);
      if (!res.ok) {
        setActionError("That report can’t be opened. Run the check again.");
        return;
      }
      const r = res.report;
      const savedOptions = mergeOptions(combined, r.options);
      const savedRanked = evaluateAll(combined, r.analysis, savedOptions);
      const sig = briefSignature(r.analysis, savedRanked.slice(0, BRIEF_CROP_CAP));
      const savedRegion = regionForLocation(r.location);
      await download(
        {
          analysis: r.analysis,
          crops: savedRanked,
          brief: r.brief?.signature === sig ? r.brief.text : null,
          region: savedRegion,
          placeName: placeNameFor(r.location, savedRegion),
          notes: cropNotes(savedRanked, combined, financeById(savedOptions), r.analysis.future.period[0], r.analysis.future.period[1]),
          switching: switchReport(r.currentCropId ?? null, null, savedRanked, combined, financeById(savedOptions), r.analysis.future.period, r.otherCrop ?? null, savedRegion),
        },
        id,
      );
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const needsManualRun = location && !location.presetId && (!analysis || !sameSpot(analysis.location, location));
  const showingStale = analysis && location && !sameSpot(analysis.location, location) && !loading;
  const change = analysis
    ? pctChange(analysis.baseline.summary.chillPortions.median, analysis.future.summary.chillPortions.median)
    : 0;

  return (
    <div className="space-y-12">
      <SavedReports refreshKey={savedListKey} onOpen={openSaved} onDownload={downloadSaved} busyId={pdfBusy} />

      <Step n={1} title="Where’s the block?">
        <LocationPicker value={location} onChange={setLocation} />
        {needsManualRun && (
          <button
            type="button"
            onClick={() => void run()}
            disabled={loading}
            className="rounded-xl bg-leaf px-6 py-3 text-lg font-bold text-white shadow-sm hover:bg-leaf/90 disabled:opacity-40"
          >
            {loading ? "Checking 50 years of climate…" : "Check this location"}
          </button>
        )}
        {loading && location?.presetId && <p className="text-muted" aria-live="polite">Checking 50 years of climate…</p>}
        {error && (
          <p role="alert" className="rounded-lg bg-ember-soft px-4 py-3 text-ember">
            {error}
          </p>
        )}
      </Step>

      {analysis && resultLoc && (
        <div ref={resultsRef} className="scroll-mt-6">
          <Step n={2} title={`What suits ${placeName}`}>
            <div className="reveal space-y-8" aria-live="polite">
              {showingStale && (
                <p className="rounded-lg bg-sun-soft px-4 py-3 text-sun-ink">
                  These results are for {analysis.location.label} ({analysis.location.lat.toFixed(2)},{" "}
                  {analysis.location.lon.toFixed(2)}).
                  {location!.presetId ? " Loading the new location…" : " Press “Check this location” to update."}
                </p>
              )}
              <div className="space-y-2">
                <p className="max-w-[62ch] text-xl leading-snug">
                  A typical winter here gave about{" "}
                  <strong className="tabular">{fmtInt(analysis.baseline.summary.chillPortions.median)}</strong> chill portions in{" "}
                  {analysis.baseline.period[0]}–{analysis.baseline.period[1]}. For {analysis.future.period[0]}–
                  {analysis.future.period[1]}, the years a tree planted now spends cropping, it’s projected at about{" "}
                  <strong className="tabular">{fmtInt(analysis.future.summary.chillPortions.median)}</strong>
                  {change < 0 ? `, ${Math.abs(change)}% less.` : change > 0 ? `, ${change}% more.` : ", about the same."}
                </p>
                <p className="max-w-[62ch] text-sm text-muted">
                  Chill portions are the winter-chill measure Australian fruit research uses (Dynamic Model). Nurseries often
                  quote chill hours instead; we convert those for you.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-3">
                <button
                  type="button"
                  disabled={pdfBusy === "current" || ranked.length === 0}
                  onClick={() =>
                    download(
                      {
                        analysis,
                        crops: ranked,
                        brief: currentBrief,
                        region,
                        placeName,
                        notes: cropNotes(ranked, combined, financeById(options), analysis.future.period[0], analysis.future.period[1]),
                        switching: switchReport(currentCropId, compareCropId, ranked, combined, financeById(options), analysis.future.period, otherCrop, region),
                      },
                      "current",
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-bark px-4 py-2 font-bold text-white disabled:opacity-50"
                >
                  <FileDown size={18} aria-hidden /> {pdfBusy === "current" ? "Making PDF…" : "Download PDF report"}
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={isSaved || ranked.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 font-bold hover:border-leaf disabled:border-leaf disabled:text-leaf"
                >
                  {isSaved ? <Check size={18} aria-hidden /> : <Save size={18} aria-hidden />}{" "}
                  {isSaved ? "Saved on this device" : "Save on this device"}
                </button>
                <span className="text-sm text-muted">
                  {currentBrief ? "Includes your plain-words summary." : "Write a summary below first to include it."}
                </span>
              </div>
              {actionError && (
                <p role="alert" className="rounded-lg bg-ember-soft px-4 py-3 text-ember">
                  {actionError}
                </p>
              )}

              <SwitchPanel
                ranked={ranked}
                crops={combined}
                currentId={currentCropId}
                onCurrent={(id) => {
                  setCurrentCropId(id);
                  setCompareCropId(null);
                }}
                compareId={compareCropId}
                onCompare={setCompareCropId}
                varietyFor={varietyFor}
                financeFor={financeFor}
                period={analysis.future.period}
                other={otherCrop}
                onOther={setOtherCrop}
                region={region}
              />

              <CropResults ranked={ranked} region={region} placeName={placeName} varietyFor={varietyFor} financeFor={financeFor} />

              <WaterPanel water={water} outlook={outlook} period={analysis.future.period} placeName={placeName} />

              <AddCropForm
                userCrops={userCrops}
                status={status}
                loadError={cropsError}
                onAdd={addCrop}
                onEdit={editCrop}
                onDelete={removeCrop}
              />

              <SeasonsPanel analysis={analysis} />
              <SeasonCharts analysis={analysis} crops={chartCrops(ranked, region)} placeName={placeName} />
              <Brief
                analysis={analysis}
                crops={briefCrops}
                grownHere={region ? groupForRegion(ranked, region).grownToday.map((c) => c.label) : []}
                water={
                  outlook
                    ? {
                        orchardIrrigationMlPerHa: water?.orchards?.mlPerHa ?? null,
                        shortfallChangeMm: Math.round(outlook.shortfallChangeMm),
                        extraMlPerHa: Math.round(outlook.extraMlPerHa * 10) / 10,
                        extraShareOfToday: outlook.shareOfOrchardUse != null ? Math.round(outlook.shareOfOrchardUse * 100) / 100 : null,
                      }
                    : null
                }
                aiEnabled={aiEnabled}
                brief={brief}
                onBrief={setBrief}
              />
              <AdaptationNotes analysis={analysis} crops={ranked} />
              <Methods analysis={analysis} />
            </div>
          </Step>
        </div>
      )}
      {!analysis && actionError && (
        <p role="alert" className="rounded-lg bg-ember-soft px-4 py-3 text-ember">
          {actionError}
        </p>
      )}
    </div>
  );
}
