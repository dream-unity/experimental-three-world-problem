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
const baseUrl = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: true });
let passed = 0;
const failures = [];

async function run(name, callback) {
  try {
    await callback();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL ${name}\n${error.stack || error}`);
  }
}

async function openPage(context) {
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#label-machine')?.offsetWidth > 0);
  await page.waitForFunction(() => document.querySelector('#gameCanvas')?.width > 1);
  return { page, errors, requests };
}

async function launch(page, world, index) {
  await page.evaluate(({ world, index }) => {
    window.dispatchEvent(new CustomEvent('dreamunity:launch-game', { detail: { world, index } }));
  }, { world, index });
  await page.locator('#arcade.open').waitFor();
}

async function close(page) {
  await page.locator('#gameBack').click();
  await page.waitForFunction(() => !document.querySelector('#arcade')?.classList.contains('open'));
}

await run('homepage keeps Unity voice unmounted and makes no voice-network request', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors, requests } = await openPage(context);

  assert.equal(
    await page.locator('[data-voice-launcher], #duVoicePanel, #duEnhancedButton, link[href*="voice.css"], script[src*="voice.js"]').count(),
    0,
    'the homepage mounted a voice control or asset',
  );
  assert.equal(
    await page.locator('button#unityLabel').count(),
    0,
    'the disabled owned core remained a dead button',
  );
  assert.equal(
    await page.evaluate(() => document.body.dataset.voiceState || document.querySelector('#app')?.dataset.voiceState || ''),
    '',
    'the homepage entered a voice runtime state',
  );

  const forbidden = requests.filter(url =>
    /\/voice\.(?:js|css)(?:[?#]|$)|dream-unity-voice-live\.vercel\.app|js\.puter\.com|\/api\/realtime-session(?:[?#]|$)/i.test(url)
  );
  assert.deepEqual(forbidden, [], `the homepage made disabled voice requests: ${forbidden.join(', ')}`);
  assert.deepEqual(errors, []);
  await context.close();
});

await run('portal navigation opens every portal and all nine game factories load', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await openPage(context);
  const worlds = [
    ['machine', ['FIGHTER JET', 'MODEL FORGE', 'ORACLE GATES']],
    ['maker', ['VECTOR VOW', 'IMPULSE RUN', 'BECOME']],
    ['reality', ['GRAVITY FOUNDRY', 'LATTICE LOCK', 'GENESIS BLOOM']],
  ];
  for (const [world, names] of worlds) {
    await page.locator(`#label-${world}`).click({ force: true });
    await page.waitForFunction(expected =>
      document.querySelector('#app')?.classList.contains('detail') &&
      document.querySelector('#detailName')?.textContent?.toLowerCase().includes(expected === 'reality' ? 'world' : expected),
    world);
    for (let index = 0; index < names.length; index++) {
      await page.locator(`#sub-${index}`).click({ force: true });
      await page.locator('#arcade.open').waitFor();
      assert.equal((await page.locator('#gameName').textContent()).trim(), names[index]);
      assert.equal(await page.locator('#arcade').getAttribute('aria-hidden'), 'false');
      await close(page);
    }
    await page.locator('#back').click({ force: true });
  }
  assert.deepEqual(errors, []);
  await context.close();
});

await run('pointer and keyboard input, pause, resume, and restart remain operational', async () => {
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const { page, errors } = await openPage(context);
  await launch(page, 'maker', 1);
  await page.locator('#gameStart').click();
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(120);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Space');
  await page.locator('#gamePause').click();
  assert.ok(await page.locator('#arcade').evaluate(node => node.classList.contains('paused')));
  await page.locator('#gameAgain').click();
  assert.ok(!(await page.locator('#arcade').evaluate(node => node.classList.contains('paused'))));
  await page.locator('#gameRestart').click();
  assert.ok(!(await page.locator('#arcade').evaluate(node => node.classList.contains('ready'))));
  assert.deepEqual(errors, []);
  await context.close();
});

await run('touch input reaches the mobile canvas without runtime errors', async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const { page, errors } = await openPage(context);
  await launch(page, 'machine', 2);
  await page.locator('#gameStart').tap();
  const box = await page.locator('#gameCanvas').boundingBox();
  assert.ok(box);
  await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.55);
  await page.dispatchEvent('#gameCanvas', 'touchstart', {
    touches: [{ identifier: 1, clientX: box.x + 80, clientY: box.y + 300 }],
    changedTouches: [{ identifier: 1, clientX: box.x + 80, clientY: box.y + 300 }],
  });
  await page.dispatchEvent('#gameCanvas', 'touchmove', {
    touches: [{ identifier: 1, clientX: box.x + 180, clientY: box.y + 320 }],
    changedTouches: [{ identifier: 1, clientX: box.x + 180, clientY: box.y + 320 }],
  });
  await page.dispatchEvent('#gameCanvas', 'touchend', {
    touches: [],
    changedTouches: [{ identifier: 1, clientX: box.x + 180, clientY: box.y + 320 }],
  });
  assert.deepEqual(errors, []);
  await context.close();
});

