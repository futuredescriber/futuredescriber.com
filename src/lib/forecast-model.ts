/**
 * A small, deterministic demand simulation and a seasonal forecast with an
 * 80% interval. It runs at build time (for the static fallback) and in the
 * browser (for the animated instrument) from the same seed, so both agree.
 *
 * Every value here is synthetic. Nothing is read from a real operation.
 */

export const HISTORY = 84;
export const HORIZON = 28;
export const PERIOD = 7;
export const CAPACITY = 135;
export const Y_MIN = 70;
export const Y_MAX = 170;
export const Y_TICKS = [80, 100, 120, 140, 160];
export const X_TICKS: Array<{ index: number; label: string }> = [
  { index: -70, label: '−10w' },
  { index: -42, label: '−6w' },
  { index: -14, label: '−2w' },
  { index: 0, label: 'now' },
  { index: 14, label: '+2w' },
  { index: 28, label: '+4w' },
];
export const DEFAULT_SEED = 23;
/* Days simulated before the visible window; chosen so the opening frame sits in a high-demand phase. */
export const WARMUP = 102;

export const Z80 = 1.2816;
export const ENSEMBLE = 96;
const RHO = 0.82;

export interface ForecastPoint {
  mean: number;
  lower: number;
  upper: number;
}

export interface ForecastState {
  observed: number[];
  forecast: ForecastPoint[];
  sigma: number;
  tLast: number;
  process: DemandProcess;
  /** Unit-variance AR(1) innovation sequences, one per possible future. */
  members: number[][];
  ensembleRng: () => number;
}

