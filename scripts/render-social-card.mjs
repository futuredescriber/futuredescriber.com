// Renders public/social/portfolio-og.png (1200 × 630) from the same seeded
// forecast simulation the hero instrument uses. Run with:
//   node --experimental-strip-types scripts/render-social-card.mjs
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const model = await import(pathToFileURL(path.join(root, 'src/lib/forecast-model.ts')).href);

const { CAPACITY, DEFAULT_SEED, HISTORY, X_TICKS, Y_TICKS, createState, geometry, memberValues } = model;
const state = createState(DEFAULT_SEED);
const width = 560;
const height = 330;
const g = geometry(width, height);
const f = (value) => value.toFixed(1);
const last = state.observed[HISTORY - 1];

const observed = state.observed
  .map((value, index) => `${index === 0 ? 'M' : 'L'}${f(g.x(index - (HISTORY - 1)))} ${f(g.y(value))}`)
  .join(' ');
const forecast = [`M${f(g.x(0))} ${f(g.y(last))}`, ...state.forecast.map((p, i) => `L${f(g.x(i + 1))} ${f(g.y(p.mean))}`)].join(' ');
const futures = state.members
  .filter((_, index) => index % 3 === 0)
  .map((member) => memberValues(member, state.forecast))
  .map((values) => [`M${f(g.x(0))} ${f(g.y(last))}`, ...values.map((v, h) => `L${f(g.x(h + 1))} ${f(g.y(v))}`)].join(' '));
const capacityY = g.y(CAPACITY);
const breaches = state.forecast
  .map((p, i) => ({ p, i: i + 1 }))
  .filter(({ p }) => p.mean > CAPACITY)
  .map(({ p, i }) => `<circle cx="${f(g.x(i))}" cy="${f(g.y(p.mean))}" r="6" fill="#0d0f12"/><circle cx="${f(g.x(i))}" cy="${f(g.y(p.mean))}" r="4" fill="#ff5a3c"/>`)
  .join('');

const fontDir = pathToFileURL(path.join(root, 'node_modules/@fontsource')).href;
const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Michroma'; font-weight: 400; src: url('${fontDir}/michroma/files/michroma-latin-400-normal.woff2') format('woff2'); }
@font-face { font-family: 'Exo 2'; font-weight: 500; src: url('${fontDir}/exo-2/files/exo-2-latin-500-normal.woff2') format('woff2'); }
@font-face { font-family: 'Exo 2'; font-weight: 400; src: url('${fontDir}/exo-2/files/exo-2-latin-400-normal.woff2') format('woff2'); }
@font-face { font-family: 'IBM Plex Mono'; font-weight: 500; src: url('${fontDir}/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2') format('woff2'); }
html, body { margin: 0; width: 1200px; height: 630px; background: #07080a; color: #e9e6df; font-family: 'Exo 2', sans-serif; -webkit-font-smoothing: antialiased; }
.card { position: relative; display: grid; grid-template-columns: 1fr 560px; gap: 48px; align-items: center; height: 630px; padding: 0 56px; box-sizing: border-box; }
.name { font-size: 22px; font-weight: 500; }
.name span { display: block; color: #85867f; font-size: 16px; font-weight: 400; margin-top: 2px; }
h1 { margin: 28px 0 0; font-family: 'Michroma', sans-serif; font-size: 36px; line-height: 1.22; letter-spacing: 0.005em; font-weight: 400; }
.url { position: absolute; left: 56px; bottom: 40px; color: #85867f; font-size: 18px; }
.panel { border: 1px solid #1f2227; border-radius: 6px; background: #0d0f12; padding: 18px 18px 14px; box-sizing: border-box; }
.head { display: flex; justify-content: space-between; font-size: 15px; font-weight: 500; margin-bottom: 10px; }
.head span { font-family: 'IBM Plex Mono', monospace; color: #85867f; font-weight: 500; font-size: 13px; }
text { font-family: 'IBM Plex Mono', monospace; font-size: 11px; fill: #85867f; }
</style></head><body>
<div class="card">
  <div>
    <p class="name">Justin Thompson<span>Future Describer</span></p>
    <h1>Operational systems for the next industrial age.</h1>
  </div>
  <div class="panel">
    <div class="head">Demand forecast <span>simulated data</span></div>
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <g stroke="#1f2227">${Y_TICKS.map((t) => `<line x1="${g.plotLeft}" x2="${g.plotRight}" y1="${f(g.y(t))}" y2="${f(g.y(t))}"/>`).join('')}</g>
      ${Y_TICKS.map((t) => `<text x="${g.plotLeft - 8}" y="${f(g.y(t) + 4)}" text-anchor="end">${t}</text>`).join('')}
      <text x="${g.plotLeft}" y="${g.plotTop - 5}">units / day</text>
      ${X_TICKS.map((t) => `<text x="${f(g.x(t.index))}" y="${g.plotBottom + 17}" text-anchor="middle"${t.index === 0 ? ' fill="#a9a9a1"' : ''}>${t.label}</text>`).join('')}
      <defs>
        <clipPath id="below"><rect x="${g.plotLeft}" y="${f(capacityY)}" width="${g.plotRight - g.plotLeft}" height="${f(g.plotBottom - capacityY)}"/></clipPath>
        <clipPath id="above"><rect x="${g.plotLeft}" y="${g.plotTop - 10}" width="${g.plotRight - g.plotLeft}" height="${f(capacityY - g.plotTop + 10)}"/></clipPath>
      </defs>
      <g clip-path="url(#below)" fill="none" stroke="#a86bf5" stroke-opacity="0.18">${futures.map((d) => `<path d="${d}"/>`).join('')}</g>
      <g clip-path="url(#above)" fill="none" stroke="#ff5a3c" stroke-opacity="0.22">${futures.map((d) => `<path d="${d}"/>`).join('')}</g>
      <line x1="${g.plotLeft}" x2="${g.plotRight}" y1="${f(g.y(CAPACITY))}" y2="${f(g.y(CAPACITY))}" stroke="#ff5a3c" stroke-width="1.25" stroke-dasharray="6 6"/>
      <text x="${g.plotLeft + 4}" y="${f(g.y(CAPACITY) - 4)}">capacity</text>
      <line x1="${f(g.x(0))}" x2="${f(g.x(0))}" y1="${g.plotTop - 10}" y2="${g.plotBottom}" stroke="#31353b"/>
      <path d="${observed}" fill="none" stroke="#2cc4ee" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${forecast}" fill="none" stroke="rgba(233,230,223,0.85)" stroke-width="1.5" stroke-dasharray="5 5"/>
      ${breaches}
      <circle cx="${f(g.x(0))}" cy="${f(g.y(last))}" r="6" fill="#0d0f12"/><circle cx="${f(g.x(0))}" cy="${f(g.y(last))}" r="4" fill="#2cc4ee"/>
    </svg>
  </div>
  <p class="url">futuredescriber.com</p>
</div>
</body></html>`;

const outputDirectory = path.join(root, 'public/social');
await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(200);
const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
await writeFile(path.join(outputDirectory, 'portfolio-og.png'), png);
await browser.close();
console.log('Wrote public/social/portfolio-og.png');
