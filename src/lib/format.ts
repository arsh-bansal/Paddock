export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-AU');
export const fmt1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-AU', { maximumFractionDigits: 1 });
export const pctChange = (from: number, to: number) => Math.round(((to - from) / from) * 100);
