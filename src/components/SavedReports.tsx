import { useEffect, useState } from 'react';
import { FileDown, FolderOpen, Trash2 } from 'lucide-react';
import { deleteReport, listReports, type SavedReportMeta } from '../lib/savedReports';

interface Props {
  /** Change this to reload the list (e.g. after a save) */
  refreshKey: number;
  onOpen: (id: string) => void;
  onDownload: (id: string) => void;
  busyId: string | null;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export function SavedReports({ refreshKey, onOpen, onDownload, busyId }: Props) {
  const [items, setItems] = useState<SavedReportMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    listReports()
      .then((r) => {
        setItems(r);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [refreshKey]);

  const remove = async (id: string) => {
    try {
      await deleteReport(id);
      setItems((xs) => xs.filter((x) => x.id !== id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConfirming(null);
    }
  };

  if (error) return <p role="alert" className="text-sm text-ember">{error}</p>;
  if (items.length === 0) return null;

  return (
    <details className="rounded-xl border border-line bg-card" open={items.length <= 3}>
      <summary className="cursor-pointer px-4 py-3 font-bold">Saved on this device ({items.length})</summary>
      <ul className="divide-y divide-line border-t border-line">
        {items.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-bold">{r.label}</p>
              <p className="text-sm text-muted">
                {when(r.savedAt)}, {r.cropCount} {r.cropCount === 1 ? 'crop' : 'crops'}
                {r.topCrop ? `, best fit ${r.topCrop}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onOpen(r.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 font-bold hover:border-leaf">
                <FolderOpen size={16} aria-hidden /> Open
              </button>
              <button type="button" onClick={() => onDownload(r.id)} disabled={busyId === r.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 font-bold hover:border-leaf disabled:opacity-50">
                <FileDown size={16} aria-hidden /> {busyId === r.id ? 'Making PDF…' : 'PDF'}
              </button>
              {confirming === r.id ? (
                <button type="button" onClick={() => remove(r.id)} className="rounded-lg bg-ember px-3 py-1.5 font-bold text-white">
                  Delete for good
                </button>
              ) : (
                <button type="button" onClick={() => setConfirming(r.id)} aria-label={`Delete saved report for ${r.label}`}
                  className="inline-flex items-center rounded-lg border border-line px-2.5 py-1.5 text-muted hover:border-ember hover:text-ember">
                  <Trash2 size={16} aria-hidden />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-4 py-2 text-sm text-muted">Saved reports stay in this browser and open without internet. Up to 30 are kept.</p>
    </details>
  );
}
