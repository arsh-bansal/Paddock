import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FileDown, Save } from "lucide-react";
import { cropLabel, defaultRequirement, type CropOption } from "../../shared/crops";
import { evaluateCrop, type CropEvaluation } from "../../shared/seasons";
import { rankCrops } from "../../shared/ranking";
import { partitionByChill } from "../../shared/chillFilter";
import type { ClimateAnalysis } from "../../shared/types";
import { fetchClimate } from "../lib/api";
import { fmtInt, pctChange } from "../lib/format";
import { loadReport, saveReport } from "../lib/savedReports";
import { useCombinedCrops } from "../lib/useCombinedCrops";
import { downloadReport } from "../report/download";
import { AdaptationNotes } from "./AdaptationNotes";
import { AddCropForm } from "./AddCropForm";
import { Brief, briefSignature, type BriefState } from "./Brief";
import { ChillChart } from "./ChillChart";
import { LocationPicker, type PickedLocation } from "./LocationPicker";
import { Methods } from "./Methods";
import {
  initialOptionState,
  OptionPicker,
  type OptionState,
} from "./OptionPicker";
import { OptionResults } from "./OptionResults";
import { SavedReports } from "./SavedReports";
import { SeasonsPanel } from "./SeasonsPanel";

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`step-${n}`}
      className="grid gap-4 sm:grid-cols-[3rem_1fr]"
    >
      <span
        aria-hidden
        className="font-display text-4xl font-extrabold leading-none text-leaf/40"
      >
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

function evaluateAll(
  crops: CropOption[],
  analysis: ClimateAnalysis,
  options: OptionState,
): CropEvaluation[] {
  const evaluated = crops
    .filter((c) => options[c.id]?.selected)
    .map((c) =>
      evaluateCrop(c, cropLabel(c), analysis.baseline.years, analysis.future.years, {
        // Only an edited figure is an override; the untouched default scores on the crop's own
        // (possibly directly sourced) chill-portions requirement.
        chillHoursOverride:
          options[c.id].requirement !== defaultRequirement(c) ? options[c.id].requirement : undefined,
      }),
    );
  // Order the considered crops best-fit-first. All consumers already accept CropEvaluation[].
  return rankCrops(evaluated);
}

/** Crops sent to the AI brief are capped client-side to stay within /api/explain's max(25). */
const BRIEF_CROP_CAP = 25;

/** The already-ranked list's first crop, if it is viable. */
function topCrop(crops: CropEvaluation[]): string | null {
  const best = rankCrops(crops)[0];
  return best && best.overall === "viable" ? best.label : null;
}

/**
 * Reconcile a saved/previous `OptionState` with the CURRENT crop list (built-ins + user crops).
 * Known ids keep their saved selection + requirement verbatim; ids present now but missing from the
 * saved state (e.g. crops added since save, or user crops that just loaded) default to selected:true
 * with their own default chill figure (`defaultRequirement` = the user's figure for a `[v,v]` range).
 * Ids in the saved state but absent from the current list (e.g. a since-deleted user crop referenced
 * by a saved report) are simply dropped — dangling ids never resurrect and never crash the load
 * (design §4.6/§4.9). No storage schema bump.
 */
function mergeOptions(crops: CropOption[], saved: OptionState): OptionState {
  return Object.fromEntries(
    crops.map((c) => [
      c.id,
      saved[c.id] ?? { selected: true, requirement: defaultRequirement(c) },
    ]),
  );
}

