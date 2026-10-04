import { useEffect, useState } from 'react';
import {
  ArrowRight, BadgeCheck, CalendarClock, ClipboardList, FlaskConical, Gauge, History, Map, Snowflake, Sprout, Users,
} from 'lucide-react';
import {
  Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { buildCaseStudy, oneIn, type CaseStudy } from '../../shared/caseStudy';
import { CROP_OPTIONS } from '../../shared/crops';
import { REGION_PRESETS } from '../../shared/regions';
import { fetchClimate, fetchLatestWinter } from '../lib/api';
import { fmtValue } from '../lib/seasonSeries';

/*
 * "Why Paddock": the problem, a real case (this winter at Shepparton) and how Paddock answers it.
 * Every number is computed from the same data as the planner; the only typed-in facts are the
 * cited cherry forecast and the plan.
 */

const CASE = REGION_PRESETS.find((r) => r.id === 'shepparton') ?? REGION_PRESETS[0];
const CHERRY = CROP_OPTIONS.find((c) => c.id === 'cherry-standard');
const NEWS_URL = 'https://www.freshfruitportal.com/news/2026/09/09/australian-cherry-drop/';

function useCaseStudy() {
  const [cs, setCs] = useState<CaseStudy | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([fetchClimate(CASE.lat, CASE.lon, CASE.name), fetchLatestWinter(CASE.lat, CASE.lon)])
      .then(([a, w]) => {
        if (!live) return;
        const built = buildCaseStudy(a, w);
        if (built) setCs(built);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);
  return { cs, failed };
}

const r = (n: number) => Math.round(n);
/** One decimal, for the record-low comparison where whole numbers would hide the gap. */
const d1 = (n: number) => n.toFixed(1);

function Eyebrow({ children, tone = 'text-leaf' }: { children: React.ReactNode; tone?: string }) {
  return <p className={`text-sm font-bold uppercase tracking-[0.14em] ${tone}`}>{children}</p>;
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-6">
      <div className="max-w-[44rem] space-y-2">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id={id} className="text-3xl font-extrabold sm:text-4xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Stat({ value, label, tone = 'text-bark' }: { value: React.ReactNode; label: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <p className={`font-display text-4xl font-extrabold leading-none tabular sm:text-5xl ${tone}`}>{value}</p>
      <p className="mt-3 text-[0.95rem] text-muted">{label}</p>
    </div>
  );
}

function WinterChart({ cs }: { cs: CaseStudy }) {
  const { latest, projected } = cs;
  const rows: { year: number; chill?: number; median?: number }[] = cs.winters.map((w) => ({ year: w.year, chill: w.portions }));
  for (let y = latest.year + 1; y <= projected.to; y++) rows.push({ year: y, median: projected.median });
  const first = cs.winters[0].year;
  const max = Math.ceil(Math.max(...cs.winters.map((w) => w.portions), projected.p90) / 10) * 10 + 10;
  const min = Math.max(0, Math.floor(Math.min(latest.chillPortions, projected.p10) / 10) * 10 - 20);

  return (
    <figure className="rounded-3xl border border-line bg-card p-4 sm:p-6">
      <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xl font-bold">Winter chill at {CASE.name}, every winter since {first}</span>
        <span className="text-sm text-muted">Chill portions, 1 April to 30 September</span>
      </figcaption>
      <div className="h-[340px] w-full" role="img"
        aria-label={`Bar chart of chill portions per winter at ${CASE.name}, ${first} to ${latest.year}. ${latest.year} is the lowest at ${r(latest.chillPortions)}. Projected ${projected.from} to ${projected.to}: typical ${r(projected.median)}, poor winters ${r(projected.p10)}.`}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 16, right: 8, bottom: 0, left: 0 }} barCategoryGap={1}>
            <CartesianGrid stroke="#e7e9e1" vertical={false} />
            <XAxis dataKey="year" type="number" domain={[first - 0.5, projected.to + 0.5]} ticks={[1985, 1995, 2005, 2015, 2025, 2035, 2045].filter((t) => t >= first)}
              tick={{ fill: '#5b5e55', fontSize: 13 }} tickLine={false} axisLine={{ stroke: '#d8dbd0' }} />
            <YAxis domain={[min, max]} tick={{ fill: '#5b5e55', fontSize: 13 }} tickLine={false} axisLine={false} width={40} allowDataOverflow />
            <ReferenceArea x1={latest.year + 0.5} x2={projected.to + 0.5} fill="#dfeaf1" fillOpacity={0.45}
              label={{ value: `Projected ${projected.from}–${projected.to}`, position: 'insideTopRight', fill: '#3c6f8f', fontSize: 13 }} />
            <ReferenceArea x1={latest.year + 0.5} x2={projected.to + 0.5} y1={projected.p10} y2={projected.p90} fill="#3c6f8f" fillOpacity={0.18} />
            <Line dataKey="median" stroke="#3c6f8f" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} name="Typical projected winter" />
            <ReferenceLine y={latest.chillPortions} stroke="#9b2f23" strokeDasharray="3 3"
              label={{ value: `${latest.year}: ${d1(latest.chillPortions)}`, position: 'insideBottomLeft', fill: '#9b2f23', fontSize: 13, fontWeight: 700 }} />
            <Bar dataKey="chill" name="Real winter" isAnimationActive={false} radius={[2, 2, 0, 0]}>
              {rows.map((row) => (
                <Cell key={row.year} fill={row.year === latest.year ? '#9b2f23' : row.year === cs.previousLow.year ? '#c9861b' : '#8fa9ba'} />
              ))}
            </Bar>
            <Tooltip
              formatter={(v: unknown, name: unknown) => [`${fmtValue(Number(v))} portions`, String(name)]}
              labelFormatter={(y: unknown) => `Winter ${y}`}
              contentStyle={{ borderRadius: 8, borderColor: '#d8dbd0', fontFamily: 'Atkinson Hyperlegible, sans-serif' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <li className="flex items-center gap-2"><span aria-hidden className="size-3 rounded-sm bg-ember" /> {latest.year}, the lowest on record</li>
        <li className="flex items-center gap-2"><span aria-hidden className="size-3 rounded-sm bg-sun" /> {cs.previousLow.year}, the previous low</li>
        <li className="flex items-center gap-2"><span aria-hidden className="size-3 rounded-sm bg-[#8fa9ba]" /> Other real winters (ERA5 reanalysis)</li>
        <li className="flex items-center gap-2"><span aria-hidden className="h-3 w-5 rounded-sm bg-frost/25" /> Likely range of projected winters, 3 climate models</li>
      </ul>
    </figure>
  );
}

