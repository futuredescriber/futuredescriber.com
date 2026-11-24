import AxeBuilder from '@axe-core/playwright';
import { chromium, expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { prepareFocusedCapture, settlePage } from '../scripts/capture-ui.mjs';
import { music } from '../src/data/music';
import { phrases } from '../src/data/phrases';

const hasLocalAudio = existsSync(path.resolve('public/audio/mix/dpt14-01.mp3'));

const canonicalOrigin = 'https://futuredescriber.com';
const canonicalHome = `${canonicalOrigin}/`;
const canonicalSocialImage = `${canonicalOrigin}/social/portfolio-og.png`;
const canonicalSitemap = `${canonicalOrigin}/sitemap.xml`;

const requiredSections = ['work', 'capabilities', 'approach', 'about', 'music', 'contact'] as const;

const requiredSystems = [
  'Production Control Layer',
  'Product Lifecycle Intelligence',
  'AI-Assisted Product Creation',
  'Inventory Risk Intelligence',
] as const;

const requiredCapabilities = [
  'Operational systems',
  'Product + UX',
  'Data + intelligence',
  'AI + automation',
  'Cloud + reliability',
  'Commerce + integrations',
] as const;

test.beforeEach(async ({ page }) => {
  /* The page-load intro plays once per session; the suite opts out except in its own test. */
  await page.addInitScript(() => {
    try {
      window.sessionStorage.setItem('fd-intro', '1');
      window.sessionStorage.setItem('fd-music', 'off');
    } catch {
      /* no storage */
    }
  });
});

async function openHome(page: Page): Promise<void> {
  const response = await page.goto('/', { waitUntil: 'networkidle' });
  expect(response?.ok()).toBe(true);
}

async function readTree(directory: string): Promise<Array<{ file: string; text: string }>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: Array<{ file: string; text: string }> = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readTree(entryPath)));
      continue;
    }

    if (/\.(?:css|html|js|json|svg|txt|xml)$/i.test(entry.name) || entry.name === '_redirects') {
      files.push({ file: entryPath, text: await readFile(entryPath, 'utf8') });
    }
  }

  return files;
}

test('published metadata uses the canonical futuredescriber.com URLs', async ({ page }) => {
  await openHome(page);

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonicalHome);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonicalHome);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', canonicalSocialImage);
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', canonicalSocialImage);

  const jsonLd = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) =>
    scripts.map((script) => JSON.parse(script.textContent ?? 'null')),
  );
  expect(jsonLd).toContainEqual(expect.objectContaining({ url: canonicalHome }));
});

test('served sitemap and robots use the canonical futuredescriber.com host', async ({ request }) => {
  const sitemapResponse = await request.get('/sitemap.xml');
  expect(sitemapResponse.ok()).toBe(true);
  const sitemap = await sitemapResponse.text();
  const sitemapLocations = Array.from(sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g), ([, location]) => location);
  expect(sitemapLocations).toEqual([canonicalHome]);

  const robotsResponse = await request.get('/robots.txt');
  expect(robotsResponse.ok()).toBe(true);
  const robots = await robotsResponse.text();
  const robotsSitemaps = robots
    .split(/\r?\n/)
    .map((line) => line.match(/^Sitemap:\s*(\S+)\s*$/i)?.[1])
    .filter((url): url is string => Boolean(url));
  expect(robotsSitemaps).toEqual([canonicalSitemap]);
});

test('built authored outputs omit the www absolute host outside redirect artifacts', async () => {
  const distDirectory = path.resolve('dist');
  const files = await readTree(distDirectory);
  expect(files.length).toBeGreaterThan(0);

  const legacyHostReferences = files
    .filter(({ file }) => path.basename(file) !== '_redirects')
    .filter(({ text }) => text.includes('https://www.futuredescriber.com'))
    .map(({ file }) => path.relative(distDirectory, file));
  expect(legacyHostReferences).toEqual([]);
});

