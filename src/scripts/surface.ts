/*
 * Surface motion for the plain parts of the page: text that decodes from
 * glyphs into words, a cyan scan that sweeps across text, and an in-view
 * class that lets section rails run. Everything here is cosmetic; the real
 * text is always present for assistive technology and without JavaScript.
 *
 * data-decode modes
 *   "load"  decodes once when the page loads (headline, lead), in sequence
 *   "once"  decodes once when it scrolls into view (headings, paragraphs)
 *   ""      decodes on reveal and may re-scramble periodically (small labels)
 */
export {};

const GLYPHS = '†‡‰•‣‹›‼‽⁄ÆØÞðþ§¶¤¬×÷±µ¿¡↑↓−';
const SCAN_SELECTOR = [
  'h2',
  'h3',
  '.section-head > p',
  '.lead',
  '.brief dd',
  '.system__context',
  '.capability > p',
  '.steps p',
  '.about__text p',
  '.facts dd',
  '.music__awards li',
  '.music__body > p',
  '.contact__intro > p',
].join(', ');
const PERIOD_MIN = 7000;
const PERIOD_MAX = 12000;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

type Mode = 'load' | 'once' | 'periodic';

interface Target {
  element: HTMLElement;
  chars: HTMLSpanElement[];
  text: string;
  mode: Mode;
  running: boolean;
  visible: boolean;
  decoded: boolean;
}

const targets: Target[] = [];

function randomGlyph(): string {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)] as string;
}

function modeOf(element: HTMLElement): Mode {
  const value = element.dataset.decode;
  if (value === 'load') return 'load';
  if (value === 'once') return 'once';
  return 'periodic';
}

function decorate(element: HTMLElement): Target | null {
  const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  if (!text) return null;

  const accessible = document.createElement('span');
  accessible.className = 'sr-only';
  accessible.textContent = text;

  const wrap = document.createElement('span');
  wrap.className = 'decode';
  wrap.setAttribute('aria-hidden', 'true');

  /* Words are unbreakable groups so a decoding line never wraps mid-word. */
  const chars: HTMLSpanElement[] = [];
  text.split(' ').forEach((word, wordIndex) => {
    if (wordIndex > 0) {
      const space = document.createElement('span');
      space.className = 'decode__space';
      space.textContent = ' ';
      chars.push(space);
      wrap.append(space);
    }
    const group = document.createElement('span');
    group.className = 'decode__word';
    Array.from(word).forEach((char) => {
      const span = document.createElement('span');
      span.className = 'decode__char';
      span.textContent = char;
      chars.push(span);
      group.append(span);
    });
    wrap.append(group);
  });
  element.replaceChildren(accessible, wrap);

  const target: Target = {
    element,
    chars,
    text,
    mode: modeOf(element),
    running: false,
    visible: false,
    decoded: false,
  };

  return target;
}

/*
 * Lock every glyph box to the width of its final character so substitute
 * glyphs never shift the line. Measured boxed (no ligatures or kerning across
 * spans) and against the final characters, so it is correct whether or not a
 * decode is running, and it is re-run when fonts finish loading.
 */
function lockWidths(): void {
  const entries: Array<{ span: HTMLSpanElement; final: string; current: string }> = [];
  targets.forEach((target) => {
    const finals = Array.from(target.text).filter((char) => char !== ' ');
    target.chars
      .filter((span) => span.className === 'decode__char')
      .forEach((span, index) => entries.push({ span, final: finals[index] ?? '', current: span.textContent ?? '' }));
  });
  entries.forEach(({ span, final }) => {
    span.textContent = final;
    span.style.display = 'inline-block';
    span.style.width = '';
    span.style.textAlign = 'center';
  });
  const widths = entries.map(({ span }) => span.getBoundingClientRect().width);
  entries.forEach(({ span, current }, index) => {
    span.style.width = `${widths[index]}px`;
    span.textContent = current;
  });
}

function settle(target: Target): void {
  const letters = target.chars.filter((span) => span.className !== 'decode__space');
  const finals = Array.from(target.text).filter((char) => char !== ' ');
  letters.forEach((span, index) => {
    span.textContent = finals[index] as string;
    span.classList.remove('is-raw', 'is-hot');
  });
  target.running = false;
}