const STEPS = [
  { icon: Map, title: 'Pick the block', body: 'Map, address search or a district. Any spot in Australia.' },
  { icon: History, title: 'Read 60 years of weather', body: '40 years of real daily weather (ERA5), plus 20 projected years from three CMIP6 climate models.' },
  { icon: Gauge, title: 'Score every season', body: 'Winter chill, spring frost at flowering, summer heat, autumn rain and water, against sourced thresholds for each crop.' },
  { icon: ClipboardList, title: 'Rank and report', body: 'Every crop ranked for that block, adjustable to the exact variety, with timelines, “Will it pay?” and a PDF to take to the bank, adviser or nursery.' },
];

const BRIEF = [
  { ask: 'A specific barrier', answer: 'Growers choose a 20-year crop with no usable picture of the winters it will grow through. Projections exist only as raw temperatures.' },
  { ask: 'Who it’s for', answer: 'Orchardists and nut growers replanting a block, and the advisers, nurseries and lenders who help them decide.' },
  { ask: 'How it works', answer: 'Real reanalysis plus three CMIP6 models, delta-change downscaling, the Dynamic chill model and sourced crop thresholds. Nothing hardcoded.' },
  { ask: 'How impact could be tested', answer: 'A backtest against real bad seasons, then a pilot with growers who are replanting (below).' },
  { ask: 'Route to real use', answer: 'Through the people growers already trust before they plant: extension officers, nurseries and industry bodies (below).' },
];