test('home page establishes identity and the complete public story', async ({ page }) => {
  await openHome(page);

  await expect(page).toHaveTitle('Justin Thompson — Operational Systems, AI & Analytics');
  await expect(page.locator('h1')).toContainText('Operational systems for the next industrial age');
  await expect(page.locator('.hero')).toContainText('Justin Thompson');
  await expect(page.locator('.site-mark')).toContainText('Justin Thompson');
  await expect(page.locator('meta[property="og:image:type"]')).toHaveAttribute('content', 'image/png');
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  const socialImage = await page.request.get('/social/portfolio-og.png');
  expect(socialImage.ok()).toBe(true);
  expect(socialImage.headers()['content-type']).toContain('image/png');
  expect((await socialImage.body()).byteLength).toBeGreaterThan(10_000);

  const portrait = page.locator('#about .about__portrait img');
  await expect(portrait).toHaveAttribute('src', '/assets/justin-thompson-profile.jpg');
  await expect(portrait).toHaveAttribute('alt', 'Justin Thompson seated in a studio workspace');

  for (const id of requiredSections) {
    await expect(page.locator(`#${id}`), `section #${id}`).toHaveCount(1);
  }

  for (const title of requiredSystems) {
    await expect(page.locator('.system h3', { hasText: title })).toHaveCount(1);
  }

  for (const title of requiredCapabilities) {
    await expect(page.locator('.capability h3', { hasText: title })).toHaveCount(1);
  }

  const music = page.locator('#music');
  await expect(music.locator('h2')).toContainText('The Basement Paintings');
  await expect(music).toContainText('began as a song title on our first album');
  await expect(music).toContainText('Metal/Loud Artist of the Year');
  await expect(music).toContainText('Western Canadian Music Award');
  await expect(music).toContainText('BreakOut West');
  await expect(music.locator('img')).toHaveAttribute('src', '/assets/basement-paintings-artwork-primary.jpg');
  const artBox = await music.locator('img').boundingBox();
  expect(artBox!.width).toBeGreaterThanOrEqual(300);
  await expect(page.locator('.secondary-projects, [data-secondary-projects]')).toHaveCount(0);

  const contactForm = page.locator('form[name="portfolio-contact"]');
  await expect(contactForm).toHaveAttribute('method', 'POST');
  await expect(contactForm).toHaveAttribute('action', '/message-received/');
  await expect(contactForm).toHaveAttribute('data-netlify', 'true');
  await expect(contactForm).toHaveAttribute('netlify-honeypot', 'bot-field');
  await expect(contactForm.locator('input[name="form-name"]')).toHaveValue('portfolio-contact');
  await expect(contactForm.locator('input[name="bot-field"]')).toHaveCount(1);
  await expect(contactForm.locator('input[name="email"]')).toHaveAttribute('required', '');
  await expect(contactForm.locator('textarea[name="message"]')).toHaveAttribute('required', '');
  await expect(contactForm.locator('#contact-form-note')).toContainText('sensitive or confidential');
  const profileLinks = page.locator('#contact .contact__links a');
  await expect(profileLinks).toHaveCount(3);
  await expect(profileLinks).toHaveText([/LinkedIn/, /^X/, /Upwork/]);
});

test('copy, internal targets, and external links are publication-safe', async ({ page }) => {
  await openHome(page);

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain('SIGNAL ACTIVE');
  expect(bodyText).not.toContain('STATUS / OPERATIONAL');
  expect(bodyText).not.toMatch(/Platform X|you@example\.com/i);
  expect(await page.locator('html').innerHTML()).not.toMatch(/@gmail\.com/i);
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  await expect(page.locator('a[href="#"]')).toHaveCount(0);

  const hashLinks = await page.locator('a[href^="#"]').evaluateAll((links) =>
    [...new Set(links.map((link) => link.getAttribute('href')).filter((href): href is string => Boolean(href)))],
  );
  for (const href of hashLinks) {
    await expect(page.locator(href), `target for ${href}`).toHaveCount(1);
  }

  const unsafeExternalLinks = await page.locator('a[href]').evaluateAll((links) =>
    links
      .map((link) => ({
        href: link.getAttribute('href') ?? '',
        target: link.getAttribute('target') ?? '',
        rel: link.getAttribute('rel') ?? '',
      }))
      .filter(({ href }) => !href.startsWith('#') && !href.startsWith('mailto:'))
      .filter(
        ({ href, target, rel }) =>
          !href.startsWith('https://') || (target === '_blank' && (!rel.includes('noopener') || !rel.includes('noreferrer'))),
      ),
  );
  expect(unsafeExternalLinks).toEqual([]);
});

