import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Pause, Play, SkipForward } from 'lucide-react';
import { illustrativeSequence, mulberry32, oneIn, type CaseStudy } from '../../shared/caseStudy';

/*
 * Scroll-driven pixel tree. Scrolling runs a year counter from the first real winter to the end of
 * the projection; each spring the tree blossoms in proportion to that winter's chill at the case-study
 * site. Real winters come from the record; projected years are an illustrative sequence drawn from the
 * projected range (shared/caseStudy.ts), not a forecast for any one year.
 */

/** Logical pixels across the short side; the long side follows the box's aspect ratio. */
const ROWS = 120;
const MIN_COLS = 100; // the tree is about 80 pixels wide
const BLOSSOM = ['#ffe4ea', '#f7c6d2', '#f4a6b8', '#e98aa3'];
const BUD = '#6b4a3a';
const BARK = ['#3b2a20', '#4a3527', '#5a4030'];
const GRASS = ['#24331f', '#2d3f26', '#35492c'];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** Scroll stages, as fractions of the section's scroll distance. */
const STAGE = { grownBy: 0.1, realEnd: 0.58, holdEnd: 0.7, projectedEnd: 0.93 };

interface Year { year: number; portions: number; kind: 'real' | 'record' | 'projected' }

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as Rgb;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const ease = (t: number) => t * t * (3 - 2 * t);

/** Sky colours (top, bottom) for real years, the record winter and projected years. */
const SKY = {
  real: [hex('#16120f'), hex('#3d4a4f')] as [Rgb, Rgb],
  record: [hex('#1b100e'), hex('#6a2c24')] as [Rgb, Rgb],
  projected: [hex('#0c1a24'), hex('#2f6280')] as [Rgb, Rgb],
};

interface Segment { x0: number; y0: number; x1: number; y1: number; depth: number; width: number }
interface Tree { segments: Segment[]; buds: { x: number; y: number; c: string }[]; maxDepth: number; stars: { x: number; y: number }[] }

/** A fixed tree in its own coordinates: base at (0, 0), growing up (negative y). */
function buildTree(seed = 11): Tree {
  const rand = mulberry32(seed);
  const segments: Segment[] = [];
  const tips: { x: number; y: number }[] = [];
  const maxDepth = 6;
  const grow = (x: number, y: number, angle: number, len: number, depth: number) => {
    const x1 = x + Math.cos(angle) * len;
    const y1 = y - Math.sin(angle) * len;
    segments.push({ x0: x, y0: y, x1, y1, depth, width: Math.max(1, Math.round((maxDepth - depth) * 0.9)) });
    if (depth >= maxDepth) {
      tips.push({ x: x1, y: y1 });
      return;
    }
    const spread = 0.38 + rand() * 0.28;
    const kids = depth < 2 ? 2 : rand() < 0.35 ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      const side = kids === 2 ? (k === 0 ? -1 : 1) : k - 1;
      grow(x1, y1, angle + side * spread + (rand() - 0.5) * 0.25, len * (0.7 + rand() * 0.12), depth + 1);
    }
  };
  grow(0, 0, Math.PI / 2 + (rand() - 0.5) * 0.08, 21, 0);

  // Blossom sites cluster round the tips; a fixed shuffled order decides which open first.
  const seen = new Set<string>();
  const buds: Tree['buds'] = [];
  for (const t of tips) {
    for (let i = 0; i < 16; i++) {
      const r = Math.sqrt(rand()) * 7.5;
      const a = rand() * Math.PI * 2;
      const x = Math.round(t.x + Math.cos(a) * r);
      const y = Math.round(t.y + Math.sin(a) * r * 0.8);
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      buds.push({ x, y, c: BLOSSOM[Math.floor(rand() * BLOSSOM.length)] });
    }
  }
  for (let i = buds.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [buds[i], buds[j]] = [buds[j], buds[i]];
  }
  const stars = Array.from({ length: 40 }, () => ({ x: rand(), y: rand() * 0.45 }));
  return { segments, buds, maxDepth, stars };
}

