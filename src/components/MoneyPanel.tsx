import { useId } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cashflow, type FinanceInputs, type Timeline } from '../../shared/finance';
import { moneyText, moneyLines } from '../lib/moneyText';

export interface FinanceControl {
  inputs: FinanceInputs;
  onChange: (next: FinanceInputs) => void;
  timeline: Timeline | null;
  endYear: number;
  /** Chance a projected year is bad for this crop, or null if no season is scored */
  badYearChance: number | null;
}

const money = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-AU')}`;

function NumberField({ label, unit, value, onChange, step = 'any', hint }: {
  label: string; unit: string; value: number | null; onChange: (v: number | null) => void; step?: string; hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold">{label}</label>
      <div className="flex items-center gap-2">
        <input id={id} type="number" inputMode="decimal" min={0} step={step} value={value ?? ''}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => {
            const raw = e.target.value.trim();
            const n = Number(raw);
            onChange(raw === '' || !Number.isFinite(n) ? null : Math.max(0, n));
          }}
          className="w-28 rounded-md border border-line bg-card px-2 py-1.5 text-right tabular" />
        <span className="text-sm text-muted">{unit}</span>
      </div>
      {hint && <span id={`${id}-hint`} className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

/** "Will it pay?": the grower's own numbers combined with the crop's timeline and climate risk. */
export function MoneyPanel({ label, f }: { label: string; f: FinanceControl }) {
  const i = f.inputs;
  const set = (patch: Partial<FinanceInputs>) => f.onChange({ ...i, ...patch });
  const cf = f.timeline ? cashflow(i, f.timeline, f.endYear, f.badYearChance) : null;
  const text = cf && f.timeline ? moneyText(cf, f.timeline, i) : null;

  return (
    <details className="mt-2 rounded-lg bg-paper px-3 py-2 text-sm" open={Boolean(cf)}>
      <summary className="cursor-pointer font-bold text-muted">
        {cf ? `Will it pay? ${text!.headline}` : 'Will it pay? Add your numbers'}
      </summary>
      <div className="mt-3 space-y-4">
        <p className="text-muted">
          Use your own figures, per hectare, for {label.toLowerCase()}. Paddock adds when the crop starts paying and how often the
          projected climate gives a bad year.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField label="Price you expect" unit="$/kg" value={i.pricePerKg} onChange={(v) => set({ pricePerKg: v })} />
          <NumberField label="Yield at full crop" unit="t/ha" value={i.fullYieldTPerHa} onChange={(v) => set({ fullYieldTPerHa: v })} />
          <NumberField label="Cost to plant" unit="$/ha" step="100" value={i.plantingCostPerHa} onChange={(v) => set({ plantingCostPerHa: v })}
            hint="Trees, trellis, irrigation, netting: one-off" />
          <NumberField label="Running cost" unit="$/ha a year" step="100" value={i.yearlyCostPerHa} onChange={(v) => set({ yearlyCostPerHa: v })}
            hint="Labour, water, sprays, picking" />
          <NumberField label="Crop lost in a bad year" unit="%" step="5" value={i.badYearLossPct}
            onChange={(v) => set({ badYearLossPct: Math.min(100, v ?? 0) })} hint="Your estimate for a short-chill or frosted year" />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-bold">Years to first / full crop</span>
            <div className="flex items-center gap-2">
              <input aria-label="Years to first crop" type="number" min={1} max={20} value={i.firstCropAfterYears ?? f.timeline?.firstAfter ?? ''}
                onChange={(e) => set({ firstCropAfterYears: e.target.value === '' ? null : Math.max(1, Math.round(Number(e.target.value))) })}
                className="w-16 rounded-md border border-line bg-card px-2 py-1.5 text-right tabular" />
              <span className="text-muted">/</span>
              <input aria-label="Years to full crop" type="number" min={1} max={30} value={i.fullCropAfterYears ?? f.timeline?.fullAfter ?? ''}
                onChange={(e) => set({ fullCropAfterYears: e.target.value === '' ? null : Math.max(1, Math.round(Number(e.target.value))) })}
                className="w-16 rounded-md border border-line bg-card px-2 py-1.5 text-right tabular" />
              <span className="text-sm text-muted">years</span>
            </div>
            <span className="text-xs text-muted">Pre-filled from the crop data; change to match your trees</span>
          </div>
        </div>

        {cf && text ? (
          <div className="space-y-3 rounded-lg bg-card p-3">
            {moneyLines(cf, text).map((l) => <p key={l}>{l}</p>)}
            <div className="h-48 w-full" role="img" aria-label={text.summary}>
              <ResponsiveContainer>
                <LineChart data={cf.years} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#e7e9e1" vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: '#5b5e55', fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#d8dbd0' }} />
                  <YAxis width={64} tick={{ fill: '#5b5e55', fontSize: 12 }} tickLine={false} axisLine={false}
                    tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${v < 0 ? '−' : ''}$${Math.round(Math.abs(v) / 1000)}k` : money(v))} />
                  <ReferenceLine y={0} stroke="#9a9c94" />
                  <Line dataKey="cumulative" name="Running total" stroke="#2f5a3b" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="cumulativeRisk" name="With climate risk" stroke="#c9861b" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                  <Tooltip formatter={(v: unknown, n: unknown) => [money(Number(v)), String(n)]} labelFormatter={(y: unknown) => `Year ${y}`}
                    contentStyle={{ borderRadius: 8, borderColor: '#d8dbd0', fontFamily: 'Atkinson Hyperlegible, sans-serif' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted">
              Solid: running total per hectare. Dashed: allowing for climate risk. {text.caveat}
            </p>
          </div>
        ) : (
          <p className="text-muted">Enter price, yield and both costs to see when this block pays back.</p>
        )}
      </div>
    </details>
  );
}