test('public system cases remain generalized and omit unique internal mechanics', async ({ page }) => {
  await openHome(page);

  const systemsText = await page.locator('#work').innerText();
  const prohibitedSystemTerms = [
    /variant-aware/i,
    /prepress/i,
    /\bproof\b/i,
    /print\s*\+\s*qc/i,
    /phase[- ]out/i,
    /clearance/i,
    /reconciliation/i,
    /response-ready/i,
    /size[- ]curve/i,
    /release[- ]spike/i,
    /margin-oriented/i,
    /cache warming/i,
    /draft-only/i,
    /publication handling/i,
    /location handling/i,
  ];

  for (const pattern of prohibitedSystemTerms) {
    expect(systemsText).not.toMatch(pattern);
  }

  expect(systemsText).toMatch(/generalized/i);

  const systems = page.locator('.system');
  await expect(systems).toHaveCount(4);
  for (const system of await systems.all()) {
    expect(await system.locator('dl.brief dt .sr-only').allTextContents()).toEqual(['Problem', 'System', 'Result']);
    await expect(system.locator('.system__ownership')).toHaveCount(1);
    await expect(system.locator('.schematic svg')).toHaveCount(1);
    expect(await system.locator('.schematic animateMotion').count()).toBeGreaterThan(0);
  }
});

test('the forecast instrument renders, is labeled simulated, and answers hover', async ({ page }) => {
  await openHome(page);

  const instrument = page.locator('[data-forecast]');
  await expect(instrument).toBeVisible();
  await expect(instrument).toContainText(/simulated/i);
  await expect(instrument.locator('.legend li')).toHaveCount(4);

  const canvas = instrument.locator('canvas');
  await expect(canvas).toBeVisible();
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({ width: element.width, height: element.height }));
  expect(size.width).toBeGreaterThan(0);
  expect(size.height).toBeGreaterThan(0);

  const readouts = instrument.locator('[data-readout]');
  await expect(readouts).toHaveCount(3);
  for (const readout of await readouts.all()) {
    await expect(readout).not.toHaveText('');
  }
  await expect(instrument.locator('[data-readout="risk"]')).toHaveText(/^\d{1,3}%$/);

  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width * 0.4, box!.y + box!.height * 0.5);
  const tooltip = instrument.locator('[data-tooltip]');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(/units/i);
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();
});

test('reduced motion renders a static forecast frame and stops the schematics', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHome(page);

  const canvas = page.locator('[data-forecast] canvas');
  await expect(canvas).toBeVisible();
  const first = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.waitForTimeout(1500);
  const second = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  expect(second).toBe(first);
  expect(first.length).toBeGreaterThan(2000);

  const packet = page.locator('.schematic--route .packet').first();
  await packet.scrollIntoViewIfNeeded();
  expect(await packet.evaluate((element) => getComputedStyle(element).animationDuration)).toMatch(/^(?:0|0\.001|1e-06)m?s$/);
  expect(await page.locator('.schematic--route svg').evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(true);
});

test('schematic motion runs only while in view', async ({ page }) => {
  await openHome(page);

  const svg = page.locator('.schematic--route svg');
  expect(await svg.evaluate((element: SVGSVGElement) => element.animationsPaused())).toBe(true);
  await svg.scrollIntoViewIfNeeded();
  await expect.poll(() => svg.evaluate((element: SVGSVGElement) => element.animationsPaused())).toBe(false);
  await expect(page.locator('.schematic--route')).toHaveClass(/is-visible/);
});