await run('best scores and Become novelty state use localStorage', async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await context.addInitScript(() => localStorage.setItem('dream-unity.arcade.best.model-forge', '37'));
  const { page, errors } = await openPage(context);
  await launch(page, 'machine', 1);
  assert.equal(await page.locator('#gameBest').textContent(), '37');
  await close(page);
  assert.equal(await page.evaluate(() => localStorage.getItem('dream-unity.arcade.best.model-forge')), '37');
  await launch(page, 'maker', 2);
  await page.locator('#gameStart').click();
  await page.locator('[data-become-action="begin-session"]').click();
  await page.waitForFunction(() => localStorage.getItem('dream-unity:become:social-agency-memory:v1') !== null);
  const stored = await page.evaluate(() => ({
    social: JSON.parse(localStorage.getItem('dream-unity:become:social-agency-memory:v1') || '[]').length,
    world: JSON.parse(localStorage.getItem('dream-unity:become:novelty-memory:v3') || '[]').length,
  }));
  assert.ok(stored.social > 0 && stored.world > 0);
  assert.deepEqual(errors, []);
  await context.close();
});

await run('Fighter Jet completes a basic start, move, fire, pause, and restart loop', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await openPage(context);
  await launch(page, 'machine', 0);
  assert.equal(await page.locator('#gameName').textContent(), 'FIGHTER JET');
  await page.locator('#gameStart').click();
  await page.waitForFunction(() => document.querySelector('#gameMetric')?.textContent?.includes('5'));
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.42);
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.42);
  await page.keyboard.down('d');
  await page.waitForTimeout(180);
  await page.keyboard.up('d');
  await page.keyboard.press('Space');
  await page.locator('#gamePause').click();
  assert.equal(await page.locator('#gameStateTitle').textContent(), 'PAUSED');
  await page.locator('#gameRestart').click();
  assert.match(await page.locator('#gameMetric').textContent(), /^5 · ×0$/);
  assert.deepEqual(errors, []);
  await context.close();
});

await run('all nine games keep responsive frame scheduling without long tasks', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await openPage(context);
  const games = ['machine', 'maker', 'reality'].flatMap(world => [0, 1, 2].map(index => [world, index]));
  for (const [world, index] of games) {
    await launch(page, world, index);
    await page.locator('#gameStart').click();
    await page.evaluate(() => {
      const probe = window.__dreamUnityPerformanceProbe = { frames: 0, maxGap: 0, last: performance.now(), running: true, longTasks: 0 };
      try {
        probe.observer = new PerformanceObserver(list => {
          probe.longTasks += list.getEntries().filter(entry => entry.duration >= 120).length;
        });
        probe.observer.observe({ type: 'longtask', buffered: false });
      } catch { /* Long Task API is optional. */ }
      requestAnimationFrame(function tick(now) {
        if (!probe.running) return;
        probe.maxGap = Math.max(probe.maxGap, now - probe.last);
        probe.last = now;
        probe.frames++;
        requestAnimationFrame(tick);
      });
    });
    await page.waitForTimeout(350);
    const probe = await page.evaluate(() => {
      const value = window.__dreamUnityPerformanceProbe;
      value.running = false;
      value.observer?.disconnect();
      return { frames: value.frames, maxGap: value.maxGap, longTasks: value.longTasks };
    });
    console.log(`PERF ${world}:${index} ${probe.frames} frames · ${probe.maxGap.toFixed(1)}ms max gap · ${probe.longTasks} long tasks`);
    assert.ok(probe.maxGap < 140, `${world}:${index} stalled for ${probe.maxGap.toFixed(1)}ms across ${probe.frames} frames`);
    assert.ok(probe.frames >= 3, `${world}:${index} stopped scheduling frames; max gap ${probe.maxGap.toFixed(1)}ms`);
    assert.equal(probe.longTasks, 0, `${world}:${index} produced a long task`);
    await close(page);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  await run(`responsive layout fits ${viewport.width}x${viewport.height}`, async () => {
    const context = await browser.newContext({ viewport });
    const { page, errors } = await openPage(context);
    const overview = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      canvasWidth: document.querySelector('#world')?.getBoundingClientRect().width,
    }));
    assert.ok(overview.scrollWidth <= overview.clientWidth + 1);
    assert.ok(overview.canvasWidth >= viewport.width - 1);
    await launch(page, 'maker', 2);
    const become = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      panelWidth: document.querySelector('.become-panel')?.getBoundingClientRect().width,
    }));
    assert.ok(become.scrollWidth <= become.clientWidth + 1);
    assert.ok(become.panelWidth > 0 && become.panelWidth <= viewport.width);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

await browser.close();
await new Promise(resolve => server.close(resolve));

console.log(`Browser regression baseline: ${passed}/${passed + failures.length} passed.`);
if (failures.length) process.exitCode = 1;
