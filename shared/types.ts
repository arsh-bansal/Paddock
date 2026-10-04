import type { Summary } from './chill';
import type { CropEvaluation, SeasonSummary, YearStat } from './seasons';

export const BASELINE_PERIOD = [1995, 2014] as const;
export const FUTURE_PERIOD = [2026, 2045] as const;
export const OBSERVED_PERIOD = [1985, 2025] as const;
/** Two real 20-year periods: the climate growers remember, and the recent one. */
export const EARLY_PERIOD = [1985, 2004] as const;
export const RECENT_PERIOD = [2005, 2024] as const;

export type Verdict = 'viable' | 'at-risk' | 'not-viable';

export interface ModelResult {
  model: string;
  /** Mean warming in the chill season (Apr–Sep), °C */
  winterWarming: number;
  /** Mean warming in summer (Dec–Feb), °C */
  summerWarming: number;
  /** Annual rainfall change, % (null if the model has no rainfall) */
  rainChangePct: number | null;
  medianChillHours: number;
  meanHotDays: number;
}

export interface PeriodClimate {
  period: readonly [number, number];
  years: YearStat[];
  summary: SeasonSummary;
}

export interface ClimateAnalysis {
  /** Bumped whenever the shape changes, so saved reports can be migrated or rejected. */
  schemaVersion: 2;
  location: { lat: number; lon: number; elevation: number | null; label: string };
  /** Real observed years (ERA5 reanalysis) */
  observed: YearStat[];
  baseline: PeriodClimate;
  /** Pooled synthetic years across all models (one set of baseline-length years per model) */
  future: PeriodClimate & { models: ModelResult[] };
  generatedAt: string;
  servedFrom: 'live' | 'cache';
}

export type { CropEvaluation, SeasonSummary, Summary, YearStat };

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
