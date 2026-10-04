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
          <strong>Winter.</strong> Hourly temperatures are rebuilt from daily min and max using day length (Linvill method), April to September. Winter is scored in
          Chill Portions (Dynamic Model), the measure Australian fruit research uses and one that warming inflates less than chill hours. Most published crop needs are in
          chill hours, so they’re converted with the cross-model table in Brunt et al. (2017, Hort Innovation cherry guide, Table 1); converted figures are marked.
          Chill hours (0–7.2 °C) are still shown for reference. A crop is a good fit if a poor winter (worst 1 in 10) still meets its need.
        </p>
        <p>
          <strong>Spring.</strong> We count days in each crop’s flowering months when the minimum falls to its frost-damage temperature (full-bloom figures from the WSU
          critical-temperature tables, a US source). A good fit sees that in no more than 1 year in 10; risky is up to 3 in 10. Treat this as a district estimate: the
          weather grid smooths out cold nights, so it undercounts frost, especially in frost hollows. It also doesn’t yet allow for trees flowering earlier as winters warm.
        </p>
        <p>
          <strong>Summer and autumn.</strong> Hot days are counted December to February (labelled by the January year), along with the longest run of days at 35 °C or hotter.
          Summer heat is shown for every crop but not scored yet: we found no published “days over 35 °C” limit for these crops, and a made-up limit would mark
          crops as failing in districts where they grow well today.
        </p>
        <p>
          <strong>Water.</strong> Evaporation is estimated with the Hargreaves method from temperature and day length, so it can be worked out the same way for the past and the future.
          The shortfall is evaporation minus rainfall, a guide to irrigation demand rather than a crop water budget.
        </p>
        <p>
          <strong>Limits.</strong> Three models and one emissions pathway don’t cover every possible future. The grid is roughly 10–25 km, so frost hollows and slopes
          on your block can differ. Thresholds marked indicative were converted between chill measures or come from non-Australian sources.
        </p>
      </div>
    </details>
  );
}