test('surface motion: labels decode into human text, the field renders, and both stay still under reduced motion', async ({ page }) => {
  await openHome(page);

  const kickers = page.locator('.kicker');
  await expect(kickers).toHaveCount(6);
  await expect(page.locator('h1')).toContainText('Operational systems for the next industrial age.');
  await expect(page.locator('h1 .decode')).toHaveCount(1);
  await expect(page.locator('h1 .sr-only')).toHaveText('Operational systems for the next industrial age.');
  await expect.poll(async () => page.locator('h1 .decode').innerText(), { timeout: 6000 }).toBe(
    'Operational systems for the next industrial age.',
  );

  const workKicker = page.locator('#work .kicker');
  await workKicker.scrollIntoViewIfNeeded();
  await expect.poll(async () => workKicker.locator('.decode').innerText(), { timeout: 6000 }).toBe('01 · Work');
  await expect(workKicker.locator('.sr-only')).toHaveText('01 · Work');
  await expect(page.locator('#work')).toHaveClass(/is-visible/);
  await expect(page.locator('.system__codename').first()).toContainText('Floorline');

  const field = page.locator('[data-field]');
  const size = await field.evaluate((element: HTMLCanvasElement) => ({ width: element.width, height: element.height }));
  expect(size.width).toBeGreaterThan(0);
  expect(size.height).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('h1 .decode')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveText('Operational systems for the next industrial age.');
  const first = await field.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.waitForTimeout(800);
  expect(await field.evaluate((element: HTMLCanvasElement) => element.toDataURL())).toBe(first);
});

test('the page-load intro waits for Enter, ignores scrolling, remembers the session, and never runs under reduced motion', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    try {
      window.sessionStorage.setItem('fd-music', 'off');
    } catch {
      /* no storage */
    }
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4322/', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('html')).toHaveClass(/is-intro/);
  await expect(page.locator('[data-intro]')).toHaveCount(1);
  expect(await page.locator('main').evaluate((element) => Number(getComputedStyle(element).opacity))).toBeLessThan(0.05);
  await expect(page.locator('html')).toHaveClass(/is-arrival-live/, { timeout: 4000 });

  const enter = page.locator('[data-intro-enter]');
  await expect(enter).toBeVisible({ timeout: 5000 });
  await expect(enter).toHaveAttribute('aria-label', 'Enter the site');
  await page.waitForTimeout(1500);
  await expect(page.locator('html')).toHaveClass(/is-intro/);

  await enter.click();
  await expect(page.locator('html')).not.toHaveClass(/is-intro/, { timeout: 3000 });
  await expect(page.locator('[data-intro]')).toHaveCount(0, { timeout: 4000 });
  await expect(page.locator('[data-intro-enter]')).toHaveCount(0);
  await expect.poll(() => page.locator('main').evaluate((element) => Number(getComputedStyle(element).opacity)), { timeout: 4000 }).toBe(1);
  expect(await page.evaluate(() => window.sessionStorage.getItem('fd-intro'))).toBe('1');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  await expect(page.locator('[data-intro]')).toHaveCount(0);

  const scrollContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await scrollContext.addInitScript(() => {
    try {
      window.sessionStorage.setItem('fd-music', 'off');
    } catch {
      /* no storage */
    }
  });
  const scroller = await scrollContext.newPage();
  await scroller.goto('http://127.0.0.1:4322/', { waitUntil: 'domcontentloaded' });
  await expect(scroller.locator('html')).toHaveClass(/is-arrival-live/, { timeout: 4000 });
  await scroller.mouse.wheel(0, 400);
  await scroller.waitForTimeout(1200);
  await expect(scroller.locator('html')).toHaveClass(/(^|\s)is-intro(\s|$)/);
  await expect(scroller.locator('[data-intro-enter]')).toBeVisible();
  await scrollContext.close();

  const calm = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
  const calmPage = await calm.newPage();
  await calmPage.goto('http://127.0.0.1:4322/', { waitUntil: 'domcontentloaded' });
  await expect(calmPage.locator('html')).not.toHaveClass(/is-intro/);
  await expect(calmPage.locator('[data-intro]')).toHaveCount(0);

  await calm.close();
  await context.close();
});

