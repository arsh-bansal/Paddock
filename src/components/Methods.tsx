import type { ClimateAnalysis } from '../../shared/types';

export function Methods({ analysis }: { analysis: ClimateAnalysis }) {
  const models = analysis.future.models.map((m) => m.model.replaceAll('_', '-')).join(', ');
  return (
    <details className="rounded-xl border border-line bg-card p-4 text-[0.95rem]">
      <summary className="cursor-pointer font-bold">How this is worked out</summary>
      <div className="mt-3 max-w-prose space-y-3">
        <p>
          <strong>Real winters.</strong> Daily minimum and maximum temperatures for {analysis.observed[0]?.year}–{analysis.observed.at(-1)?.year} come
          from ERA5 reanalysis (ECMWF) via the Open-Meteo Historical Weather API.
        </p>
        <p>
          <strong>Future winters.</strong> For each climate model ({models}) we take the monthly warming between {analysis.baseline.period[0]}–{analysis.baseline.period[1]} and {analysis.future.period[0]}–{analysis.future.period[1]},
          then add it to the real {analysis.baseline.period[0]}–{analysis.baseline.period[1]} record. This “delta change” method keeps your site’s real weather
          patterns and avoids the models’ own temperature biases. Projections come from the CMIP6 HighResMIP runs served by the Open-Meteo Climate API.
        </p>
        <p>
          <strong>Chill.</strong> Hourly temperatures are rebuilt from daily min and max using day length (Linvill method). Chill hours count hours between 0 and 7.2 °C.
          We also compute Chill Portions (Dynamic Model), which researchers prefer for warmer climates: typical winter {Math.round(analysis.baseline.chillPortions.median)} portions
          then, about {Math.round(analysis.future.chillPortions.median)} projected.
        </p>
        <p>
          <strong>Verdicts.</strong> An option is a good fit if a poor winter (the worst 1 in 10) still meets its chill need, risky if a typical winter does but poor ones don’t,
          and a poor fit if a typical winter falls short.
        </p>
        <p>
          <strong>Limits.</strong> Three models and one emissions pathway don’t cover the full range of possible futures. The grid is roughly 10–25 km, so frost hollows and slopes
          on your block can differ. Crop chill ranges are indicative classes, not variety-specific figures.
        </p>
      </div>
    </details>
  );
}
