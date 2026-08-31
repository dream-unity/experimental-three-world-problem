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

const server = createServer(async (request, response) => {
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

const { port } = server.address();
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

await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__dreamUnityInteractions?.ready === true);
await page.waitForFunction(() => window.__interactionArcadeReady === true);
await page.waitForFunction(() => document.querySelector('#label-machine')?.offsetWidth > 0);

const readLabels = () => page.evaluate(() => Object.fromEntries(
  ['machine', 'maker', 'reality'].map(key => {
    const rect = document.querySelector(`#label-${key}`).getBoundingClientRect();
    return [key, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }];
  })
));

const before = await readLabels();
const machine = before.machine;
await page.mouse.move(machine.x + machine.width / 2, machine.y + machine.height / 2);
await page.mouse.down();
await page.mouse.move(machine.x + machine.width / 2 + 132, machine.y + machine.height / 2 + 74, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(120);
const after = await readLabels();

const moved = Math.hypot(after.machine.x - before.machine.x, after.machine.y - before.machine.y);
const makerDrift = Math.hypot(after.maker.x - before.maker.x, after.maker.y - before.maker.y);
const realityDrift = Math.hypot(after.reality.x - before.reality.x, after.reality.y - before.reality.y);
assert.ok(moved > 70, `Dream Machine did not move independently (${moved.toFixed(1)}px)`);
assert.ok(makerDrift < 18, `Dream Maker drifted with Dream Machine (${makerDrift.toFixed(1)}px)`);
assert.ok(realityDrift < 18, `Dream World drifted with Dream Machine (${realityDrift.toFixed(1)}px)`);
assert.equal(await page.locator('#app').getAttribute('data-independent-worlds'), 'true');

await page.evaluate(() => window.__dreamUnityInteractions.reset());
await page.locator('#label-maker').click();
await page.waitForFunction(() => document.querySelector('#app')?.classList.contains('detail'));
await page.waitForFunction(() => [...document.querySelectorAll('.sub-label')].every(node => {
  const rect = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  return style.visibility !== 'hidden' && style.pointerEvents !== 'none' && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
}));
await page.locator('#back').click();
await page.waitForFunction(() => !document.querySelector('#app')?.classList.contains('detail'));

await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('dreamunity:launch-game', { detail: { world: 'maker', index: 1 } }));
});
await page.locator('#arcade.open').waitFor();
await page.waitForFunction(() => {
  const bar = document.querySelector('.game-bar');
  const style = getComputedStyle(bar);
  const rect = bar.getBoundingClientRect();
  return style.visibility === 'visible' && Number(style.opacity) > 0.95 && style.pointerEvents !== 'none' && rect.width > 600 && rect.height >= 50;
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
  assert.equal(control.visibility, 'visible', `${control.id} is hidden`);
  assert.notEqual(control.display, 'none', `${control.id} is not displayed`);
  assert.notEqual(control.pointerEvents, 'none', `${control.id} cannot receive input`);
  assert.ok(control.width >= 38 && control.height >= 38, `${control.id} is too small to use`);
}

await page.locator('#gameStart').click();
await page.locator('#gamePause').click();
await page.waitForFunction(() => document.querySelector('#arcade')?.classList.contains('paused'));
await page.locator('#gamePause').click();
await page.waitForFunction(() => !document.querySelector('#arcade')?.classList.contains('paused'));
await page.locator('#gameRestart').click();
await page.locator('#gameBack').click();
await page.waitForFunction(() => !document.querySelector('#arcade')?.classList.contains('open'));

assert.deepEqual(errors, []);
await context.close();
await browser.close();
await new Promise(resolve => server.close(resolve));
console.log('Interaction Recovery validated: independent world drag, visible portal controls, and playable game controls.');