/** Where the scroll is: the year shown (fractional) and how far the tree has grown. */
function scrollState(p: number, first: number, record: number, last: number) {
  // Starts as a sapling so the first screen isn't empty.
  const growth = 0.14 + 0.86 * ease(clamp(p / STAGE.grownBy));
  let year: number;
  if (p < STAGE.realEnd) year = first + (record - first) * clamp((p - STAGE.grownBy * 1.2) / (STAGE.realEnd - STAGE.grownBy * 1.2));
  else if (p < STAGE.holdEnd) year = record;
  else year = record + (last - record) * clamp((p - STAGE.holdEnd) / (STAGE.projectedEnd - STAGE.holdEnd));
  return { growth, year };
}

/** The scroll progress that shows a given year (inverse of scrollState). */
function progressFor(year: number, first: number, record: number, last: number): number {
  const start = STAGE.grownBy * 1.2;
  if (year < record) return start + ((year - first) / Math.max(1, record - first)) * (STAGE.realEnd - start);
  if (year === record) return (STAGE.realEnd + STAGE.holdEnd) / 2;
  return STAGE.holdEnd + ((year - record) / Math.max(1, last - record)) * (STAGE.projectedEnd - STAGE.holdEnd);
}

function useTimeline(cs: CaseStudy | null): Year[] {
  return useMemo(() => {
    if (!cs) return [];
    const real: Year[] = cs.winters.map((w) => ({ year: w.year, portions: w.portions, kind: w.year === cs.latest.year ? 'record' : 'real' }));
    const n = cs.projected.to - cs.latest.year;
    const future = illustrativeSequence(cs.futureWinters ?? [], n).map((portions, i) => ({ year: cs.latest.year + 1 + i, portions, kind: 'projected' as const }));
    return [...real, ...future];
  }, [cs]);
}

function draw(ctx: CanvasRenderingContext2D, cols: number, rows: number, tree: Tree, growth: number, yearF: number, timeline: Year[], lo: number, hi: number) {
  const idx = clamp(Math.floor(yearF - (timeline[0]?.year ?? 0)), 0, Math.max(0, timeline.length - 1));
  const cur = timeline[idx];
  const next = timeline[Math.min(idx + 1, timeline.length - 1)];
  const frac = yearF - Math.floor(yearF);
  const portions = cur ? cur.portions + ((next?.portions ?? cur.portions) - cur.portions) * ease(frac) : hi;
  const kind = cur?.kind ?? 'real';

  // Sky: dithered vertical gradient, tinted by era.
  const [top, bottom] = SKY[kind];
  const img = ctx.createImageData(cols, rows);
  for (let y = 0; y < rows; y++) {
    const t = y / rows;
    for (let x = 0; x < cols; x++) {
      const th = BAYER[(y % 4) * 4 + (x % 4)];
      const steps = 7;
      const q = Math.floor(t * steps + th) / steps;
      const c = mix(top, bottom, clamp(q));
      const o = (y * cols + x) * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  ctx.fillStyle = kind === 'projected' ? '#9cc7de' : '#e9e2d4';
  for (const s of tree.stars) ctx.fillRect(Math.floor(s.x * cols), Math.floor(s.y * rows), 1, 1);

  // Ground: a low hill with dithered grass. On tall (phone) boxes the ground sits higher, leaving
  // dark soil below for the captions so they never cover the tree.
  const portrait = rows > cols;
  const groundY = portrait ? Math.round(rows * 0.6) : rows - 14;
  for (let x = 0; x < cols; x++) {
    const h = Math.round(Math.sin((x / cols) * Math.PI) * 4);
    for (let y = groundY - h; y < rows; y++) {
      ctx.fillStyle = y > groundY + 6 && (x + y) % 2 === 0 ? '#151a12' : GRASS[(x * 7 + y * 3) % 3];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Tree: segments appear depth by depth as it grows.
  // Wide boxes: tree to the right of the text. Narrow (phones): centred.
  const ox = Math.round(cols * (cols > rows * 1.35 ? 0.66 : 0.5));
  const oy = groundY - 3;
  const shown = growth * (tree.maxDepth + 1);
  for (const s of tree.segments) {
    const part = clamp(shown - s.depth);
    if (part <= 0) continue;
    const x1 = s.x0 + (s.x1 - s.x0) * part;
    const y1 = s.y0 + (s.y1 - s.y0) * part;
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - s.x0, y1 - s.y0)));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(ox + s.x0 + ((x1 - s.x0) * i) / steps);
      const y = Math.round(oy + s.y0 + ((y1 - s.y0) * i) / steps);
      ctx.fillStyle = BARK[(x + y) % 3];
      const w = s.width;
      ctx.fillRect(x - Math.floor(w / 2), y, w, 1);
    }
  }

  // Blossom in proportion to this winter's chill; the rest stay as closed buds.
  const budsOn = clamp((growth - 0.85) / 0.15);
  if (budsOn > 0) {
    // A curve so low-chill winters look clearly sparse, not just a little thinner.
    const share = clamp((portions - lo) / (hi - lo), 0.03, 1) ** 1.6;
    const open = Math.round(tree.buds.length * share * budsOn);
    tree.buds.forEach((b, i) => {
      if (i < open) {
        ctx.fillStyle = b.c;
        ctx.fillRect(ox + b.x, oy + b.y, 1, 1);
      } else if (i % 3 === 0) {
        ctx.fillStyle = BUD;
        ctx.fillRect(ox + b.x, oy + b.y, 1, 1);
      }
    });
    // A few fallen petals under good years.
    for (let i = 0; i < Math.round(18 * share * budsOn); i++) {
      const b = tree.buds[i];
      ctx.fillStyle = b.c;
      ctx.fillRect(ox + Math.round(b.x * 1.4), groundY + 1 + (i % 3), 1, 1);
    }
  }
}

