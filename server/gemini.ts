import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { ClimateAnalysis, OptionEvaluation, StressDiagnosis } from '../shared/types';

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
let client: GoogleGenAI | null = null;

export class AiUnavailableError extends Error {}

function ai(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') throw new AiUnavailableError('GEMINI_API_KEY is not set on the server.');
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

const round = (n: number) => Math.round(n);

/** Plain-English brief for the grower. The model only rewords numbers we computed. */
export async function explainResult(analysis: ClimateAnalysis, options: OptionEvaluation[]): Promise<string> {
  const facts = {
    location: analysis.location.label,
    winterChillHours: {
      [`${analysis.baseline.period[0]}-${analysis.baseline.period[1]} typical`]: round(analysis.baseline.chillHours.median),
      [`${analysis.future.period[0]}-${analysis.future.period[1]} typical`]: round(analysis.future.chillHours.median),
      [`${analysis.future.period[0]}-${analysis.future.period[1]} poor winter (1 in 10)`]: round(analysis.future.chillHours.p10),
    },
    hotDaysPerSummerAtOrAbove35C: {
      baseline: Number(analysis.baseline.hotDays.mean.toFixed(1)),
      future: Number(analysis.future.hotDays.mean.toFixed(1)),
    },
    climateModelsUsed: analysis.future.models.length,
    options: options.map((o) => ({
      option: o.label,
      chillNeededHours: o.requirement,
      percentOfWintersMetBaseline: round(o.baselinePctMet),
      percentOfWintersMetFuture: round(o.futurePctMet),
      verdict: o.verdict,
    })),
  };

  const res = await ai().models.generateContent({
    model: MODEL,
    contents: `Facts (JSON):\n${JSON.stringify(facts, null, 2)}`,
    config: {
      temperature: 0.3,
      maxOutputTokens: 600,
      systemInstruction: [
        'You write short briefs for Australian orchardists deciding what to plant on a block that will crop for the next 20 years.',
        'Use plain Australian English, as if talking to the grower over the fence. No headings, no bullet points, no markdown.',
        'Two short paragraphs, under 140 words total.',
        'Only use numbers that appear in the facts. Never invent figures, varieties, prices or sources.',
        'Paragraph 1: how winter chill and summer heat are changing at this location.',
        'Paragraph 2: what that means for the options, starting with the safest one.',
        'End with one sentence saying these are model projections and the cultivar choice should be checked with their nursery or an Agriculture Victoria adviser.',
      ].join('\n'),
    },
  });
  const text = res.text?.trim();
  if (!text) throw new Error('Empty response from Gemini.');
  return text;
}

const diagnosisSchema = z.object({
  likelyIssue: z.string().min(1).max(200),
  category: z.enum(['heat', 'water', 'pest', 'disease', 'nutrient', 'healthy', 'unclear']),
  confidence: z.enum(['low', 'medium', 'high']),
  signs: z.array(z.string().max(200)).max(5),
  actions: z.array(z.string().max(240)).max(4),
  climateLink: z.string().max(300),
  seeAdvisor: z.boolean(),
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
  const res = await ai().models.generateContent({
    model: MODEL,
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
  const parsed = diagnosisSchema.safeParse(JSON.parse(res.text ?? '{}'));
  if (!parsed.success) throw new Error('Gemini returned an unexpected diagnosis format.');
  return parsed.data;
}