export function Planner({ aiEnabled }: { aiEnabled: boolean }) {
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [options, setOptions] = useState<OptionState>(initialOptionState);
  const [analysis, setAnalysis] = useState<ClimateAnalysis | null>(null);
  // Whether the grower has explicitly asked for the full Step-3 analysis/ranking ("Check my block").
  // This is deliberately SEPARATE from `analysis != null`: a preset auto-fetch sets `analysis` (so
  // Step 2 can filter) WITHOUT setting this flag, so Step 3 stays hidden until the button is pressed.
  const [resultsRequested, setResultsRequested] = useState(false);
  const [brief, setBrief] = useState<BriefState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [savedListKey, setSavedListKey] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  // The unified crop list: built-ins (synchronous baseline) + user crops (async overlay).
  const { combined, userCrops, status, error: cropsError, addCrop, editCrop, removeCrop } =
    useCombinedCrops();

  // Back-fill `OptionState` whenever the combined list changes (user crops load / are added). New
  // ids default to selected:true with their own default chill figure; dangling ids are dropped. This
  // is a no-op (same object identity in effect comparison aside) when nothing changed, and never
  // double-inserts under StrictMode because it reconciles against the authoritative crop list.
  useEffect(() => {
    setOptions((prev) => {
      const next = mergeOptions(combined, prev);
      // Avoid a state update (and re-render loop) when the reconciliation is a no-op.
      const sameKeys =
        Object.keys(next).length === Object.keys(prev).length &&
        Object.keys(next).every(
          (id) =>
            prev[id] &&
            prev[id].selected === next[id].selected &&
            prev[id].requirement === next[id].requirement,
        );
      return sameKeys ? prev : next;
    });
  }, [combined]);

  // Tracks the preset identity we have already kicked off an auto-run for. A ref (not state) so it
  // survives React 19 StrictMode's dev-only double-invoke of effects without triggering a second
  // fetch, and so updating it never causes a re-render/effect loop.
  const autoRanPresetKey = useRef<string | null>(null);

  // Mirror `analysis` into a ref so the auto-run effect can read its *current* value without
  // listing it as a dependency (which would re-trigger the effect and risk a fetch loop).
  const analysisRef = useRef<ClimateAnalysis | null>(null);
  analysisRef.current = analysis;

  const crops = useMemo(
    () => (analysis ? evaluateAll(combined, analysis, options) : []),
    [combined, analysis, options],
  );
  // The AI brief gets the top-ranked crops only, capped so the request can never exceed
  // /api/explain's max(25) no matter how large the catalogue grows (design 4.6).
  const briefCrops = useMemo(() => crops.slice(0, BRIEF_CROP_CAP), [crops]);
  // Step-2 DISPLAY split: once the block's climate is known, crops a typical future winter can't
  // satisfy move to a "struggles here" group (shown with the reason, never hidden). Display only:
  // `evaluateAll` still runs over the full `combined` set.
  const futureMedianPortions = analysis ? analysis.future.summary.chillPortions.median : NaN;
  const { suited, struggling } = useMemo(
    () => (analysis ? partitionByChill(combined, futureMedianPortions) : { suited: combined, struggling: [] }),
    [analysis, combined, futureMedianPortions],
  );
  const signature = analysis ? briefSignature(analysis, briefCrops) : null;
  const currentBrief =
    brief && brief.signature === signature ? brief.text : null;
  const isSaved =
    signature != null &&
    savedSignature === `${signature}|${currentBrief ?? ""}`;

  const run = async (target?: PickedLocation) => {
    const loc = target ?? location;
    if (!loc) return;
    setLoading(true);
    setError(null);
    try {
      setAnalysis(await fetchClimate(loc.lat, loc.lon, loc.label));
    } catch (e) {
      setAnalysis(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // HYBRID auto-run (design Option C): picking a PRESET DISTRICT runs the analysis automatically
  // (preset climate is pre-cached, so this costs no live API call). Manual coordinates and
  // "Use my location" still require the explicit "Check my block" button.
  //
  // Keyed ONLY on the preset identity (presetId + rounded coords) so:
  //   • switching between presets re-runs once per preset,
  //   • unrelated re-renders and crop-refine changes (OptionPicker / chill requirement) never
  //     re-fetch — `options`/`analysis` are deliberately NOT dependencies,
  //   • the ref guard absorbs StrictMode's double-invoke and prevents concurrent/duplicate fetches.
  const presetKey = location?.presetId
    ? `${location.presetId}:${location.lat.toFixed(2)},${location.lon.toFixed(2)}`
    : null;
  useEffect(() => {
    if (!presetKey || !location?.presetId) return;
    // Already auto-ran (or started) for this exact preset — nothing to do (StrictMode re-invoke).
    if (autoRanPresetKey.current === presetKey) return;
    // Analysis for this very location is already loaded (e.g. reopened saved report) — don't refetch.
    if (analysisRef.current && analysisRef.current.location.label === location.label) {
      autoRanPresetKey.current = presetKey;
      return;
    }
    // Mark this preset as handled *before* the async fetch so StrictMode's immediate second
    // invoke (and any re-render) sees it as done and never kicks off a duplicate run.
    autoRanPresetKey.current = presetKey;
    void run(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey]);

  const download = async (
    input: {
      analysis: ClimateAnalysis;
      crops: CropEvaluation[];
      brief: string | null;
    },
    busyKey: string,
  ) => {
    setPdfBusy(busyKey);
    setActionError(null);
    try {
      await downloadReport(input);
    } catch (e) {
      console.error(e);
      setActionError(
        "The PDF couldn’t be made. Try again, or save the report and download it later.",
      );
    } finally {
      setPdfBusy(null);
    }
  };

  const save = async () => {
    if (!analysis || !location || crops.length === 0) return;
    setActionError(null);
    try {
      await saveReport(
        { location, options, analysis, brief: currentBrief ? brief : null },
        { topCrop: topCrop(crops), cropCount: crops.length },
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
      // A reopened report shows the full Step-3 results immediately (as it did before this gate existed).
      setResultsRequested(true);
      setBrief(r.brief);
      setError(null);
      const sig = briefSignature(
        r.analysis,
        evaluateAll(combined, r.analysis, opts).slice(0, BRIEF_CROP_CAP),
      );
      setSavedSignature(
        `${sig}|${r.brief?.signature === sig ? r.brief.text : ""}`,
      );
      requestAnimationFrame(() =>
        resultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
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
      const savedCrops = evaluateAll(combined, r.analysis, mergeOptions(combined, r.options));
      const sig = briefSignature(r.analysis, savedCrops.slice(0, BRIEF_CROP_CAP));
      await download(
        {
          analysis: r.analysis,
          crops: savedCrops,
          brief: r.brief?.signature === sig ? r.brief.text : null,
        },
        id,
      );
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const showingStale =
    analysis && location && analysis.location.label !== location.label;
  const change = analysis
    ? pctChange(
        analysis.baseline.summary.chillPortions.median,
        analysis.future.summary.chillPortions.median,
      )
    : 0;

  return (
    <div className="space-y-12">
      <SavedReports
        refreshKey={savedListKey}
        onOpen={openSaved}
        onDownload={downloadSaved}
        busyId={pdfBusy}
      />

      <Step n={1} title="Where’s the block?">
        <LocationPicker
          value={location}
          onChange={(loc) => {
            // A new block invalidates any prior full-results request: hide Step 3 until the grower
            // presses "Check my block" again for THIS block. (A preset will still auto-fetch climate
            // for the Step-2 filter via the auto-run effect, but Step 3 stays gated.)
            setLocation(loc);
            setResultsRequested(false);
          }}
        />
      </Step>

      <Step n={2} title="What are you weighing up?">
        {analysis && (
          <p className="max-w-[62ch] text-muted">
            We rank every crop for your block, best fit first. Refine the list below if you want —
            untick crops or enter your own variety’s chill figure.
          </p>
        )}
        <OptionPicker
          crops={suited}
          struggling={struggling}
          futureMedianPortions={futureMedianPortions}
          value={options}
          onChange={setOptions}
          filterState={analysis ? "filtered" : "pre-location"}
        />
        <AddCropForm
          userCrops={userCrops}
          status={status}
          loadError={cropsError}
          onAdd={addCrop}
          onEdit={editCrop}
          onDelete={removeCrop}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              // Explicitly request the full Step-3 analysis/ranking, then run (fetches if needed; a
              // preset's climate is already cached so this is a cheap cache hit).
              setResultsRequested(true);
              void run();
            }}
            disabled={!location || loading}
            className="rounded-xl bg-leaf px-6 py-3 text-lg font-bold text-white shadow-sm hover:bg-leaf/90 disabled:opacity-40"
          >
            {loading ? "Checking 50 years of climate…" : "Check my block"}
          </button>
          {!location && (
            <span className="text-muted">Pick a district first.</span>
          )}
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-ember-soft px-4 py-3 text-ember"
          >
            {error}
          </p>
        )}
      </Step>

      {analysis && resultsRequested && (
        <div ref={resultsRef} className="scroll-mt-6">
          <Step n={3} title="What the next 20 years look like">
            <div className="reveal space-y-8" aria-live="polite">
              {showingStale && (
                <p className="rounded-lg bg-sun-soft px-4 py-3 text-sun-ink">
                  These results are for {analysis.location.label}. Press “Check
                  my block” to update for {location!.label}.
                </p>
              )}
              <p className="max-w-[62ch] text-xl leading-snug">
                At {analysis.location.label}, a typical winter gave about{" "}
                <strong className="tabular">
                  {fmtInt(analysis.baseline.summary.chillPortions.median)}
                </strong>{" "}
                chill portions in {analysis.baseline.period[0]}–{analysis.baseline.period[1]}. For{" "}
                {analysis.future.period[0]}–{analysis.future.period[1]}, the years a tree planted now
                spends cropping, it’s projected at about{" "}
                <strong className="tabular">
                  {fmtInt(analysis.future.summary.chillPortions.median)}
                </strong>
                {change < 0
                  ? `, ${Math.abs(change)}% less.`
                  : change > 0
                    ? `, ${change}% more.`
                    : ", about the same."}
              </p>
              <p className="-mt-5 max-w-[62ch] text-sm text-muted">
                Chill portions are the winter-chill measure Australian fruit research uses (Dynamic Model).
                Nurseries often quote chill hours instead; we convert those for you.
              </p>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-3">
                <button
                  type="button"
                  disabled={pdfBusy === "current" || crops.length === 0}
                  onClick={() =>
                    download(
                      { analysis, crops, brief: currentBrief },
                      "current",
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-bark px-4 py-2 font-bold text-white disabled:opacity-50"
                >
                  <FileDown size={18} aria-hidden />{" "}
                  {pdfBusy === "current"
                    ? "Making PDF…"
                    : "Download PDF report"}
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={isSaved || crops.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 font-bold hover:border-leaf disabled:border-leaf disabled:text-leaf"
                >
                  {isSaved ? (
                    <Check size={18} aria-hidden />
                  ) : (
                    <Save size={18} aria-hidden />
                  )}{" "}
                  {isSaved ? "Saved on this device" : "Save on this device"}
                </button>
                <span className="text-sm text-muted">
                  {currentBrief
                    ? "Includes your plain-words summary."
                    : "Write a summary below first to include it."}
                </span>
              </div>
              {actionError && (
                <p
                  role="alert"
                  className="rounded-lg bg-ember-soft px-4 py-3 text-ember"
                >
                  {actionError}
                </p>
              )}

              <OptionResults crops={crops} />
              <SeasonsPanel analysis={analysis} />
              <ChillChart analysis={analysis} crops={crops} />
              <Brief
                analysis={analysis}
                crops={briefCrops}
                aiEnabled={aiEnabled}
                brief={brief}
                onBrief={setBrief}
              />
              <AdaptationNotes analysis={analysis} crops={crops} />
              <Methods analysis={analysis} />
            </div>
          </Step>
        </div>
      )}
      {!analysis && actionError && (
        <p
          role="alert"
          className="rounded-lg bg-ember-soft px-4 py-3 text-ember"
        >
          {actionError}
        </p>
      )}
    </div>
  );
}