interface Props {
  cs: CaseStudy | null;
  place: string;
  onStart: () => void;
  /** Element id the Skip button scrolls to */
  skipTo: string;
}

export function BlossomTree({ cs, place, onStart, skipTo }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tree = useMemo(() => buildTree(), []);
  const timeline = useTimeline(cs);
  const [p, setP] = useState(0);
  const [dims, setDims] = useState({ cols: 200, rows: ROWS, px: 4, dpr: 1 });
  const [playing, setPlaying] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setStill(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Scroll progress through the tall section, throttled to one update per frame.
  useEffect(() => {
    if (still) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = sectionRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setP(clamp(-r.top / Math.max(1, r.height - window.innerHeight)));
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [still]);

  // Canvas columns follow the box's aspect ratio so pixels stay square.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (!width || !height) return;
      // Each logical pixel is a whole number of device pixels, so edges stay sharp (no blur from
      // fractional scaling). Landscape: about ROWS rows. Portrait (phones): about MIN_COLS columns,
      // so the tree fits and the sky grows.
      const dpr = window.devicePixelRatio || 1;
      const landscape = (ROWS * width) / height >= MIN_COLS;
      const px = Math.max(2, Math.round(landscape ? (height * dpr) / ROWS : (width * dpr) / MIN_COLS));
      setDims({ cols: Math.ceil((width * dpr) / px), rows: Math.ceil((height * dpr) / px), px, dpr });
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const first = timeline[0]?.year ?? 1985;
  const record = cs?.latest.year ?? 2026;
  const last = timeline.at(-1)?.year ?? 2045;
  const { growth, year } = still ? { growth: 1, year: record } : scrollState(p, first, record, last);
  const values = timeline.map((t) => t.portions);
  const hi = values.length ? Math.max(...values) : 1;
  const lo = values.length ? Math.min(...values) - (hi - Math.min(...values)) * 0.12 : 0;
  const shownYear = Math.min(last, Math.floor(year));
  const cur = timeline.find((t) => t.year === shownYear);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    draw(ctx, dims.cols, dims.rows, tree, growth, timeline.length ? year : first, timeline, lo, hi);
  }, [dims, tree, growth, year, timeline, lo, hi, first]);

  /** Scroll the page so the animation shows progress q (one source of truth: the scroll position). */
  const scrollToProgress = (q: number, smooth = false) => {
    const el = sectionRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + clamp(q) * (el.offsetHeight - window.innerHeight), behavior: smooth ? 'smooth' : 'auto' });
  };
  const jumpToYear = (y: number) => {
    setPlaying(false);
    scrollToProgress(progressFor(y, first, record, last));
  };
  const skip = () => {
    setPlaying(false);
    const target = document.getElementById(skipTo) ?? sectionRef.current?.nextElementSibling;
    if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 16, behavior: 'smooth' });
  };

  // Play: glide through the remaining years in about 15 seconds. Any manual scroll or key stops it.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    let q = p >= 0.99 ? 0 : p;
    const stop = () => setPlaying(false);
    const tick = (now: number) => {
      q = Math.min(1, q + (now - last) / 15000);
      last = now;
      scrollToProgress(q);
      if (q >= 1) stop();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('keydown', stop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start position is read once per play
  }, [playing]);

  const odds = cs ? oneIn(cs.futureSharePct) : null;
  const stage = still ? 'record' : p < STAGE.grownBy * 1.2 ? 'intro' : p < STAGE.realEnd ? 'real' : p < STAGE.holdEnd ? 'record' : p < STAGE.projectedEnd ? 'projected' : 'end';
  const fade = (on: boolean) => `transition-opacity duration-500 ${on ? 'opacity-100' : 'pointer-events-none opacity-0'}`;
  const kindLabel = cur?.kind === 'projected' ? 'Projected' : cur?.kind === 'record' ? 'Record low' : 'Real winter';

  return (
    <section ref={sectionRef} aria-label="Sixty years of winters at one orchard" className={still ? '' : 'h-[260vh]'}>
      <div className={`${still ? '' : 'sticky top-0'} flex h-[100svh] max-h-[900px] min-h-[560px] items-stretch py-3`}>
        <div ref={boxRef} className="relative w-full overflow-hidden rounded-[2rem] bg-bark">
          <canvas ref={canvasRef} width={dims.cols} height={dims.rows} aria-hidden
            style={{ width: (dims.cols * dims.px) / dims.dpr, height: (dims.rows * dims.px) / dims.dpr }}
            className="absolute left-0 top-0 [image-rendering:pixelated]" />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/50" />
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-1/2 bg-gradient-to-r from-black/35 to-transparent sm:block" />

          {/* Year counter and this winter's chill */}
          {cs && stage !== 'intro' && (
            <div className="absolute left-5 top-5 text-paper sm:left-8 sm:top-7">
              <p className={`text-xs font-bold uppercase tracking-[0.18em] ${cur?.kind === 'record' ? 'text-[#f0a597]' : cur?.kind === 'projected' ? 'text-[#9cc7de]' : 'text-sun'}`}>{kindLabel}</p>
              <p className="font-display text-6xl font-extrabold leading-none tabular sm:text-8xl">{shownYear}</p>
              {cur && <p className="mt-1 text-paper/80 tabular">{cur.portions.toFixed(1)} chill portions</p>}
            </div>
          )}

          {/* Controls: no one has to scroll through the whole thing */}
          {!still && (
            <div className="absolute right-4 top-4 flex gap-2 sm:right-6 sm:top-6">
              <button type="button" onClick={() => setPlaying((v) => !v)} aria-pressed={playing}
                className="inline-flex items-center gap-1.5 rounded-full bg-paper/15 px-4 py-2 text-sm font-bold text-paper backdrop-blur hover:bg-paper/25">
                {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />} {playing ? 'Pause' : 'Play'}
              </button>
              <button type="button" onClick={skip}
                className="inline-flex items-center gap-1.5 rounded-full bg-paper/15 px-4 py-2 text-sm font-bold text-paper backdrop-blur hover:bg-paper/25">
                <SkipForward size={16} aria-hidden /> Skip to case study
              </button>
            </div>
          )}

          {/* Captions */}
          <div className="absolute inset-x-5 bottom-20 text-paper sm:inset-x-8 sm:bottom-24">
            <div className={`${fade(stage === 'intro')} absolute bottom-0 max-w-[40rem] space-y-4`}>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sun">Build for 2035 · COP31: Awareness Across All Areas</p>
              <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-6xl">A tree planted this winter is still cropping in 2045.</h1>
              <p className="flex items-center gap-2 text-lg text-paper/80">
                <ArrowDown size={18} aria-hidden className="motion-safe:animate-bounce" /> Scroll or press Play: {timeline.length || 60} winters of real data from {place}, an orchard district
              </p>
            </div>
            <p className={`${fade(stage === 'real')} absolute bottom-0 max-w-[36rem] text-xl sm:text-2xl`}>
              Every spring, blossom depends on how much winter chill the tree got. For 40 years, {place}’s winters were steady.
            </p>
            {cs && (
              <div className={`${fade(stage === 'record')} absolute bottom-0 max-w-[38rem] space-y-2`}>
                <p className="text-xl sm:text-2xl">
                  <strong className="text-[#f0a597]">{cs.latest.year}: the least winter chill in {cs.winters.length} years.</strong>
                </p>
                <p className="text-paper/80">
                  {cs.latest.chillPortions.toFixed(1)} chill portions, below the previous low of {cs.previousLow.portions.toFixed(1)} in {cs.previousLow.year}. The same
                  season, Australia’s cherry crop is forecast to fall 15%.
                </p>
              </div>
            )}
            {cs && (
              <div className={`${fade(stage === 'projected')} absolute bottom-0 max-w-[38rem] space-y-2`}>
                <p className="text-xl sm:text-2xl">
                  These are the winters a tree planted now will crop through. <strong className="text-[#9cc7de]">About {odds ?? 'some'} will be as low as {cs.latest.year}.</strong>
                </p>
                <p className="text-sm text-paper/70">Years after {cs.latest.year} are an illustrative sequence drawn from the projected range of 3 climate models, not a forecast for any one year.</p>
              </div>
            )}
            <div className={`${fade(stage === 'end')} absolute bottom-0 max-w-[38rem] space-y-4`}>
              <p className="text-2xl font-bold sm:text-3xl">Growers plant on memory. Paddock shows them the winters ahead.</p>
              <button type="button" onClick={onStart}
                className="inline-flex items-center gap-2 rounded-xl bg-paper px-6 py-3 text-lg font-bold text-bark hover:bg-white">
                Check your block <ArrowRight size={20} aria-hidden />
              </button>
            </div>
          </div>

          {/* Timeline scrubber: one bar per winter, height = chill */}
          {timeline.length > 0 && (
            <div className="absolute inset-x-5 bottom-5 h-10 rounded has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-paper sm:inset-x-8">
            {/* Year slider: drag, click or use arrow keys to jump to any winter */}
            <input type="range" min={first} max={last} step={1} value={shownYear} onChange={(e) => jumpToYear(Number(e.target.value))}
              aria-label="Winter to show" aria-valuetext={cur ? `${shownYear}, ${kindLabel.toLowerCase()}, ${cur.portions.toFixed(1)} chill portions` : String(shownYear)}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" disabled={still} />
            <div aria-hidden className="flex h-full items-end gap-[2px]">
              {timeline.map((t) => {
                const active = t.year === shownYear;
                const colour = t.kind === 'record' ? 'bg-[#e0705f]' : t.kind === 'projected' ? 'bg-[#6fa5c4]' : 'bg-paper/45';
                return (
                  <span key={t.year} className={`flex-1 rounded-t-[1px] ${colour} ${active ? 'opacity-100 outline outline-1 outline-paper' : t.year > shownYear ? 'opacity-30' : 'opacity-80'}`}
                    style={{ height: `${20 + 80 * clamp((t.portions - lo) / (hi - lo))}%` }} />
                );
              })}
            </div>
            </div>
          )}
        </div>
      </div>

      {/* Screen-reader summary of the whole animation */}
      {cs && (
        <p className="sr-only">
          Animation of a blossoming tree at {place}, one spring per winter from {first} to {last}. Blossom follows each winter’s chill. {cs.latest.year} had the least
          chill in {cs.winters.length} years ({cs.latest.chillPortions.toFixed(1)} portions). In projected winters, about {odds ?? 'some'} are as low.
        </p>
      )}
    </section>
  );
}
