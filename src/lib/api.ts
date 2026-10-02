import type { ClimateAnalysis, OptionEvaluation, StressDiagnosis } from '../../shared/types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error('Could not reach the Paddock server. Check your connection and try again.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status}).`);
  return body as T;
}

export function fetchClimate(lat: number, lon: number, label: string) {
  const q = new URLSearchParams({ lat: String(lat), lon: String(lon), label });
  return request<ClimateAnalysis>(`/api/climate?${q}`);
}

export function fetchBrief(analysis: ClimateAnalysis, options: OptionEvaluation[]) {
  return request<{ text: string }>('/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysis, options }),
  });
}

export function fetchDiagnosis(image: string, mimeType: string, crop?: string) {
  return request<StressDiagnosis>('/api/diagnose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, mimeType, crop }),
  });
}

/** Downscale a photo in the browser so uploads are fast on rural mobile connections. */
export async function prepareImage(file: File, maxSide = 1280): Promise<{ base64: string; mimeType: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg', preview: dataUrl };
}
