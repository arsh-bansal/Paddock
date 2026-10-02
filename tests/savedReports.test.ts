import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { initialOptionState } from '../src/components/OptionPicker';
import { deleteReport, listReports, loadReport, MAX_SAVED_REPORTS, saveReport } from '../src/lib/savedReports';
import type { ClimateAnalysis } from '../shared/types';

const analysis = (label: string) =>
  ({ schemaVersion: 2, location: { lat: -36.38, lon: 145.4, elevation: 114, label } }) as unknown as ClimateAnalysis;
const input = (label: string) => ({
  location: { lat: -36.38, lon: 145.4, label },
  options: initialOptionState(),
  analysis: analysis(label),
  brief: null,
});

describe('saved reports', () => {
  it('saves, lists newest first, loads and deletes', async () => {
    const a = await saveReport(input('Shepparton'), { topCrop: 'Apricot', cropCount: 4 });
    await new Promise((r) => setTimeout(r, 5));
    const b = await saveReport(input('Cobram'), { topCrop: null, cropCount: 2 });

    const list = await listReports();
    expect(list.map((m) => m.label).slice(0, 2)).toEqual(['Cobram', 'Shepparton']);

    const loaded = await loadReport(a.id);
    expect(loaded.ok && loaded.report.analysis.location.label).toBe('Shepparton');

    await deleteReport(b.id);
    expect((await listReports()).some((m) => m.id === b.id)).toBe(false);
    expect((await loadReport(b.id)).ok).toBe(false);
  });

  it(`keeps only the newest ${MAX_SAVED_REPORTS}`, async () => {
    for (let i = 0; i < MAX_SAVED_REPORTS + 3; i++) {
      await saveReport(input(`Block ${i}`), { topCrop: null, cropCount: 1 });
    }
    const list = await listReports();
    expect(list).toHaveLength(MAX_SAVED_REPORTS);
    expect(list[0].label).toBe(`Block ${MAX_SAVED_REPORTS + 2}`);
  });

  it('refuses reports from an older data format', async () => {
    const old = { ...input('Old'), analysis: { ...analysis('Old'), schemaVersion: 1 } as unknown as ClimateAnalysis };
    const m = await saveReport(old, { topCrop: null, cropCount: 1 });
    expect(await loadReport(m.id)).toEqual({ ok: false, reason: 'outdated' });
  });
});
