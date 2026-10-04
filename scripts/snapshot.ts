/**
 * Pre-fetch climate data for every preset region into data/snapshot/ so the app and
 * the demo work on bad venue wifi. Commit data/snapshot/ after running this.
 *
 *   npm run snapshot
 */
import { REGION_PRESETS } from '../shared/regions';
import { analyseLocation, latestWinter } from '../server/analysis';
import { writeToSnapshot } from '../server/openMeteo';

writeToSnapshot();

for (const r of REGION_PRESETS) {
  const label = `${r.name}, ${r.district}`;
  try {
    const a = await analyseLocation(r.lat, r.lon, label);
    console.log(
      `✓ ${label.padEnd(32)} chill ${Math.round(a.baseline.summary.chillPortions.median)} → ${Math.round(a.future.summary.chillPortions.median)} portions ` +
        `(${Math.round(a.baseline.summary.chillHours.median)} → ${Math.round(a.future.summary.chillHours.median)} h), ` +
        `frost days ${a.baseline.summary.springFrostDays.mean.toFixed(1)} → ${a.future.summary.springFrostDays.mean.toFixed(1)}, ` +
        `hot days ${a.baseline.summary.hotDays.mean.toFixed(1)} → ${a.future.summary.hotDays.mean.toFixed(1)}, ` +
        `rain ${Math.round(a.baseline.summary.annualRainMm.mean)} mm, models ${a.future.models.length}`,
    );
    const w = await latestWinter(r.lat, r.lon);
    console.log(`  winter ${w.year}: ${Math.round(w.chillPortions)} portions (${w.chillHours} h)`);
  } catch (err) {
    console.error(`✗ ${label}: ${(err as Error).message}`);
  }
  // Be polite to the free API. Open-Meteo also has per-minute and hourly limits: set SNAPSHOT_DELAY_MS=65000 if you hit them.
  await new Promise((r) => setTimeout(r, Number(process.env.SNAPSHOT_DELAY_MS ?? 1500)));
}
