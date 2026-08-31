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
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  reducedMotion: 'no-preference',
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
targetUrl.searchParams.set('fluid-orbit-check', String(Date.now()));
await page.goto(targetUrl.href, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__dreamUnityInteractions?.ready === true);
await page.waitForFunction(() => window.__dreamUnityInteractions?.fluid === true);
await page.waitForFunction(() => window.__interactionArcadeReady === true);
await page.waitForFunction(() => document.querySelector('#label-machine')?.offsetWidth > 0);
await page.waitForFunction(() => window.__dreamUnityInteractions.screen().machine.r > 20);
await page.waitForFunction(() => {
  const loader = document.querySelector('#loading');
  const style = loader ? getComputedStyle(loader) : null;
  return !loader || (loader.classList.contains('hide') && style?.visibility === 'hidden' && Number.parseFloat(style.opacity || '1') <= 0.01);
});

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const shapeDelta = (a, b) => Math.max(
  Math.abs(a.machineMaker - b.machineMaker),
  Math.abs(a.makerReality - b.makerReality),
  Math.abs(a.realityMachine - b.realityMachine),
);
const readRig = () => page.evaluate(() => ({
  screen: window.__dreamUnityInteractions.screen(),
  shape: window.__dreamUnityInteractions.shape(),
  orientation: window.__dreamUnityInteractions.orientation(),
  alignment: window.__dreamUnityInteractions.visualAlignment(),
  integrity: window.__dreamUnityInteractions.integrity(),
}));

async function resetRig() {
  await page.evaluate(() => window.__dreamUnityInteractions.reset());
  await page.waitForTimeout(55);
}

function assertRigidWholeField(before, after, label) {
  const movement = ['machine', 'maker', 'reality'].map(key => distance(before.screen[key], after.screen[key]));
  assert.ok(movement.filter(value => value > 3).length >= 2, `${label}: fewer than two worlds visibly moved (${movement.map(v => v.toFixed(1)).join(', ')})`);
  assert.ok(movement.reduce((sum, value) => sum + value, 0) > 18, `${label}: complete field barely moved (${movement.map(v => v.toFixed(1)).join(', ')})`);
  assert.ok(shapeDelta(before.shape, after.shape) < 1e-8, `${label}: rigid model-space relationships changed`);
  assert.equal(after.integrity.connected, true, `${label}: a world detached from its thread`);
  assert.equal(after.integrity.rigid, true, `${label}: runtime no longer reports a rigid whole field`);
  assert.equal(after.integrity.allFinite, true, `${label}: invalid geometry was introduced`);
}

async function dragAt(x, y, dx, dy, steps = 7) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps });
  await page.mouse.up();
}

async function verifyHandle(name, pointFactory, dx = 38, dy = 22) {
  await resetRig();
  const before = await readRig();
  const point = await pointFactory(before);
  await dragAt(point.x, point.y, dx, dy);
  await page.waitForTimeout(40);
  const after = await readRig();
  const yawTravel = Math.abs(after.orientation.yaw - before.orientation.yaw);
  const pitchTravel = Math.abs(after.orientation.pitch - before.orientation.pitch);
  assert.ok(yawTravel + pitchTravel > 0.34, `${name}: ${dx}px gesture produced only ${(yawTravel + pitchTravel).toFixed(3)} radians`);
  assertRigidWholeField(before, after, name);
  const alignmentValues = Object.values(after.alignment);
  assert.ok(Math.max(...alignmentValues) < 0.09, `${name}: score-driven render lag resisted direct manipulation (${Math.max(...alignmentValues).toFixed(3)})`);
}

await verifyHandle('Dream Machine body', before => before.screen.machine);
await verifyHandle('Dream Maker body', before => before.screen.maker, -38, 24);
await verifyHandle('Dream World body', before => before.screen.reality, -36, -24);

for (const [key, dx, dy] of [
  ['machine', 35, 20],
  ['maker', -35, 22],
  ['reality', -34, -22],
]) {
  await verifyHandle(`${key} name`, async () => {
    const rect = await page.locator(`#label-${key}`).boundingBox();
    assert.ok(rect, `${key} name has no bounding box`);
    return { x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.5 };
  }, dx, dy);
}

