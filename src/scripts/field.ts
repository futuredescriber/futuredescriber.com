/*
 * The particle field behind the page.
 *
 * Particles live in page coordinates and scroll with the content, with a
 * little parallax by depth. Dense halos orbit the visualizations (the hero
 * plot and the four schematics), where the empty space is; the rest of the
 * page is sparse. Every few seconds the field self-organizes for a moment:
 * a wave front ripples outward, a network of pings spreads hop by hop, a
 * vortex swirls a region, or a patch snaps into a hex lattice and releases.
 * Fast scrolling stretches particles into streaks.
 *
 * One fixed canvas, at most 40 frames a second, paused in hidden tabs, and a
 * single static frame under reduced motion.
 */
export {};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const canvas = document.querySelector<HTMLCanvasElement>('[data-field]');
const context = canvas?.getContext('2d');

interface Anchor {
  element: Element;
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  margin: number;
}

interface Particle {
  kind: 'drift' | 'halo';
  x: number;
  y: number;
  depth: number;
  radius: number;
  alpha: number;
  twinkle: number;
  phase: number;
  tint: string;
  bright: boolean;
  vx: number;
  vy: number;
  anchor: Anchor | null;
  theta: number;
  omega: number;
  rhoPhase: number;
  sx: number;
  sy: number;
  boost: number;
  violet: number;
  hx: number;
  hy: number;
  handoffAt: number;
}

interface WaveEvent {
  type: 'wave';
  x: number;
  y: number;
  start: number;
  speed: number;
  lambda: number;
  amp: number;
  maxR: number;
}

interface VortexEvent {
  type: 'vortex';
  x: number;
  y: number;
  start: number;
  duration: number;
  radius: number;
  strength: number;
}

interface LatticeEvent {
  type: 'lattice';
  x: number;
  y: number;
  start: number;
  duration: number;
  radius: number;
  spacing: number;
}

interface Edge {
  from: Particle;
  to: Particle;
  t0: number;
  t1: number;
}

interface NetEvent {
  type: 'net';
  start: number;
  end: number;
  edges: Edge[];
}

type FieldEvent = WaveEvent | VortexEvent | LatticeEvent | NetEvent;