export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function phaseOf(t: number): number {
  return ((t % PERIOD) + PERIOD) % PERIOD;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

export class DemandProcess {
  private t = 0;
  private level = 118;
  private readonly rng: () => number;

  constructor(seed: number) {
    this.rng = createRng(seed);
  }

  next(): number {
    this.t += 1;
    this.level += 0.9 * Math.sin(this.t / 23) + 0.5 * Math.cos(this.t / 61) + gaussian(this.rng) * 0.7;
    this.level = Math.min(140, Math.max(106, this.level));
    const seasonal =
      1 + 0.08 * Math.sin((2 * Math.PI * this.t) / PERIOD + 0.6) + 0.02 * Math.sin((4 * Math.PI * this.t) / PERIOD);
    const noise = gaussian(this.rng) * 3;
    return Math.max(40, this.level * seasonal + noise);
  }

  get time(): number {
    return this.t;
  }
}

export function computeForecast(observed: number[], tLast: number): { forecast: ForecastPoint[]; sigma: number } {
  const n = observed.length;
  const window = 28;
  const start = n - window;
  const at = (k: number): number => observed[Math.min(n - 1, Math.max(0, k))] as number;
  const movingAverage = (k: number): number => {
    let sum = 0;
    for (let j = k - 3; j <= k + 3; j += 1) sum += at(j);
    return sum / 7;
  };

  const sums = new Array<number>(PERIOD).fill(0);
  const counts = new Array<number>(PERIOD).fill(0);
  for (let k = start; k < n; k += 1) {
    const p = phaseOf(tLast - (n - 1 - k));
    sums[p] = (sums[p] as number) + at(k) / movingAverage(k);
    counts[p] = (counts[p] as number) + 1;
  }
  let factors = sums.map((sum, p) => ((counts[p] as number) > 0 ? sum / (counts[p] as number) : 1));
  const factorMean = average(factors);
  factors = factors.map((factor) => factor / factorMean);
  const factor = (t: number): number => factors[phaseOf(t)] as number;

  const deseasonalized: number[] = [];
  for (let k = n - 21; k < n; k += 1) deseasonalized.push(at(k) / factor(tLast - (n - 1 - k)));
  const recent = average(deseasonalized.slice(-7));
  const earlier = average(deseasonalized.slice(0, 7));
  let trend = ((recent - earlier) / 14) * 0.6;
  trend = Math.max(-1.2, Math.min(1.2, trend));
  const level = recent;

  let squaredError = 0;
  let count = 0;
  for (let k = start; k < n; k += 1) {
    const t = tLast - (n - 1 - k);
    const fitted = (at(k - 1) / factor(t - 1)) * factor(t);
    squaredError += (at(k) - fitted) ** 2;
    count += 1;
  }
  const sigma = Math.max(3, Math.min(12, Math.sqrt(squaredError / Math.max(1, count)) * 0.8));

  const forecast: ForecastPoint[] = [];
  for (let h = 1; h <= HORIZON; h += 1) {
    const mean = (level + trend * h) * factor(tLast + h);
    const half = Z80 * sigma * Math.sqrt(1 + 0.16 * h);
    forecast.push({ mean, lower: mean - half, upper: mean + half });
  }

  return { forecast, sigma };
}

/* Ensemble: each member is a smooth AR(1) innovation path scaled by the interval width at each horizon. */

export function createMember(rng: () => number): number[] {
  const sequence: number[] = [];
  let e = 0;
  for (let h = 0; h < HORIZON; h += 1) {
    e = RHO * e + Math.sqrt(1 - RHO * RHO) * gaussian(rng);
    sequence.push(e);
  }
  return sequence;
}

export function advanceMember(sequence: number[], rng: () => number): void {
  sequence.shift();
  const last = sequence[sequence.length - 1] ?? 0;
  sequence.push(RHO * last + Math.sqrt(1 - RHO * RHO) * gaussian(rng));
}

export function memberValues(sequence: number[], forecast: ForecastPoint[]): number[] {
  return forecast.map((point, h) => point.mean + ((sequence[h] ?? 0) * (point.upper - point.mean)) / Z80);
}

export const BREACH_WINDOW = 7;

/** Share of possible futures that cross capacity within the first `days` days. */
export function breachChance(paths: number[][], days: number = BREACH_WINDOW): number {
  if (!paths.length) return 0;
  const crossing = paths.filter((values) => values.slice(0, days).some((value) => value > CAPACITY)).length;
  return Math.round((100 * crossing) / paths.length);
}

export function createState(seed: number = DEFAULT_SEED, warmup: number = WARMUP): ForecastState {
  const process = new DemandProcess(seed);
  const observed: number[] = [];
  for (let i = 0; i < HISTORY + warmup; i += 1) {
    observed.push(process.next());
    if (observed.length > HISTORY) observed.shift();
  }
  const tLast = process.time;
  const { forecast, sigma } = computeForecast(observed, tLast);
  const ensembleRng = createRng(seed * 7919 + 1);
  const members = Array.from({ length: ENSEMBLE }, () => createMember(ensembleRng));
  return { observed, forecast, sigma, tLast, process, members, ensembleRng };
}

export function advance(state: ForecastState): void {
  state.observed.push(state.process.next());
  state.observed.shift();
  state.tLast = state.process.time;
  const next = computeForecast(state.observed, state.tLast);
  state.forecast = next.forecast;
  state.sigma = next.sigma;
  state.members.forEach((member) => advanceMember(member, state.ensembleRng));
}

export function daysOverCapacity(forecast: ForecastPoint[]): number {
  return forecast.filter((point) => point.mean > CAPACITY).length;
}

export function intervalPercent(forecast: ForecastPoint[]): number {
  const ratios = forecast.map((point) => (point.upper - point.mean) / point.mean);
  return Math.round(average(ratios) * 100);
}

/* Plot geometry shared by the canvas renderer and the static SVG fallback. */

export const PAD = { top: 18, right: 14, bottom: 26, left: 44 } as const;

export interface Geometry {
  width: number;
  height: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  step: number;
  x: (index: number, phase?: number) => number;
  y: (value: number) => number;
  indexAt: (x: number, phase?: number) => number;
}

export function geometry(width: number, height: number): Geometry {
  const plotLeft = PAD.left;
  const plotRight = width - PAD.right;
  const plotTop = PAD.top;
  const plotBottom = height - PAD.bottom;
  const span = HISTORY - 1 + HORIZON;
  const step = (plotRight - plotLeft) / span;
  const x = (index: number, phase = 0): number => plotLeft + (index - phase + HISTORY - 1) * step;
  const y = (value: number): number =>
    plotBottom - ((value - Y_MIN) / (Y_MAX - Y_MIN)) * (plotBottom - plotTop);
  const indexAt = (px: number, phase = 0): number => (px - plotLeft) / step - (HISTORY - 1) + phase;
  return { width, height, plotLeft, plotRight, plotTop, plotBottom, step, x, y, indexAt };
}

export function formatUnits(value: number): string {
  return `${Math.round(value)} units/day`;
}
