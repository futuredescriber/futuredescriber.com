import {
  CAPACITY,
  DEFAULT_SEED,
  HISTORY,
  HORIZON,
  X_TICKS,
  Y_MAX,
  Y_MIN,
  Y_TICKS,
  advance,
  breachChance,
  createState,
  formatUnits,
  geometry,
  intervalPercent,
  memberValues,
  type ForecastPoint,
  type Geometry,
} from '../lib/forecast-model';

const STEP_MS = 1200;
const DPR_CAP = 2;
const FRAME_MS = 1000 / 45;
const BLEND = 0.45;
const PARTICLE_COUNT = 6;
const PULSE_MS = 1700;
const SWEEP_MS = 650;
const FOG_BINS = 26;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

interface Particle {
  position: number;
  speed: number;
}

class ForecastInstrument {
  private readonly root: HTMLElement;
  private readonly plot: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly fog: HTMLCanvasElement;
  private readonly fogContext: CanvasRenderingContext2D;
  private readonly fogImage: ImageData;
  private readonly tooltip: HTMLElement | null;
  private readonly readouts: Record<string, HTMLElement | null>;
  private readonly colors: Record<string, string>;
  private readonly monoFont: string;
  private readonly state = createState(DEFAULT_SEED);
  private previousForecast: ForecastPoint[];
  private currentPaths: number[][];
  private previousPaths: number[][];
  private particles: Particle[];
  private geometry: Geometry;
  private chance = 0;
  private phase = 0;
  private time = 0;
  private lastTime = 0;
  private lastRender = 0;
  private sweepAt = Number.NEGATIVE_INFINITY;
  private frame = 0;
  private visible = false;
  private hoverIndex: number | null = null;

  constructor(
    root: HTMLElement,
    plot: HTMLElement,
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    fog: HTMLCanvasElement,
    fogContext: CanvasRenderingContext2D,
  ) {
    this.root = root;
    this.plot = plot;
    this.canvas = canvas;
    this.context = context;
    this.fog = fog;
    this.fogContext = fogContext;
    this.fog.width = HORIZON + 1;
    this.fog.height = FOG_BINS;
    this.fogImage = fogContext.createImageData(HORIZON + 1, FOG_BINS);
    this.tooltip = root.querySelector<HTMLElement>('[data-tooltip]');
    this.readouts = {
      horizon: root.querySelector<HTMLElement>('[data-readout="horizon"]'),
      risk: root.querySelector<HTMLElement>('[data-readout="risk"]'),
      band: root.querySelector<HTMLElement>('[data-readout="band"]'),
    };
    const styles = getComputedStyle(root);
    const read = (name: string): string => styles.getPropertyValue(name).trim();
    this.colors = {
      surface: read('--bg') || '#07080a',
      line: read('--line') || '#1f2227',
      lineStrong: read('--line-strong') || '#31353b',
      ink: read('--ink') || '#e9e6df',
      ink2: read('--ink-2') || '#a9a9a1',
      ink3: read('--ink-3') || '#85867f',
      series: read('--series') || '#2cc4ee',
      seriesRgb: read('--series-rgb') || '44, 196, 238',
      futures: read('--futures') || '#a86bf5',
      futuresRgb: read('--futures-rgb') || '168, 107, 245',
      signal: read('--signal') || '#ff5a3c',
      signalRgb: read('--signal-rgb') || '255, 90, 60',
      spark: read('--spark') || '#e6fbff',
    };
    this.monoFont = `500 11px ${read('--font-mono') || 'monospace'}`;
    this.previousForecast = this.state.forecast.map((point) => ({ ...point }));
    this.currentPaths = this.state.members.map((member) => memberValues(member, this.state.forecast));
    this.previousPaths = this.currentPaths.map((values) => values.slice());
    this.chance = breachChance(this.currentPaths);
    this.particles = Array.from({ length: PARTICLE_COUNT }, (_, index) => ({
      position: ((index + 0.5) / PARTICLE_COUNT) * (HISTORY - 1),
      speed: 13 + index * 2.1,
    }));
    this.geometry = geometry(1, 1);
    this.resize();
    this.updateReadouts();
    this.bind();
  }

