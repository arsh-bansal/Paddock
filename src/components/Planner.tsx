import { useMemo, useRef, useState } from "react";
import { Check, FileDown, Save } from "lucide-react";
import { CROP_OPTIONS, cropLabel } from "../../shared/crops";
import { evaluateCrop, type CropEvaluation } from "../../shared/seasons";
import type { ClimateAnalysis } from "../../shared/types";
import { fetchClimate } from "../lib/api";
import { fmtInt, pctChange } from "../lib/format";
import { loadReport, saveReport } from "../lib/savedReports";
import { downloadReport } from "../report/download";
import { AdaptationNotes } from "./AdaptationNotes";
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
  analysis: ClimateAnalysis,
  options: OptionState,
): CropEvaluation[] {
  return CROP_OPTIONS.filter((c) => options[c.id]?.selected).map((c) =>
    evaluateCrop(
      c,
      cropLabel(c),
      analysis.baseline.years,
      analysis.future.years,
      options[c.id].requirement,
    ),
  );
}

const RANK = {
  viable: 0,
  "at-risk": 1,
  "not-viable": 2,
  "no-data": 3,
} as const;
function topCrop(crops: CropEvaluation[]): string | null {
  const best = [...crops].sort((a, b) => RANK[a.overall] - RANK[b.overall])[0];
  return best && best.overall === "viable" ? best.label : null;
}

/** Saved option state may predate crops added since; fill the gaps with defaults. */
function mergeOptions(saved: OptionState): OptionState {
  const defaults = initialOptionState();
  return Object.fromEntries(
    Object.keys(defaults).map((id) => [
      id,
      saved[id] ?? { ...defaults[id], selected: false },
    ]),
  );
}

export function Planner({ aiEnabled }: { aiEnabled: boolean }) {
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [options, setOptions] = useState<OptionState>(initialOptionState);
  const [analysis, setAnalysis] = useState<ClimateAnalysis | null>(null);
  const [brief, setBrief] = useState<BriefState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [savedListKey, setSavedListKey] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  const selectedCount = CROP_OPTIONS.filter(
    (c) => options[c.id].selected,
  ).length;
  const crops = useMemo(
    () => (analysis ? evaluateAll(analysis, options) : []),
    [analysis, options],
  );
  const signature = analysis ? briefSignature(analysis, crops) : null;
  const currentBrief =
    brief && brief.signature === signature ? brief.text : null;
  const isSaved =
    signature != null &&
    savedSignature === `${signature}|${currentBrief ?? ""}`;

  const run = async () => {
    if (!location) return;
    setLoading(true);
    setError(null);
    try {
      setAnalysis(
        await fetchClimate(location.lat, location.lon, location.label),
      );
    } catch (e) {
      setAnalysis(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

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
      const opts = mergeOptions(r.options);
      setLocation(r.location);
      setOptions(opts);
      setAnalysis(r.analysis);
      setBrief(r.brief);
      setError(null);
      const sig = briefSignature(r.analysis, evaluateAll(r.analysis, opts));
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
      const savedCrops = evaluateAll(r.analysis, mergeOptions(r.options));
      const sig = briefSignature(r.analysis, savedCrops);
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
        analysis.baseline.summary.chillHours.median,
        analysis.future.summary.chillHours.median,
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
        <LocationPicker value={location} onChange={setLocation} />
      </Step>

      <Step n={2} title="What are you weighing up?">
        <OptionPicker value={options} onChange={setOptions} />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={!location || selectedCount === 0 || loading}
            className="rounded-xl bg-leaf px-6 py-3 text-lg font-bold text-white shadow-sm hover:bg-leaf/90 disabled:opacity-40"
          >
            {loading ? "Checking 50 years of climate…" : "Check my block"}
          </button>
          {!location && (
            <span className="text-muted">Pick a district first.</span>
          )}
          {location && selectedCount === 0 && (
            <span className="text-muted">Tick at least one option.</span>
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

      {analysis && (
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
                  {fmtInt(analysis.baseline.summary.chillHours.median)}
                </strong>{" "}
                chill hours in {analysis.baseline.period[0]}–
                {analysis.baseline.period[1]}. For {analysis.future.period[0]}–
                {analysis.future.period[1]}, the years a tree planted now spends
                cropping, it’s projected at about{" "}
                <strong className="tabular">
                  {fmtInt(analysis.future.summary.chillHours.median)}
                </strong>
                {change < 0
                  ? `, ${Math.abs(change)}% less.`
                  : change > 0
                    ? `, ${change}% more.`
                    : ", about the same."}
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

              <SeasonsPanel analysis={analysis} />
              <ChillChart analysis={analysis} crops={crops} />
              <OptionResults crops={crops} />
              <Brief
                analysis={analysis}
                crops={crops}
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