test('the intro phrases fit along the axis on a phone and stay inside the mono face', () => {
  /* IBM Plex Mono as served carries Latin-1 and General Punctuation; anything else falls back to another face. */
  const inFace = /^[\u0020-\u007e\u00a0-\u00ff\u2000-\u206f]+$/;
  expect(phrases.length).toBeGreaterThanOrEqual(40);
  expect(new Set(phrases).size).toBe(phrases.length);
  for (const phrase of phrases) {
    expect(phrase, phrase).toMatch(inFace);
    expect(phrase.length, phrase).toBeLessThanOrEqual(34);
    expect(phrase, phrase).toBe(phrase.trim());
  }
});

test('entering through the intro starts the music', async ({ browser }) => {
  test.skip(!hasLocalAudio, 'Optional audio files are omitted from the public repository');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4322/', { waitUntil: 'domcontentloaded' });
  const enter = page.locator('[data-intro-enter]');
  await expect(enter).toBeVisible({ timeout: 5000 });
  await enter.click();
  const toggle = page.locator('.site-header [data-music-sound]');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true', { timeout: 8000 });
  await expect.poll(() => page.locator('[data-music-audio]').evaluate((element: HTMLAudioElement) => !element.paused), { timeout: 8000 }).toBe(true);
  await context.close();
});

test('each visit plays a chunk of the mix it has not heard in its last three starts', async ({ browser }) => {
  test.skip(!hasLocalAudio, 'Optional audio files are omitted from the public repository');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const heard: number[] = [];
  for (let visit = 0; visit < 5; visit += 1) {
    /* A new tab in the same browser: the intro plays again, localStorage carries the history. */
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4322/', { waitUntil: 'domcontentloaded' });
    const enter = page.locator('[data-intro-enter]');
    await expect(enter).toBeVisible({ timeout: 5000 });
    await enter.click();
    const audio = page.locator('[data-music-audio]');
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => !element.paused && element.currentTime > 0), { timeout: 8000 }).toBe(true);
    const src = await audio.evaluate((element: HTMLAudioElement) => new URL(element.currentSrc).pathname);
    const index = music.chunks.findIndex((chunk) => chunk.src === src);
    expect(index, `played ${src}, not a listed chunk`).toBeGreaterThanOrEqual(0);
    expect(heard.slice(-3), `chunk ${index} repeated within three starts`).not.toContain(index);
    heard.push(index);
    const recent = await page.evaluate(() => JSON.parse(window.localStorage.getItem('fd-music-recent') ?? '[]'));
    expect(recent).toEqual(heard.slice(-3));
    await page.close();
  }
  await context.close();
});

test('every chunk of the mix is published', async ({ request }) => {
  test.skip(!hasLocalAudio, 'Optional audio files are omitted from the public repository');
  for (const chunk of music.chunks) {
    const response = await request.head(`http://127.0.0.1:4322${chunk.src}`);
    expect(response.status(), chunk.src).toBe(200);
  }
});

test('a tap on a phone enters through the gate and starts the music', async () => {
  test.skip(!hasLocalAudio, 'Optional audio files are omitted from the public repository');
  /* Chromium's strict autoplay policy, a touch screen, and a real tap on the gate's label. */
  const phone = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
  const context = await phone.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4322/', { waitUntil: 'domcontentloaded' });
  const enter = page.locator('[data-intro-enter]');
  await expect(enter).toBeVisible({ timeout: 5000 });
  const box = await enter.boundingBox();
  expect(box).not.toBeNull();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height - 12);
  await expect(page.locator('html')).not.toHaveClass(/(^|\s)is-intro(\s|$)/, { timeout: 4000 });
  await expect(page.locator('.site-header [data-music-sound]')).toHaveAttribute('aria-pressed', 'true', { timeout: 8000 });
  await expect.poll(() => page.locator('[data-music-audio]').evaluate((element: HTMLAudioElement) => !element.paused), { timeout: 8000 }).toBe(true);
  await phone.close();
});

test('operating approach remains a semantic four-step sequence', async ({ page }) => {
  await openHome(page);

  const steps = page.locator('#approach ol.steps > li');
  await expect(steps).toHaveCount(4);
  expect(await steps.locator('h3 .sr-only').allTextContents()).toEqual([
    'Observe the work',
    'Define the control model',
    'Build the shortest useful loop',
    'Harden and extend',
  ]);
});

