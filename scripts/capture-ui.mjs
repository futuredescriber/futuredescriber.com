import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(repositoryRoot, '.visual-audit');
const localUrl = 'http://127.0.0.1:4322';
const previewTimeoutMs = 120_000;

const sites = [
  { name: 'live', url: 'https://futuredescriber.com' },
  { name: 'local', url: localUrl },
];

const viewports = [
  { width: 1440, height: 1000 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 700 },
];

const focusedCaptures = [
  { name: 'hero', selector: '#top' },
  { name: 'system', selector: '.system' },
  { name: 'capabilities', selector: '#capabilities' },
  { name: 'about', selector: '#about' },
  { name: 'contact', selector: '#contact' },
];

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function urlIsReady(url) {
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureLocalPreview() {
  if (await urlIsReady(localUrl)) {
    console.log(`Reusing local preview at ${localUrl}`);
    return null;
  }

  const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(
    npmExecutable,
    ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4322'],
    {
      cwd: repositoryRoot,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let output = '';
  let spawnError;
  const rememberOutput = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-8_000);
  };
  child.stdout.on('data', rememberOutput);
  child.stderr.on('data', rememberOutput);
  child.once('error', (error) => {
    spawnError = error;
  });

  try {
    const deadline = Date.now() + previewTimeoutMs;
    while (Date.now() < deadline) {
      if (spawnError) {
        throw new Error(`Could not start the local preview: ${spawnError.message}`);
      }
      if (child.exitCode !== null) {
        throw new Error(`Local preview exited with code ${child.exitCode}.\n${output}`);
      }
      if (await urlIsReady(localUrl)) {
        console.log(`Started local production preview at ${localUrl}`);
        return child;
      }
      await delay(250);
    }

    throw new Error(`Local preview did not become ready within ${previewTimeoutMs / 1_000} seconds.\n${output}`);
  } catch (error) {
    await stopLocalPreview(child);
    throw error;
  }
}

async function stopLocalPreview(child) {
  if (!child || !child.pid || child.exitCode !== null) return;

  const signalProcess = (signal) => {
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
  };

  signalProcess('SIGTERM');
  const deadline = Date.now() + 5_000;
  while (child.exitCode === null && Date.now() < deadline) {
    await delay(50);
  }
  if (child.exitCode === null) signalProcess('SIGKILL');
}

export async function settlePage(page) {
  await page.locator('img').evaluateAll((images) => {
    images.forEach((image) => {
      image.loading = 'eager';
    });
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (image) => {
        if (image.complete) return Promise.resolve();
        return new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        });
      }),
    );
  });

  await page.evaluate(() => {
    document.documentElement.setAttribute('data-capture', 'true');
    document.querySelectorAll('[data-decode]').forEach((element) => {
      const accessible = element.querySelector('.sr-only');
      const wrap = element.querySelector('.decode');
      if (!accessible || !wrap) return;
      const chars = Array.from(accessible.textContent ?? '');
      Array.from(wrap.querySelectorAll('.decode__char, .decode__space')).forEach((span, index) => {
        span.textContent = chars[index] ?? '';
        span.classList.remove('is-raw', 'is-hot');
      });
    });
  });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        scroll-behavior: auto !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }

      [data-ui-capture-suppressed='true'] {
        visibility: hidden !important;
      }
    `,
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function waitForScrollSettled(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let lastX = window.scrollX;
        let lastY = window.scrollY;
        let stableFrames = 0;

        const checkPosition = () => {
          const isStable = window.scrollX === lastX && window.scrollY === lastY;
          stableFrames = isStable ? stableFrames + 1 : 0;
          lastX = window.scrollX;
          lastY = window.scrollY;

          if (stableFrames >= 3) {
            resolve();
            return;
          }
          requestAnimationFrame(checkPosition);
        };

        requestAnimationFrame(checkPosition);
      }),
  );
}

export async function prepareFocusedCapture(page, target) {
  await target.scrollIntoViewIfNeeded();
  await waitForScrollSettled(page);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    document.querySelectorAll('*').forEach((element) => {
      if (!(element instanceof HTMLElement) || element.hasAttribute('data-ui-capture-suppressed')) return;
      const position = getComputedStyle(element).position;
      if (element.matches('.skip-link') || position === 'fixed' || position === 'sticky') {
        element.setAttribute('data-ui-capture-suppressed', 'true');
      }
    });
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  return async () => {
    await page.evaluate(() => {
      document.querySelectorAll('[data-ui-capture-suppressed="true"]').forEach((element) => {
        element.removeAttribute('data-ui-capture-suppressed');
      });
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
}

async function captureViewport(browser, site, viewport) {
  const viewportName = `${viewport.width}x${viewport.height}`;
  const captureDirectory = path.join(outputRoot, site.name, viewportName);
  await mkdir(captureDirectory, { recursive: true });

  const context = await browser.newContext({
    bypassCSP: true,
    colorScheme: 'dark',
    deviceScaleFactor: 1,
    locale: 'en-CA',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    viewport,
  });
  await context.addInitScript(() => {
    try {
      window.sessionStorage.setItem('fd-intro', '1');
      window.sessionStorage.setItem('fd-music', 'off');
    } catch {
      /* no storage */
    }
  });
  const page = await context.newPage();

  try {
    const response = await page.goto(site.url, { waitUntil: 'networkidle', timeout: 60_000 });
    if (!response?.ok()) {
      throw new Error(`${site.url} returned HTTP ${response?.status() ?? 'unknown'}`);
    }
    await settlePage(page);

    const pageHeight = await page.evaluate(() =>
      Math.max(
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight,
        document.body.scrollHeight,
        document.body.offsetHeight,
      ),
    );

    await page.screenshot({
      path: path.join(captureDirectory, 'full-page.png'),
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
    });

    for (const capture of focusedCaptures) {
      const target = page.locator(capture.selector).first();
      if ((await target.count()) !== 1) {
        throw new Error(`Capture target ${capture.selector} was not found on ${site.url}`);
      }

      const restoreCaptureState = await prepareFocusedCapture(page, target);
      try {
        await target.screenshot({
          path: path.join(captureDirectory, `${capture.name}.png`),
          animations: 'disabled',
          caret: 'hide',
        });
      } finally {
        await restoreCaptureState();
      }
    }

    console.log(`${site.name.padEnd(5)} ${viewportName.padEnd(9)} ${pageHeight}px`);
    return pageHeight;
  } finally {
    await context.close();
  }
}

async function captureUi() {
  let previewProcess;
  let browser;

  try {
    previewProcess = await ensureLocalPreview();
    await rm(outputRoot, { recursive: true, force: true });
    await mkdir(outputRoot, { recursive: true });

    browser = await chromium.launch();
    const pageHeights = Object.fromEntries(sites.map((site) => [site.name, {}]));

    for (const site of sites) {
      for (const viewport of viewports) {
        const viewportName = `${viewport.width}x${viewport.height}`;
        pageHeights[site.name][viewportName] = await captureViewport(browser, site, viewport);
      }
    }

    await writeFile(
      path.join(outputRoot, 'page-heights.json'),
      `${JSON.stringify(pageHeights, null, 2)}\n`,
      'utf8',
    );
    console.log(`Captures written to ${path.relative(repositoryRoot, outputRoot)}/`);
  } finally {
    await browser?.close();
    await stopLocalPreview(previewProcess);
  }
}

const executedFile = process.argv[1];
if (executedFile && path.resolve(executedFile) === fileURLToPath(import.meta.url)) {
  await captureUi();
}
