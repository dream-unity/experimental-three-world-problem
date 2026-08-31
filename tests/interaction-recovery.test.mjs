import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
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
let baseUrl = process.env.DU_INTERACTION_BASE_URL || '';
if (!baseUrl) {
  server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, 'http://127.0.0.1');
      const relative = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
      const file = normalize(join(rootPath, relative));
      assert.ok(file.startsWith(rootPath), 'request escaped repository root');
      assert.ok((await stat(file)).isFile(), 'not a file');
      response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
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
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const errors = [];

await page.addInitScript(() => {
  try { localStorage.setItem('dream-unity-score-muted', '1'); } catch {}
  window.__interactionArcadeReady = false;
  window.addEventListener('dreamunity:arcade-ready', () => { window.__interactionArcadeReady = true; });
});
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));

const targetUrl = new URL(baseUrl);
targetUrl.searchParams.set('interaction-check', String(Date.now()));
await page.goto(targetUrl.href, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__dreamUnityInteractions?.ready === true);
await page.waitForFunction(() => window.__dreamUnityInteractions?.wholeField === true);
await page.waitForFunction(() => window.__dreamUnityInteractions?.independent === false);
await page.waitForFunction(() => window.__interactionArcadeReady === true);
await page.waitForFunction(() => document.querySelector('#label-machine')?.offsetWidth > 0);
await page.waitForFunction(() => window.__dreamUnityInteractions.screen().machine.r > 20);
await page.waitForFunction(() => {
  const loader = document.querySelector('#loading');
  const style = loader ? getComputedStyle(loader) : null;
  return !loader || (loader.classList.contains('hide') && style?.visibility === 'hidden' && Number.parseFloat(style.opacity || '1') <= 0.01);
});

const worldKeys = ['machine', 'maker', 'reality'];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const orientationDistance = (a, b) => Math.hypot(a.yaw - b.yaw, a.pitch - b.pitch, a.roll - b.roll);
const readLabels = () => page.evaluate(() => Object.fromEntries(
  ['machine', 'maker', 'reality'].map(key => {
    const rect = document.querySelector(`#label-${key}`).getBoundingClientRect();
    return [key, {
      x: rect.left + rect.width * 0.5,
      y: rect.top + rect.height * 0.5,
      width: rect.width,
      height: rect.height,
    }];
  })
));
const readRig = () => page.evaluate(() => ({
  screen: window.__dreamUnityInteractions.screen(),
  anchors: window.__dreamUnityInteractions.anchors(),
  orientation: window.__dreamUnityInteractions.orientation(),
  shape: window.__dreamUnityInteractions.shape(),
  integrity: window.__dreamUnityInteractions.integrity(),
  samples: window.__dreamUnityInteractions.threadSamples(96),
}));

function assertRigidShape(before, after, handle) {
  for (const key of Object.keys(before.shape)) {
    assert.ok(Math.abs(after.shape[key] - before.shape[key]) < 1e-10, `${handle}: rigid shape changed at ${key}`);
  }
  assert.equal(after.integrity.connected, true, `${handle}: a world separated from its thread`);
  assert.equal(after.integrity.rigid, true, `${handle}: field is not marked rigid`);
  assert.equal(after.integrity.allFinite, true, `${handle}: invalid path geometry appeared`);
  assert.ok(after.integrity.maxSegmentGap < 48, `${handle}: path opened a ${after.integrity.maxSegmentGap.toFixed(1)}px gap`);
  for (const key of worldKeys) {
    assert.ok(after.anchors[key].distance < 0.75, `${handle}: ${key} separated from its coloured thread by ${after.anchors[key].distance.toFixed(2)}px`);
  }
}

