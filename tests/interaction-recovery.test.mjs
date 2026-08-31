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
await page.waitForFunction(() => window.__dreamUnityInteractions?.connected === true);
await page.waitForFunction(() => window.__interactionArcadeReady === true);
await page.waitForFunction(() => document.querySelector('#label-machine')?.offsetWidth > 0);
await page.waitForFunction(() => window.__dreamUnityInteractions.screen().machine.r > 20);
await page.waitForFunction(() => {
  const loader = document.querySelector('#loading');
  const style = loader ? getComputedStyle(loader) : null;
  return !loader || (loader.classList.contains('hide') && style?.visibility === 'hidden' && Number.parseFloat(style.opacity || '1') <= 0.01);
});

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const readLabels = () => page.evaluate(() => Object.fromEntries(
  ['machine', 'maker', 'reality'].map(key => {
    const rect = document.querySelector(`#label-${key}`).getBoundingClientRect();
    return [key, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }];
  })
));
const readRig = () => page.evaluate(() => ({
  screen: window.__dreamUnityInteractions.screen(),
  anchors: window.__dreamUnityInteractions.anchors(),
  deformations: window.__dreamUnityInteractions.deformations(),
  integrity: window.__dreamUnityInteractions.integrity(),
}));

async function dragConnectedWorld(key, dx, dy) {
  await page.evaluate(() => window.__dreamUnityInteractions.reset());
  await page.waitForTimeout(70);
  const beforeLabels = await readLabels();
  const before = await readRig();
  const world = before.screen[key];
  const topElement = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id || '', world);
  assert.equal(topElement, 'world', `${key} body was obstructed by ${topElement || 'an unknown element'}`);

  await page.mouse.move(world.x, world.y);
  await page.mouse.down();
  await page.mouse.move(world.x + dx, world.y + dy, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(worldKey => {
    const value = window.__dreamUnityInteractions.deformations()[worldKey];
    return Math.hypot(value.x, value.y, value.z) > 0.25;
  }, key);
  await page.waitForTimeout(90);

  const afterLabels = await readLabels();
  const after = await readRig();
  const moved = distance(after.screen[key], before.screen[key]);
  const threadMoved = distance(after.anchors[key].thread, before.anchors[key].thread);
  const leadingThreadMoved = distance(after.anchors[key].before, before.anchors[key].before);
  const trailingThreadMoved = distance(after.anchors[key].after, before.anchors[key].after);
  const labelMoved = distance(afterLabels[key], beforeLabels[key]);
  const deformation = after.deformations[key];

  assert.ok(Math.hypot(deformation.x, deformation.y, deformation.z) > 0.25, `${key} deformation was not recorded`);
  assert.ok(moved > 45, `${key} body did not move (${moved.toFixed(1)}px)`);
  assert.ok(threadMoved > 45, `${key} path anchor did not move with its world (${threadMoved.toFixed(1)}px)`);
  assert.ok(leadingThreadMoved > 28, `${key} leading coloured thread did not bend with its world (${leadingThreadMoved.toFixed(1)}px)`);
  assert.ok(trailingThreadMoved > 28, `${key} trailing coloured thread did not bend with its world (${trailingThreadMoved.toFixed(1)}px)`);
  assert.ok(labelMoved > 30, `${key} label did not follow its connected world (${labelMoved.toFixed(1)}px)`);
  assert.ok(after.anchors[key].distance < 0.75, `${key} separated from its thread by ${after.anchors[key].distance.toFixed(2)}px`);
  assert.equal(after.integrity.connected, true, `${key} broke the connected-world rig`);
  assert.equal(after.integrity.allFinite, true, `${key} introduced invalid thread geometry`);
  assert.ok(after.integrity.maxSegmentGap < 48, `continuous path opened a ${after.integrity.maxSegmentGap.toFixed(1)}px gap`);

  for (const other of ['machine', 'maker', 'reality'].filter(value => value !== key)) {
    const bodyDrift = distance(after.screen[other], before.screen[other]);
    const anchorDrift = distance(after.anchors[other].thread, before.anchors[other].thread);
    assert.ok(bodyDrift < 16, `${other} body drifted while dragging ${key} (${bodyDrift.toFixed(1)}px)`);
    assert.ok(anchorDrift < 16, `${other} path anchor drifted while dragging ${key} (${anchorDrift.toFixed(1)}px)`);
    assert.ok(after.anchors[other].distance < 0.75, `${other} is not attached to its thread`);
  }
}

await dragConnectedWorld('machine', 112, 58);
await dragConnectedWorld('maker', -94, 62);
await dragConnectedWorld('reality', -86, -72);
assert.equal(await page.locator('#app').getAttribute('data-independent-worlds'), 'true');
assert.equal(await page.locator('#app').getAttribute('data-connected-world-rig'), 'true');

await page.evaluate(() => window.__dreamUnityInteractions.reset());
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
console.log(`Connected World Rig validated${process.env.DU_INTERACTION_BASE_URL ? ' live' : ''}: all three worlds deform their attached paths and all nine game control sets remain operable.`);
