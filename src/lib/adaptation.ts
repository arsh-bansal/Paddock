import type { CropEvaluation } from '../../shared/seasons';
import type { ClimateAnalysis } from '../../shared/types';
import { formatValue } from './seasonRows';

export interface AdaptationNote {
  key: 'winter' | 'spring' | 'summer' | 'water';
  title: string;
  lines: string[];
}

/** Risk-reduction notes, shared by the screen and the PDF. Only shows notes the results call for. */
export function adaptationNotes(a: ClimateAnalysis, crops: CropEvaluation[]): AdaptationNote[] {
  const troubled = (season: 'winter' | 'spring' | 'summer') =>
    crops.some((c) => c.seasons.some((s) => s.season === season && (s.verdict === 'at-risk' || s.verdict === 'not-viable')));
  const b = a.baseline.summary;
  const f = a.future.summary;
  const notes: AdaptationNote[] = [];

  if (troubled('winter')) {
    notes.push({
      key: 'winter',
      title: 'If winter chill is the problem',
      lines: [
        'A lower-chill variety of the same crop is usually the cheapest fix, because it keeps your packing and marketing setup.',
        'Rest-breaking sprays can partly make up for a short winter. Check current APVMA registrations and your packer’s rules first.',
      ],
    });
  }
  if (troubled('spring')) {
    notes.push({
      key: 'spring',
      title: 'If spring frost is the problem',
      lines: [
        'Avoid planting frost-prone varieties in low spots where cold air pools.',
        'Frost fans or overhead sprinklers protect flowers on frost nights; cost them per hectare before committing.',
      ],
    });
  }
  if (troubled('summer') || f.hotDays.mean - b.hotDays.mean >= 1) {
    notes.push({
      key: 'summer',
      title: 'If summer heat is the problem',
      lines: [
        `Days of 35 °C or hotter go from about ${formatValue(b.hotDays.mean, 1)} to ${formatValue(f.hotDays.mean, 1)} per summer here.`,
        'Shade or hail netting cuts fruit sunburn and is worth costing into a new block.',
      ],
    });
  }
  if (Number.isFinite(b.waterDeficitMm.mean) && f.waterDeficitMm.mean - b.waterDeficitMm.mean >= 25) {
    notes.push({
      key: 'water',
      title: 'Plan for more irrigation',
      lines: [
        `The yearly gap between evaporation and rain grows from about ${formatValue(b.waterDeficitMm.mean, 0)} to ${formatValue(f.waterDeficitMm.mean, 0)} mm.`,
        'Drip irrigation and soil moisture monitoring stretch water further. Solar-powered pumps keep it running in heatwaves without diesel costs.',
      ],
    });
  }
  return notes;
}
