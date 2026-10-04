import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

const busy = () => Object.assign(new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand."}}'), { status: 503 });
const reply = (obj: unknown) => ({ text: JSON.stringify(obj) });
const good = { likelyIssue: 'Sunburn on fruit', category: 'heat', confidence: 'high', signs: ['Brown patch on sun side'], actions: ['Consider netting'], climateLink: 'More hot days.', seeAdvisor: false };

async function load() {
  vi.resetModules();
  process.env.GEMINI_API_KEY = 'test-key';
  return import('../server/gemini');
}

/** Run a promise while fast-forwarding the retry delays. */
async function settle<T>(p: Promise<T>): Promise<T> {
  const done = p.then((v) => ({ v }), (e) => ({ e }));
  for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(2500);
  const r = (await done) as { v?: T; e?: unknown };
  if ('e' in r) throw r.e;
  return r.v as T;
}

describe('Gemini calls are resilient to busy errors and odd replies', () => {
  beforeEach(() => {
    generateContent.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('retries a "high demand" 503 and succeeds', async () => {
    const g = await load();
    generateContent.mockRejectedValueOnce(busy()).mockResolvedValueOnce(reply(good));
    const d = await settle(g.diagnosePhoto('x'.repeat(200), 'image/jpeg'));
    expect(d.category).toBe('heat');
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('uses the lighter fallback model on the last try', async () => {
    const g = await load();
    generateContent.mockRejectedValueOnce(busy()).mockRejectedValueOnce(busy()).mockResolvedValueOnce(reply(good));
    await settle(g.diagnosePhoto('x'.repeat(200), 'image/jpeg'));
    const models = generateContent.mock.calls.map((c) => (c[0] as { model: string }).model);
    expect(models[0]).toBe(models[1]);
    expect(models[2]).not.toBe(models[0]);
  });

  it('gives a clear "busy" error after the retries run out', async () => {
    const g = await load();
    generateContent.mockRejectedValue(busy());
    await expect(settle(g.diagnosePhoto('x'.repeat(200), 'image/jpeg'))).rejects.toBeInstanceOf(g.AiBusyError);
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it('trims an over-long answer instead of rejecting it', async () => {
    const g = await load();
    generateContent.mockResolvedValueOnce(reply({ ...good, signs: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], likelyIssue: 'x'.repeat(500), category: 'HEAT', confidence: 'very sure' }));
    const d = await settle(g.diagnosePhoto('x'.repeat(200), 'image/jpeg'));
    expect(d.signs).toHaveLength(5);
    expect(d.likelyIssue.length).toBeLessThanOrEqual(200);
    expect(d.category).toBe('heat');
    expect(d.confidence).toBe('low'); // unknown confidence falls back to the cautious option
  });

  it('retries an empty summary (a thinking model can use up its budget)', async () => {
    const g = await load();
    generateContent.mockResolvedValueOnce({ text: '' }).mockResolvedValueOnce({ text: 'Winters stay cool enough here.' });
    const analysis = {
      location: { label: 'Test' }, baseline: { period: [1995, 2014], summary: new Proxy({}, { get: () => ({ p10: 1, median: 1, p90: 1, mean: 1 }) }) },
      future: { period: [2026, 2045], models: [1, 2, 3], summary: new Proxy({}, { get: () => ({ p10: 1, median: 1, p90: 1, mean: 1 }) }) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = await settle(g.explainResult(analysis as any, []));
    expect(text).toMatch(/Winters/);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('does not retry a missing API key', async () => {
    vi.resetModules();
    delete process.env.GEMINI_API_KEY;
    const g = await import('../server/gemini');
    await expect(g.diagnosePhoto('x'.repeat(200), 'image/jpeg')).rejects.toBeInstanceOf(g.AiUnavailableError);
    expect(generateContent).not.toHaveBeenCalled();
  });
});