function run(target: Target, duration: number): void {
  if (target.running) return;
  /* Visual-audit captures set data-capture on <html>; decodes then resolve at once. */
  if (document.documentElement.hasAttribute('data-capture')) {
    settle(target);
    return;
  }
  target.running = true;
  const letters = target.chars.filter((span) => span.className !== 'decode__space');
  const finals = Array.from(target.text).filter((char) => char !== ' ');
  const start = performance.now();
  let lastScramble = 0;

  letters.forEach((span) => span.classList.add('is-raw'));

  const frame = (now: number): void => {
    const elapsed = now - start;
    const front = Math.min(letters.length, Math.floor((elapsed / duration) * (letters.length + 1)));
    const scramble = now - lastScramble > 72;
    if (scramble) lastScramble = now;

    letters.forEach((span, index) => {
      if (index < front) {
        if (span.classList.contains('is-raw')) {
          span.textContent = finals[index] as string;
          span.classList.remove('is-raw');
          span.classList.add('is-hot');
          window.setTimeout(() => span.classList.remove('is-hot'), 220);
        }
      } else if (scramble) {
        span.textContent = randomGlyph();
      }
    });

    if (front < letters.length) requestAnimationFrame(frame);
    else settle(target);
  };

  requestAnimationFrame(frame);
}

function scan(element: HTMLElement): void {
  if (element.classList.contains('is-scanning')) return;
  const finish = (): void => element.classList.remove('is-scanning');
  element.addEventListener('animationend', finish, { once: true });
  window.setTimeout(finish, 1600);
  element.classList.add('is-scanning');
}

function inViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0;
}

if (!reducedMotion.matches) {
  document.querySelectorAll<HTMLElement>('[data-decode]').forEach((element) => {
    const target = decorate(element);
    if (target) targets.push(target);
  });

  const reveal = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const target = targets.find((candidate) => candidate.element === entry.target);
        if (!target) return;
        target.visible = entry.isIntersecting;
        if (entry.isIntersecting && target.mode !== 'load' && !target.decoded) {
          target.decoded = true;
          run(target, target.mode === 'once' ? Math.min(1100, 400 + target.text.length * 6) : 650);
        }
      });
    },
    { threshold: 0.4 },
  );
  const watchReveals = (): void => targets.forEach((target) => reveal.observe(target.element));
  if (document.documentElement.classList.contains('is-intro')) {
    window.addEventListener('fd:intro-done', watchReveals, { once: true });
    window.setTimeout(watchReveals, 9500);
  } else {
    watchReveals();
  }

  const relock = (): void => {
    if (document.fonts?.ready) document.fonts.ready.then(lockWidths).catch(lockWidths);
    else lockWidths();
  };
  relock();
  document.fonts?.addEventListener('loadingdone', lockWidths);
  window.addEventListener('load', lockWidths, { once: true });
  let resizeTimer = 0;
  window.addEventListener(
    'resize',
    () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(relock, 150);
    },
    { passive: true },
  );

  /* Page load: the headline, then the lead, resolve in sequence, once the intro (if any) has let the page through. */
  const loadTargets = targets.filter((target) => target.mode === 'load');
  let loadStarted = false;
  const startLoad = (): void => {
    if (loadStarted) return;
    loadStarted = true;
    loadTargets.forEach((target, index) => {
      window.setTimeout(() => run(target, index === 0 ? 1300 : 1500), index * 500);
    });
  };
  const afterFonts = (callback: () => void): void => {
    if (document.fonts?.ready) document.fonts.ready.then(callback).catch(callback);
    else callback();
  };
  if (document.documentElement.classList.contains('is-intro')) {
    window.addEventListener('fd:intro-done', () => afterFonts(startLoad), { once: true });
    window.setTimeout(() => afterFonts(startLoad), 8000);
  } else {
    afterFonts(startLoad);
  }

  /* The pulse: every few seconds a small label forgets itself, and a scan sweeps a line of text. */
  const scanPool = Array.from(document.querySelectorAll<HTMLElement>(SCAN_SELECTOR)).filter(
    (element) => !element.closest('.instrument'),
  );
  const schedulePeriodic = (): void => {
    window.setTimeout(
      () => {
        if (!document.hidden) {
          const labels = targets.filter((target) => target.mode === 'periodic' && target.visible && !target.running);
          const label = labels[Math.floor(Math.random() * labels.length)];
          if (label) run(label, 520);

          if (Math.random() < 0.5) {
            const lines = scanPool.filter((element) => inViewport(element) && !element.classList.contains('is-scanning'));
            const line = lines[Math.floor(Math.random() * lines.length)];
            if (line) scan(line);
          }
        }
        schedulePeriodic();
      },
      PERIOD_MIN + Math.random() * (PERIOD_MAX - PERIOD_MIN),
    );
  };
  schedulePeriodic();
}

/* Sections and other containers that run their rails only while in view. */

const inView = Array.from(document.querySelectorAll<HTMLElement>('[data-inview]'));
if ('IntersectionObserver' in window && inView.length) {
  const observer = new IntersectionObserver(
    (entries) => entries.forEach((entry) => entry.target.classList.toggle('is-visible', entry.isIntersecting)),
    { rootMargin: '40px 0px', threshold: 0.05 },
  );
  inView.forEach((element) => observer.observe(element));
} else {
  inView.forEach((element) => element.classList.add('is-visible'));
}