const INSIGHT = [
  { word: 'Adopt', body: 'Free, two minutes, plain English, works on a phone in the paddock.' },
  { word: 'Finance', body: '“Will it pay?” and a PDF report a grower can hand to their bank.' },
  { word: 'Implement', body: 'Concrete choices: a lower-chill variety, netting, a different crop, a planting timeline.' },
  { word: 'Measure', body: 'Every block checked leaves a record of what was planted and why, ready to compare against real seasons.' },
];

const ROADMAP = [
  {
    when: 'Now, Oct 2026',
    what: `Working prototype: ${REGION_PRESETS.length} Victorian districts preloaded, any Australian location on demand, ${CROP_OPTIONS.length} crops with sourced thresholds.`,
  },
  { when: '2027 winter', what: 'Pilot with 5–10 Goulburn Valley growers replanting this season, recruited through Fruit Growers Victoria and Agriculture Victoria.' },
  { when: '2028', what: 'Partners: extension officers use it in farm visits; nurseries show the verdict next to each variety at the point of sale.' },
  { when: '2030', what: 'Every temperate fruit and nut district in Australia and New Zealand, with cultivar figures from Hort Innovation trials.' },
  { when: '2035', what: 'Goal: every replant in these districts checked against the climate it will crop in, the COP31 aim of climate-resilient farming.' },
];