if (canvas && context) {
  const ctx = context;
  const styles = getComputedStyle(document.documentElement);
  const series = styles.getPropertyValue('--series-rgb').trim() || '44, 196, 238';
  const futures = styles.getPropertyValue('--futures-rgb').trim() || '168, 107, 245';
  const warm = '233, 230, 223';
  const spark = '230, 251, 255';
  const tints = [warm, warm, warm, series, series, futures];
  const narrow = window.innerWidth < 700;

  let width = 0;
  let height = 0;
  let docHeight = 0;
  let particles: Particle[] = [];
  let anchors: Anchor[] = [];
  let events: FieldEvent[] = [];
  let frame = 0;
  let lastTime = 0;
  let lastRender = 0;
  let lastAnchorSync = 0;
  let nextEventAt = 0;
  let scrollY = window.scrollY;
  let velocity = 0;

  const random = (min: number, max: number): number => min + Math.random() * (max - min);
  const pick = <T>(list: T[]): T | undefined => list[Math.floor(Math.random() * list.length)];

  const makeParticle = (kind: Particle['kind'], x: number, y: number, anchor: Anchor | null): Particle => {
    const bright = Math.random() < 0.13;
    return {
      kind,
      x,
      y,
      depth: kind === 'halo' ? 1 : random(0.55, 1),
      radius: bright ? random(1.5, 2.4) : random(0.7, 1.6),
      alpha: bright ? random(0.65, 1) : random(0.3, 0.72),
      twinkle: random(0.6, 2.6),
      phase: random(0, Math.PI * 2),
      tint: pick(tints) as string,
      bright,
      vx: random(-2.5, 2.5),
      vy: random(-4, -0.8),
      anchor,
      theta: random(0, Math.PI * 2),
      omega: random(0.04, 0.11) * (Math.random() < 0.5 ? -1 : 1),
      rhoPhase: random(0, Math.PI * 2),
      sx: 0,
      sy: 0,
      boost: 0,
      violet: 0,
      hx: 0,
      hy: 0,
      handoffAt: 0,
    };
  };

  const syncAnchors = (): Anchor[] => {
    const elements = Array.from(document.querySelectorAll('[data-forecast] .instrument__plot, .schematic'));
    return elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        element,
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2 + window.scrollY,
        hw: rect.width / 2,
        hh: rect.height / 2,
        margin: narrow ? 70 : 140,
      };
    });
  };

  const seed = (): void => {
    anchors = syncAnchors();
    const next: Particle[] = [];
    const driftCount = Math.round((width * docHeight) / (narrow ? 52000 : 29000));
    for (let i = 0; i < driftCount; i += 1) {
      next.push(makeParticle('drift', random(0, width), random(0, docHeight), null));
    }
    anchors.forEach((anchor) => {
      const ring = (anchor.hw + anchor.hh) * 2 * anchor.margin;
      const count = Math.round(ring / (narrow ? 1900 : 1250));
      for (let i = 0; i < count; i += 1) next.push(makeParticle('halo', anchor.cx, anchor.cy, anchor));
    });
    particles = next;
  };

  const resize = (): void => {
    width = window.innerWidth;
    height = window.innerHeight;
    docHeight = Math.max(height, document.documentElement.scrollHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    render(0, 0);
  };

  /* Keep halos attached to their elements as images load and layout settles. */
  const refreshAnchors = (): void => {
    const fresh = syncAnchors();
    fresh.forEach((anchor) => {
      const existing = anchors.find((candidate) => candidate.element === anchor.element);
      if (existing) Object.assign(existing, anchor);
    });
    const newHeight = Math.max(height, document.documentElement.scrollHeight);
    if (Math.abs(newHeight - docHeight) > 200) {
      docHeight = newHeight;
      seed();
    }
  };

  /* Events */

  const visibleParticles = (): Particle[] => particles.filter((p) => p.sy > 0 && p.sy < height);

  const spawnEvent = (now: number): void => {
    const visible = visibleParticles();
    if (!visible.length) return;
    const halos = visible.filter((p) => p.kind === 'halo');
    const origin = (Math.random() < 0.7 && halos.length ? pick(halos) : pick(visible)) as Particle;
    const roll = Math.random();

    if (roll < 0.46) {
      events.push({ type: 'wave', x: origin.x, y: origin.y, start: now, speed: random(220, 320), lambda: random(70, 110), amp: random(9, 14), maxR: random(520, 760) });
    } else if (roll < 0.74) {
      const edges: Edge[] = [];
      const visited = new Set<Particle>([origin]);
      let frontier = [origin];
      const reach = narrow ? 90 : 120;
      for (let depth = 0; depth < 3 && edges.length < 16; depth += 1) {
        const nextFrontier: Particle[] = [];
        frontier.forEach((node) => {
          const neighbours = visible
            .filter((candidate) => !visited.has(candidate))
            .map((candidate) => ({ candidate, d: Math.hypot(candidate.x - node.x, candidate.y - node.y) }))
            .filter(({ d }) => d < reach && d > 12)
            .sort((a, b) => a.d - b.d)
            .slice(0, depth === 0 ? 3 : 2);
          neighbours.forEach(({ candidate }) => {
            if (edges.length >= 16) return;
            visited.add(candidate);
            const t0 = now + depth * 300 + random(0, 120);
            edges.push({ from: node, to: candidate, t0, t1: t0 + 260 });
            nextFrontier.push(candidate);
          });
        });
        frontier = nextFrontier;
        if (!frontier.length) break;
      }
      if (edges.length) {
        const end = Math.max(...edges.map((edge) => edge.t1)) + 1500;
        events.push({ type: 'net', start: now, end, edges });
      }
    } else if (roll < 0.87) {
      events.push({ type: 'vortex', x: origin.x, y: origin.y, start: now, duration: random(2600, 3600), radius: random(150, 220), strength: random(0.9, 1.5) });
    } else {
      events.push({ type: 'lattice', x: origin.x, y: origin.y, start: now, duration: random(3200, 4200), radius: random(130, 190), spacing: narrow ? 22 : 28 });
    }
  };

  const pruneEvents = (now: number): void => {
    events = events.filter((event) => {
      if (event.type === 'wave') return ((now - event.start) / 1000) * event.speed < event.maxR;
      if (event.type === 'net') return now < event.end;
      return now - event.start < event.duration;
    });
  };

  const applyEvents = (p: Particle, now: number): { ox: number; oy: number } => {
    let ox = 0;
    let oy = 0;
    events.forEach((event) => {
      if (event.type === 'wave') {
        const r = ((now - event.start) / 1000) * event.speed;
        const dx = p.x - event.x;
        const dy = p.y - event.y;
        const d = Math.hypot(dx, dy) || 1;
        const u = (d - r) / event.lambda;
        if (Math.abs(u) < 1) {
          const hump = Math.cos((u * Math.PI) / 2);
          const fade = 1 - r / event.maxR;
          ox += (dx / d) * event.amp * hump * fade;
          oy += (dy / d) * event.amp * hump * fade;
          p.boost = Math.max(p.boost, hump * fade * 0.8);
        }
      } else if (event.type === 'vortex') {
        const dx = p.x - event.x;
        const dy = p.y - event.y;
        const d = Math.hypot(dx, dy);
        if (d < event.radius) {
          const t = (now - event.start) / event.duration;
          const falloff = (1 - d / event.radius) ** 2;
          const angle = event.strength * Math.sin(Math.PI * t) * falloff;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          ox += dx * cos - dy * sin - dx;
          oy += dx * sin + dy * cos - dy;
          p.boost = Math.max(p.boost, 0.35 * Math.sin(Math.PI * t) * falloff);
        }
      } else if (event.type === 'lattice') {
        const dx = p.x - event.x;
        const dy = p.y - event.y;
        const d = Math.hypot(dx, dy);
        if (d < event.radius) {
          const t = (now - event.start) / event.duration;
          const ease = t < 0.25 ? t / 0.25 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
          const smooth = ease * ease * (3 - 2 * ease);
          const rowHeight = event.spacing * 0.866;
          const row = Math.round(dy / rowHeight);
          const shift = (row % 2 === 0 ? 0 : 0.5) * event.spacing;
          const col = Math.round((dx - shift) / event.spacing);
          const tx = col * event.spacing + shift;
          const ty = row * rowHeight;
          const edge = Math.min(1, (event.radius - d) / 40);
          ox += (tx - dx) * smooth * edge;
          oy += (ty - dy) * smooth * edge;
          p.violet = Math.max(p.violet, smooth * edge);
          p.boost = Math.max(p.boost, 0.3 * smooth * edge);
        }
      }
    });
    return { ox, oy };
  };

  const drawEvents = (now: number): void => {
    events.forEach((event) => {
      if (event.type === 'wave') {
        const r = ((now - event.start) / 1000) * event.speed;
        const alpha = (1 - r / event.maxR) * 0.28;
        if (alpha <= 0) return;
        ctx.beginPath();
        ctx.arc(event.x, event.y - scrollY, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${series}, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(event.x, event.y - scrollY, Math.max(0, r - event.lambda * 0.6), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${series}, ${alpha * 0.35})`;
        ctx.stroke();
      } else if (event.type === 'net') {
        event.edges.forEach((edge) => {
          if (now < edge.t0) return;
          const ax = edge.from.sx;
          const ay = edge.from.sy;
          const bx = edge.to.sx;
          const by = edge.to.sy;
          const travel = Math.min(1, (now - edge.t0) / (edge.t1 - edge.t0));
          const settled = now > edge.t1 ? Math.min(1, (now - edge.t1) / 1500) : 0;
          const alpha = 0.5 * (1 - settled);
          if (alpha <= 0) return;
          const hx = ax + (bx - ax) * travel;
          const hy = ay + (by - ay) * travel;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(hx, hy);
          ctx.strokeStyle = `rgba(${series}, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
          if (travel < 1) {
            ctx.beginPath();
            ctx.arc(hx, hy, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${spark}, 0.95)`;
            ctx.fill();
          } else {
            edge.to.boost = Math.max(edge.to.boost, 1 - settled);
            edge.from.boost = Math.max(edge.from.boost, (1 - settled) * 0.6);
          }
        });
      }
    });
  };

  /* Frame */

  const render = (now: number, delta: number): void => {
    ctx.clearRect(0, 0, width, height);
    const still = reducedMotion.matches;
    const stretch = still ? 0 : Math.min(1, Math.abs(velocity) / 1600);
    const direction = velocity >= 0 ? 1 : -1;
    const dt = delta / 1000;

    particles.forEach((p) => {
      /* Only particles near the viewport are updated; the rest wait where they are. */
      const near = p.kind === 'halo' && p.anchor
        ? p.anchor.cy - scrollY > -500 && p.anchor.cy - scrollY < height + 500
        : p.y - scrollY * p.depth > -200 && p.y - scrollY * p.depth < height + 200;
      if (!near) {
        p.sy = -9999;
        return;
      }
      if (p.kind === 'halo' && p.anchor) {
        if (!still) p.theta += p.omega * dt;
        const inner = p.anchor.hw / (p.anchor.hw + p.anchor.margin);
        const rho = inner + (1 - inner) * (0.55 + 0.45 * Math.sin(p.rhoPhase + (still ? 0 : now * 0.00025)));
        p.x = p.anchor.cx + Math.cos(p.theta) * (p.anchor.hw + p.anchor.margin) * rho;
        p.y = p.anchor.cy + Math.sin(p.theta) * (p.anchor.hh + p.anchor.margin) * rho;
      } else if (!still && dt) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y < -6) p.y = docHeight + 6;
        if (p.y > docHeight + 6) p.y = -6;
        if (p.x < -6) p.x = width + 6;
        if (p.x > width + 6) p.x = -6;
      }
      p.sx = p.x;
      p.sy = p.y - scrollY * p.depth;
      p.boost *= 0.86;
      p.violet *= 0.9;
    });

    const visible = particles.filter((p) => p.sy > -40 && p.sy < height + 40);

    visible.forEach((p) => {
      const { ox, oy } = still ? { ox: 0, oy: 0 } : applyEvents(p, now);
      /* Particles handed over by the intro start where its particles were and glide home. */
      let hx = 0;
      let hy = 0;
      if (p.handoffAt) {
        const k = 1 - Math.min(1, (now - p.handoffAt) / 1700);
        const eased = k * k * (3 - 2 * k);
        hx = p.hx * eased;
        hy = p.hy * eased;
        if (k <= 0) p.handoffAt = 0;
      }
      const x = p.sx + ox + hx;
      const y = p.sy + oy + hy;
      const twinkle = still ? 1 : 0.6 + 0.4 * Math.sin(now * 0.001 * p.twinkle + p.phase);
      const alpha = Math.min(1, p.alpha * twinkle + p.boost);
      const tint = p.violet > 0.5 ? futures : p.boost > 0.55 ? spark : p.tint;

      if (p.bright) {
        ctx.beginPath();
        ctx.arc(x, y, p.radius * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${tint}, ${alpha * 0.12})`;
        ctx.fill();
      }

      if (stretch > 0.04) {
        const length = stretch * (14 + 16 * p.depth);
        ctx.beginPath();
        ctx.moveTo(x, y - direction * length * 0.3);
        ctx.lineTo(x, y + direction * length * 0.7);
        ctx.strokeStyle = `rgba(${tint}, ${Math.min(1, alpha + stretch * 0.3)})`;
        ctx.lineWidth = p.radius * 1.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${tint}, ${alpha})`;
        ctx.fill();
      }
    });

    if (!still) drawEvents(now);
  };

  const tick = (now: number): void => {
    frame = 0;
    if (document.hidden || reducedMotion.matches) return;
    const delta = lastTime ? Math.min(now - lastTime, 200) : 0;
    lastTime = now;

    const nextScroll = window.scrollY;
    const instant = delta ? ((nextScroll - scrollY) / delta) * 1000 : 0;
    velocity = velocity * 0.78 + instant * 0.22;
    scrollY = nextScroll;

    if (now - lastAnchorSync > 1500) {
      lastAnchorSync = now;
      refreshAnchors();
    }

    if (!nextEventAt) nextEventAt = now + 1800;
    if (now >= nextEventAt) {
      pruneEvents(now);
      if (events.length < 2) spawnEvent(now);
      nextEventAt = now + random(2800, 5800);
    }
    pruneEvents(now);

    if (now - lastRender >= 1000 / 36) {
      lastRender = now;
      render(now, delta);
    }
    frame = requestAnimationFrame(tick);
  };

  const schedule = (): void => {
    if (frame || document.hidden || reducedMotion.matches) return;
    if (document.documentElement.classList.contains('is-intro')) return;
    lastTime = 0;
    frame = requestAnimationFrame(tick);
  };

  resize();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('load', refreshAnchors);
  window.addEventListener(
    'fd:intro-handoff',
    (event) => {
      const points = (event as CustomEvent<Array<{ x: number; y: number }>>).detail ?? [];
      if (!points.length) return;
      const now = performance.now();
      scrollY = window.scrollY;
      particles.forEach((p) => {
        p.sx = p.x;
        p.sy = p.y - scrollY * p.depth;
      });
      const home = particles.filter((p) => p.sy > -40 && p.sy < height + 40);
      home.forEach((p) => {
        const point = points[Math.floor(Math.random() * points.length)];
        if (!point) return;
        p.hx = point.x - p.sx;
        p.hy = point.y - p.sy;
        p.handoffAt = now;
      });
    },
    { once: true },
  );
  window.addEventListener(
    'fd:intro-done',
    () => {
      events.push({
        type: 'wave',
        x: width * 0.5,
        y: window.scrollY + height * 0.5,
        start: performance.now(),
        speed: 420,
        lambda: 120,
        amp: 16,
        maxR: Math.max(width, height) * 0.8,
      });
      schedule();
    },
    { once: true },
  );
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else schedule();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      render(0, 0);
    } else schedule();
  });
  schedule();
}
