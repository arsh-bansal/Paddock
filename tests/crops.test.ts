import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CROP_OPTIONS,
  cropLabel,
  defaultRequirement,
  hasIndicativeData,
  type CropOption,
} from '../shared/crops';

/*
 * These tests exercise two things:
 *  1. The real catalogue loaded from shared/crops.data.json (the loader ran at import time).
 *  2. A schema identical to the loader's, parsed against hand-built inputs, so we can assert the
 *     validation rules (duplicate ids, bad ranges, enum, keyword expansion, source default) throw
 *     or coerce as designed without needing to ship broken JSON.
 */

const HEAT = { high: 5, medium: 10, low: 15 } as const;

const sourced = z.object({
  indicative: z.boolean(),
  source: z.string().default(''),
});

const cropSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).max(60),
  crop: z.string().min(1),
  type: z.string().min(1),
  category: z.enum(['stone fruit', 'pome fruit', 'cherry']),
  heatNote: z.string().min(1).max(300),
  winter: sourced.extend({
    chillHours: z
      .tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])
      .refine(([lo, hi]) => lo <= hi, 'chillHours must be [min, max] with min <= max'),
  }),
  spring: sourced
    .extend({
      floweringMonths: z.array(z.number().int().min(1).max(12)).min(1),
      frostDamageC: z.number(),
    })
    .nullable(),
  summer: sourced
    .extend({
      hotDaysTolerated: z.union([
        z.number().int().positive(),
        z.enum(['high', 'medium', 'low']).transform((k) => HEAT[k]),
      ]),
    })
    .nullable(),
});

const cropsSchema = z
  .array(cropSchema)
  .min(1)
  .refine((cs) => new Set(cs.map((c) => c.id)).size === cs.length, 'crop ids must be unique');

/** A minimal valid crop object we can mutate per test. */
const valid = () => ({
  id: 'test-crop',
  crop: 'Test',
  type: 'Standard varieties',
  category: 'stone fruit',
  heatNote: 'A heat note.',
  winter: { chillHours: [400, 800], indicative: false, source: 'x' },
  spring: { floweringMonths: [8, 9], frostDamageC: -2, indicative: true, source: '' },
  summer: { hotDaysTolerated: 'medium', indicative: true },
});

describe('crops loader (real catalogue)', () => {
  it('parses the shipped data and loads at least 10 crops', () => {
    expect(CROP_OPTIONS.length).toBeGreaterThanOrEqual(10);
  });

  it('includes every documented crop id', () => {
    const ids = new Set(CROP_OPTIONS.map((c) => c.id));
    for (const id of [
      'peach-standard',
      'peach-low',
      'apricot',
      'plum-japanese',
      'plum-european',
      'cherry-standard',
      'cherry-low',
      'apple-mainstream',
      'apple-low',
      'pear',
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('has unique ids', () => {
    expect(new Set(CROP_OPTIONS.map((c) => c.id)).size).toBe(CROP_OPTIONS.length);
  });

  it('applies decision 1: standard sweet cherry is a sourced range around 700', () => {
    const cherry = CROP_OPTIONS.find((c) => c.id === 'cherry-standard')!;
    expect(cherry.winter.chillHours).toEqual([600, 800]);
    expect(cherry.winter.indicative).toBe(false);
    expect(cherry.winter.source).toContain('Chill Hours Tracker');
  });

  it('expands heat band keywords to the legacy numbers', () => {
    // Every crop uses a keyword in the JSON; after loading they must be numeric 5/10/15.
    for (const c of CROP_OPTIONS) {
      if (c.summer) expect([5, 10, 15]).toContain(c.summer.hotDaysTolerated);
    }
  });
});

describe('crops helpers (preserved behaviour)', () => {
  const peach = CROP_OPTIONS.find((c) => c.id === 'peach-standard')!;

  it('cropLabel joins crop and lowercased type', () => {
    expect(cropLabel(peach)).toBe('Peach / nectarine, standard-chill varieties');
  });

  it('defaultRequirement is the midpoint of the chill range', () => {
    expect(defaultRequirement(peach)).toBe(Math.round((400 + 800) / 2));
    expect(defaultRequirement(peach)).toBe(600);
  });

  it('hasIndicativeData reflects any indicative season', () => {
    // peach-standard: winter sourced, spring+summer indicative -> true
    expect(hasIndicativeData(peach)).toBe(true);
    const allSourced: CropOption = {
      ...peach,
      winter: { ...peach.winter, indicative: false },
      spring: peach.spring ? { ...peach.spring, indicative: false } : null,
      summer: peach.summer ? { ...peach.summer, indicative: false } : null,
    };
    expect(hasIndicativeData(allSourced)).toBe(false);
  });
});

describe('crops schema validation', () => {
  it('accepts valid data', () => {
    expect(() => cropsSchema.parse([valid()])).not.toThrow();
  });

  it('throws on duplicate ids', () => {
    expect(() => cropsSchema.parse([valid(), valid()])).toThrow();
  });

  it('throws when chillHours min > max', () => {
    const bad = valid();
    bad.winter.chillHours = [900, 400];
    expect(() => cropsSchema.parse([bad])).toThrow();
  });

  it('throws when floweringMonths are out of 1-12', () => {
    const bad = valid();
    bad.spring.floweringMonths = [0, 13];
    expect(() => cropsSchema.parse([bad])).toThrow();
  });

  it('throws on a category outside the enum', () => {
    const bad = valid();
    (bad as { category: string }).category = 'citrus';
    expect(() => cropsSchema.parse([bad])).toThrow();
  });

  it('expands the "medium" heat keyword to 10', () => {
    const parsed = cropsSchema.parse([valid()]);
    expect(parsed[0].summer!.hotDaysTolerated).toBe(10);
  });

  it('passes a numeric hotDaysTolerated through unchanged', () => {
    const c = valid();
    (c.summer as unknown as { hotDaysTolerated: number }).hotDaysTolerated = 7;
    const parsed = cropsSchema.parse([c]);
    expect(parsed[0].summer!.hotDaysTolerated).toBe(7);
  });

  it('defaults an omitted source to the empty string', () => {
    const c = valid();
    // summer omits source entirely; loader should fill ''.
    const parsed = cropsSchema.parse([c]);
    expect(parsed[0].summer!.source).toBe('');
  });
});
