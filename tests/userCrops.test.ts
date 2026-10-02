import 'fake-indexeddb/auto';
import { set } from 'idb-keyval';
import { createStore } from 'idb-keyval';
import { describe, expect, it } from 'vitest';
import { CROP_OPTIONS } from '../shared/crops';
import {
  addUserCrop,
  deleteUserCrop,
  isUserCrop,
  listUserCrops,
  updateUserCrop,
  USER_CROP_SOURCE,
  USER_CROP_TYPE,
  userCropInputSchema,
} from '../src/lib/userCrops';

const USER_ID = /^user-[a-z0-9-]+$/;
const LOADER_ID = /^[a-z0-9-]+$/; // the crops.ts loader id rule

describe('userCrops store', () => {
  it('add -> list round-trip expands a minimal record into a valid CropOption', async () => {
    const created = await addUserCrop({ name: 'Mango', chillHours: 100 });
    expect(created.id).toMatch(USER_ID);
    expect(created.crop).toBe('Mango');
    expect(created.type).toBe(USER_CROP_TYPE);
    expect(created.winter.chillHours).toEqual([100, 100]);
    expect(created.winter.source).toBe(USER_CROP_SOURCE);
    expect(created.winter.indicative).toBe(true);
    expect(created.spring).toBeNull();
    expect(created.summer).toBeNull();

    const list = await listUserCrops();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(created);
    // Survives a fresh read (persisted, not just in-memory).
    expect((await listUserCrops())[0].id).toBe(created.id);
  });

  it('update changes the record in place, preserving the id', async () => {
    const created = await addUserCrop({ name: 'Guava', chillHours: 50 });
    const updated = await updateUserCrop(created.id, { name: 'Guava, white', chillHours: 75 });
    expect(updated.id).toBe(created.id);
    expect(updated.crop).toBe('Guava, white');
    expect(updated.winter.chillHours).toEqual([75, 75]);

    const list = await listUserCrops();
    const match = list.filter((c) => c.id === created.id);
    expect(match).toHaveLength(1);
    expect(match[0].crop).toBe('Guava, white');
    expect(match[0].winter.chillHours).toEqual([75, 75]);
  });

  it('delete removes the record', async () => {
    const created = await addUserCrop({ name: 'Lychee', chillHours: 200 });
    expect((await listUserCrops()).some((c) => c.id === created.id)).toBe(true);
    await deleteUserCrop(created.id);
    expect((await listUserCrops()).some((c) => c.id === created.id)).toBe(false);
  });

  it('validation rejects bad input before persisting', () => {
    expect(userCropInputSchema.safeParse({ name: '', chillHours: 100 }).success).toBe(false);
    expect(userCropInputSchema.safeParse({ name: '   ', chillHours: 100 }).success).toBe(false);
    expect(userCropInputSchema.safeParse({ name: 'x'.repeat(61), chillHours: 100 }).success).toBe(false);
    expect(userCropInputSchema.safeParse({ name: 'Fig', chillHours: -1 }).success).toBe(false);
    expect(userCropInputSchema.safeParse({ name: 'Fig', chillHours: 2001 }).success).toBe(false);
    expect(userCropInputSchema.safeParse({ name: 'Fig', chillHours: 10.5 }).success).toBe(false);
    expect(userCropInputSchema.safeParse({ name: 'Fig', chillHours: Number.NaN }).success).toBe(false);
    // Valid input passes and trims the name.
    const ok = userCropInputSchema.safeParse({ name: '  Fig  ', chillHours: 300 });
    expect(ok.success && ok.data.name).toBe('Fig');
  });

  it('addUserCrop throws on invalid input and writes nothing', async () => {
    const before = (await listUserCrops()).length;
    await expect(addUserCrop({ name: '', chillHours: 100 })).rejects.toThrow();
    await expect(addUserCrop({ name: 'Bad', chillHours: 9999 })).rejects.toThrow();
    expect((await listUserCrops()).length).toBe(before);
  });

  it('ids are unique, well-formed, and never collide with built-ins', async () => {
    const a = await addUserCrop({ name: 'Olive', chillHours: 300 });
    const b = await addUserCrop({ name: 'Date', chillHours: 400 });
    expect(a.id).not.toBe(b.id);
    for (const id of [a.id, b.id]) {
      expect(id).toMatch(USER_ID);
      expect(id).toMatch(LOADER_ID); // satisfies the loader id regex too
      expect(id.length).toBeLessThanOrEqual(60);
      expect(isUserCrop(id)).toBe(true);
    }
    // No built-in id starts with 'user-' and none equals a user id.
    const builtinIds = new Set(CROP_OPTIONS.map((c) => c.id));
    expect([...builtinIds].some((id) => id.startsWith('user-'))).toBe(false);
    expect(builtinIds.has(a.id)).toBe(false);
    expect(builtinIds.has(b.id)).toBe(false);
  });

  it('skips corrupt / stale records on load instead of throwing', async () => {
    // Reach into the SAME store the loader reads and plant a garbage record.
    const store = createStore('Paddock-user-crops', 'crops');
    await set('user-garbage', { nope: true }, store);
    await set('user-wrongversion', { id: 'user-x', schemaVersion: 2, name: 'X', chillHours: [1, 1], createdAt: 'z' }, store);
    const good = await addUserCrop({ name: 'Pistachio', chillHours: 500 });

    const list = await listUserCrops();
    // Garbage is skipped; the valid crop is still returned.
    expect(list.some((c) => c.id === good.id)).toBe(true);
    expect(list.some((c) => c.id === 'user-garbage')).toBe(false);
    expect(list.some((c) => c.id === 'user-wrongversion')).toBe(false);
  });

  it('expanded user crop satisfies the CropOption invariants the loader enforces', async () => {
    const c = await addUserCrop({ name: 'Pecan', chillHours: 600 });
    // id regex + length, chill range min<=max, winter present, spring/summer null.
    expect(c.id).toMatch(LOADER_ID);
    expect(c.winter.chillHours[0]).toBeLessThanOrEqual(c.winter.chillHours[1]);
    expect(['stone fruit', 'pome fruit', 'cherry']).toContain(c.category);
    expect(c.winter).toBeTruthy();
    expect(c.spring).toBeNull();
    expect(c.summer).toBeNull();
  });
});
