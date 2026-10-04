import { createStore, del, entries, get, set, type UseStore } from "idb-keyval";
import type { BriefState } from "../components/Brief";
import type { PickedLocation } from "../components/LocationPicker";
import type { OptionState } from "./optionState";
import type { OtherCrop } from "../../shared/switching";
import type { ClimateAnalysis } from "../../shared/types";

/**
 * Reports saved on this device (IndexedDB). Nothing leaves the browser.
 * Full records and a small metadata index live in separate stores so the list
 * loads instantly without reading every analysis.
 */

export const MAX_SAVED_REPORTS = 30;
const RECORD_VERSION = 1;

export interface SavedReport {
  id: string;
  version: typeof RECORD_VERSION;
  savedAt: string;
  location: PickedLocation;
  options: OptionState;
  analysis: ClimateAnalysis;
  brief: BriefState | null;
  /** The crop on the block now, if the grower said (optional so older saved reports still load) */
  currentCropId?: string | null;
  /** What they typed when it's not in the list (with their income and costs) */
  otherCrop?: OtherCrop;
}

export interface SavedReportMeta {
  id: string;
  savedAt: string;
  label: string;
  /** Best overall crop at save time, for the list */
  topCrop: string | null;
  cropCount: number;
}

export class StorageUnavailableError extends Error {
  constructor() {
    super(
      "This browser isn’t letting Paddock save reports. Private browsing often blocks it.",
    );
  }
}

let stores: { data: UseStore; meta: UseStore } | null = null;
function db() {
  if (typeof indexedDB === "undefined") throw new StorageUnavailableError();
  stores ??= {
    data: createStore("Paddock-reports", "reports"),
    meta: createStore("Paddock-reports-meta", "meta"),
  };
  return stores;
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StorageUnavailableError) throw err;
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      throw new Error(
        "This device is out of storage space. Delete a saved report and try again.",
      );
    }
    throw new StorageUnavailableError();
  }
}

/** Strictly increasing save times, so two saves in the same millisecond still sort correctly. */
let lastSavedMs = 0;
function nextSavedAt(): string {
  lastSavedMs = Math.max(Date.now(), lastSavedMs + 1);
  return new Date(lastSavedMs).toISOString();
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export async function listReports(): Promise<SavedReportMeta[]> {
  return guard(async () => {
    const all = await entries<string, SavedReportMeta>(db().meta);
    return all
      .map(([, m]) => m)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  });
}

export async function saveReport(
  input: Omit<SavedReport, "id" | "version" | "savedAt">,
  meta: Pick<SavedReportMeta, "topCrop" | "cropCount">,
): Promise<SavedReportMeta> {
  return guard(async () => {
    const { data, meta: metaStore } = db();
    const record: SavedReport = {
      ...input,
      id: newId(),
      version: RECORD_VERSION,
      savedAt: nextSavedAt(),
    };
    const m: SavedReportMeta = {
      id: record.id,
      savedAt: record.savedAt,
      label: input.analysis.location.label,
      ...meta,
    };
    await set(record.id, record, data);
    await set(record.id, m, metaStore);

    // Keep the newest MAX_SAVED_REPORTS.
    const existing = await listReports();
    for (const old of existing.slice(MAX_SAVED_REPORTS))
      await deleteReport(old.id);
    return m;
  });
}

export type LoadResult =
  | { ok: true; report: SavedReport }
  | { ok: false; reason: "missing" | "outdated" };

export async function loadReport(id: string): Promise<LoadResult> {
  return guard(async () => {
    const record = await get<SavedReport>(id, db().data);
    if (!record) {
      await del(id, db().meta); // orphaned index entry
      return { ok: false, reason: "missing" } as const;
    }
    if (
      record.version !== RECORD_VERSION ||
      record.analysis?.schemaVersion !== 2
    ) {
      return { ok: false, reason: "outdated" } as const;
    }
    return { ok: true, report: record } as const;
  });
}

export async function deleteReport(id: string): Promise<void> {
  return guard(async () => {
    await del(id, db().data);
    await del(id, db().meta);
  });
}