  private bind(): void {
    const resizeObserver = new ResizeObserver(() => this.resize());
    resizeObserver.observe(this.plot);

    const visibility = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          this.visible = entry.isIntersecting;
        });
        this.schedule();
      },
      { rootMargin: '80px 0px', threshold: 0.01 },
    );
    visibility.observe(this.root);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.schedule();
    });

    window.addEventListener('fd:intro-done', () => this.schedule(), { once: true });

    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches) {
        this.stop();
        this.phase = 0;
        this.render();
      } else {
        this.schedule();
      }
    });

    this.canvas.addEventListener('pointermove', (event) => this.handlePointer(event));
    this.canvas.addEventListener('pointerdown', (event) => this.handlePointer(event));
    this.canvas.addEventListener('pointerleave', () => this.clearHover());
    this.canvas.addEventListener('pointercancel', () => this.clearHover());

    if (document.fonts?.ready) {
      document.fonts.ready.then(() => this.render()).catch(() => undefined);
    }
  }

  private resize(): void {
    const bounds = this.plot.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.geometry = geometry(width, height);
    this.render();
  }

  private schedule(): void {
    if (this.frame || !this.visible || document.hidden || reducedMotion.matches) return;
    if (document.documentElement.classList.contains('is-intro')) return;
    this.lastTime = 0;
    this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  private stop(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private tick(time: number): void {
    this.frame = 0;
    if (!this.visible || document.hidden || reducedMotion.matches) return;

    const delta = this.lastTime ? Math.min(time - this.lastTime, 250) : 0;
    this.lastTime = time;
    this.time = time;
    this.phase += delta / STEP_MS;
    while (this.phase >= 1) {
      this.phase -= 1;
      this.commit();
    }

    this.particles.forEach((particle) => {
      particle.position += (particle.speed * delta) / 1000;
      if (particle.position > HISTORY - 1) particle.position -= HISTORY - 1;
    });

    if (time - this.lastRender >= FRAME_MS) {
      this.lastRender = time;
      this.render();
    }
    this.frame = requestAnimationFrame((next) => this.tick(next));
  }

  private commit(): void {
    this.previousForecast = this.displayedForecast();
    this.previousPaths = this.currentPaths.map((values, index) =>
      values.map((value, h) => this.displayedPathValue(index, h, value)),
    );
    advance(this.state);
    this.currentPaths = this.state.members.map((member) => memberValues(member, this.state.forecast));
    this.chance = breachChance(this.currentPaths);
    this.sweepAt = this.time;
    this.updateReadouts();
    if (this.hoverIndex !== null) this.updateTooltip();
  }

  private blend(): number {
    return reducedMotion.matches ? 1 : easeOutCubic(Math.min(1, this.phase / BLEND));
  }

  private displayedForecast(): ForecastPoint[] {
    const blend = this.blend();
    return this.state.forecast.map((point, index) => {
      const previous = this.previousForecast[index] ?? point;
      return {
        mean: previous.mean + (point.mean - previous.mean) * blend,
        lower: previous.lower + (point.lower - previous.lower) * blend,
        upper: previous.upper + (point.upper - previous.upper) * blend,
      };
    });
  }

  private displayedPathValue(index: number, h: number, value: number): number {
    const previous = this.previousPaths[index]?.[h] ?? value;
    return previous + (value - previous) * this.blend();
  }

  private updateReadouts(): void {
    if (this.readouts.horizon) this.readouts.horizon.textContent = `${HORIZON} days`;
    if (this.readouts.risk) this.readouts.risk.textContent = `${this.chance}%`;
    if (this.readouts.band) this.readouts.band.textContent = `±${intervalPercent(this.state.forecast)}%`;
  }

  private handlePointer(event: PointerEvent): void {
    const bounds = this.canvas.getBoundingClientRect();
    const px = event.clientX - bounds.left;
    const raw = this.geometry.indexAt(px, this.phase);
    const index = Math.round(Math.max(-(HISTORY - 1), Math.min(HORIZON, raw)));
    if (px < this.geometry.plotLeft - 6 || px > this.geometry.plotRight + 6) {
      this.clearHover();
      return;
    }
    this.hoverIndex = index;
    this.updateTooltip();
    if (reducedMotion.matches || !this.frame) this.render();
  }

  private clearHover(): void {
    if (this.hoverIndex === null) return;
    this.hoverIndex = null;
    if (this.tooltip) this.tooltip.hidden = true;
    if (reducedMotion.matches || !this.frame) this.render();
  }

  private valueAt(index: number): { label: string; value: number; band?: [number, number] } | null {
    if (index <= 0) {
      const observed = this.state.observed[HISTORY - 1 + index];
      if (observed === undefined) return null;
      return { label: 'Observed', value: observed };
    }
    const point = this.displayedForecast()[index - 1];
    if (!point) return null;
    return { label: 'Forecast', value: point.mean, band: [point.lower, point.upper] };
  }

  private updateTooltip(): void {
    if (!this.tooltip || this.hoverIndex === null) return;
    const sample = this.valueAt(this.hoverIndex);
    if (!sample) {
      this.tooltip.hidden = true;
      return;
    }

    const day = this.hoverIndex === 0 ? 'Today' : this.hoverIndex > 0 ? `Day +${this.hoverIndex}` : `Day −${-this.hoverIndex}`;
    const detail = sample.band
      ? `${sample.label} ${formatUnits(sample.value)}, 80% interval ${Math.round(sample.band[0])}–${Math.round(sample.band[1])}`
      : `${sample.label} ${formatUnits(sample.value)}`;
    const over = sample.value > CAPACITY ? ' · over capacity' : '';
    this.tooltip.innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = `${day}${over}`;
    const span = document.createElement('span');
    span.textContent = detail;
    this.tooltip.append(strong, span);

    const x = this.geometry.x(this.hoverIndex, this.phase);
    const y = this.geometry.y(sample.value);
    const clampedX = Math.max(72, Math.min(this.geometry.width - 72, x));
    this.tooltip.style.left = `${clampedX}px`;
    this.tooltip.style.top = `${Math.max(44, y)}px`;
    this.tooltip.hidden = false;
  }

  private observedAt(position: number): { x: number; y: number } {
    const clamped = Math.max(0, Math.min(HISTORY - 1, position));
    const lower = Math.floor(clamped);
    const upper = Math.min(HISTORY - 1, lower + 1);
    const fraction = clamped - lower;
    const a = this.state.observed[lower] as number;
    const b = this.state.observed[upper] as number;
    return {
      x: this.geometry.x(clamped - (HISTORY - 1), this.phase),
      y: this.geometry.y(a + (b - a) * fraction),
    };
  }

  /* Density of the possible futures as a tiny image, drawn scaled with smoothing so it reads as fog. */
  private paintFog(phase: number, stride: number): void {
    const g = this.geometry;
    const data = this.fogImage.data;
    const columns = HORIZON + 1;
    const counts = new Float32Array(columns * FOG_BINS);
    let maxCount = 1;
    this.currentPaths.forEach((values, index) => {
      if (index % stride !== 0) return;
      values.forEach((value, h) => {
        const shown = this.displayedPathValue(index, h, value);
        const row = Math.max(0, Math.min(FOG_BINS - 1, Math.floor(((Y_MAX - shown) / (Y_MAX - Y_MIN)) * FOG_BINS)));
        const cell = row * columns + (h + 1);
        counts[cell] = (counts[cell] as number) + 1;
        if ((counts[cell] as number) > maxCount) maxCount = counts[cell] as number;
      });
    });

    const [sr, sg, sb] = (this.colors.signalRgb as string).split(',').map((part) => Number(part.trim()));
    const [fr, fg, fb] = (this.colors.futuresRgb as string).split(',').map((part) => Number(part.trim()));
    for (let row = 0; row < FOG_BINS; row += 1) {
      const centre = Y_MAX - ((row + 0.5) / FOG_BINS) * (Y_MAX - Y_MIN);
      const hot = centre > CAPACITY;
      for (let column = 0; column < columns; column += 1) {
        const offset = (row * columns + column) * 4;
        const density = (counts[row * columns + column] as number) / maxCount;
        const alpha = density > 0 ? Math.pow(density, 0.6) * 235 : 0;
        data[offset] = hot ? (sr as number) : (fr as number);
        data[offset + 1] = hot ? (sg as number) : (fg as number);
        data[offset + 2] = hot ? (sb as number) : (fb as number);
        data[offset + 3] = Math.round(alpha);
      }
    }
    this.fogContext.putImageData(this.fogImage, 0, 0);

    const ctx = this.context;
    const left = g.x(0, phase) - g.step / 2;
    const right = g.x(HORIZON, phase) + g.step / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.58;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.fog, 0, 0, columns, FOG_BINS, left, g.plotTop, right - left, g.plotBottom - g.plotTop);
    ctx.restore();
  }

  private render(): void {
    const ctx = this.context;
    const g = this.geometry;
    const c = this.colors;
    const still = reducedMotion.matches;
    const time = still ? 0 : this.time;
    const { observed } = this.state;
    const forecast = this.displayedForecast();
    const phase = still ? 0 : this.phase;
    const lastObserved = observed[HISTORY - 1] as number;
    const capacityY = Math.round(g.y(CAPACITY)) + 0.5;
    const stride = g.width < 600 ? 2 : 1;
    const overCapacity = (forecast[0]?.mean ?? 0) > CAPACITY;

    ctx.clearRect(0, 0, g.width, g.height);

    /* Frame: hairlines, corner brackets, week labels */
    ctx.save();
    ctx.font = this.monoFont;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.strokeStyle = c.line as string;
    ctx.lineWidth = 1;
    Y_TICKS.forEach((tick) => {
      const y = Math.round(g.y(tick)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(g.plotLeft, y);
      ctx.lineTo(g.plotRight, y);
      ctx.stroke();
      ctx.fillStyle = c.ink3 as string;
      ctx.fillText(String(tick), g.plotLeft - 8, y);
    });

    ctx.strokeStyle = c.lineStrong as string;
    const bracket = 9;
    const top = g.plotTop - 10;
    [
      [g.plotLeft, top, 1, 1],
      [g.plotRight, top, -1, 1],
      [g.plotLeft, g.plotBottom, 1, -1],
      [g.plotRight, g.plotBottom, -1, -1],
    ].forEach(([x, y, dx, dy]) => {
      const px = Math.round(x as number) + 0.5;
      const py = Math.round(y as number) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, py + bracket * (dy as number));
      ctx.lineTo(px, py);
      ctx.lineTo(px + bracket * (dx as number), py);
      ctx.stroke();
    });

    ctx.textAlign = 'left';
    ctx.fillStyle = c.ink3 as string;
    ctx.fillText('units / day', g.plotLeft, g.plotTop - 9);
    ctx.textAlign = 'center';
    X_TICKS.forEach((tick) => {
      ctx.fillStyle = tick.index === 0 ? (c.ink2 as string) : (c.ink3 as string);
      ctx.fillText(tick.label, g.x(tick.index), g.plotBottom + 14);
    });
    ctx.restore();

    /* Conveyor: daily ticks slide with the data, weeks taller */
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.plotLeft - 1, g.plotBottom, g.plotRight - g.plotLeft + 2, 8);
    ctx.clip();
    for (let index = -(HISTORY - 1); index <= HORIZON; index += 1) {
      const absoluteDay = this.state.tLast + index;
      const week = ((absoluteDay % 7) + 7) % 7 === 0;
      const x = Math.round(g.x(index, phase)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, g.plotBottom);
      ctx.lineTo(x, g.plotBottom + (week ? 6 : 3));
      ctx.strokeStyle = week ? (c.ink3 as string) : (c.lineStrong as string);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(g.plotLeft, g.plotTop - 10, g.plotRight - g.plotLeft, g.plotBottom - g.plotTop + 10);
    ctx.clip();

    /* Present-moment beam */
    const nowX = g.x(0);
    const beam = ctx.createLinearGradient(nowX - 22, 0, nowX + 22, 0);
    beam.addColorStop(0, `rgba(${c.seriesRgb}, 0)`);
    beam.addColorStop(0.5, `rgba(${c.seriesRgb}, 0.07)`);
    beam.addColorStop(1, `rgba(${c.seriesRgb}, 0)`);
    ctx.fillStyle = beam;
    ctx.fillRect(nowX - 22, g.plotTop - 10, 44, g.plotBottom - g.plotTop + 10);

    /* Fog and paths of possible futures */
    this.paintFog(phase, stride);

    const wobble = (index: number, h: number): number =>
      still ? 0 : Math.sin(time * 0.0013 + index * 0.73 + h * 0.31) * 0.4;
    const tracePaths = (): void => {
      this.currentPaths.forEach((values, index) => {
        if (index % stride !== 0) return;
        ctx.beginPath();
        ctx.moveTo(g.x(0, phase), g.y(lastObserved));
        values.forEach((value, h) => {
          ctx.lineTo(g.x(h + 1, phase), g.y(this.displayedPathValue(index, h, value) + wobble(index, h)));
        });
        ctx.stroke();
      });
    };
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';

    ctx.save();
    ctx.beginPath();
    ctx.rect(g.plotLeft, capacityY, g.plotRight - g.plotLeft, g.plotBottom - capacityY);
    ctx.clip();
    ctx.strokeStyle = `rgba(${c.futuresRgb}, 0.1)`;
    tracePaths();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(g.plotLeft, g.plotTop - 10, g.plotRight - g.plotLeft, capacityY - (g.plotTop - 10));
    ctx.clip();
    ctx.strokeStyle = `rgba(${c.signalRgb}, 0.13)`;
    tracePaths();
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';

    /* Capacity threshold: a flowing dash that charges when the mean is over it */
    ctx.save();
    ctx.setLineDash([7, 7]);
    ctx.lineDashOffset = still ? 0 : -((time * 0.018) % 14);
    if (overCapacity) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.moveTo(g.plotLeft, capacityY);
      ctx.lineTo(g.plotRight, capacityY);
      ctx.strokeStyle = `rgba(${c.signalRgb}, 0.28)`;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.beginPath();
    ctx.moveTo(g.plotLeft, capacityY);
    ctx.lineTo(g.plotRight, capacityY);
    ctx.strokeStyle = c.signal as string;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.restore();

    /* Observed demand: phosphor glow, line, bright core */
    const observedPath = (): void => {
      ctx.beginPath();
      observed.forEach((value, index) => {
        const x = g.x(index - (HISTORY - 1), phase);
        const y = g.y(value);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
    };
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    observedPath();
    ctx.strokeStyle = `rgba(${c.seriesRgb}, 0.2)`;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    observedPath();
    ctx.strokeStyle = c.series as string;
    ctx.lineWidth = 2;
    ctx.stroke();
    observedPath();
    ctx.strokeStyle = 'rgba(230, 251, 255, 0.45)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    /* Forecast mean */
    ctx.beginPath();
    ctx.moveTo(g.x(0, phase), g.y(lastObserved));
    forecast.forEach((point, index) => ctx.lineTo(g.x(index + 1, phase), g.y(point.mean)));
    ctx.strokeStyle = 'rgba(233, 230, 223, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    forecast.forEach((point, index) => {
      if (point.mean <= CAPACITY) return;
      this.dot(g.x(index + 1, phase), g.y(point.mean), c.signal as string, 3.5);
    });

    /* Re-forecast sweep */
    if (!still && time - this.sweepAt < SWEEP_MS) {
      const t = (time - this.sweepAt) / SWEEP_MS;
      const x = g.x(0) + (g.x(HORIZON) - g.x(0)) * easeOutCubic(t);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const trail = ctx.createLinearGradient(x - 16, 0, x, 0);
      trail.addColorStop(0, `rgba(${c.seriesRgb}, 0)`);
      trail.addColorStop(1, `rgba(${c.seriesRgb}, ${(1 - t) * 0.16})`);
      ctx.fillStyle = trail;
      ctx.fillRect(x - 16, g.plotTop - 10, 16, g.plotBottom - g.plotTop + 10);
      ctx.beginPath();
      ctx.moveTo(x, g.plotTop - 10);
      ctx.lineTo(x, g.plotBottom);
      ctx.strokeStyle = `rgba(230, 251, 255, ${(1 - t) * 0.75})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    /* Particles flowing toward now */
    if (!still) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      this.particles.forEach((particle) => {
        for (let trail = 6; trail >= 0; trail -= 1) {
          const position = particle.position - trail * 0.8;
          if (position < 0) continue;
          const { x, y } = this.observedAt(position);
          const alpha = (1 - trail / 7) * 0.95;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.6, 2.6 - trail * 0.32), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(230, 251, 255, ${alpha})`;
          ctx.fill();
        }
      });
      ctx.restore();
    }

    /* Now: breach-probability ring, turning dial, pulse, head */
    const headX = g.x(0, phase);
    const headY = g.y(lastObserved);
    ctx.save();
    ctx.beginPath();
    ctx.arc(headX, headY, 14, 0, Math.PI * 2);
    ctx.strokeStyle = c.lineStrong as string;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (this.chance > 0) {
      ctx.beginPath();
      ctx.arc(headX, headY, 14, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * this.chance) / 100);
      ctx.strokeStyle = c.signal as string;
      ctx.lineWidth = 2;
      ctx.lineCap = 'butt';
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.setLineDash([3, 6]);
    ctx.lineDashOffset = still ? 0 : -((time * 0.01) % 9);
    ctx.arc(headX, headY, 20, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${c.seriesRgb}, 0.6)`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    if (!still) {
      const pulse = (time % PULSE_MS) / PULSE_MS;
      ctx.beginPath();
      ctx.arc(headX, headY, 6 + pulse * 16, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${c.seriesRgb}, ${(1 - pulse) * 0.6})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
    this.dot(headX, headY, c.spark as string, 3.6);

    /* Capacity label at the quiet left end */
    ctx.save();
    ctx.font = this.monoFont;
    ctx.fillStyle = c.ink3 as string;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('capacity', g.plotLeft + 4, capacityY - 4);
    ctx.restore();

    /* Hover crosshair */
    if (this.hoverIndex !== null) {
      const sample = this.valueAt(this.hoverIndex);
      if (sample) {
        const x = Math.round(g.x(this.hoverIndex, phase)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, g.plotTop - 10);
        ctx.lineTo(x, g.plotBottom);
        ctx.strokeStyle = c.ink3 as string;
        ctx.lineWidth = 1;
        ctx.stroke();
        this.dot(x, g.y(sample.value), c.ink as string, 4.5);
      }
    }

    ctx.restore();
  }

  private dot(x: number, y: number, fill: string, radius = 4): void {
    const ctx = this.context;
    ctx.beginPath();
    ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
    ctx.fillStyle = this.colors.surface as string;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

document.querySelectorAll<HTMLElement>('[data-forecast]').forEach((root) => {
  const plot = root.querySelector<HTMLElement>('.instrument__plot');
  const canvas = root.querySelector<HTMLCanvasElement>('canvas');
  const context = canvas?.getContext('2d');
  const fog = document.createElement('canvas');
  const fogContext = fog.getContext('2d');
  if (!plot || !canvas || !context || !fogContext) return;
  try {
    new ForecastInstrument(root, plot, canvas, context, fog, fogContext);
  } catch {
    root.classList.add('is-static');
  }
});
