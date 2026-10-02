import type { ClimateAnalysis } from '../../shared/types';

export function Methods({ analysis }: { analysis: ClimateAnalysis }) {
  const models = analysis.future.models.map((m) => m.model.replaceAll('_', '-')).join(', ');
  return (
    <details className="rounded-xl border border-line bg-card p-4 text-[0.95rem]">
      <summary className="cursor-pointer font-bold">How this is worked out</summary>
      <div className="mt-3 max-w-prose space-y-3">
        <p>
          <strong>Real weather.</strong> Daily minimum and maximum temperature and rainfall for {analysis.observed[0]?.year}–{analysis.observed.at(-1)?.year} come
          from ERA5 reanalysis (ECMWF) via the Open-Meteo Historical Weather API.
        </p>
        <p>
          <strong>Future seasons.</strong> For each climate model ({models}) we take the monthly change between {analysis.baseline.period[0]}–{analysis.baseline.period[1]} and {analysis.future.period[0]}–{analysis.future.period[1]}
          and apply it to the real {analysis.baseline.period[0]}–{analysis.baseline.period[1]} record: temperatures shift by the modelled warming, and rainfall scales by the modelled
          ratio (limited to between half and one and a half times). This “delta change” method keeps your site’s real weather patterns and avoids the models’ own biases.
          Projections come from CMIP6 HighResMIP runs served by the Open-Meteo Climate API.
        </p>
        <p>
          <strong>Winter.</strong> Hourly temperatures are rebuilt from daily min and max using day length (Linvill method). Chill hours count hours between 0 and 7.2 °C from April to September.
          Chill Portions (Dynamic Model), which researchers prefer for warmer climates, are a cross-check: typical winter {Math.round(analysis.baseline.summary.chillPortions.median)} portions
          then, about {Math.round(analysis.future.summary.chillPortions.median)} projected. A crop is a good fit if a poor winter (worst 1 in 10) still meets its need.
        </p>
        <p>
          <strong>Spring.</strong> We count days in each crop’s flowering months when the minimum falls to its frost-damage temperature. A good fit sees that in no more than 1 year in 10; risky is up to 3 in 10.
          This doesn’t yet allow for trees flowering earlier as winters warm.
        </p>
        <p>
          <strong>Summer and autumn.</strong> Hot days are counted December to February (labelled by the January year), along with the longest run of days at 35 °C or hotter.
          A crop is a good fit if even a hot summer (worst 1 in 10) stays within its tolerance.
        </p>
        <p>
          <strong>Water.</strong> Evaporation is estimated with the Hargreaves method from temperature and day length, so it can be worked out the same way for the past and the future.
          The shortfall is evaporation minus rainfall, a guide to irrigation demand rather than a crop water budget.
        </p>
        <p>
          <strong>Limits.</strong> Three models and one emissions pathway don’t cover every possible future. The grid is roughly 10–25 km, so frost hollows and slopes
          on your block can differ. Crop thresholds marked indicative are rules of thumb still being replaced with sourced figures.
        </p>
      </div>
    </details>
  );
}