export function StoryPage({ onStart }: { onStart: () => void }) {
  const { cs, failed } = useCaseStudy();
  const cherryNeed = CHERRY?.winter?.chillPortions;
  const futureOdds = cs ? oneIn(cs.futureSharePct) : null;
  const goodFits = cs ? cs.ranked.filter((c) => c.overall === 'viable') : [];
  const lowestPast = cs ? Math.min(...cs.winters.filter((w) => w.year !== cs.latest.year).map((w) => w.portions)) : 0;

  return (
    <article className="space-y-20 pb-8 pt-10 sm:space-y-24">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-[2rem] bg-bark px-6 py-12 text-paper sm:px-12 sm:py-16">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-frost/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-ember/30 blur-3xl" />
        <div className="relative max-w-[44rem] space-y-6">
          <Eyebrow tone="text-sun">Build for 2035 · COP31 priority: Awareness Across All Areas</Eyebrow>
          <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-6xl">
            A tree planted this winter is still cropping in 2045.
          </h1>
          <p className="text-xl text-paper/80 sm:text-2xl">
            Its grower has to choose it now, using the winters they remember. Paddock shows them the winters it will actually grow through.
          </p>
          {cs && (
            <p className="inline-flex flex-wrap items-baseline gap-x-3 rounded-2xl bg-paper/10 px-5 py-4 text-lg">
              <span className="font-display text-4xl font-extrabold text-[#f0a597] tabular">{cs.latest.year}</span>
              <span>gave {CASE.name} its least winter chill in <strong>{cs.winters.length} years</strong> of records.</span>
            </p>
          )}
          <div>
            <button type="button" onClick={onStart}
              className="inline-flex items-center gap-2 rounded-xl bg-paper px-6 py-3 text-lg font-bold text-bark hover:bg-white">
              Check your block <ArrowRight size={20} aria-hidden />
            </button>
          </div>
        </div>
      </header>

      {/* The problem, now */}
      <Section id="story-now" eyebrow="The problem is already here" title="This season, a warm winter is costing growers.">
        <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl border border-ember/25 bg-ember-soft/60 p-6">
            <p className="font-display text-6xl font-extrabold text-ember tabular">−15%</p>
            <p className="mt-2 text-xl font-bold">Australia’s 2026/27 cherry crop forecast</p>
            <p className="mt-2">
              Above-average winter minimums across the mainland, including Victoria’s Goulburn Valley, left trees short of chill. Tasmania, with a cold
              enough winter, is expected to do well.
            </p>
            <p className="mt-3 text-sm text-muted">
              USDA Foreign Agricultural Service, <i>Australia Stone Fruit Annual</i>, August 2026, reported by{' '}
              <a className="underline" href={NEWS_URL} target="_blank" rel="noreferrer">FreshFruitPortal, 9 September 2026</a>.
            </p>
          </div>
          <div className="grid gap-4">
            <div className="rounded-3xl border border-line bg-card p-6">
              <Snowflake aria-hidden className="text-frost" />
              <p className="mt-2 font-bold">Fruit trees need winter cold</p>
              <p className="mt-1 text-[0.95rem] text-muted">Without enough chill, flowering is late and patchy, fruit set drops, and so does the crop.</p>
            </div>
            <div className="rounded-3xl border border-line bg-card p-6">
              <CalendarClock aria-hidden className="text-frost" />
              <p className="mt-2 font-bold">Replanting is a 20-year bet</p>
              <p className="mt-1 text-[0.95rem] text-muted">The variety is chosen once, before anyone knows what those winters will bring.</p>
            </div>
          </div>
        </div>
      </Section>

      {/* Real-world example */}
      <Section id="story-case" eyebrow={`Real-world example · ${CASE.name}, ${CASE.district}`}
        title={cs ? <>Winter {cs.latest.year} was the lowest-chill winter in {cs.winters.length} years. It won’t be the last.</> : 'A record-low winter, and what comes next.'}>
        {!cs && !failed && <div className="h-[340px] animate-pulse rounded-3xl bg-card" aria-label="Loading the real weather record" />}
        {failed && (
          <p className="rounded-2xl bg-sun-soft px-5 py-4 text-sun-ink">
            The weather record couldn’t be loaded right now, so the numbers for this example are hidden. Try again in a minute.
          </p>
        )}
        {cs && (
          <>
            <WinterChart cs={cs} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat tone="text-ember" value={d1(cs.latest.chillPortions)}
                label={<>chill portions this winter ({cs.latest.year}). The previous low was {d1(cs.previousLow.portions)}, in {cs.previousLow.year}.</>} />
              <Stat value={cs.pastSharePct === 0 ? 'Never' : `${r(cs.pastSharePct)}%`}
                label={<>before: how often a winter this low happened in the {cs.winters.length - 1} real winters since {cs.winters[0].year}.</>} />
              <Stat tone="text-frost" value={futureOdds ?? 'Rarely'}
                label={<>projected winters from {cs.projected.from} to {cs.projected.to} as low as this, or lower.</>} />
            </div>
            <div className="overflow-x-auto rounded-3xl border border-line bg-card">
              <table className="w-full min-w-[30rem] border-collapse text-left">
                <caption className="sr-only">Typical winter chill and hot summer days at {CASE.name} by period</caption>
                <thead>
                  <tr className="border-b border-line text-sm text-muted">
                    <th scope="col" className="px-5 py-3 font-normal">Typical year</th>
                    {cs.periods.map((p) => (
                      <th key={p.label} scope="col" className="px-5 py-3 text-right font-normal">
                        <span className="block text-xs">{p.kind === 'real' ? 'Real' : 'Projected'}</span>{p.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row" className="px-5 py-3 font-bold">Winter chill (portions)</th>
                    {cs.periods.map((p, i) => <td key={p.label} className={`px-5 py-3 text-right tabular ${i === 2 ? 'font-bold text-frost' : ''}`}>{r(p.chill)}</td>)}
                  </tr>
                  <tr className="border-t border-line">
                    <th scope="row" className="px-5 py-3 font-bold">Days of 35 °C or hotter</th>
                    {cs.periods.map((p, i) => <td key={p.label} className={`px-5 py-3 text-right tabular ${i === 2 ? 'font-bold text-sun-ink' : ''}`}>{fmtValue(p.hotDays)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="max-w-[62ch] text-lg">
              For 40 years, winters here looked steady, so planting on memory worked. Summers have already changed, and the projection says winters are next:
              a winter like {cs.latest.year} goes from <strong>never</strong> to <strong>{futureOdds ?? 'rare'}</strong>.
            </p>
          </>
        )}
      </Section>

      {/* Before / after */}
      <Section id="story-before-after" eyebrow="Before and after Paddock" title={`A ${CASE.name} grower replanting a block`}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-line bg-card p-6">
            <p className="text-sm font-bold uppercase tracking-wide text-muted">Before</p>
            <ul className="mt-4 space-y-4">
              <li><strong>Plants on memory.</strong> {cs ? <>Every winter from {cs.winters[0].year} to {cs.latest.year - 1} gave at least {d1(lowestPast)} chill portions, so the old varieties look safe.</> : 'The last few decades of winters look safe.'}</li>
              <li><strong>Can’t use climate science.</strong> Projections are published as temperature grids, not as “what should I plant on this block?”.</li>
              <li><strong>Judges one crop, one season.</strong> Chill, spring frost, summer heat and water are checked separately, if at all.</li>
              <li><strong>Finds out in the orchard.</strong> A winter like {cs?.latest.year ?? 'this one'} arrives, flowering is patchy, and the trees are already in the ground for 20 years.</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-leaf/40 bg-leaf-soft/60 p-6">
            <p className="text-sm font-bold uppercase tracking-wide text-leaf">After, in two minutes</p>
            <ul className="mt-4 space-y-4">
              <li><strong>Sees the winters ahead.</strong> 40 real years and 20 projected, for every season, at their block.</li>
              <li><strong>Knows the odds.</strong> {futureOdds ? <>A winter like {cs!.latest.year} becomes about {futureOdds} by {cs!.projected.to}.</> : 'How often a bad winter comes back.'}</li>
              <li><strong>Gets a ranked shortlist.</strong> {cs ? <>{cs.ranked.length} crops scored on every season with sourced thresholds, and ranked by how much room each has to spare{goodFits.length ? <>: here {goodFits.slice(0, 3).map((c) => c.label.toLowerCase()).join(', ')} lead</> : null}.</> : 'Every crop scored with sourced thresholds.'}</li>
              <li><strong>Decides with a record.</strong> Adjusts for the exact variety, checks timelines and “Will it pay?”, and downloads a PDF for the bank, adviser or nursery.</li>
            </ul>
          </div>
        </div>
        {cs && cherryNeed && (
          <p className="max-w-[62ch] rounded-2xl bg-paper px-5 py-4 text-[0.95rem] text-muted shadow-[0_0_0_1px_var(--color-line)]">
            <BadgeCheck size={18} aria-hidden className="mr-1 inline text-leaf" />
            <strong className="text-bark">Honest limits.</strong> Paddock still rates standard sweet cherries a good fit at {CASE.name}: they need about {cherryNeed[0]}–{cherryNeed[1]} chill
            portions, below even this winter. It doesn’t claim to explain this season’s crop. What it shows is how often winters this warm will come back,
            and which crops have the most room to spare.
          </p>
        )}
      </Section>

      {/* How it works */}
      <Section id="story-how" eyebrow="How it works" title="From a pin on the map to a planting decision.">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="relative rounded-3xl border border-line bg-card p-6">
              <span aria-hidden className="absolute right-5 top-4 font-display text-4xl font-extrabold text-line">{i + 1}</span>
              <Icon aria-hidden className="text-leaf" />
              <p className="mt-3 font-bold">{title}</p>
              <p className="mt-1 text-[0.95rem] text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Brief alignment */}
      <Section id="story-brief" eyebrow="Built for the brief" title="What the challenge asks, and our answer.">
        <dl className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
          {BRIEF.map((b) => (
            <div key={b.ask} className="grid gap-1 px-6 py-4 sm:grid-cols-[13rem_1fr] sm:gap-6">
              <dt className="font-bold text-leaf">{b.ask}</dt>
              <dd>{b.answer}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INSIGHT.map((x) => (
            <div key={x.word} className="rounded-3xl bg-bark p-6 text-paper">
              <p className="font-display text-2xl font-extrabold text-sun">{x.word}</p>
              <p className="mt-2 text-[0.95rem] text-paper/80">{x.body}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted">The challenge looks for ideas that make climate action easier to adopt, finance, implement or measure.</p>
      </Section>

      {/* Testing impact */}
      <Section id="story-test" eyebrow="How we’d test the impact" title="Prove it against real seasons, then with real growers.">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-line bg-card p-6">
            <FlaskConical aria-hidden className="text-frost" />
            <p className="mt-2 font-bold">1. Backtest</p>
            <p className="mt-1 text-[0.95rem] text-muted">
              This winter is the first test: Paddock’s record flags {cs ? cs.latest.year : 'it'} as the lowest-chill winter on record, the same season the industry
              reports a chill-driven crop drop. Next, match every low-chill year since 1985 against published crop records.
            </p>
          </div>
          <div className="rounded-3xl border border-line bg-card p-6">
            <Users aria-hidden className="text-frost" />
            <p className="mt-2 font-bold">2. Grower pilot</p>
            <p className="mt-1 text-[0.95rem] text-muted">
              5–10 Goulburn Valley growers who are replanting use Paddock before they order trees, with an adviser alongside. We record what they planned to
              plant before, and what they chose after.
            </p>
          </div>
          <div className="rounded-3xl border border-line bg-card p-6">
            <Sprout aria-hidden className="text-frost" />
            <p className="mt-2 font-bold">3. Measure</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[0.95rem] text-muted">
              <li>Variety or crop choices changed</li>
              <li>Hectares planned with a Paddock report</li>
              <li>Reports shared with a bank, adviser or nursery</li>
              <li>Later: flowering and yield on those blocks</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* Road to 2035 */}
      <Section id="story-road" eyebrow="Route to real use" title="From prototype to every replant decision by 2035.">
        <ol className="relative space-y-6 border-l-2 border-leaf/30 pl-6">
          {ROADMAP.map((m, i) => (
            <li key={m.when} className="relative">
              <span aria-hidden className={`absolute -left-[2.1rem] top-1 size-4 rounded-full border-4 border-paper ${i === 0 ? 'bg-ember' : i === ROADMAP.length - 1 ? 'bg-leaf' : 'bg-frost'}`} />
              <p className="font-display text-lg font-extrabold">{m.when}</p>
              <p className="max-w-[62ch] text-muted">{m.what}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">Dates after October 2026 are our plan, not commitments from the organisations named.</p>
      </Section>

      {/* CTA */}
      <section className="rounded-[2rem] bg-leaf px-6 py-12 text-center text-white sm:px-12">
        <h2 className="text-3xl font-extrabold sm:text-4xl">See the winters your next trees will grow through.</h2>
        <p className="mx-auto mt-3 max-w-[40rem] text-white/80">Pick your block and get every season, every crop, ranked for the climate they’ll actually crop in.</p>
        <button type="button" onClick={onStart}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-lg font-bold text-leaf hover:bg-paper">
          Check your block <ArrowRight size={20} aria-hidden />
        </button>
        <p className="mx-auto mt-6 max-w-[48rem] text-xs text-white/70">
          Real weather: ERA5 reanalysis via Open-Meteo (CC BY 4.0). Projections: EC-Earth3P-HR, MPI-ESM1-2-XR and MRI-AGCM3-2-S (CMIP6 HighResMIP), one emissions
          pathway, about 10–25 km grid. Chill: Dynamic Model. Projections are guidance, not a guarantee.
        </p>
      </section>
    </article>
  );
}