function assertWholeFieldMoved(before, after, handle, primaryKey = null) {
  const orientationMoved = orientationDistance(before.orientation, after.orientation);
  assert.ok(orientationMoved > 0.24, `${handle}: whole-field orientation changed only ${orientationMoved.toFixed(3)} radians`);

  const bodyMoves = Object.fromEntries(worldKeys.map(key => [key, distance(before.screen[key], after.screen[key])]));
  if (primaryKey) assert.ok(bodyMoves[primaryKey] > 28, `${handle}: grabbed world moved only ${bodyMoves[primaryKey].toFixed(1)}px`);
  for (const key of worldKeys) {
    assert.ok(bodyMoves[key] > 6, `${handle}: ${key} did not travel with the whole 3D form (${bodyMoves[key].toFixed(1)}px)`);
  }
  const otherMovement = worldKeys
    .filter(key => key !== primaryKey)
    .reduce((sum, key) => sum + bodyMoves[key], 0);
  assert.ok(otherMovement > 34, `${handle}: the rest of the 3D visualisation barely moved (${otherMovement.toFixed(1)}px combined)`);

  let movedSamples = 0;
  for (let index = 0; index < Math.min(before.samples.length, after.samples.length); index += 1) {
    if (distance(before.samples[index], after.samples[index]) > 6) movedSamples += 1;
  }
  const ratio = movedSamples / Math.min(before.samples.length, after.samples.length);
  assert.ok(ratio > 0.72, `${handle}: only ${(ratio * 100).toFixed(1)}% of the complete thread moved`);
  assertRigidShape(before, after, handle);
}

async function resetField() {
  await page.evaluate(() => window.__dreamUnityInteractions.reset());
  await page.waitForTimeout(80);
}

async function dragWorldBody(key, dx, dy) {
  await resetField();
  const before = await readRig();
  const world = before.screen[key];
  const topElement = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id || '', world);
  assert.equal(topElement, 'world', `${key} body was obstructed by ${topElement || 'an unknown element'}`);

  await page.mouse.move(world.x, world.y);
  await page.mouse.down();
  await page.mouse.move(world.x + dx, world.y + dy, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(previous => {
    const current = window.__dreamUnityInteractions.orientation();
    return Math.hypot(current.yaw - previous.yaw, current.pitch - previous.pitch, current.roll - previous.roll) > 0.24;
  }, before.orientation);
  await page.waitForTimeout(70);

  const after = await readRig();
  assertWholeFieldMoved(before, after, `${key} body handle`, key);
  assert.equal(await page.locator('#app').getAttribute('data-whole-field-orbit'), 'true');
  assert.equal(await page.locator('#app').getAttribute('data-independent-worlds'), 'false');
  assert.equal(await page.locator('#app').evaluate(node => node.classList.contains('detail')), false, `${key} drag incorrectly entered its world`);
}

async function dragWorldName(key, dx, dy) {
  await resetField();
  const labelsBefore = await readLabels();
  const before = await readRig();
  const label = labelsBefore[key];
  const topElement = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id || '', label);
  assert.equal(topElement, `label-${key}`, `${key} name was obstructed by ${topElement || 'an unknown element'}`);

  await page.mouse.move(label.x, label.y);
  await page.mouse.down();
  await page.mouse.move(label.x + dx, label.y + dy, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(previous => {
    const current = window.__dreamUnityInteractions.orientation();
    return Math.hypot(current.yaw - previous.yaw, current.pitch - previous.pitch, current.roll - previous.roll) > 0.24;
  }, before.orientation);
  await page.waitForTimeout(70);

  const after = await readRig();
  const labelsAfter = await readLabels();
  assertWholeFieldMoved(before, after, `${key} name handle`, key);
  assert.ok(distance(labelsBefore[key], labelsAfter[key]) > 8, `${key} name did not follow the rotating whole form`);
  assert.equal(await page.locator('#app').evaluate(node => node.classList.contains('detail')), false, `${key} name drag incorrectly entered its world`);
}

await dragWorldBody('machine', 116, 58);
await dragWorldBody('maker', -104, 68);
await dragWorldBody('reality', 96, -76);
await dragWorldName('machine', 108, 54);
await dragWorldName('maker', -98, 64);
await dragWorldName('reality', 92, -70);

