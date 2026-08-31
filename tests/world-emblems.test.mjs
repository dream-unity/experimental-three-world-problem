import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const rootPath = normalize(new URL('../', import.meta.url).pathname);
const mime = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8',
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
      response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(await readFile(file));
    } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

const browser = await chromium.launch({ headless: true });
const errors = [];
const keys = ['machine', 'maker', 'reality'];
const names = { machine: 'DREAM MACHINE', maker: 'DREAM MAKER', reality: 'DREAM WORLD' };
const triads = {
  machine: 'PERCEIVE · MODEL · PREDICT',
  maker: 'INTEND · ACT · DESIGN',
  reality: 'MATERIAL · STRUCTURE · EXPERIENCE',
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

async function openPage(options) {
  const context = await browser.newContext({ reducedMotion: 'reduce', ...options });
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  await page.addInitScript(() => { try { localStorage.setItem('dream-unity-score-muted', '1'); } catch {} });
  const url = new URL(baseUrl);
  url.searchParams.set('crystal-nexus-check', `${Date.now()}-${Math.random()}`);
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__dreamUnityRenderer?.id === 'crystal-nexus' && window.__dreamUnityInteractions?.ready === true);
  await page.waitForFunction(() => Object.values(window.__dreamUnityInteractions.screen()).every(item => item.r > 24));
  await page.waitForFunction(() => document.querySelector('#loading')?.classList.contains('hide'));
  return { context, page };
}

async function snapshot(page) {
  return page.evaluate(() => ({
    renderer: window.__dreamUnityRenderer,
    orientation: window.__dreamUnityInteractions.orientation(),
    shape: window.__dreamUnityInteractions.shape(),
    screen: window.__dreamUnityInteractions.screen(),
    integrity: window.__dreamUnityInteractions.integrity(),
    labels: Object.fromEntries(['machine','maker','reality'].map(key => {
      const button = document.querySelector(`#label-${key}`);
      const title = button.querySelector('strong');
      const subtitle = button.querySelector('small');
      const br = button.getBoundingClientRect();
      const tr = title.getBoundingClientRect();
      const sr = subtitle.getBoundingClientRect();
      const style = getComputedStyle(button);
      return [key, {
        side: button.dataset.side,
        title: title.textContent.trim(), subtitle: subtitle.textContent.trim(),
        rect: { x:br.x, y:br.y, width:br.width, height:br.height, cx:br.x+br.width/2, cy:br.y+br.height/2 },
        titleRect: { x:tr.x, y:tr.y, width:tr.width, height:tr.height },
        subtitleRect: { x:sr.x, y:sr.y, width:sr.width, height:sr.height },
        pointerEvents: style.pointerEvents, visibility: style.visibility, opacity: Number(style.opacity),
      }];
    })),
    nexus: (() => { const r=document.querySelector('#nexusTitle').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2}; })(),
    viewport: { width: innerWidth, height: innerHeight },
  }));
}

function assertLayout(state, mobile = false) {
  assert.equal(state.renderer.referenceDriven, true);
  assert.equal(state.integrity.connected, true);
  assert.equal(state.integrity.rigid, true);
  assert.equal(state.integrity.allFinite, true);
  assert.ok(Math.abs(state.nexus.cx - state.viewport.width / 2) < state.viewport.width * 0.13, 'nexus is not visually centred');
  assert.ok(state.nexus.width > 80, 'central Dream Unity title is missing');

  for (const key of keys) {
    const point = state.screen[key];
    const label = state.labels[key];
    assert.ok(point.r >= (mobile ? 28 : 48), `${key}: portal sphere too small (${point.r.toFixed(1)}px)`);
    assert.equal(label.title, names[key]);
    assert.equal(label.subtitle, triads[key]);
    assert.notEqual(label.pointerEvents, 'none', `${key}: portal plate cannot receive input`);
    assert.equal(label.visibility, 'visible');
    assert.ok(label.opacity > 0.95);
    const separation = distance(point, { x:label.rect.cx, y:label.rect.cy });
    assert.ok(separation > point.r * 0.70, `${key}: glass identity plate incorrectly covers the faceted sphere`);
    assert.ok(separation < point.r * (mobile ? 4.8 : 4.4), `${key}: glass identity plate detached from its portal`);
    assert.ok(label.rect.width <= state.viewport.width * 0.48, `${key}: identity plate is excessively wide`);
    assert.ok(label.rect.x >= -2 && label.rect.y >= -2, `${key}: identity plate escapes viewport`);
    assert.ok(label.rect.x + label.rect.width <= state.viewport.width + 2, `${key}: identity plate clips horizontally`);
    assert.ok(label.rect.y + label.rect.height <= state.viewport.height + 2, `${key}: identity plate clips vertically`);
    assert.ok(label.titleRect.width > 60, `${key}: title lacks visual authority`);
    assert.ok(label.subtitleRect.width > 35, `${key}: triad is not legible`);
  }
  assert.equal(state.labels.machine.side, 'left');
  assert.equal(state.labels.maker.side, 'right');
  assert.equal(state.labels.reality.side, 'bottom');
}

const desktop = await openPage({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.5 });
let state = await snapshot(desktop.page);
assertLayout(state);
const before = state;
const maker = state.screen.maker;
await desktop.page.mouse.move(maker.x, maker.y);
await desktop.page.mouse.down();
await desktop.page.mouse.move(maker.x - 48, maker.y + 26, { steps: 8 });
await desktop.page.mouse.up();
await desktop.page.waitForTimeout(80);
state = await snapshot(desktop.page);
assert.ok(Math.abs(state.orientation.yaw-before.orientation.yaw)+Math.abs(state.orientation.pitch-before.orientation.pitch) > 0.18, 'portal drag did not orbit the complete nexus');
assert.ok(Math.max(
  Math.abs(state.shape.machineMaker-before.shape.machineMaker),
  Math.abs(state.shape.makerReality-before.shape.makerReality),
  Math.abs(state.shape.realityMachine-before.shape.realityMachine),
) < 1e-8, 'portal drag distorted the rigid nexus');
assertLayout(state);

await desktop.page.evaluate(() => window.__dreamUnityInteractions.reset());
await desktop.page.waitForTimeout(120);
await desktop.page.locator('#label-machine').click();
await desktop.page.waitForFunction(() => document.querySelector('#app')?.classList.contains('detail'));
await desktop.page.locator('#back').click();
await desktop.page.waitForFunction(() => !document.querySelector('#app')?.classList.contains('detail'));

const screenshotDir = process.env.DU_EMBLEM_SCREENSHOT_DIR;
if (screenshotDir) {
  await mkdir(screenshotDir, { recursive: true });
  await desktop.page.evaluate(() => window.__dreamUnityInteractions.reset());
  await desktop.page.waitForTimeout(120);
  await desktop.page.screenshot({ path: join(screenshotDir, 'crystal-nexus-desktop.png'), fullPage: true });
}
await desktop.context.close();

const mobile = await openPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
state = await snapshot(mobile.page);
assertLayout(state, true);
if (screenshotDir) await mobile.page.screenshot({ path: join(screenshotDir, 'crystal-nexus-mobile.png'), fullPage: true });
await mobile.context.close();

assert.deepEqual(errors, []);
await browser.close();
if (server) await new Promise(resolve => server.close(resolve));
console.log(`Crystal Nexus composition validated${process.env.DU_EMBLEM_BASE_URL ? ' live' : ''}: faceted portals, attached glass plates, centred sovereign crystal, rigid whole-form movement and responsive composition.`);
