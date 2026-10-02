/**
 * `CropCatalogue` — a READ-ONLY reference view of the complete crop dataset (addendum A4, change 3).
 *
 * Renders a semantic table of every crop — built-ins AND user-added crops — with its name, type,
 * category, winter chill range, and PROVENANCE (where the chill figure comes from). This serves the
 * data-credibility goal by surfacing sourcing honestly, separate from the Step-2 decision flow.
 *
 * It is strictly read-only: no inputs, no onAdd/onEdit/onDelete, no mutation. All CRUD lives in
 * `AddCropForm`. It REUSES existing data/helpers (`CROP_OPTIONS`, `cropLabel`, `hasIndicativeData`
 * from `shared/crops.ts`; the pure `isUserCrop` id-check from `src/lib/userCrops.ts`) and never
 * duplicates or edits the catalogue. User crops are pulled in via `useCombinedCrops()` so the tab is
 * self-contained (a second, StrictMode-safe IndexedDB read, acceptable per the design).
 *
 * Accessibility: a single <h2>, a real <table> with <caption> and <th scope="col"> headers, and all
 * provenance flags are TEXT (not colour-only).
 */
import { cropLabel, hasIndicativeData, type CropOption } from "../../shared/crops";
import { isUserCrop } from "../lib/userCrops";
import { useCombinedCrops } from "../lib/useCombinedCrops";

/** The provenance text + a short label for a crop's winter chill figure. Always TEXT, never colour. */
function provenance(c: CropOption): { label: string; detail: string } {
  // User-added crops: the grower's own figure.
  if (isUserCrop(c.id)) {
    return { label: "Your figures", detail: c.winter.source };
  }
  // Built-in, indicative (placeholder) figure → an app assumption; show the source if we have one.
  if (c.winter.indicative) {
    return { label: "App assumption", detail: c.winter.source };
  }
  // Built-in, sourced figure → the citation is the source of record.
  return { label: "Sourced", detail: c.winter.source };
}

export function CropCatalogue() {
  // Self-contained: read the combined (built-ins + user) list directly. Read-only use of the hook.
  const { combined, status, error } = useCombinedCrops();

  return (
    <section aria-labelledby="crop-catalogue-heading" className="space-y-4">
      <div className="space-y-2">
        <h2 id="crop-catalogue-heading" className="text-2xl font-bold">
          Crop data &amp; sources
        </h2>
        <p className="max-w-[70ch] text-muted">
          Every crop Paddock knows about, with the winter chill range it uses and where that figure
          comes from. “App assumption” marks a rule-of-thumb placeholder still being replaced with a
          sourced figure; “Your figures” are crops you added yourself. This view is read-only — manage
          your own crops in the planner.
        </p>
      </div>

      {status === "error" && error && (
        <p role="alert" className="rounded-lg bg-ember-soft px-4 py-3 text-ember">
          {error} Showing the built-in crops only.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            Full crop catalogue: crop name, type, category, winter chill-hour range, the chill-portion
            range it is scored on, and the source of each chill figure.
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="px-4 py-3 font-bold">
                Crop
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                Type
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                Category
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                Winter chill (hours)
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                Scored as (portions)
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                Provenance
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {combined.map((c) => {
              const prov = provenance(c);
              return (
                <tr key={c.id}>
                  <th scope="row" className="px-4 py-3 text-left font-bold">
                    {cropLabel(c)}
                  </th>
                  <td className="px-4 py-3">{c.type}</td>
                  <td className="px-4 py-3 capitalize">{c.category}</td>
                  <td className="px-4 py-3 tabular">
                    {c.winter.chillHours[0]}–{c.winter.chillHours[1]}
                  </td>
                  <td className="px-4 py-3 tabular">
                    {Math.round(c.winter.chillPortions[0])}–{Math.round(c.winter.chillPortions[1])}
                    <span className="block text-xs text-muted">
                      {c.winter.portionsDerived ? "converted from hours" : "sourced directly"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold">{prov.label}</span>
                    {prov.detail && (
                      <span className="block text-muted">{prov.detail}</span>
                    )}
                    {!isUserCrop(c.id) && hasIndicativeData(c) && (
                      <span className="block text-xs text-muted">
                        {c.spring ? "Frost: US full-bloom table, indicative. " : "Frost: no data. "}
                        {c.summer ? "Heat: indicative limit." : "Heat: shown, not scored (no published limit)."}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-muted">
        Full per-field sourcing notes live in the project’s crop-data-sources documentation.
      </p>
    </section>
  );
}
