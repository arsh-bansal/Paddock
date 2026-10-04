import { useId } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CropOption } from '../../shared/crops';
import { badYearChance, cashflow, inputsComplete, timelineFor } from '../../shared/finance';
import type { CropEvaluation } from '../../shared/seasons';
import { analyseSwitch, bestFitsForOther, compareStaySwitch, OTHER_CROP, stayCashflow, stayCashflowFromIncome, type OtherCrop } from '../../shared/switching';
import type { RegionCrops } from '../../shared/regionCrops';
import { otherLocalNote, otherPaths, otherStayVsSwitchLines, switchPaths, stayVsSwitchLines } from '../lib/switchText';
import { CardList, CropCard, VERDICT_UI, type VarietyControl } from './CropResults';
import type { FinanceControl } from './MoneyPanel';

interface Props {
  ranked: CropEvaluation[];
  crops: CropOption[];
  currentId: string | null;
  onCurrent: (id: string | null) => void;
  compareId: string | null;
  onCompare: (id: string | null) => void;
  varietyFor: (c: CropEvaluation) => VarietyControl | undefined;
  financeFor: (c: CropEvaluation) => FinanceControl | undefined;
  period: readonly [number, number];
  /** What the grower typed when they grow something not in the list */
  other: OtherCrop;
  onOther: (next: OtherCrop) => void;
  region: RegionCrops | null;
}

const money = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-AU')}`;

