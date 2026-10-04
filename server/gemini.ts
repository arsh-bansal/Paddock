import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { ClimateAnalysis, CropEvaluation, StressDiagnosis } from '../shared/types';

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
/**
 * Used for the final retry when the main model keeps answering "high demand" (503): a lighter
 * model is usually less congested, and a simpler answer beats an error.
 */
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest';
let client: GoogleGenAI | null = null;

export class AiUnavailableError extends Error {}
/** Gemini was busy, rate-limited or returned something unusable after retries. */
export class AiBusyError extends Error {}

/** Transient Gemini failures worth retrying: rate limits, overload, server errors, empty or malformed replies. */
function isRetryable(err: unknown): boolean {
  if (err instanceof AiUnavailableError) return false;
  const e = err as { status?: number; code?: number; message?: string };
  const status = e?.status ?? e?.code;
  if (typeof status === 'number' && (status === 429 || status >= 500)) return true;
  const msg = String(e?.message ?? '').toLowerCase();
  return (
    err instanceof SyntaxError ||
    err instanceof EmptyReplyError ||
    /overloaded|unavailable|resource_exhausted|rate limit|deadline|timeout|fetch failed|econnreset/.test(msg)
  );
}

class EmptyReplyError extends Error {}

/**
 * Call Gemini with up to 2 retries (0.8 s, then 2 s) on transient failures. Gemini regularly
 * answers "overloaded" or "too many requests" for a moment, which used to fail the whole request.
 */
