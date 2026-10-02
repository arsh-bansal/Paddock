import { useEffect, useState } from "react";
import { CropCatalogue } from "./components/CropCatalogue";
import { Planner } from "./components/Planner";
import { StressCheck } from "./components/StressCheck";

type View = "planner" | "stress" | "crops";

export default function App() {
  const [view, setView] = useState<View>("planner");
  const [aiEnabled, setAiEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h: { ai?: boolean }) => setAiEnabled(Boolean(h.ai)))
      .catch(() => setAiEnabled(false));
  }, []);

  const tab = (id: View, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === id}
      aria-controls={`panel-${id}`}
      id={`tab-${id}`}
      onClick={() => setView(id)}
      className={`rounded-lg px-4 py-2 font-bold transition-colors ${view === id ? "bg-bark text-white" : "text-muted hover:text-bark"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-4">
        <p className="font-display text-xl font-extrabold text-leaf">Paddock</p>
        <nav
          role="tablist"
          aria-label="Tools"
          className="flex gap-1 rounded-xl bg-card p-1 shadow-[0_0_0_1px_var(--color-line)]"
        >
          {tab("planner", "Replant planner")}
          {tab("stress", "Check a tree")}
          {tab("crops", "Crop data")}
        </nav>
      </header>

      <main>
        <div
          id="panel-planner"
          role="tabpanel"
          aria-labelledby="tab-planner"
          hidden={view !== "planner"}
        >
          <div className="max-w-[40rem] py-12 sm:py-16">
            <h1 className="text-4xl font-extrabold sm:text-5xl">
              A tree planted this winter is still cropping in 2045.
            </h1>
            <p className="mt-4 text-xl text-muted">
              See how winter chill and summer heat are changing at your block,
              and which crops will still fit the climate they’ll grow in.
            </p>
          </div>
          <Planner aiEnabled={aiEnabled} />
        </div>
        <div
          id="panel-stress"
          role="tabpanel"
          aria-labelledby="tab-stress"
          hidden={view !== "stress"}
          className="pt-10"
        >
          <StressCheck aiEnabled={aiEnabled} />
        </div>
        <div
          id="panel-crops"
          role="tabpanel"
          aria-labelledby="tab-crops"
          hidden={view !== "crops"}
          className="pt-10"
        >
          <CropCatalogue />
        </div>
      </main>

      <footer className="mt-20 space-y-1 border-t border-line pt-6 text-sm text-muted">
        <p>
          Weather and climate data by{" "}
          <a className="underline" href="https://open-meteo.com/">
            Open-Meteo.com
          </a>{" "}
          (CC BY 4.0), using ERA5 reanalysis and CMIP6 HighResMIP models.
        </p>
        <p>
          Projections are guidance, not a guarantee. Check variety choices with
          your nursery or an Agriculture Victoria adviser.
        </p>
      </footer>
    </div>
  );
}
