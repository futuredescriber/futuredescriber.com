/*
 * Page-load intro: a Gaussian wave packet, drawn in particles, with a gate.
 *
 * On a blank black overlay, particles fade into existence and assemble into a
 * travelling wave packet: the corkscrew of Ψ(x,t) = A·e^{-(x−vt)²/4a²}·e^{i(kx−ωt)}
 * inside its Gaussian envelope, with the envelope's rings, a core built from
 * smaller particles, and the oscillating shadow on a perspective floor. The
 * packet keeps travelling along a receding axis toward the viewer, off the
 * near edge and back on from the far end, until the visitor enters.
 *
 * The control is part of the instrument: a small ring of particles standing on
 * the axis, which the packet threads on every pass and lights as it goes
 * through, with a mono "enter" label beneath it. Only a click, tap or key
 * enters, with sound (it is the gesture the music needs); the page waits as
 * long as the visitor likes. On entering, the gate opens as a
 * ripple, the wave keeps moving as it fades, the page comes up through blur,
 * and the particles are handed to the page's own field, which starts its
 * particles at those positions and glides them home.
 *
 * Everything inside the envelope turns about the axis: the corkscrew, the
 * envelope's rings (each a little behind the one before, so the cage twists),
 * and the core, a small cluster of particles on tilted orbits, the inner ones
 * fastest. The gate answers each pass: it swells on a spring as the packet
 * threads it and takes a spin from the wave that drags back to rest.
 *
 * Technical phrases travel with the packet, in mono, in lanes above and below
 * the axis and laid in its plane so they recede with it: leading the envelope
 * or trailing it, never beside the core. Each one flickers in as glyphs,
 * decodes into text, holds, and scrambles back out within its trip across the
 * screen. They are decoration (the canvas is hidden from assistive
 * technology); the page carries the words.
 *
 * Plays once per session, never under reduced motion, never when arriving at
 * an anchor. The <head> sets html.is-intro synchronously so the page never
 * flashes first; CSS carries a fail-safe that reveals the page if this script
 * never starts, and a watchdog enters if the animation stalls.
 */
import { phrases } from '../data/phrases';

const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const ASSEMBLE_START = 650;
const ASSEMBLE_END = 1800;
const GATE_AT = 1900;
const PASS_SECONDS = 3.9;
const DISSOLVE_MS = 1300;

const SIGMA = 0.22;
const AMPLITUDE = 0.3;
const WAVES = 38;
const OMEGA = Math.PI * 2 * 1.25;
const FLOOR = -0.46;
const SPAN = 3.8;
const GLYPHS = '†‡‰•‣‹›‼‽⁄ÆØÞðþ§¶¤¬×÷±µ¿¡↑↓−';

/* Rotation inside the envelope, in radians a second; negative turns with the corkscrew. */
const RING_SPIN = -2.1;
const RING_TWIST = 3.4;
const CORE_SPIN = -2.6;

/* The gate's spring (swell) and flywheel (spin). */
const SWELL = 0.38;
const SWELL_STIFFNESS = 60;
const SWELL_DAMPING = 9;
const TORQUE = 4.2;
const DRAG = 0.85;

/*
 * Phrases: drawn at PHRASE_FONT px and scaled so the type is PHRASE_PX tall
 * (14 on a phone) at the gate's depth. A phrase's life is fitted to its trip:
 * it is wholly on screen from 10% to 86% of it, decodes in the first third,
 * and scrambles out after 72%.
 */
const PHRASE_FONT = 20;
const PHRASE_PX = 15;
const PHRASE_LIFE_MAX = 3600;
const PHRASE_TRACK = 0.78;

type Kind = 'helix' | 'ring' | 'shadow' | 'core' | 'gate' | 'pip';

interface Orbit {
  radius: number;
  speed: number;
  e1: [number, number, number];
  e2: [number, number, number];
}

interface Particle {
  kind: Kind;
  u: number;
  thickness: number;
  angle: number;
  ringAngle: number;
  startX: number;
  startY: number;
  delay: number;
  x: number;
  y: number;
  bx: number;
  by: number;
  alpha: number;
  size: number;
  drawSize: number;
  tint: string;
  seed: number;
  /* Brightness weight, so an evenly spaced ring shows its turning. */
  shade: number;
  /* Helix: how fast the particle's offset circles its strand. */
  spin: number;
  orbit?: Orbit;
}

function done(): void {
  root.classList.remove('is-intro', 'is-arrival-live');
  window.dispatchEvent(new Event('fd:intro-done'));
}

if (root.classList.contains('is-intro')) {
  try {
    sessionStorage.setItem('fd-intro', '1');
  } catch {
    /* storage can be unavailable; the intro simply plays again next time */
  }
  if (reducedMotion.matches || document.hidden) done();
  else play();
}

