import type { SeasonStat, Summary } from './chill';

export const BASELINE_PERIOD = [1995, 2014] as const;
export const FUTURE_PERIOD = [2026, 2045] as const;
export const OBSERVED_PERIOD = [1995, 2025] as const;

export interface ModelResult {
  model: string;
  /** Mean warming in the chill season (Apr–Sep), °C */
  winterWarming: number;
  /** Mean warming in summer (Dec–Feb), °C */
  summerWarming: number;
  medianChillHours: number;
  meanHotDays: number;
}

export interface ClimateAnalysis {
  location: { lat: number; lon: number; elevation: number | null; label: string };
  /** Real observed winters/summers, reanalysis (ERA5) */
  observed: SeasonStat[];
  baseline: {
    period: readonly [number, number];
    chillHoursByYear: number[];
    chillHours: Summary;
    chillPortions: Summary;
    hotDays: Summary;
  };
  future: {
    period: readonly [number, number];
    /** Pooled synthetic winters across all models (20 per model) */
    chillHoursPooled: number[];
    chillHours: Summary;
    chillPortions: Summary;
    hotDays: Summary;
    models: ModelResult[];
  };
  generatedAt: string;
  servedFrom: 'live' | 'cache';
}

export interface OptionEvaluation {
  id: string;
  label: string;
  requirement: number;
  baselinePctMet: number;
  futurePctMet: number;
  verdict: Verdict;
  heatNote: string;
}

export type Verdict = 'viable' | 'at-risk' | 'not-viable';

export type StressCategory = 'heat' | 'water' | 'pest' | 'disease' | 'nutrient' | 'healthy' | 'unclear';

export interface StressDiagnosis {
  likelyIssue: string;
  category: StressCategory;
  confidence: 'low' | 'medium' | 'high';
  signs: string[];
  actions: string[];
  climateLink: string;
  seeAdvisor: boolean;
}