/** "What do you grow now?": the current crop's outlook, what holds up better, and how to switch. */
export function SwitchPanel({ ranked, crops, currentId, onCurrent, compareId, onCompare, varietyFor, financeFor, period, other, onOther, region }: Props) {
  const selectId = useId();
  const compareSelectId = useId();
  const a = currentId && currentId !== OTHER_CROP ? analyseSwitch(currentId, ranked, crops) : null;
  const choices = a ? [...a.sameCrop, ...a.better] : [];
  const target = choices.find((c) => c.id === compareId) ?? choices[0] ?? null;

  // Stay vs switch, using the grower's own figures for both crops.
  const fCur = a ? financeFor(a.current) : undefined;
  const fTarget = target ? financeFor(target) : undefined;
  const targetCrop = target ? crops.find((c) => c.id === target.id) : undefined;
  const stay = fCur && inputsComplete(fCur.inputs) ? stayCashflow(fCur.inputs, period[0], period[1], badYearChance(a!.current)) : null;
  const tTarget = targetCrop && fTarget ? timelineFor(targetCrop, period[0], fTarget.inputs) : null;
  const sw = fTarget && tTarget && inputsComplete(fTarget.inputs) ? cashflow(fTarget.inputs, tTarget, period[1], badYearChance(target!)) : null;
  const cmp = stay && sw ? compareStaySwitch(stay, sw) : null;
  const chartData = cmp ? cmp.stay.years.map((y, i) => ({ year: y.year, stay: y.cumulativeRisk, switch: cmp.switchTo.years[i]?.cumulativeRisk })) : [];

  return (
    <section aria-labelledby="switch-heading" className="space-y-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
      <div className="space-y-1">
        <h3 id="switch-heading" className="text-xl font-bold">Thinking of switching?</h3>
        <p className="text-muted">Tell us what’s on the block now to see how it holds up and what you could change to.</p>
      </div>
      <label htmlFor={selectId} className="flex flex-wrap items-center gap-3">
        <span className="font-bold">What do you grow on this block now?</span>
        <select id={selectId} value={currentId ?? ''} onChange={(e) => onCurrent(e.target.value || null)}
          className="rounded-md border border-line bg-card px-3 py-2">
          <option value="">Nothing yet / starting fresh</option>
          {ranked.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          <option value={OTHER_CROP}>Something else (not in the list)</option>
        </select>
      </label>

      {currentId === OTHER_CROP && (
        <OtherSwitch ranked={ranked} crops={crops} other={other} onOther={onOther} compareId={compareId} onCompare={onCompare}
          varietyFor={varietyFor} financeFor={financeFor} period={period} region={region} />
      )}

      {a && (
        <div className="space-y-6">
          <div className="space-y-2">
            <h4 className="font-display text-lg font-bold">
              What you grow now: <span className={`rounded-full px-2.5 py-0.5 text-base ${VERDICT_UI[a.current.overall].chip}`}>{VERDICT_UI[a.current.overall].label}</span>
            </h4>
            <ul className="space-y-3">
              <CropCard c={a.current} variety={varietyFor(a.current)} finance={financeFor(a.current)} />
            </ul>
            <p className="text-sm text-muted">
              In “Will it pay?” for your current crop, enter the price, yield and running cost of your existing trees. The cost to plant is ignored when comparing, since they’re already in the ground.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-display text-lg font-bold">Ways to switch, cheapest first</h4>
            <ol className="list-decimal space-y-2 pl-5">
              {switchPaths(a).map((p) => (
                <li key={p.title}>
                  <span className="font-bold">{p.title}.</span> {p.text}
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-2">
            <h4 className="font-display text-lg font-bold">
              {a.alreadyBest ? 'Nothing holds up clearly better here' : `Holds up better on climate here (${a.sameCrop.length + a.better.length})`}
            </h4>
            {a.alreadyBest ? (
              <p className="text-muted">On climate, your current crop is already among the best fits for this block through {period[1]}.</p>
            ) : (
              <CardList crops={choices} varietyFor={varietyFor} financeFor={financeFor} />
            )}
          </div>

          {choices.length > 0 && (
            <div className="space-y-3 rounded-xl border border-line p-4">
              <h4 className="font-display text-lg font-bold">Stay or switch: your money</h4>
              <label htmlFor={compareSelectId} className="flex flex-wrap items-center gap-3">
                <span>Compare staying with switching to</span>
                <select id={compareSelectId} value={target?.id ?? ''} onChange={(e) => onCompare(e.target.value || null)}
                  className="rounded-md border border-line bg-card px-3 py-2">
                  {choices.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                </select>
              </label>
              {cmp && target ? (
                <>
                  {stayVsSwitchLines(cmp, a.current.label, target.label).map((l) => <p key={l}>{l}</p>)}
                  <div className="h-48 w-full" role="img" aria-label={stayVsSwitchLines(cmp, a.current.label, target.label).join(' ')}>
                    <ResponsiveContainer>
                      <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                        <CartesianGrid stroke="#e7e9e1" vertical={false} />
                        <XAxis dataKey="year" tick={{ fill: '#5b5e55', fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#d8dbd0' }} />
                        <YAxis width={64} tick={{ fill: '#5b5e55', fontSize: 12 }} tickLine={false} axisLine={false}
                          tickFormatter={(v: number) => `${v < 0 ? '−' : ''}$${Math.round(Math.abs(v) / 1000)}k`} />
                        <ReferenceLine y={0} stroke="#9a9c94" />
                        <Line dataKey="stay" name={`Stay: ${a.current.label}`} stroke="#5b5e55" strokeWidth={2} dot={false} isAnimationActive={false} />
                        <Line dataKey="switch" name={`Switch: ${target.label}`} stroke="#2f5a3b" strokeWidth={2} dot={false} isAnimationActive={false} />
                        <Tooltip formatter={(v: unknown, n: unknown) => [money(Number(v)), String(n)]} labelFormatter={(y: unknown) => `Year ${y}`}
                          contentStyle={{ borderRadius: 8, borderColor: '#d8dbd0', fontFamily: 'Atkinson Hyperlegible, sans-serif' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-muted">
                    Running totals per hectare, both allowing for climate risk. Grey: keep your current trees. Green: switch now. A planning sketch with your figures; doesn’t include the cost of removing trees.
                  </p>
                </>
              ) : (
                <p className="text-muted">
                  Add your figures in “Will it pay?” for both {a.current.label.toLowerCase()} and {target?.label.toLowerCase()} to compare staying with switching.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Something not in our database (olives, citrus, grazing, cropping…): what suits the block instead. */
function OtherSwitch({ ranked, crops, other, onOther, compareId, onCompare, varietyFor, financeFor, period, region }: {
  ranked: CropEvaluation[]; crops: CropOption[]; other: OtherCrop; onOther: (o: OtherCrop) => void;
  compareId: string | null; onCompare: (id: string | null) => void;
  varietyFor: (c: CropEvaluation) => VarietyControl | undefined; financeFor: (c: CropEvaluation) => FinanceControl | undefined;
  period: readonly [number, number]; region: RegionCrops | null;
}) {
  const nameId = useId();
  const incomeId = useId();
  const costId = useId();
  const compareSelectId = useId();
  const name = other.name.trim();
  const choices = bestFitsForOther(ranked);
  const target = choices.find((c) => c.id === compareId) ?? choices[0] ?? null;
  const local = otherLocalNote(name, region);

  const stay = stayCashflowFromIncome(other, period[0], period[1]);
  const fTarget = target ? financeFor(target) : undefined;
  const targetCrop = target ? crops.find((c) => c.id === target.id) : undefined;
  const tTarget = targetCrop && fTarget ? timelineFor(targetCrop, period[0], fTarget.inputs) : null;
  const sw = fTarget && tTarget && inputsComplete(fTarget.inputs) ? cashflow(fTarget.inputs, tTarget, period[1], badYearChance(target!)) : null;
  const cmp = stay && sw ? compareStaySwitch(stay, sw) : null;
  const label = name || 'your current crop';
  const num = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Number(v)));

  return (
    <div className="space-y-6">
      <label htmlFor={nameId} className="flex flex-wrap items-center gap-3">
        <span className="font-bold">What do you grow or run there?</span>
        <input id={nameId} type="text" maxLength={60} placeholder="e.g. olives, sheep grazing, wheat" value={other.name}
          onChange={(e) => onOther({ ...other, name: e.target.value })}
          className="w-72 max-w-full rounded-md border border-line bg-card px-3 py-2" />
      </label>

      {name && (
        <div className="space-y-2 rounded-xl bg-paper p-4">
          <p>
            We can’t rate how {name.toLowerCase()} will cope with the future climate yet: it isn’t in our crop database. Here’s what holds up
            well on your block instead.
          </p>
          {local && <p className="text-sm font-bold text-leaf">{local}</p>}
        </div>
      )}

      <div className="space-y-2">
        <h4 className="font-display text-lg font-bold">Ways to switch</h4>
        <ol className="list-decimal space-y-2 pl-5">
          {otherPaths().map((p) => <li key={p.title}><span className="font-bold">{p.title}.</span> {p.text}</li>)}
        </ol>
        <p className="text-sm text-muted">Grafting a new variety onto existing trees only works within the same kind of fruit, so it isn’t an option here.</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-display text-lg font-bold">Holds up well on your block ({choices.length})</h4>
        {choices.length ? (
          <CardList crops={choices} varietyFor={varietyFor} financeFor={financeFor} />
        ) : (
          <p className="text-muted">None of the crops in our database is a good or risky fit here.</p>
        )}
      </div>

      {choices.length > 0 && (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <h4 className="font-display text-lg font-bold">Stay or switch: your money</h4>
          <div className="flex flex-wrap gap-4">
            <label htmlFor={incomeId} className="flex flex-col gap-1">
              <span className="text-sm font-bold">Your income now</span>
              <span className="flex items-center gap-2">
                <input id={incomeId} type="number" min={0} step={50} value={other.incomePerHa ?? ''}
                  onChange={(e) => onOther({ ...other, incomePerHa: num(e.target.value) })}
                  className="w-28 rounded-md border border-line bg-card px-2 py-1.5 text-right tabular" />
                <span className="text-sm text-muted">$/ha a year</span>
              </span>
            </label>
            <label htmlFor={costId} className="flex flex-col gap-1">
              <span className="text-sm font-bold">Your running cost now</span>
              <span className="flex items-center gap-2">
                <input id={costId} type="number" min={0} step={50} value={other.costPerHa ?? ''}
                  onChange={(e) => onOther({ ...other, costPerHa: num(e.target.value) })}
                  className="w-28 rounded-md border border-line bg-card px-2 py-1.5 text-right tabular" />
                <span className="text-sm text-muted">$/ha a year</span>
              </span>
            </label>
          </div>
          <label htmlFor={compareSelectId} className="flex flex-wrap items-center gap-3">
            <span>Compare staying with switching to</span>
            <select id={compareSelectId} value={target?.id ?? ''} onChange={(e) => onCompare(e.target.value || null)}
              className="rounded-md border border-line bg-card px-3 py-2">
              {choices.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </label>
          {cmp && target ? (
            otherStayVsSwitchLines(cmp, label, target.label).map((l) => <p key={l}>{l}</p>)
          ) : (
            <p className="text-muted">
              Enter your income and running cost now, and your figures in “Will it pay?” for {target?.label.toLowerCase()}, to compare.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
