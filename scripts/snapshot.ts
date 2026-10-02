/**
 * Pre-fetch climate data for every preset region into data/cache/ so the demo
 * works on bad venue wifi. Commit data/cache/ after running this.
 *
 *   npm run snapshot
 */
import { REGION_PRESETS } from '../shared/regions';
import { analyseLocation } from '../server/analysis';

for (const r of REGION_PRESETS) {
  const label = `${r.name}, ${r.district}`;
  try {
    const a = await analyseLocation(r.lat, r.lon, label);
    console.log(
      `✓ ${label.padEnd(32)} chill ${Math.round(a.baseline.chillHours.median)} → ${Math.round(a.future.chillHours.median)} h, ` +
        `hot days ${a.baseline.hotDays.mean.toFixed(1)} → ${a.future.hotDays.mean.toFixed(1)}, models ${a.future.models.length}`,
    );
  } catch (err) {
    console.error(`✗ ${label}: ${(err as Error).message}`);
  }
  await new Promise((r) => setTimeout(r, 1500)); // be polite to the free API
}