async function withRetry<T>(label: string, fn: (model: string) => Promise<T>): Promise<T> {
  const delays = [800, 2000];
  for (let attempt = 0; ; attempt++) {
    // Main model first; the last attempt falls back to the lighter model.
    const model = attempt === delays.length && FALLBACK_MODEL !== MODEL ? FALLBACK_MODEL : MODEL;
    try {
      return await fn(model);
    } catch (err) {
      if (!isRetryable(err)) throw err;
      if (attempt >= delays.length) {
        console.error(`[gemini] ${label} failed after ${attempt + 1} attempts:`, (err as Error).message);
        throw new AiBusyError('The AI is busy right now.');
      }
      console.warn(`[gemini] ${label} attempt ${attempt + 1} (${model}) failed: ${String((err as Error).message).slice(0, 160)}; retrying`);
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}

function ai(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') throw new AiUnavailableError('GEMINI_API_KEY is not set on the server.');
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

const round = (n: number) => (Number.isFinite(n) ? Math.round(n) : null);
const one = (n: number) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

/** Plain-English brief for the grower. The model only rewords numbers we computed. */
export async function explainResult(
  analysis: ClimateAnalysis,
  crops: CropEvaluation[],
  grownHere: string[] = [],
  water: {
    orchardIrrigationMlPerHa: number | null;
    shortfallChangeMm: number;
    extraMlPerHa: number;
    extraShareOfToday: number | null;
  } | null = null,
): Promise<string> {
  const b = analysis.baseline.summary;
  const f = analysis.future.summary;
  const then = `${analysis.baseline.period[0]}-${analysis.baseline.period[1]}`;
  const next = `${analysis.future.period[0]}-${analysis.future.period[1]}`;
  const facts = {
    location: analysis.location.label,
    periods: { then, projected: next },
    winter: {
      measure: 'chill portions (Dynamic Model, the measure Australian fruit research uses)',
      typicalChillPortions: { then: round(b.chillPortions.median), projected: round(f.chillPortions.median) },
      poorWinterChillPortionsProjected: round(f.chillPortions.p10),
      typicalChillHoursForReference: { then: round(b.chillHours.median), projected: round(f.chillHours.median) },
    },
    spring: {
      frostDaysAtOrBelow0CAugToOct: { then: one(b.springFrostDays.mean), projected: one(f.springFrostDays.mean) },
      note: 'Frost comes from a 10-25 km weather grid and underestimates frost on cold blocks. Call it a district estimate and never present it as reassurance.',
    },
    summer: {
      hotDaysAtOrAbove35C: { then: one(b.hotDays.mean), projected: one(f.hotDays.mean) },
      typicalLongestHotSpellDays: { then: round(b.longestHotSpell.median), projected: round(f.longestHotSpell.median) },
    },
    water: {
      annualRainfallMm: { then: round(b.annualRainMm.mean), projected: round(f.annualRainMm.mean) },
      annualShortfallRainVsEvaporationMm: { then: round(b.waterDeficitMm.mean), projected: round(f.waterDeficitMm.mean) },
    },
    climateModelsUsed: analysis.future.models.length,
    cropsGrownInThisDistrictToday: grownHere,
    irrigation: water
      ? {
          orchardIrrigationTodayMlPerHectare: water.orchardIrrigationMlPerHa,
          changeInYearlyEvaporationMinusRainMm: water.shortfallChangeMm,
          roughExtraIrrigationMlPerHectare: water.extraMlPerHa,
          roughExtraAsShareOfTodaysUse: water.extraShareOfToday,
          note: 'Irrigation today is ABS 2020-21 data; the extra figure is a rough indication, not a crop water budget.',
        }
      : null,
    crops: crops.map((c) => ({
      crop: c.label,
      overall: c.overall,
      chillPortionsNeeded: c.chillPortionsRequirement,
      seasons: c.seasons
        .filter((s) => s.verdict !== 'no-data')
        .map((s) => ({
          season: s.season,
          verdict: s.verdict,
          measure:
            s.season === 'winter' ? '% of winters with enough chill' : s.season === 'spring' ? '% of years with damaging frost at flowering' : 'hot days in a typical summer',
          then: round(s.baseline ?? NaN),
          projected: round(s.future ?? NaN),
        })),
    })),
  };

  return withRetry('summary', async (model) => {
  const res = await ai().models.generateContent({
    model,
    contents: `Facts (JSON):\n${JSON.stringify(facts, null, 2)}`,
    config: {
      temperature: 0.3,
      // Newer Gemini models "think" before writing and that counts against this limit; 600 was
      // sometimes used up entirely, leaving an empty reply. Length is kept short by the instructions.
      maxOutputTokens: 4096,
      systemInstruction: [
        'You write short briefs for Australian orchardists deciding what to plant on a block that will crop for the next 20 years.',
        'Use plain Australian English, as if talking to the grower over the fence. No headings, no bullet points, no markdown.',
        'Two short paragraphs, under 160 words total.',
        'Only use numbers that appear in the facts. Never invent figures, varieties, prices or sources. Skip any value that is null.',
        'Paragraph 1: how the seasons are changing at this location: winter chill, spring frost, summer heat and water, in that order. Only mention the changes that matter most. If irrigation facts are given, say how much orchards irrigate today and roughly how that need could change, calling the change rough.',
        'Paragraph 2: what that means for the crops. If cropsGrownInThisDistrictToday is not empty, start with how those crops fare, then mention the best other option. Name the season that holds back any risky crop.',
        'End with one sentence saying these are model projections and the cultivar choice should be checked with their nursery or an Agriculture Victoria adviser.',
      ].join('\n'),
    },
  });
  const text = res.text?.trim();
  if (!text) throw new EmptyReplyError('Empty response from Gemini.');
  return text;
  });
}

const CATEGORIES = ['heat', 'water', 'pest', 'disease', 'nutrient', 'healthy', 'unclear'] as const;
const clip = (max: number) => z.string().transform((v) => (v.length > max ? `${v.slice(0, max - 1).trimEnd()}…` : v));

/**
 * Lenient on shape, strict on meaning: extra list items are dropped and long text is trimmed
 * rather than rejecting a good answer (Gemini sometimes returns 6 signs or a long sentence).
 * Anything it can't use falls back to the cautious option.
 */
const diagnosisSchema = z.object({
  likelyIssue: clip(200).pipe(z.string().min(1)),
  category: z.string().transform((v) => ((CATEGORIES as readonly string[]).includes(v.toLowerCase()) ? v.toLowerCase() : 'unclear') as (typeof CATEGORIES)[number]),
  confidence: z.string().transform((v) => (['low', 'medium', 'high'].includes(v.toLowerCase()) ? v.toLowerCase() : 'low') as 'low' | 'medium' | 'high'),
  signs: z.array(clip(200)).default([]).transform((a) => a.slice(0, 5)),
  actions: z.array(clip(240)).default([]).transform((a) => a.slice(0, 4)),
  climateLink: clip(300).default(''),
  seeAdvisor: z.boolean().default(true),
});

const diagnosisJsonSchema = {
  type: 'object',
  properties: {
    likelyIssue: { type: 'string', description: 'Most likely problem, in plain words' },
    category: { type: 'string', enum: ['heat', 'water', 'pest', 'disease', 'nutrient', 'healthy', 'unclear'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    signs: { type: 'array', items: { type: 'string' }, description: 'Visible signs in the photo that support this' },
    actions: { type: 'array', items: { type: 'string' }, description: 'Practical next steps, most urgent first' },
    climateLink: { type: 'string', description: 'How this relates to heat, drought or changing seasons, or empty if unrelated' },
    seeAdvisor: { type: 'boolean', description: 'True if the grower should get an expert or lab to confirm' },
  },
  required: ['likelyIssue', 'category', 'confidence', 'signs', 'actions', 'climateLink', 'seeAdvisor'],
} as const;

export async function diagnosePhoto(imageBase64: string, mimeType: string, crop?: string): Promise<StressDiagnosis> {
  return withRetry('photo check', async (model) => {
  const res = await ai().models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { data: imageBase64, mimeType } },
          { text: crop ? `The grower says this is: ${crop}.` : 'The grower did not say what crop this is.' },
        ],
      },
    ],
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseJsonSchema: diagnosisJsonSchema,
      systemInstruction: [
        'You help Australian fruit growers triage photos of trees, leaves and fruit.',
        'Focus on climate stress first: heat and sunburn damage, water stress, and pests or diseases that are spreading with warmer seasons.',
        'Only describe what is visible. If the photo is not a plant, is blurry, or the cause is ambiguous, use category "unclear" and low confidence.',
        'Do not recommend specific chemical products or application rates. Recommend confirming with an agronomist or lab when the call matters.',
        'Plain Australian English, short sentences.',
      ].join('\n'),
    },
  });
  const text = res.text?.trim();
  if (!text) throw new EmptyReplyError('Empty response from Gemini.');
  // A malformed reply (SyntaxError) or one we can't use is retried like a busy error.
  const parsed = diagnosisSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new SyntaxError(`Unusable diagnosis: ${parsed.error.issues[0]?.message ?? 'bad shape'}`);
  return parsed.data;
  });
}

