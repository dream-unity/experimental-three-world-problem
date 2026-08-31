import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const rootPath = normalize(root.pathname);
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};

let server = null;
let baseUrl = process.env.DU_EMBLEM_BASE_URL || '';
if (!baseUrl) {
  server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, 'http://127.0.0.1');
      const relative = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
      const file = normalize(join(rootPath, relative));
      assert.ok(file.startsWith(rootPath), 'request escaped repository root');
      assert.ok((await stat(file)).isFile(), 'not a file');
      response.writeHead(200, {
        'Content-Type': mime[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

const browser = await chromium.launch({ headless: true });
const errors = [];
const expected = {
  machine: 'DREAM MACHINE',
  maker: 'DREAM MAKER',
  reality: 'DREAM WORLD',
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

async function openContext(options) {
  const context = await browser.newContext({ reducedMotion: 'reduce', ...options });
  const page = await context.newPage();
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  await page.addInitScript(() => {
    try { localStorage.setItem('dream-unity-score-muted', '1'); } catch {}
  });
  const target = new URL(baseUrl);
  target.searchParams.set('emblem-check', `${Date.now()}-${Math.random()}`);
  await page.goto(target.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__dreamUnityWorldEmblems?.ready === true);
  await page.waitForFunction(() => window.__dreamUnityInteractions?.ready === true);
  await page.waitForFunction(() => document.querySelector('#app')?.dataset.worldEmblems === 'true');
  await page.waitForFunction(() => Object.values(window.__dreamUnityWorldEmblems.metrics()).every(value => value.radius > 20 && value.label?.width > 20));
  await page.waitForFunction(() => {
    const loader = document.querySelector('#loading');
    if (!loader) return true;
    const style = getComputedStyle(loader);
    return loader.classList.contains('hide') && style.visibility === 'hidden' && Number(style.opacity) <= 0.01;
  });
  return { context, page };
}

async function readState(page) {
  return page.evaluate(() => ({
    metrics: window.__dreamUnityWorldEmblems.metrics(),
    orientation: window.__dreamUnityInteractions.orientation(),
    shape: window.__dreamUnityInteractions.shape(),
    screen: window.__dreamUnityInteractions.screen(),
    integrity: window.__dreamUnityInteractions.integrity(),
    labels: Object.fromEntries(['machine', 'maker', 'reality'].map(key => {
      const element = document.querySelector(`#label-${key}`);
      const title = element.querySelector('strong');
      const subtitle = element.querySelector('small');
      const style = getComputedStyle(element);
      const titleStyle = getComputedStyle(title);
      const titleRect = title.getBoundingClientRect();
      const subtitleRect = subtitle.getBoundingClientRect();
      return [key, {
        text: title.textContent.trim(),
        className: element.className,
        borderLeftWidth: style.borderLeftWidth,
        borderRadius: style.borderRadius,
        pointerEvents: style.pointerEvents,
        titleFontSize: Number.parseFloat(titleStyle.fontSize),
        titleRect: { x: titleRect.x, y: titleRect.y, width: titleRect.width, height: titleRect.height },
        subtitleRect: { x: subtitleRect.x, y: subtitleRect.y, width: subtitleRect.width, height: subtitleRect.height },
      }];
    })),
  }));
}

function shapeDelta(a, b) {
  return Math.max(
    Math.abs(a.machineMaker - b.machineMaker),
    Math.abs(a.makerReality - b.makerReality),
    Math.abs(a.realityMachine - b.realityMachine),
  );
}

function assertEmblems(state, { mobile = false } = {}) {
  for (const key of Object.keys(expected)) {
    const metric = state.metrics[key];
    const label = state.labels[key];
    const minimumRadius = mobile ? 32 : 62;
    assert.ok(metric.radius >= minimumRadius, `${key} emblem radius is only ${metric.radius.toFixed(1)}px`);
    assert.ok(metric.label, `${key} emblem label is missing`);
    assert.ok(metric.title, `${key} title metrics are missing`);
    assert.ok(distance(metric.world, metric.label) < 1.6, `${key} title control is detached from its symbol by ${distance(metric.world, metric.label).toFixed(2)}px`);
    assert.ok(distance(metric.world, metric.title) < metric.radius * 0.20, `${key} title is not inside the symbol centre`);
    assert.ok(metric.label.width > metric.radius * 1.38, `${key} internal title control is undersized`);
    assert.ok(metric.label.width < metric.radius * 1.62, `${key} internal title control escapes the emblem`);
    assert.equal(label.text, expected[key]);
    assert.match(label.className, /world-emblem-label/);
    assert.equal(label.borderLeftWidth, '0px', `${key} still has the obsolete external title rail`);
    assert.notEqual(label.pointerEvents, 'none', `${key} emblem cannot receive input`);
    assert.ok(label.titleFontSize >= (mobile ? 5.7 : 7.1), `${key} title is too small (${label.titleFontSize}px)`);
    assert.ok(label.titleRect.width <= metric.radius * 1.40, `${key} rendered title band escapes the symbol (${label.titleRect.width.toFixed(1)}px for a ${metric.radius.toFixed(1)}px radius)`);
    const titleCenter = {
      x: label.titleRect.x + label.titleRect.width * 0.5,
      y: label.titleRect.y + label.titleRect.height * 0.5,
    };
    const subtitleCenter = {
      x: label.subtitleRect.x + label.subtitleRect.width * 0.5,
      y: label.subtitleRect.y + label.subtitleRect.height * 0.5,
    };
    assert.ok(distance(metric.world, titleCenter) < metric.radius * 0.22, `${key} title band is outside the emblem`);
    assert.ok(distance(metric.world, subtitleCenter) < metric.radius * 0.44, `${key} subtitle is outside the emblem`);
  }
  assert.equal(state.integrity.connected, true);
  assert.equal(state.integrity.rigid, true);
  assert.equal(state.integrity.allFinite, true);
}

const desktop = await openContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.5 });
let state = await readState(desktop.page);
assertEmblems(state);
assert.equal(await desktop.page.locator('#app').getAttribute('data-world-emblem-version'), '20260831-world-emblems-26');

// The internal title itself remains a handle on the single rigid instrument.
const before = state;
const makerTitle = state.metrics.maker.title;
await desktop.page.mouse.move(makerTitle.x, makerTitle.y);
await desktop.page.mouse.down();
await desktop.page.mouse.move(makerTitle.x - 42, makerTitle.y + 24, { steps: 8 });
await desktop.page.mouse.up();
await desktop.page.waitForTimeout(70);
state = await readState(desktop.page);
assert.ok(Math.abs(state.orientation.yaw - before.orientation.yaw) + Math.abs(state.orientation.pitch - before.orientation.pitch) > 0.34, 'dragging the embedded title did not orbit the whole form');
assert.ok(shapeDelta(before.shape, state.shape) < 1e-8, 'dragging an embedded title changed rigid world relationships');
const moved = Object.keys(expected).map(key => distance(before.screen[key], state.screen[key]));
assert.ok(moved.filter(value => value > 3).length >= 2, `the whole form did not move with the title (${moved.map(value => value.toFixed(1)).join(', ')})`);
assertEmblems(state);

// A clean tap on the title still enters its world.
await desktop.page.evaluate(() => window.__dreamUnityInteractions.reset());
await desktop.page.waitForTimeout(620);
await desktop.page.locator('#label-machine strong').click();
await desktop.page.waitForFunction(() => document.querySelector('#app')?.classList.contains('detail'));
await desktop.page.locator('#back').click();
await desktop.page.waitForFunction(() => !document.querySelector('#app')?.classList.contains('detail'));

const screenshotDir = process.env.DU_EMBLEM_SCREENSHOT_DIR;
if (screenshotDir) {
  await mkdir(screenshotDir, { recursive: true });
  await desktop.page.evaluate(() => window.__dreamUnityInteractions.reset());
  await desktop.page.waitForTimeout(120);
  await desktop.page.screenshot({ path: join(screenshotDir, 'world-emblems-desktop.png'), fullPage: true });
}
await desktop.context.close();

const mobile = await openContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
state = await readState(mobile.page);
assertEmblems(state, { mobile: true });
if (screenshotDir) await mobile.page.screenshot({ path: join(screenshotDir, 'world-emblems-mobile.png'), fullPage: true });
await mobile.context.close();

assert.deepEqual(errors, []);
await browser.close();
if (server) await new Promise(resolve => server.close(resolve));
console.log(`World Emblems validated${process.env.DU_EMBLEM_BASE_URL ? ' live' : ''}: enlarged symbols, embedded titles, rigid whole-field drag and responsive layout.`);