await verifyHandle('empty-space canvas', async () => ({ x: 360, y: 128 }), 40, 23);

// The former ±0.314 rad pitch cage must be gone.
await resetRig();
let before = await readRig();
await dragAt(before.screen.machine.x, before.screen.machine.y, 4, 76, 9);
await page.waitForTimeout(35);
let after = await readRig();
assert.ok(Math.abs(after.orientation.pitch - before.orientation.pitch) > 0.60, `vertical orbit remained constrained (${Math.abs(after.orientation.pitch - before.orientation.pitch).toFixed(3)} radians)`);
assert.ok(Math.abs(after.orientation.pitch) > 0.50, `pitch never escaped the old shallow range (${after.orientation.pitch.toFixed(3)})`);
assertRigidWholeField(before, after, 'expanded vertical orbit');

// A release should glide rather than stopping abruptly.
await resetRig();
before = await readRig();
await dragAt(before.screen.maker.x, before.screen.maker.y, 74, 14, 3);
const released = await readRig();
await page.waitForTimeout(180);
after = await readRig();
assert.ok(Math.abs(after.orientation.yaw - released.orientation.yaw) > 0.025, 'whole-field inertia stopped immediately after release');
assertRigidWholeField(before, after, 'inertial glide');

// Precision-trackpad two-finger scrolling orbits the same complete object.
await resetRig();
before = await readRig();
await page.evaluate(() => {
  document.querySelector('#world')?.dispatchEvent(new WheelEvent('wheel', {
    deltaX: 22.5,
    deltaY: 13.25,
    deltaMode: 0,
    bubbles: true,
    cancelable: true,
  }));
});
await page.waitForTimeout(35);
after = await readRig();
assert.ok(Math.abs(after.orientation.yaw - before.orientation.yaw) > 0.12, 'precision-trackpad horizontal swipe did not orbit');
assert.ok(Math.abs(after.orientation.pitch - before.orientation.pitch) > 0.06, 'precision-trackpad vertical swipe did not orbit');
assertRigidWholeField(before, after, 'trackpad swipe');

// Trackpad pinch remains zoom, rather than being misread as orbit.
const zoomBefore = after.orientation.zoom;
await page.evaluate(() => {
  document.querySelector('#world')?.dispatchEvent(new WheelEvent('wheel', {
    deltaY: -24,
    deltaMode: 0,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  }));
});
await page.waitForTimeout(30);
const zoomAfter = (await readRig()).orientation.zoom;
assert.ok(Math.abs(zoomAfter - zoomBefore) > 0.08, `trackpad pinch barely changed zoom (${zoomBefore.toFixed(3)} -> ${zoomAfter.toFixed(3)})`);

// One-finger touch uses the high-response whole-field path.
await resetRig();
before = await readRig();
await page.evaluate(({ x, y }) => {
  const canvas = document.querySelector('#world');
  const event = (type, clientX, clientY, buttons) => new PointerEvent(type, {
    pointerId: 71,
    pointerType: 'touch',
    isPrimary: true,
    clientX,
    clientY,
    buttons,
    bubbles: true,
    cancelable: true,
  });
  canvas.dispatchEvent(event('pointerdown', x, y, 1));
  window.dispatchEvent(event('pointermove', x + 48, y + 28, 1));
  window.dispatchEvent(event('pointerup', x + 48, y + 28, 0));
}, before.screen.machine);
await page.waitForTimeout(40);
after = await readRig();
assert.ok(Math.abs(after.orientation.yaw - before.orientation.yaw) > 0.38, 'touch drag remained unresponsive');
assertRigidWholeField(before, after, 'touch drag');

// A tap still enters a world; movement does not.
await resetRig();
const machine = (await readRig()).screen.machine;
await page.mouse.click(machine.x, machine.y);
await page.waitForFunction(() => document.querySelector('#app')?.classList.contains('detail'));
await page.locator('#back').click();
await page.waitForFunction(() => !document.querySelector('#app')?.classList.contains('detail'));

// All nine games and their restored controls remain operable.
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
console.log(`Fluid Whole-Field Orbit validated${process.env.DU_INTERACTION_BASE_URL ? ' live' : ''}: touchpad, touch, body, label and empty-space gestures all move one rigid 3D form; all nine games remain operable.`);
