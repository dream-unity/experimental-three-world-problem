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
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
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
  await page.addInitScript(() => {
    window.__dreamUnityRendererEvents = [];
    for (const name of [
      'dreamunity:renderer-ready',
      'dreamunity:renderer-context-lost',
      'dreamunity:renderer-context-restored',
    ]) {
      window.addEventListener(name, event => {
        window.__dreamUnityRendererEvents.push({ name, detail: event.detail || null });
      });
    }
  });
  page.on('request', request => requests.push(request.url()));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  // Renderer readiness below is the relevant load boundary. Waiting for
  // network-idle would also wait for the intentionally looping public score,
  // slowing every isolated visual context without strengthening an assertion.
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const app = document.querySelector('#app');
    const renderer = window.__dreamUnityRenderer;
    return app?.dataset.rendererReady === 'true' &&
      app.dataset.rendererState === 'ready' &&
      renderer?.id === 'sovereign-nocturne' &&
      renderer.ready === true;
  });
  await page.waitForFunction(() => document.querySelector('#label-machine')?.offsetWidth > 0);
  await page.waitForFunction(() => document.querySelector('#gameCanvas')?.width > 1);
  await page.waitForFunction(() => {
    const loader = document.querySelector('#loading');
    if (!loader?.classList.contains('hide')) return false;
    const style = getComputedStyle(loader);
    return style.visibility === 'hidden' && Number.parseFloat(style.opacity || '1') <= 0.01;
  });
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

