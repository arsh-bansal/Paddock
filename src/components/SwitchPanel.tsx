import { useId } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CropOption } from '../../shared/crops';
import { badYearChance, cashflow, inputsComplete, timelineFor } from '../../shared/finance';
import type { CropEvaluation } from '../../shared/seasons';
import { analyseSwitch, compareStaySwitch, stayCashflow } from '../../shared/switching';
import { switchPaths, stayVsSwitchLines } from '../lib/switchText';
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
}

const money = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-AU')}`;

/** "What do you grow now?": the current crop's outlook, what holds up better, and how to switch. */
export function SwitchPanel({ ranked, crops, currentId, onCurrent, compareId, onCompare, varietyFor, financeFor, period }: Props) {
  const selectId = useId();
  const compareSelectId = useId();
  const a = currentId ? analyseSwitch(currentId, ranked, crops) : null;
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
        </select>
      </label>

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