test('global capability grid preserves broad technical proof and system references', async ({ page }) => {
  await openHome(page);

  const capabilityText = await page.locator('#capabilities').innerText();
  for (const proof of [
    'Full-stack React + TypeScript',
    'PostgreSQL + SQL',
    'ETL / ELT',
    'Forecasting',
    'Multimodal vision models',
    'Human-in-the-loop gates',
    'Cloud Run jobs + services',
    'Cloud Scheduler',
    'BigQuery + Cloud Storage',
    'Migrations + rollback',
    'Playwright + pytest',
    'Shopify GraphQL + REST',
    'Google Workspace',
    'Slack',
    'Webhooks + APIs',
    'OAuth',
  ]) {
    expect(capabilityText).toContain(proof);
  }
});

test('internal navigation works with pointer and keyboard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHome(page);

  await page.locator('.site-nav a[href="#work"]').click();
  await expect(page).toHaveURL(/#work$/);
  await expect(page.locator('#work')).toBeInViewport();

  const contactButton = page.locator('.hero__actions a[href="#contact"]');
  await contactButton.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#contact$/);
  await expect(page.locator('#contact')).toBeInViewport();
});

test('header marks the current section while scrolling', async ({ page }) => {
  await openHome(page);

  const approachLink = page.locator('.site-nav a[href="#approach"]');
  await expect(approachLink).toContainText('Approach');
  await page.locator('#approach').evaluate((section) => section.scrollIntoView({ block: 'center' }));
  await expect(approachLink).toHaveAttribute('aria-current', 'true');
});

test('the responsive hero keeps the instrument in the first viewport on desktop and after the copy on phones', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openHome(page);

  const instrumentBox = await page.locator('[data-forecast]').boundingBox();
  expect(instrumentBox).toBeTruthy();
  expect(instrumentBox!.y).toBeLessThan(800);

  await page.setViewportSize({ width: 390, height: 844 });
  const [copyBox, phoneInstrumentBox] = await Promise.all([
    page.locator('.hero__copy').boundingBox(),
    page.locator('[data-forecast]').boundingBox(),
  ]);
  expect(copyBox && phoneInstrumentBox).toBeTruthy();
  expect(copyBox!.y).toBeLessThan(phoneInstrumentBox!.y);
  expect(phoneInstrumentBox!.width).toBeLessThanOrEqual(390);
});

test('mobile navigation opens, closes, and returns focus on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);

  const toggle = page.locator('[data-menu-toggle]');
  const nav = page.locator('[data-site-nav]');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('link', { name: 'Work' })).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('link', { name: 'Work' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Approach' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});

test('keyboard traversal reaches every visible interactive control', async ({ page }) => {
  await openHome(page);

  const expectedCount = await page
    .locator('a[href], button, summary, input:not([type="hidden"]):not([tabindex="-1"]), textarea, select')
    .evaluateAll((elements) => {
      const visible = elements.filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });
      visible.forEach((element, index) => element.setAttribute('data-focus-order-test', String(index)));
      return visible.length;
    });

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const visited = new Set<string>();
  for (let index = 0; index < expectedCount + 2; index += 1) {
    await page.keyboard.press('Tab');
    const marker = await page.evaluate(() => document.activeElement?.getAttribute('data-focus-order-test'));
    if (typeof marker === 'string') visited.add(marker);
  }

  expect(visited.size).toBe(expectedCount);
  await expect(page.locator('.skip-link')).toHaveAttribute('href', '#main-content');
});

test('interactive text meets the typography floor', async ({ page }) => {
  await openHome(page);

  const sizes = await page
    .locator('a[href], button, input, textarea, label, dt, dd, p, li, h1, h2, h3')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
        })
        .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    );
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
});

