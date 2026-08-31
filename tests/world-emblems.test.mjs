import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const rootPath = normalize(new URL('../', import.meta.url).pathname);
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};
let server;
let baseUrl = process.env.DU_EMBLEM_BASE_URL || '';

if (!baseUrl) {
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const file = normalize(join(rootPath, relative));
      assert.ok(file.startsWith(rootPath));
      assert.ok((await stat(file)).isFile());
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
const keys = ['machine', 'maker', 'reality'];
const names = { machine: 'DREAM MACHINE', maker: 'DREAM MAKER', reality: 'DREAM WORLD' };
const triads = {
  machine: 'PERCEIVE · MODEL · PREDICT',
  maker: 'INTEND · ACT · BECOME',
  reality: 'MATTER · STRUCTURE · EMERGE',
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const shapeDelta = (a, b) => Math.max(
  Math.abs(a.machineMaker - b.machineMaker),
  Math.abs(a.makerReality - b.makerReality),
  Math.abs(a.realityMachine - b.realityMachine),
);

async function openPage(options) {
  const context = await browser.newContext({ reducedMotion: 'reduce', ...options });
  const page = await context.newPage();
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  await page.addInitScript(() => {
    try { localStorage.setItem('dream-unity-score-muted', '1'); } catch {}
  });
  const url = new URL(baseUrl);
  url.searchParams.set('emblem-check', `${Date.now()}-${Math.random()}`);
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.__dreamUnityWorldEmblems?.ready === true &&
    window.__dreamUnityWorldEmblemPolish?.ready === true &&
    window.__dreamUnityInteractions?.ready === true
  );
  await page.waitForFunction(() => Object.values(window.__dreamUnityWorldEmblems.metrics()).every(item => item.radius > 20 && item.label?.width > 20));
  await page.waitForFunction(() => {
    const node = document.querySelector('#loading');
    if (!node) return true;
    const style = getComputedStyle(node);
    return node.classList.contains('hide') && style.visibility === 'hidden' && Number(style.opacity) < 0.02;
  });
  return { context, page };
}

async function snapshot(page) {
  return page.evaluate(() => ({
    metrics: window.__dreamUnityWorldEmblems.metrics(),
    orientation: window.__dreamUnityInteractions.orientation(),
    shape: window.__dreamUnityInteractions.shape(),
    screen: window.__dreamUnityInteractions.screen(),
    integrity: window.__dreamUnityInteractions.integrity(),
    labels: Object.fromEntries(['machine', 'maker', 'reality'].map(key => {
      const button = document.querySelector(`#label-${key}`);
      const title = button.querySelector('strong');
      const subtitle = button.querySelector('small');
      const buttonStyle = getComputedStyle(button);
      const titleStyle = getComputedStyle(title);
      const subtitleStyle = getComputedStyle(subtitle);
      const titleRect = title.getBoundingClientRect();
      const subtitleRect = subtitle.getBoundingClientRect();
      return [key, {
        title: title.textContent.trim(),
        subtitle: subtitle.textContent.trim(),
        className: button.className,
        borderLeftWidth: buttonStyle.borderLeftWidth,
        pointerEvents: buttonStyle.pointerEvents,
        titleFontSize: parseFloat(titleStyle.fontSize),
        titleRect: { x: titleRect.x, y: titleRect.y, width: titleRect.width, height: titleRect.height },
        subtitleRect: { x: subtitleRect.x, y: subtitleRect.y, width: subtitleRect.width, height: subtitleRect.height },
        subtitleWhiteSpace: subtitleStyle.whiteSpace,
        subtitleOverflow: subtitleStyle.overflow,
        subtitleScrollWidth: subtitle.scrollWidth,
        subtitleClientWidth: subtitle.clientWidth,
        subtitleScrollHeight: subtitle.scrollHeight,
        subtitleClientHeight: subtitle.clientHeight,
      }];
    })),
  }));
}

function assertLayout(state, mobile = false) {
  for (const key of keys) {
    const metric = state.metrics[key];
    const label = state.labels[key];
    assert.ok(metric.radius >= (mobile ? 32 : 62), `${key}: emblem is too small (${metric.radius.toFixed(1)}px)`);
    assert.ok(distance(metric.world, metric.label) < 1.6, `${key}: title control detached from emblem`);
    assert.ok(distance(metric.world, metric.title) < metric.radius * 0.20, `${key}: title is not centred inside emblem`);
    assert.ok(metric.label.width > metric.radius * 1.38 && metric.label.width < metric.radius * 1.62, `${key}: internal control has wrong scale`);
    assert.equal(label.title, names[key]);
    assert.equal(label.subtitle, triads[key]);
    assert.match(label.className, /world-emblem-label/);
    assert.equal(label.borderLeftWidth, '0px', `${key}: obsolete external title rail remains`);
    assert.notEqual(label.pointerEvents, 'none', `${key}: emblem cannot receive input`);
    assert.ok(label.titleFontSize >= (mobile ? 5.7 : 7.1), `${key}: title is too small`);
    assert.ok(label.titleRect.width <= metric.radius * (mobile ? 1.46 : 1.40), `${key}: title band escapes emblem`);
    const titleCenter = { x: label.titleRect.x + label.titleRect.width / 2, y: label.titleRect.y + label.titleRect.height / 2 };
    const subtitleCenter = { x: label.subtitleRect.x + label.subtitleRect.width / 2, y: label.subtitleRect.y + label.subtitleRect.height / 2 };
    assert.ok(distance(metric.world, titleCenter) < metric.radius * 0.22, `${key}: title band is outside emblem`);
    assert.ok(distance(metric.world, subtitleCenter) < metric.radius * 0.48, `${key}: subtitle is outside emblem`);
    if (mobile) {
      assert.notEqual(label.subtitleWhiteSpace, 'nowrap', `${key}: mobile triad is forced into a clipped line`);
      assert.notEqual(label.subtitleOverflow, 'hidden', `${key}: mobile triad is clipped`);
      assert.ok(label.subtitleScrollWidth <= label.subtitleClientWidth + 2, `${key}: mobile triad overflows horizontally`);
      assert.ok(label.subtitleScrollHeight <= label.subtitleClientHeight + 2, `${key}: mobile triad overflows vertically`);
    }
  }
  assert.equal(state.integrity.connected, true);
  assert.equal(state.integrity.rigid, true);
  assert.equal(state.integrity.allFinite, true);
}

const desktop = await openPage({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.5 });
let state = await snapshot(desktop.page);
assertLayout(state);
assert.equal(await desktop.page.locator('#app').getAttribute('data-world-emblem-version'), '20260831-world-emblems-26');
assert.equal(await desktop.page.locator('#app').getAttribute('data-world-emblem-polish'), 'true');

const before = state;
const handle = state.metrics.maker.title;
await desktop.page.mouse.move(handle.x, handle.y);
await desktop.page.mouse.down();
await desktop.page.mouse.move(handle.x - 42, handle.y + 24, { steps: 8 });
await desktop.page.mouse.up();
await desktop.page.waitForTimeout(70);
state = await snapshot(desktop.page);
assert.ok(Math.abs(state.orientation.yaw - before.orientation.yaw) + Math.abs(state.orientation.pitch - before.orientation.pitch) > 0.34, 'embedded title did not orbit whole form');
assert.ok(shapeDelta(before.shape, state.shape) < 1e-8, 'embedded-title drag changed rigid relationships');
assert.ok(keys.map(key => distance(before.screen[key], state.screen[key])).filter(value => value > 3).length >= 2, 'whole form did not move with embedded title');
assertLayout(state);

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

const mobile = await openPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
state = await snapshot(mobile.page);
assertLayout(state, true);
if (screenshotDir) await mobile.page.screenshot({ path: join(screenshotDir, 'world-emblems-mobile.png'), fullPage: true });
await mobile.context.close();

assert.deepEqual(errors, []);
await browser.close();
if (server) await new Promise(resolve => server.close(resolve));
console.log(`World Emblems validated${process.env.DU_EMBLEM_BASE_URL ? ' live' : ''}: enlarged symbols, internal titles, unclipped mobile triads, rigid whole-field drag and responsive layout.`);