function play(): void {
  const canvas = document.createElement('canvas');
  canvas.className = 'intro';
  canvas.setAttribute('data-intro', '');
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    done();
    return;
  }

  const enterButton = document.createElement('button');
  enterButton.type = 'button';
  enterButton.className = 'intro__enter';
  enterButton.setAttribute('data-intro-enter', '');
  enterButton.setAttribute('aria-label', 'Enter the site');
  enterButton.hidden = true;
  const enterLabel = document.createElement('span');
  enterLabel.className = 'intro__enter-label';
  enterLabel.setAttribute('aria-hidden', 'true');
  enterLabel.textContent = 'enter';
  enterButton.append(enterLabel);
  document.body.prepend(enterButton);

  const styles = getComputedStyle(root);
  const series = styles.getPropertyValue('--series-rgb').trim() || '44, 196, 238';
  const futures = styles.getPropertyValue('--futures-rgb').trim() || '168, 107, 245';
  const spark = '230, 251, 255';

  let width = 0;
  let height = 0;
  let narrow = false;
  const resize = (): void => {
    width = window.innerWidth;
    height = window.innerHeight;
    narrow = width < 700;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    placeEnter();
  };

  const random = (min: number, max: number): number => min + Math.random() * (max - min);
  const particles: Particle[] = [];
  const make = (kind: Kind, u: number, thickness: number, angle: number, ringAngle: number, size: number, tint: string): Particle => {
    const p: Particle = {
      kind,
      u,
      thickness,
      angle,
      ringAngle,
      startX: random(-40, window.innerWidth + 40),
      startY: random(-40, window.innerHeight + 40),
      delay: random(0, 560),
      x: 0,
      y: 0,
      bx: 0,
      by: 0,
      alpha: 0,
      size,
      drawSize: size,
      tint,
      seed: random(0, Math.PI * 2),
      shade: 1,
      spin: 0,
    };
    particles.push(p);
    return p;
  };

  const scale = window.innerWidth < 700 ? 0.5 : 1;
  const helixCount = Math.round(640 * scale);
  for (let i = 0; i < helixCount; i += 1) {
    const u = -1.3 + (2.6 * i) / (helixCount - 1) + random(-0.002, 0.002);
    const p = make('helix', u, random(0, 0.018), random(0, Math.PI * 2), 0, random(1.2, 2.2), series);
    p.spin = -random(0.9, 2.2);
  }
  const helix = particles.filter((p) => p.kind === 'helix').sort((a, b) => a.u - b.u);
  const rings = 10;
  for (let j = 0; j < rings; j += 1) {
    const offset = -2 * SIGMA + (4 * SIGMA * j) / (rings - 1);
    const count = Math.round(22 * scale);
    for (let i = 0; i < count; i += 1) {
      const p = make('ring', offset, 0, 0, (Math.PI * 2 * i) / count + j * 0.17, 1.3, futures);
      /* Two bright arcs per ring, so its turning reads. */
      p.shade = 0.3 + 0.7 * (0.5 + 0.5 * Math.cos((Math.PI * 4 * i) / count)) ** 2;
    }
  }
  const shadowCount = Math.round(260 * scale);
  for (let i = 0; i < shadowCount; i += 1) {
    make('shadow', -1.3 + (2.6 * i) / (shadowCount - 1), 0, 0, 0, 1.1, futures);
  }
  const shadow = particles.filter((p) => p.kind === 'shadow').sort((a, b) => a.u - b.u);
  /*
   * The core is built from small particles that converge as the packet
   * assembles, then keep circling it on orbits tilted up to ~35° off the axis,
   * the inner ones fastest.
   */
  for (let i = 0; i < 70 * scale; i += 1) {
    const p = make('core', random(-0.03, 0.03), 0, random(0, Math.PI * 2), 0, random(1, 1.9), spark);
    const tilt = random(0, 0.6);
    const node = random(0, Math.PI * 2);
    const n: [number, number, number] = [Math.cos(tilt), Math.sin(tilt) * Math.cos(node), Math.sin(tilt) * Math.sin(node)];
    const length = Math.hypot(n[2], n[0]);
    const e1: [number, number, number] = [-n[2] / length, 0, n[0] / length];
    const e2: [number, number, number] = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
    const radius = 0.018 + 0.05 * Math.random() ** 1.4;
    p.orbit = { radius, speed: CORE_SPIN * (0.03 / radius) ** 1.2, e1, e2 };
  }

  /* Camera: the axis recedes to the upper left and comes toward the viewer at the lower right. */
  const yaw = 0.54;
  const pitch = 0.3;
  const distance = 2.6;
  const focal = () => width * (narrow ? 1.9 : 1.25);
  const cx = () => width * 0.5;
  const cy = () => height * 0.44;

  const project = (X: number, Y: number, Z: number): { x: number; y: number; depth: number } => {
    const x1 = X * Math.cos(yaw) + Z * Math.sin(yaw);
    const z1 = -X * Math.sin(yaw) + Z * Math.cos(yaw);
    const y2 = Y * Math.cos(pitch) + z1 * Math.sin(pitch);
    const z2 = -Y * Math.sin(pitch) + z1 * Math.cos(pitch);
    const z3 = z2 + distance;
    const f = focal();
    return { x: cx() + (f * x1) / z3, y: cy() - (f * y2) / z3, depth: z3 };
  };

  const envelope = (u: number, centre: number): number => Math.exp(-((u - centre) ** 2) / (2 * SIGMA * SIGMA));
  const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const easeOut = (t: number): number => 1 - (1 - t) ** 3;
  const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

  const target = (
    p: Particle,
    centre: number,
    seconds: number,
    assembled: number,
  ): { x: number; y: number; bx: number; by: number; depth: number; strength: number } => {
    if (p.kind === 'ring') {
      const u = centre + p.u;
      const r = AMPLITUDE * envelope(u, centre);
      const angle = p.ringAngle + RING_SPIN * seconds - RING_TWIST * p.u;
      const point = project(u, r * Math.cos(angle), r * Math.sin(angle));
      return { ...point, bx: point.x, by: point.y, strength: envelope(u, centre) };
    }
    if (p.kind === 'shadow') {
      const r = AMPLITUDE * envelope(p.u, centre);
      const alpha = WAVES * p.u - OMEGA * seconds;
      const point = project(p.u, FLOOR, r * Math.sin(alpha));
      return { ...point, bx: point.x, by: point.y, strength: 0.35 + 0.65 * envelope(p.u, centre) };
    }
    if (p.kind === 'core' && p.orbit) {
      const { radius, speed, e1, e2 } = p.orbit;
      const reach = radius * (1 + 2.5 * (1 - assembled));
      const theta = p.angle + speed * seconds;
      const c = Math.cos(theta) * reach;
      const s = Math.sin(theta) * reach;
      const u = centre + p.u * (1 - assembled) + c * e1[0] + s * e2[0];
      const point = project(u, c * e1[1] + s * e2[1], c * e1[2] + s * e2[2]);
      return { ...point, bx: point.x, by: point.y, strength: 1 };
    }
    const r = AMPLITUDE * envelope(p.u, centre);
    const alpha = WAVES * p.u - OMEGA * seconds;
    const fuzz = p.angle + p.spin * seconds;
    const Y = r * Math.cos(alpha) + p.thickness * Math.cos(fuzz);
    const Z = r * Math.sin(alpha) + p.thickness * Math.sin(fuzz);
    const point = project(p.u, Y, Z);
    const ideal = project(p.u, r * Math.cos(alpha), r * Math.sin(alpha));
    return { ...point, bx: ideal.x, by: ideal.y, strength: 0.3 + 0.7 * envelope(p.u, centre) };
  };

  const floorGrid = (alpha: number): void => {
    if (alpha <= 0) return;
    ctx.save();
    ctx.strokeStyle = `rgba(${series}, ${alpha})`;
    ctx.lineWidth = 1;
    for (let X = -1.6; X <= 1.6; X += 0.2) {
      const a = project(X, FLOOR, -1);
      const b = project(X, FLOOR, 1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (let Z = -1; Z <= 1; Z += 0.2) {
      const a = project(-1.6, FLOOR, Z);
      const b = project(1.6, FLOOR, Z);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* The packet eases out of rest, then travels at constant speed, wrapping from the near edge to the far end. */
  const travelAt = (t: number): number => {
    if (t <= ASSEMBLE_END) return -0.85;
    const tau = (t - ASSEMBLE_END) / 1000;
    const speed = SPAN / PASS_SECONDS;
    return -0.85 + speed * (tau <= 0.7 ? (tau * tau) / 1.4 : tau - 0.35);
  };
  const centreAt = (t: number): number => ((((travelAt(t) + 1.9) % SPAN) + SPAN) % SPAN) - 1.9;
  const passAt = (t: number): number => Math.floor((travelAt(t) + 1.9) / SPAN);

  /*
   * The gate: a ring standing on the axis, a little way toward the viewer,
   * drawn in particles with a hairline through them and a dial of ticks
   * outside. The packet threads it on every pass; the core lights it as it
   * goes through. The label is real text under the ring.
   */
  const gateU = (): number => (narrow ? 0.2 : 0.32);
  const gateR = (): number => (narrow ? 0.13 : 0.09);
  const gatePoint = (angle: number, radius: number): { x: number; y: number; depth: number } =>
    project(gateU(), radius * Math.cos(angle), radius * Math.sin(angle));
  /* The label sits clear of the ring at rest and of most of its swell. */
  const gateBox = (extent = gateR() * 1.45): { x: number; y: number; top: number; bottom: number; halfWidth: number } => {
    const centre = project(gateU(), 0, 0);
    let top = Infinity;
    let bottom = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (let i = 0; i < 24; i += 1) {
      const point = gatePoint((Math.PI * 2 * i) / 24, extent);
      top = Math.min(top, point.y);
      bottom = Math.max(bottom, point.y);
      left = Math.min(left, point.x);
      right = Math.max(right, point.x);
    }
    return { x: centre.x, y: centre.y, top, bottom, halfWidth: Math.max(right - centre.x, centre.x - left) };
  };

  let gateBuilt = false;
  let gateShownAt = 0;
  let hot = false;
  let scanTimer = 0;

  /*
   * The gate's response to the wave: a spring pulls the swell toward how much
   * of the packet is passing through, overshooting a little as it lets go,
   * and the pass spins a flywheel that drag brings back to rest.
   */
  let swell = 0;
  let swellVelocity = 0;
  let gateTurn = 0;
  let gateSpin = 0;
  const gateRadius = (): number => gateR() * (1 + SWELL * swell);
  const stepGate = (pass: number, dt: number): void => {
    swellVelocity += (SWELL_STIFFNESS * (pass - swell) - SWELL_DAMPING * swellVelocity) * dt;
    swell = Math.max(-0.3, Math.min(1.4, swell + swellVelocity * dt));
    gateSpin += (-TORQUE * pass - DRAG * gateSpin) * dt;
    gateTurn += gateSpin * dt;
  };

  const placeEnter = (): void => {
    const box = gateBox();
    const w = Math.max(96, Math.round(box.halfWidth * 2 + 40));
    const top = Math.round(box.top - 14);
    const bottom = Math.round(box.bottom + 52);
    enterButton.style.left = `${Math.round(box.x - w / 2)}px`;
    enterButton.style.top = `${top}px`;
    enterButton.style.width = `${w}px`;
    enterButton.style.height = `${bottom - top}px`;
  };

  const decodeLabel = (element: HTMLElement, text: string, duration: number): void => {
    const began = performance.now();
    let lastScramble = 0;
    const step = (now: number): void => {
      const front = Math.min(text.length, Math.floor(((now - began) / duration) * (text.length + 1)));
      if (now - lastScramble > 70) {
        lastScramble = now;
        let glyphs = '';
        for (let i = front; i < text.length; i += 1) glyphs += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        element.textContent = text.slice(0, front) + glyphs;
      }
      if (front < text.length) requestAnimationFrame(step);
      else element.textContent = text;
    };
    requestAnimationFrame(step);
  };

  const scheduleScan = (): void => {
    scanTimer = window.setTimeout(
      () => {
        enterLabel.classList.add('is-scanning');
        window.setTimeout(() => enterLabel.classList.remove('is-scanning'), 950);
        scheduleScan();
      },
      3800 + Math.random() * 3200,
    );
  };

  const buildGate = (now: number): void => {
    gateBuilt = true;
    gateShownAt = now;
    const box = gateBox();
    const count = narrow ? 64 : 96;
    for (let i = 0; i < count; i += 1) {
      const p = make('gate', 0, 0, 0, (Math.PI * 2 * i) / count, narrow ? 1.1 : 1.2, series);
      /* Every eighth particle is a marker, so the ring's turning shows. */
      p.shade = i % 8 === 0 ? 1.5 : 1;
      p.startX = box.x + random(-180, 180);
      p.startY = box.y + random(-120, 120);
      p.delay = random(0, 420);
    }
    for (let i = 0; i < 3; i += 1) {
      const p = make('pip', 0, 0, (Math.PI * 2 * i) / 3, 0, 1.7, spark);
      p.startX = box.x + random(-180, 180);
      p.startY = box.y + random(-120, 120);
      p.delay = random(100, 420);
    }
    placeEnter();
    enterButton.hidden = false;
    requestAnimationFrame(() => enterButton.classList.add('is-live'));
    window.setTimeout(() => decodeLabel(enterLabel, 'enter', 700), 520);
    window.setTimeout(scheduleScan, 1600);
  };

  const warm = (): void => {
    hot = true;
  };
  const cool = (): void => {
    hot = false;
  };
  enterButton.addEventListener('pointerenter', warm);
  enterButton.addEventListener('pointerleave', cool);
  enterButton.addEventListener('focus', warm);
  enterButton.addEventListener('blur', cool);

  /*
   * Phrases ride with the packet. Each has a lane (a height above or below the
   * axis, clear of the gate and its label), a place leading or trailing the
   * envelope, and a rate: leading phrases keep pace, trailing ones fall back a
   * little like a wake (more on a phone, where the screen is crossed in about
   * a second). A new pass brings a new phrase, sometimes two.
   */
  interface Phrase {
    text: string;
    anchor: number;
    anchorTravel: number;
    rate: number;
    y: number;
    em: number;
    born: number;
    life: number;
    seed: number;
  }
  const phrasesLive: Phrase[] = [];
  const bag: string[] = [];
  let lastPass = -1;
  const monoFamily = styles.getPropertyValue('--font-mono').trim() || 'monospace';
  document.fonts?.load(`400 ${PHRASE_FONT}px ${monoFamily}`).catch(() => undefined);

  const nextText = (): string => {
    if (!bag.length) {
      const fresh = [...phrases];
      for (let i = fresh.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
      }
      bag.push(...fresh);
    }
    return bag.pop() ?? phrases[0];
  };

  const unitsPerPx = (): number => {
    const a = project(gateU(), 0, 0);
    const b = project(gateU(), 0.1, 0);
    return 0.1 / Math.max(1, a.y - b.y);
  };

  /* Lanes in world units: above the dial at full swell, below the label, never down on the floor. */
  const lanes = (em: number): { above: number; below: number | null } => {
    const perPx = unitsPerPx();
    const centre = project(gateU(), 0, 0);
    const ticksTop = centre.y - gateBox(gateR() * (1 + SWELL) * 1.34).top;
    const labelBottom = gateBox().bottom - centre.y + 46;
    const above = (ticksTop + 14) * perPx;
    const belowTop = -(labelBottom + 34) * perPx;
    const below = belowTop - em * 0.72;
    return { above, below: below - em * 0.3 > FLOOR + 0.05 ? below : null };
  };

  const phraseAt = (phrase: Phrase, t: number): number => phrase.anchor + phrase.rate * (travelAt(t) - phrase.anchorTravel);

  const fits = (phrase: Phrase, t: number): boolean => {
    const u = phraseAt(phrase, t);
    const length = phrase.text.length * phrase.em * PHRASE_TRACK;
    const margin = narrow ? 10 : 20;
    for (const point of [project(u, phrase.y, 0), project(u + length, phrase.y, 0), project(u + length, phrase.y + phrase.em, 0)]) {
      if (point.x < margin || point.x > width - margin || point.y < margin || point.y > height - margin) return false;
    }
    return true;
  };

  const spawnPhrase = (t: number, avoid?: Phrase): Phrase | null => {
    const em = (narrow ? 14 : PHRASE_PX) * unitsPerPx();
    const lane = lanes(em);
    const gap = narrow ? 0.32 : 0.5;
    const centre = centreAt(t);
    const travel = travelAt(t);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const text = nextText();
      const length = text.length * em * PHRASE_TRACK;
      const lead = avoid ? avoid.rate < 1 : Math.random() < 0.5;
      const up = avoid ? avoid.y < 0 : lane.below === null || Math.random() < 0.55;
      const y = up ? lane.above : lane.below;
      if (y === null) continue;
      const phrase: Phrase = {
        text,
        anchor: lead ? centre + gap : centre - gap - length,
        anchorTravel: travel,
        rate: lead ? 1 : narrow ? 0.62 : 0.93,
        y,
        em,
        born: 0,
        life: 0,
        seed: Math.random() * 1000,
      };
      /* The stretch of this pass during which the whole phrase is on screen. */
      let enters = -1;
      let leaves = -1;
      for (let at = t; at < t + PASS_SECONDS * 1000 * 1.4; at += 40) {
        if (passAt(at) !== passAt(t) && phrase.rate === 1) break;
        if (fits(phrase, at)) {
          if (enters < 0) enters = at;
          leaves = at;
        } else if (enters >= 0) break;
      }
      const onScreen = leaves - enters;
      if (enters < 0 || onScreen < (narrow ? 900 : 1300)) continue;
      phrase.life = Math.min(PHRASE_LIFE_MAX, onScreen / 0.76);
      phrase.born = enters - 0.1 * phrase.life;
      return phrase;
    }
    return null;
  };

  const updatePhrases = (t: number): void => {
    for (let i = phrasesLive.length - 1; i >= 0; i -= 1) {
      if (t - phrasesLive[i].born > phrasesLive[i].life) phrasesLive.splice(i, 1);
    }
    if (!gateBuilt || entered || performance.now() - gateShownAt < 900) return;
    const pass = passAt(t);
    if (pass === lastPass) return;
    lastPass = pass;
    const first = spawnPhrase(t);
    if (!first) return;
    phrasesLive.push(first);
    if (!narrow && Math.random() < 0.35) {
      const second = spawnPhrase(t, first);
      if (second) phrasesLive.push(second);
    }
  };

  const glyphAt = (seed: number, index: number, now: number): string => {
    const tick = Math.floor(now / 70);
    const hash = Math.abs(Math.sin(seed + index * 12.9898 + tick * 78.233) * 43758.5453);
    return GLYPHS[Math.floor((hash % 1) * GLYPHS.length)];
  };

  const drawPhrases = (t: number, now: number, fade: number): void => {
    if (!phrasesLive.length || fade <= 0) return;
    ctx.font = `400 ${PHRASE_FONT}px ${monoFamily}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    for (const phrase of phrasesLive) {
      const age = t - phrase.born;
      if (age < 0) continue;
      const f = age / phrase.life;
      const n = phrase.text.length;
      const start = phraseAt(phrase, t);
      const step = phrase.em * PHRASE_TRACK;
      const k = phrase.em / PHRASE_FONT;
      for (let i = 0; i < n; i += 1) {
        const ch = phrase.text[i];
        if (ch === ' ') continue;
        const order = i / n;
        const appear = clamp01((f - 0.1 * order) / 0.08);
        const resolvedAt = 0.12 + 0.24 * order;
        const revertAt = 0.72 + 0.14 * order;
        const out = clamp01((f - revertAt - 0.02) / 0.1);
        const alpha = appear * (1 - out) * fade;
        if (alpha <= 0.01) continue;
        const resolved = f >= resolvedAt && f < revertAt;
        const fresh = resolved && f - resolvedAt < 0.05;
        const glyph = resolved ? ch : glyphAt(phrase.seed, i, now);
        const tint = fresh ? spark : resolved ? series : futures;

        /* Each character is drawn in the plane of the axis: its own local slice of the perspective. */
        const u = start + i * step;
        const origin = project(u, phrase.y, 0);
        const along = project(u + 0.01, phrase.y, 0);
        const up = project(u, phrase.y + 0.01, 0);
        ctx.save();
        ctx.transform(
          ((along.x - origin.x) / 0.01) * k,
          ((along.y - origin.y) / 0.01) * k,
          (-(up.x - origin.x) / 0.01) * k,
          (-(up.y - origin.y) / 0.01) * k,
          origin.x,
          origin.y,
        );
        ctx.fillStyle = `rgba(${tint}, ${alpha * (resolved ? 0.9 : 0.62)})`;
        ctx.fillText(glyph, 0, 0);
        ctx.restore();
      }
    }
  };

  /* Entering */
  let start = 0;
  let entered = false;
  let dissolveAt = 0;
  let finished = false;
  let frame = 0;
  let lastFrameAt = 0;

  const handoff = (): void => {
    const points = particles
      .filter((p) => p.alpha > 0.15 && p.x > -20 && p.x < width + 20 && p.y > -20 && p.y < height + 20)
      .map((p) => ({ x: p.x, y: p.y }));
    window.dispatchEvent(new CustomEvent('fd:intro-handoff', { detail: points }));
  };

  const enter = (withSound: boolean): void => {
    if (entered) return;
    entered = true;
    window.clearTimeout(scanTimer);
    enterButton.hidden = true;
    enterButton.remove();
    window.dispatchEvent(new CustomEvent('fd:enter', { detail: { sound: withSound } }));
    dissolveAt = performance.now();
    handoff();
    root.classList.add('is-materializing');
    canvas.style.transition = 'opacity 1000ms cubic-bezier(0.2, 0.7, 0.2, 1)';
    canvas.style.opacity = '0';
    window.setTimeout(() => {
      if (!finished) done();
      finished = true;
    }, 100);
    window.setTimeout(() => {
      canvas.remove();
      root.classList.remove('is-materializing');
      window.removeEventListener('resize', resize);
    }, DISSOLVE_MS + 500);
  };

  /*
   * The entering gesture has to be one the browser counts as user activation,
   * or the music cannot start from it: a mouse button going down counts, a
   * finger touching down does not, a finger lifting does. So a mouse enters on
   * pointerdown and a touch on pointerup (touchend as a fallback). Nothing
   * else enters: the page waits for the visitor.
   */
  enterButton.addEventListener('click', () => enter(true));
  window.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'mouse') enter(true);
    },
    { passive: true },
  );
  window.addEventListener(
    'pointerup',
    (event) => {
      if (event.pointerType !== 'mouse' && !touchMoved) enter(true);
    },
    { passive: true },
  );
  window.addEventListener(
    'touchend',
    () => {
      if (!touchMoved) enter(true);
    },
    { passive: true },
  );
  window.addEventListener(
    'keydown',
    (event) => {
      if (['Tab', 'Shift', 'Meta', 'Control', 'Alt'].includes(event.key)) return;
      enter(true);
    },
    { passive: true },
  );
  /* A touch that travels is a scroll, not a tap: it does not enter. */
  let touchX = 0;
  let touchY = 0;
  let touchMoved = false;
  window.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.touches[0];
      touchMoved = false;
      if (touch) {
        touchX = touch.clientX;
        touchY = touch.clientY;
      }
    },
    { passive: true },
  );
  window.addEventListener(
    'touchmove',
    (event) => {
      const touch = event.touches[0];
      if (touch && Math.hypot(touch.clientX - touchX, touch.clientY - touchY) > 12) touchMoved = true;
    },
    { passive: true },
  );

  const ellipse = (radius: number, steps = 72): void => {
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const point = gatePoint((Math.PI * 2 * i) / steps, radius);
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
  };

  const drawGate = (now: number, pass: number, fade: number): void => {
    const settled = clamp01((now - gateShownAt - 800) / 500) * fade;
    if (settled <= 0) return;
    const lift = Math.max(pass, hot ? 0.6 : 0);
    const radius = gateRadius();
    const tint = lift > 0.5 ? spark : series;

    ellipse(radius);
    ctx.strokeStyle = `rgba(${tint}, ${(0.32 + 0.5 * lift) * settled})`;
    ctx.lineWidth = 1 + 0.8 * lift;
    ctx.stroke();

    /* The dial: ticks outside the ring, reaching further when the pointer is near. */
    const reach = hot ? 1.34 : 1.24;
    ctx.strokeStyle = `rgba(${series}, ${(0.28 + 0.3 * lift) * settled})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i += 1) {
      const angle = (Math.PI * 2 * i) / 12 + gateTurn;
      const a = gatePoint(angle, radius * 1.14);
      const b = gatePoint(angle, radius * reach);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    /* The leader down to the label, from wherever the swelling dial reaches. */
    const box = gateBox();
    const reached = gateBox(radius * reach).bottom + 6;
    if (reached < box.bottom + 18) {
      ctx.strokeStyle = `rgba(${series}, ${0.42 * settled})`;
      ctx.beginPath();
      ctx.moveTo(box.x, reached);
      ctx.lineTo(box.x, box.bottom + 22);
      ctx.stroke();
    }

    /* The opening: on entering, the ring lets go as a ripple. */
    if (entered) {
      for (const stagger of [0, 0.22]) {
        const e = clamp01((now - dissolveAt) / 900 - stagger);
        if (e <= 0 || e >= 1) continue;
        ellipse(gateR() * (1 + 3.2 * easeOut(e)));
        ctx.strokeStyle = `rgba(${spark}, ${0.55 * (1 - e)})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  };

  const render = (now: number): void => {
    frame = 0;
    if (!start) {
      start = now;
      root.classList.add('is-arrival-live');
    }
    const dt = lastFrameAt ? Math.min(0.05, (now - lastFrameAt) / 1000) : 0;
    lastFrameAt = now;
    const t = now - start;
    const seconds = t / 1000;
    const centre = centreAt(t);
    const assembled = easeInOut(clamp01((t - ASSEMBLE_START) / (ASSEMBLE_END - ASSEMBLE_START)));
    const dissolving = entered ? clamp01((now - dissolveAt) / DISSOLVE_MS) : 0;
    const fade = entered ? 1 - easeOut(dissolving) : 1;
    const pass = gateBuilt ? envelope(gateU(), centre) : 0;

    if (!gateBuilt && t >= GATE_AT) buildGate(now);
    if (gateBuilt) stepGate(pass, dt);
    updatePhrases(t);

    ctx.fillStyle = '#07080a';
    ctx.fillRect(0, 0, width, height);
    floorGrid(0.11 * assembled * fade);

    ctx.globalCompositeOperation = 'lighter';
    drawPhrases(t, now, fade);
    particles.forEach((p) => {
      const emerge = clamp01((t - p.delay) / 420);
      if (p.kind === 'gate' || p.kind === 'pip') {
        const mix = easeOut(clamp01((now - gateShownAt - p.delay) / 800));
        const lift = Math.max(pass, hot ? 0.6 : 0);
        if (p.kind === 'gate') {
          const wobble = Math.sin(now * 0.002 + p.seed) * 0.003;
          const goal = gatePoint(p.ringAngle + gateTurn, gateRadius() + wobble);
          p.x = p.startX + (goal.x - p.startX) * mix;
          p.y = p.startY + (goal.y - p.startY) * mix;
          p.alpha = mix * (0.55 + 0.45 * lift) * p.shade * fade;
          p.drawSize = p.size * (1 + 0.3 * lift) * (p.shade > 1 ? 1.3 : 1);
          p.tint = lift > 0.5 ? spark : series;
        } else {
          const spin = p.angle + gateTurn + now * 0.0011 * (hot ? 2.4 : 1);
          const goal = gatePoint(spin, gateRadius());
          p.x = p.startX + (goal.x - p.startX) * mix;
          p.y = p.startY + (goal.y - p.startY) * mix;
          p.alpha = mix * 0.9 * fade;
          p.drawSize = p.size;
        }
      } else {
        const goal = target(p, centre, seconds, assembled);
        const mix = easeInOut(clamp01((t - ASSEMBLE_START - p.delay * 0.6) / (ASSEMBLE_END - ASSEMBLE_START)));
        p.x = p.startX + (goal.x - p.startX) * mix;
        p.y = p.startY + (goal.y - p.startY) * mix;
        p.bx = p.startX + (goal.bx - p.startX) * mix;
        p.by = p.startY + (goal.by - p.startY) * mix;
        const near = clamp01((3.4 - goal.depth) / 1.6);
        const offscreen = p.x > width + 30 ? 0 : 1;
        p.alpha = emerge * (0.3 + 0.7 * mix * goal.strength) * (0.6 + 0.4 * near) * offscreen * 1.25 * p.shade * fade;
        p.drawSize = p.size * (0.7 + 0.5 * near);
      }
      if (p.alpha <= 0.01) return;

      let tint = p.tint;
      if (p.kind === 'helix') {
        const phase = Math.cos(WAVES * p.u - OMEGA * seconds);
        tint = phase > 0.2 ? series : phase < -0.2 ? futures : spark;
      }
      if ((p.kind === 'helix' && p.alpha > 0.3) || p.kind === 'pip') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.drawSize * 2.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${tint}, ${Math.min(1, p.alpha) * (p.kind === 'pip' ? 0.2 : 0.14)})`;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.drawSize * (p.kind === 'shadow' ? 0.8 : 1), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${tint}, ${Math.min(1, p.alpha) * (p.kind === 'shadow' ? 0.55 : 1)})`;
      ctx.fill();
    });

    /* The core's glow grows as its particles arrive. */
    const corePoint = project(centre, 0, 0);
    const coreGlow = assembled * assembled * fade * (corePoint.x > width + 40 ? 0 : 1);
    if (coreGlow > 0.01) {
      const near = clamp01((3.4 - corePoint.depth) / 1.6);
      const radius = (10 + 14 * near) * coreGlow;
      const glow = ctx.createRadialGradient(corePoint.x, corePoint.y, 0, corePoint.x, corePoint.y, radius * 3);
      glow.addColorStop(0, `rgba(${spark}, ${0.9 * coreGlow})`);
      glow.addColorStop(0.25, `rgba(${spark}, ${0.35 * coreGlow})`);
      glow.addColorStop(1, `rgba(${spark}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(corePoint.x, corePoint.y, radius * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    /* Bonds: the spiral line through the helix and the shadow trace, once the particles have settled. */
    const bond = clamp01((t - ASSEMBLE_END - 150) / 600) * fade;
    if (bond > 0) {
      const trace = (list: Particle[], tint: string, alpha: number, widthPx: number): void => {
        ctx.beginPath();
        let drawing = false;
        list.forEach((p) => {
          if (p.alpha <= 0.05 || p.bx > width + 30) {
            drawing = false;
            return;
          }
          if (!drawing) {
            ctx.moveTo(p.bx, p.by);
            drawing = true;
          } else ctx.lineTo(p.bx, p.by);
        });
        ctx.strokeStyle = `rgba(${tint}, ${alpha * bond})`;
        ctx.lineWidth = widthPx;
        ctx.lineJoin = 'round';
        ctx.stroke();
      };
      trace(helix, series, 0.55, 1.1);
      trace(shadow, futures, 0.3, 1);
    }

    if (gateBuilt) drawGate(now, pass, fade);
    ctx.globalCompositeOperation = 'source-over';

    if (!entered || now - dissolveAt < DISSOLVE_MS + 400) frame = requestAnimationFrame(render);
  };

  resize();
  window.addEventListener('resize', resize, { passive: true });
  frame = requestAnimationFrame(render);

  /* Watchdog: only if the animation itself stalls does the page enter on its own. */
  const silent = (): void => enter(false);
  const watchdog = window.setInterval(() => {
    if (finished) {
      window.clearInterval(watchdog);
      return;
    }
    if (lastFrameAt && performance.now() - lastFrameAt > 3000 && !entered) silent();
    if (!lastFrameAt && performance.now() > 6000) silent();
  }, 1000);
}
