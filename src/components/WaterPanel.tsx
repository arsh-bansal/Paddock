import type { DistrictWater, WaterOutlook } from '../../shared/regionWater';
import { districtComparison, outlookText, todayText, WATER_CAVEAT } from '../lib/waterText';

interface Props {
  water: DistrictWater | null;
  outlook: WaterOutlook | null;
  period: readonly [number, number];
  placeName: string;
}

/** Water today (ABS irrigation) and how the climate's water shortfall changes. */
export function WaterPanel({ water, outlook, period, placeName }: Props) {
  if (!outlook) return null;
  const today = todayText(water);
  const compare = districtComparison();
  const max = Math.max(...compare.map((c) => c.mlPerHa), 1);

  return (
    <section aria-labelledby="water-heading" className="space-y-3">
      <h3 id="water-heading" className="text-xl font-bold">Water</h3>
      <div className="max-w-[62ch] space-y-2">
        {today ? (
          <p>{today}</p>
        ) : water ? (
          <p className="text-muted">The ABS records too little irrigated orchard in {water.lga} for a reliable per-hectare figure.</p>
        ) : (
          <p className="text-muted">We don’t have local irrigation figures for {placeName}.</p>
        )}
        <p>{outlookText(outlook, period)}</p>
      </div>

      {today && compare.length > 1 && (
        <figure className="rounded-xl border border-line bg-card p-4">
          <figcaption className="mb-3 text-sm text-muted">Irrigation applied by orchards, ML per irrigated hectare, 2020–21 (ABS)</figcaption>
          <ul className="space-y-2">
            {compare.map((c) => {
              const mine = c.presetId === water?.presetId;
              return (
                <li key={c.presetId} className="grid grid-cols-[minmax(7rem,10rem)_1fr_3rem] items-center gap-3 text-sm">
                  <span className={mine ? 'font-bold' : 'text-muted'}>{c.lga}</span>
                  <span className="h-3 rounded-full bg-paper" aria-hidden>
                    <span className={`block h-3 rounded-full ${mine ? 'bg-frost' : 'bg-line'}`} style={{ width: `${(c.mlPerHa / max) * 100}%` }} />
                  </span>
                  <span className={`tabular text-right ${mine ? 'font-bold' : ''}`}>{c.mlPerHa.toLocaleString('en-AU', { maximumFractionDigits: 1 })}</span>
                </li>
              );
            })}
          </ul>
        </figure>
      )}
      <p className="text-sm text-muted">{WATER_CAVEAT}</p>
    </section>
  );
}