await resetField();
const emptyBefore = await readRig();
await page.mouse.move(640, 116);
await page.mouse.down();
await page.mouse.move(742, 178, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(80);
const emptyAfter = await readRig();
assertWholeFieldMoved(emptyBefore, emptyAfter, 'empty-space handle');

await resetField();
await page.locator('#label-maker').click();
await page.waitForFunction(() => document.querySelector('#app')?.classList.contains('detail'));
await page.waitForFunction(() => [...document.querySelectorAll('.sub-label')].every(node => {
  const rect = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  return style.visibility !== 'hidden' && style.pointerEvents !== 'none'
    && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
}));
await page.locator('#back').click();
await page.waitForFunction(() => !document.querySelector('#app')?.classList.contains('detail'));

const games = [
  ['machine', 0, 'FIGHTER JET'],
  ['machine', 1, 'MODEL FORGE'],
  ['machine', 2, 'ORACLE GATES'],
  ['maker', 0, 'VECTOR VOW'],
  ['maker', 1, 'IMPULSE RUN'],
  ['maker', 2, 'BECOME'],
  ['reality', 0, 'GRAVITY FOUNDRY'],
  ['reality', 1, 'LATTICE LOCK'],
  ['reality', 2, 'GENESIS BLOOM'],
];

for (const [world, index, expectedName] of games) {
  await page.evaluate(({ worldName, gameIndex }) => {
    window.dispatchEvent(new CustomEvent('dreamunity:launch-game', { detail: { world: worldName, index: gameIndex } }));
  }, { worldName: world, gameIndex: index });
  await page.locator('#arcade.open').waitFor();
  assert.equal((await page.locator('#gameName').textContent()).trim(), expectedName);
  await page.waitForFunction(() => {
    const bar = document.querySelector('.game-bar');
    const style = getComputedStyle(bar);
    const rect = bar.getBoundingClientRect();
    return style.visibility === 'visible' && Number(style.opacity) > 0.95
      && style.pointerEvents !== 'none' && rect.width > 600 && rect.height >= 50;
  });
  const controls = await page.evaluate(() => [...document.querySelectorAll('.game-icon')].map(button => {
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return {
      id: button.id,
      width: rect.width,
      height: rect.height,
      visibility: style.visibility,
      display: style.display,
      pointerEvents: style.pointerEvents,
    };
  }));
  assert.deepEqual(controls.map(control => control.id), ['gameBack', 'gameSound', 'gamePause', 'gameRestart']);
  for (const control of controls) {
    assert.equal(control.visibility, 'visible', `${expectedName}: ${control.id} is hidden`);
    assert.notEqual(control.display, 'none', `${expectedName}: ${control.id} is not displayed`);
    assert.notEqual(control.pointerEvents, 'none', `${expectedName}: ${control.id} cannot receive input`);
    assert.ok(control.width >= 38 && control.height >= 38, `${expectedName}: ${control.id} is too small to use`);
  }
  await page.locator('#gameStart').click();
  if (expectedName === 'IMPULSE RUN') {
    await page.locator('#gamePause').click();
    await page.waitForFunction(() => document.querySelector('#arcade')?.classList.contains('paused'));
    await page.locator('#gamePause').click();
    await page.waitForFunction(() => !document.querySelector('#arcade')?.classList.contains('paused'));
    await page.locator('#gameRestart').click();
  }
  await page.locator('#gameBack').click();
  await page.waitForFunction(() => !document.querySelector('#arcade')?.classList.contains('open'));
}

assert.deepEqual(errors, []);
await context.close();
await browser.close();
if (server) await new Promise(resolve => server.close(resolve));
console.log(`Whole Field Orbit validated${process.env.DU_INTERACTION_BASE_URL ? ' live' : ''}: every world body and name moves the complete rigid 3D visualisation, and all nine games remain operable.`);
