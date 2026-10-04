import type { CropOption } from '../../shared/crops';
import { badYearChance, cashflow, inputsComplete, timelineFor, type FinanceInputs } from '../../shared/finance';
import type { CropEvaluation } from '../../shared/seasons';
import { analyseSwitch, compareStaySwitch, stayCashflow, type StayVsSwitch, type SwitchAnalysis } from '../../shared/switching';

/* Switching wording shared by the screen and the PDF (ASCII-safe for the PDF fonts). */

const money = (v: number) => `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v / 100) * 100).toLocaleString('en-AU')}`;

export function switchPaths(a: SwitchAnalysis): { title: string; text: string }[] {
  const paths: { title: string; text: string }[] = [];
  if (a.sameCrop.length > 0) {
    paths.push({
      title: 'A different variety of the same crop',
      text: `${a.sameCrop.map((e) => e.label).join(', ')} ${a.sameCrop.length === 1 ? 'holds' : 'hold'} up at least as well here. Usually the cheapest switch: you keep your shed, equipment and buyers.`,
    });
  }
  if (a.topWork !== 'no') {
    paths.push({
      title: 'Graft a new variety onto your trees (top-working)',
      text:
        'Keeps the roots, so the block comes back into production much sooner than replanting. It only works within the same kind of fruit. ' +
        (a.topWork === 'any-age'
          ? 'Apples and pears can be top-worked at almost any age.'
          : 'Stone fruit trees older than about 5 years usually can’t be changed this way.'),
    });
  }
  paths.push({
    title: 'Replant gradually',
    text: 'Replace part of the block each year, so income from the rest keeps coming while new trees establish.',
  });
  paths.push({
    title: 'Switch to a different crop',
    text: 'Remove the trees and replant. Check the new crop’s timeline: there are years with little or no income before it crops.',
  });
  return paths;
}

export function stayVsSwitchLines(c: StayVsSwitch, current: string, target: string): string[] {
  const end = c.stay.endYear;
  const lines = [
    `By ${end}, allowing for climate risk: staying with ${current.toLowerCase()} about ${money(c.stay.totalByEndRisk)} per hectare; switching now to ${target.toLowerCase()} about ${money(c.switchTo.totalByEndRisk)}.`,
  ];
  if (c.catchUpYear != null) {
    lines.push(`Switching costs you in the early years, then catches up around ${c.catchUpYear}${c.differenceByEnd > 0 ? ` and is about ${money(c.differenceByEnd)} per hectare ahead by ${end}` : ''}.`);
  } else if (c.differenceByEnd > 0) {
    lines.push(`Switching comes out ahead by about ${money(c.differenceByEnd)} per hectare by ${end}.`);
  } else {
    lines.push(`With these figures, switching doesn’t catch up with staying by ${end}.`);
  }
  return lines;
}

export interface SwitchReport {
  current: string;
  verdict: CropEvaluation['overall'];
  alreadyBest: boolean;
  better: string[];
  paths: { title: string; text: string }[];
  stayVsSwitch: string[] | null;
}

/** Everything the PDF needs about switching, or null when the grower didn't say what they grow. */
export function switchReport(
  currentId: string | null,
  compareId: string | null,
  ranked: CropEvaluation[],
  crops: CropOption[],
  finance: Record<string, FinanceInputs | undefined>,
  period: readonly [number, number],
): SwitchReport | null {
  if (!currentId) return null;
  const a = analyseSwitch(currentId, ranked, crops);
  if (!a) return null;
  const choices = [...a.sameCrop, ...a.better];
  const target = choices.find((c) => c.id === compareId) ?? choices[0];
  let lines: string[] | null = null;
  const fCur = finance[a.current.id];
  const fTarget = target ? finance[target.id] : undefined;
  const targetCrop = target ? crops.find((c) => c.id === target.id) : undefined;
  if (target && fCur && fTarget && targetCrop && inputsComplete(fCur) && inputsComplete(fTarget)) {
    const stay = stayCashflow(fCur, period[0], period[1], badYearChance(a.current));
    const t = timelineFor(targetCrop, period[0], fTarget);
    const sw = t ? cashflow(fTarget, t, period[1], badYearChance(target)) : null;
    if (stay && sw) lines = stayVsSwitchLines(compareStaySwitch(stay, sw), a.current.label, target.label);
  }
  return {
    current: a.current.label,
    verdict: a.current.overall,
    alreadyBest: a.alreadyBest,
    better: choices.map((c) => c.label),
    paths: switchPaths(a),
    stayVsSwitch: lines,
  };
}