test('focused capture preparation is isolated and repeatable', async ({ page }) => {
  await openHome(page);
  await settlePage(page);

  const target = page.locator('#contact');
  const skipLink = page.locator('.skip-link');
  const header = page.locator('[data-site-header]');
  await skipLink.focus();
  await expect(skipLink).toBeFocused();

  const restoreFirstCapture = await prepareFocusedCapture(page, target);
  await expect(skipLink).not.toBeFocused();
  await expect(skipLink).toHaveCSS('visibility', 'hidden');
  await expect(header).toHaveCSS('visibility', 'hidden');
  const firstCapture = await target.screenshot({ animations: 'disabled', caret: 'hide' });
  await restoreFirstCapture();

  await expect(skipLink).toHaveCSS('visibility', 'visible');
  await expect(header).toHaveCSS('visibility', 'visible');
  await expect(page.locator('[data-ui-capture-suppressed]')).toHaveCount(0);

  const restoreSecondCapture = await prepareFocusedCapture(page, target);
  const secondCapture = await target.screenshot({ animations: 'disabled', caret: 'hide' });
  await restoreSecondCapture();

  expect(secondCapture.equals(firstCapture)).toBe(true);
});

test('the complete content and navigation remain usable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const response = await page.goto('http://127.0.0.1:4322/');

  expect(response?.ok()).toBe(true);
  await expect(page.locator('h1')).toContainText('Operational systems');
  await expect(page.locator('[data-forecast] .instrument__fallback')).toBeVisible();
  await expect(page.locator('.system')).toHaveCount(4);
  await expect(page.locator('.capability')).toHaveCount(6);

  const navLink = page.locator('.site-nav a[href="#work"]');
  await expect(navLink).toBeVisible();
  await navLink.click();
  await expect(page).toHaveURL(/#work$/);
  await expect(page.locator('#work')).toBeInViewport();

  await context.close();
});

for (const width of [320, 375, 768, 1024, 1280, 1440]) {
  test(`has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width <= 375 ? 700 : width <= 768 ? 1024 : 900 });
    await openHome(page);

    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders: Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            id: element.id,
            className: typeof element.className === 'string' ? element.className : '',
            left: Math.round(rect.left),
            right: Math.round(rect.right),
          };
        })
        .filter(({ left, right }) => left < -2 || right > document.documentElement.clientWidth + 2)
        .slice(0, 20),
    }));

    expect(geometry.scrollWidth, JSON.stringify(geometry.offenders, null, 2)).toBeLessThanOrEqual(geometry.clientWidth);
  });
}

test('the page is short enough to read: under 9000px tall on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(height).toBeLessThan(9000);
});

test('the page produces no uncaught browser errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await openHome(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(250);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('automated accessibility scan has no WCAG A/AA violations', async ({ page }) => {
  await openHome(page);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('built public artifacts contain no private-context or credential markers', async () => {
  const files = await readTree(path.resolve('dist'));
  expect(files.length).toBeGreaterThan(0);

  const prohibited = [
    /\/Users\//,
    /\/home\//,
    /\.portfolio-private/i,
    /(?:SHOPIFY_ACCESS_TOKEN|DATABASE_URL|GOOGLE_APPLICATION_CREDENTIALS)/,
    /(?:xox[baprs]-|AIza[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z_-]{20,})/,
    /-----BEGIN [A-Z ]+ PRIVATE KEY-----/,
    /(?:TODO|FIXME|SOURCE-ONLY REVIEW NOTE|DO NOT PUBLISH)/i,
    /(?:localhost|127\.0\.0\.1|\.internal)(?::\d+)?/i,
  ];

  const findings = files.flatMap(({ file, text }) =>
    prohibited.filter((pattern) => pattern.test(text)).map((pattern) => `${file}: ${pattern}`),
  );
  expect(findings).toEqual([]);
});

test('custom confirmation and 404 routes are available', async ({ page }) => {
  const confirmation = await page.goto('/message-received/');
  expect(confirmation?.ok()).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Message received');
  await expect(page).toHaveTitle('Message received | Justin Thompson');

  const response = await page.goto('/not-a-real-route');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Page not found');
  await expect(page.getByRole('link', { name: /Back to the home page/i })).toHaveAttribute('href', '/');
});