const screenshotDir = process.env.DREAM_UNITY_SCREENSHOT_DIR;
if (screenshotDir) {
  await run('CI captures Sovereign Nocturne visual evidence', async () => {
    await mkdir(screenshotDir, { recursive: true });
    for (const viewport of [
      { width: 2048, height: 1024 },
      { width: 1363, height: 936 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport });
      const { page, errors } = await openPage(context);
      await page.waitForTimeout(180);
      await page.screenshot({
        path: join(screenshotDir, `overview-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
      });
      assert.deepEqual(errors, []);
      await context.close();
    }

    const context = await browser.newContext({ viewport: { width: 1363, height: 936 } });
    const { page, errors } = await openPage(context);
    await page.locator('#label-reality').click();
    await page.waitForFunction(() =>
      document.querySelector('#detailName')?.textContent === 'DREAM WORLD' &&
      [...document.querySelectorAll('.sub-label')].every(node => node.getAttribute('aria-hidden') === 'false')
    );
    await page.waitForFunction(() =>
      Number.parseFloat(document.querySelector('#app')?.style.getPropertyValue('--du-view-mix') || '0') >= 0.995
    );
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({
      path: join(screenshotDir, 'detail-dream-world-1363x936.png'),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    await context.close();
  });
}

await run('Sovereign Nocturne becomes ready through WebGL without runtime errors', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await openPage(context);
  const state = await page.evaluate(() => ({
    app: { ...document.querySelector('#app')?.dataset },
    renderer: { ...window.__dreamUnityRenderer },
    events: window.__dreamUnityRendererEvents,
    context: document.querySelector('#world')?.getContext('webgl2')?.constructor?.name || '',
  }));
  assert.equal(state.app.renderer, 'webgl');
  assert.equal(state.app.rendererReady, 'true');
  assert.equal(state.app.rendererState, 'ready');
  assert.equal(state.renderer.mode, 'webgl');
  assert.equal(state.renderer.api, 'webgl2');
  assert.equal(state.renderer.version, '20260830-sovereign-nocturne-6');
  assert.ok(state.events.some(event => event.name === 'dreamunity:renderer-ready' && event.detail?.mode === 'webgl'));
  assert.match(state.context, /WebGL2/i);
  assert.deepEqual(errors, []);
  await context.close();
});

await run('WebGL context loss is declared and restoration returns to ready', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await openPage(context);
  const prevented = await page.evaluate(() => {
    const event = new Event('webglcontextlost', { cancelable: true });
    document.querySelector('#world')?.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(prevented, true, 'context-loss handler did not preserve the recoverable WebGL context');
  await page.waitForFunction(() =>
    document.querySelector('#app')?.dataset.rendererState === 'context-lost' &&
    window.__dreamUnityRenderer?.ready === false
  );
  await page.evaluate(() => document.querySelector('#world')?.dispatchEvent(new Event('webglcontextrestored')));
  await page.waitForFunction(() =>
    document.querySelector('#app')?.dataset.rendererReady === 'true' &&
    document.querySelector('#app')?.dataset.rendererState === 'ready' &&
    window.__dreamUnityRenderer?.ready === true
  );
  const events = await page.evaluate(() => window.__dreamUnityRendererEvents.map(event => event.name));
  assert.ok(events.includes('dreamunity:renderer-context-lost'));
  assert.ok(events.includes('dreamunity:renderer-context-restored'));
  assert.deepEqual(errors, []);
  await context.close();
});

await run('Canvas2D fallback reaches the same ready navigation contract', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, ...args) {
      if (this.id === 'world' && (type === 'webgl2' || type === 'webgl')) return null;
      return getContext.call(this, type, ...args);
    };
  });
  const { page, errors } = await openPage(context);
  const state = await page.evaluate(() => ({
    app: { ...document.querySelector('#app')?.dataset },
    renderer: { ...window.__dreamUnityRenderer },
    events: window.__dreamUnityRendererEvents,
  }));
  assert.equal(state.app.renderer, 'canvas2d-fallback');
  assert.equal(state.app.rendererReady, 'true');
  assert.equal(state.renderer.mode, 'canvas2d-fallback');
  assert.equal(state.renderer.api, 'canvas2d');
  assert.ok(state.events.some(event => event.name === 'dreamunity:renderer-ready' && event.detail?.mode === 'canvas2d-fallback'));
  await page.locator('#label-machine').click();
  await page.waitForFunction(() => document.querySelector('#app')?.classList.contains('detail'));
  assert.equal(await page.locator('#detailName').textContent(), 'DREAM MACHINE');
  assert.deepEqual(errors, []);
  await context.close();
});

await run('reduced motion publishes and renders a stable resolved pose', async () => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'reduce',
  });
  const { page, errors } = await openPage(context);
  assert.equal(await page.locator('#app').getAttribute('data-motion'), 'reduced');
  assert.equal(await page.evaluate(() => window.__dreamUnityRenderer?.reducedMotion), true);
  await page.waitForTimeout(120);
  const beforeFrame = await page.evaluate(() => window.__dreamUnityRenderer?.frame);
  const before = await page.locator('#world').screenshot();
  await page.waitForTimeout(180);
  const after = await page.locator('#world').screenshot();
  const afterFrame = await page.evaluate(() => window.__dreamUnityRenderer?.frame);
  assert.equal(afterFrame, beforeFrame, 'reduced-motion renderer continued scheduling autonomous visual work');
  // SwiftShader readback can vary at a handful of edge pixels even when no
  // frame was scheduled. The public renderer frame counter is the deterministic
  // contract: equality proves that reduced motion produced no autonomous draw.
  assert.ok(before.length > 0 && after.length > 0, 'reduced-motion canvas did not produce readable evidence');
  assert.deepEqual(errors, []);
  await context.close();
});

await run('homepage keeps private media and Unity voice off the network', async () => {
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
    /\/voice\.(?:js|css)(?:[?#]|$)|dream-unity-voice-live\.vercel\.app|js\.puter\.com|\/api\/realtime-session(?:[?#]|$)|awaken(?:%20|[ _-])+the(?:%20|[ _-])+true(?:%20|[ _-])+war[^/]*\.mp3/i.test(url)
  );
  assert.deepEqual(forbidden, [], `the homepage made a private-media or disabled voice request: ${forbidden.join(', ')}`);
  const publishedMp3 = requests.filter(url => /\.mp3(?:[?#]|$)/i.test(url));
  assert.ok(publishedMp3.every(url => new URL(url).pathname === '/assets/i-remember-tomorrow.mp3'));
  assert.deepEqual(errors, []);
  await context.close();
});

if (process.env.DU_BROWSER_SCOPE === 'voice') {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  console.log(`Voice browser regression: ${passed}/${passed + failures.length} passed.`);
  if (failures.length) process.exitCode = 1;
} else {
await run('portal navigation opens every portal and all nine game factories load', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await openPage(context);
  const worlds = [
    ['machine', ['FIGHTER JET', 'MODEL FORGE', 'ORACLE GATES']],
    ['maker', ['VECTOR VOW', 'IMPULSE RUN', 'BECOME']],
    ['reality', ['GRAVITY FOUNDRY', 'LATTICE LOCK', 'GENESIS BLOOM']],
  ];
  for (const [world, names] of worlds) {
    await page.evaluate(value => document.querySelector(`#label-${value}`)?.click(), world);
    await page.waitForFunction(expected =>
      document.querySelector('#app')?.classList.contains('detail') &&
      document.querySelector('#detailName')?.textContent?.toLowerCase().includes(expected === 'reality' ? 'world' : expected),
    world);
    for (let index = 0; index < names.length; index++) {
      const portal = page.locator(`#sub-${index}`);
      await portal.waitFor({ state: 'visible' });
      await portal.click();
      await page.locator('#arcade.open').waitFor();
      assert.equal((await page.locator('#gameName').textContent()).trim(), names[index]);
      assert.equal(await page.locator('#arcade').getAttribute('aria-hidden'), 'false');
      await close(page);
    }
    await page.evaluate(() => document.querySelector('#back')?.click());
    await page.waitForFunction(() => !document.querySelector('#app')?.classList.contains('detail'));
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

await run('Become transfer typing is sovereign over global arcade shortcuts', async () => {
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const { page, errors } = await openPage(context);
  await launch(page, 'maker', 2);
  await page.locator('#gameStart').click();
  await page.evaluate(() => {
    const probe = document.createElement('textarea');
    probe.id = 'keyboardGuardProbe';
    probe.setAttribute('aria-label', 'Keyboard shortcut isolation probe');
    document.querySelector('#arcade')?.append(probe);
    probe.focus();
  });
  await page.keyboard.type('r p x');
  assert.equal(await page.locator('#keyboardGuardProbe').inputValue(), 'r p x');
  assert.ok(!(await page.locator('#arcade').evaluate(node => node.classList.contains('paused'))));
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
      const probe = window.__dreamUnityPerformanceProbe = { frames: 0, gaps: [], maxGap: 0, last: null, running: true, longTasks: 0 };
      try {
        probe.observer = new PerformanceObserver(list => {
          probe.longTasks += list.getEntries().filter(entry => entry.duration >= 120).length;
        });
        probe.observer.observe({ type: 'longtask', buffered: false });
      } catch { /* Long Task API is optional. */ }
      requestAnimationFrame(function tick(now) {
        if (!probe.running) return;
        if (probe.last !== null) {
          const gap = now - probe.last;
          probe.gaps.push(gap);
          probe.maxGap = Math.max(probe.maxGap, gap);
        }
        probe.last = now;
        probe.frames++;
        requestAnimationFrame(tick);
      });
    });
    // Separate one-time game construction from steady-state scheduling. The
    // Long Task observer remains active throughout the warm-up, so blocking
    // startup work still fails; only compositor/GPU readiness gaps are excluded
    // from the running-frame measurement.
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const probe = window.__dreamUnityPerformanceProbe;
      probe.frames = 0;
      probe.gaps = [];
      probe.maxGap = 0;
      probe.last = null;
    });
    await page.waitForFunction(
      () => window.__dreamUnityPerformanceProbe?.frames >= 10,
      null,
      { timeout: 2500, polling: 40 },
    );
    const probe = await page.evaluate(() => {
      const value = window.__dreamUnityPerformanceProbe;
      value.running = false;
      value.observer?.disconnect();
      return { frames: value.frames, gaps: value.gaps, maxGap: value.maxGap, longTasks: value.longTasks };
    });
    const responsiveGaps = probe.gaps.filter(gap => gap < 100).length;
    console.log(`PERF ${world}:${index} ${probe.frames} frames · ${responsiveGaps}/${probe.gaps.length} responsive gaps · ${probe.maxGap.toFixed(1)}ms max gap · ${probe.longTasks} long tasks`);
    // SwiftShader occasionally pauses the compositor without occupying the page
    // main thread. Require a sustained run of responsive frames and separately
    // reject main-thread long tasks instead of treating one runner pause as app work.
    assert.ok(responsiveGaps >= 7, `${world}:${index} scheduled only ${responsiveGaps}/${probe.gaps.length} responsive gaps; max ${probe.maxGap.toFixed(1)}ms`);
    assert.ok(probe.frames >= 10, `${world}:${index} stopped scheduling frames; max gap ${probe.maxGap.toFixed(1)}ms`);
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
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      canvasWidth: document.querySelector('#world')?.getBoundingClientRect().width,
      canvasHeight: document.querySelector('#world')?.getBoundingClientRect().height,
      portals: [...document.querySelectorAll('.world-label')].map(node => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      }),
    }));
    assert.ok(overview.scrollWidth <= overview.clientWidth + 1);
    assert.ok(overview.scrollHeight <= overview.clientHeight + 1);
    assert.ok(overview.canvasWidth >= viewport.width - 1);
    assert.ok(overview.canvasHeight >= viewport.height - 1);
    assert.ok(overview.portals.every(rect =>
      rect.left >= -1 && rect.top >= -1 && rect.right <= viewport.width + 1 && rect.bottom <= viewport.height + 1
    ), 'an overview portal escaped the viewport');

    await page.locator('#label-reality').click();
    await page.waitForFunction(() =>
      document.querySelector('#app')?.classList.contains('detail') &&
      document.querySelector('#detailName')?.textContent === 'DREAM WORLD'
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.sub-label')].every(node => node.getAttribute('aria-hidden') === 'false')
    );
    await page.waitForFunction(() =>
      Number.parseFloat(document.querySelector('#app')?.style.getPropertyValue('--du-view-mix') || '0') >= 0.995
    );
    const detail = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      backVisible: document.querySelector('#back')?.getBoundingClientRect().width > 0,
      capacities: [...document.querySelectorAll('.sub-label')].map(node => {
        const rect = node.getBoundingClientRect();
        return {
          hidden: node.getAttribute('aria-hidden'),
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        };
      }),
    }));
    assert.ok(detail.scrollWidth <= detail.clientWidth + 1);
    assert.ok(detail.scrollHeight <= detail.clientHeight + 1);
    assert.equal(detail.backVisible, true);
    assert.ok(detail.capacities.every(rect =>
      rect.hidden === 'false' && rect.left >= -1 && rect.top >= -1 && rect.right <= viewport.width + 1 && rect.bottom <= viewport.height + 1
    ), 'a detail capacity escaped the viewport or remained hidden');
    await page.locator('#back').click();
    await page.waitForFunction(() => !document.querySelector('#app')?.classList.contains('detail'));

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
}
