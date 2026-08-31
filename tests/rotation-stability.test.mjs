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
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
const page = await context.newPage();
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => { try { localStorage.setItem('dream-unity-score-muted', '1'); } catch {} });

const target = new URL(baseUrl);
target.searchParams.set('rotation-stability', String(Date.now()));
await page.goto(target.href, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__dreamUnityInteractions?.ready === true);
await page.waitForFunction(() => window.__dreamUnityFluidResponse?.version === '20260831-stable-rotation-29');
await page.waitForFunction(() => document.querySelector('#loading')?.classList.contains('hide'));

const policy = await page.evaluate(() => window.__dreamUnityFluidResponse);
assert.equal(policy.acceleratesAfterRelease, false);
assert.equal(policy.autonomousRotation, false);
assert.ok(policy.inertiaDecay >= 3);
assert.ok(policy.maximumReleaseVelocity.yaw <= 4.5);

const orientation = () => page.evaluate(() => window.__dreamUnityInteractions.orientation());
const angularDistance = (a, b) => Math.hypot(b.yaw - a.yaw, b.pitch - a.pitch, b.roll - a.roll);

await page.evaluate(() => window.__dreamUnityInteractions.reset());
await page.waitForTimeout(80);
const machine = await page.evaluate(() => window.__dreamUnityInteractions.screen().machine);
await page.mouse.move(machine.x, machine.y);
await page.mouse.down();
await page.mouse.move(machine.x + 112, machine.y + 2, { steps: 3 });
await page.mouse.up();

const released = await orientation();
await page.waitForTimeout(160);
const t1 = await orientation();
await page.waitForTimeout(160);
const t2 = await orientation();
await page.waitForTimeout(160);
const t3 = await orientation();
const d1 = angularDistance(released, t1);
const d2 = angularDistance(t1, t2);
const d3 = angularDistance(t2, t3);
assert.ok(d1 > 0.02, `release inertia is missing (${d1.toFixed(4)})`);
assert.ok(d2 < d1 * 0.82 + 0.004, `rotation accelerated or failed to decay: ${d1.toFixed(4)} -> ${d2.toFixed(4)}`);
assert.ok(d3 < d2 * 0.82 + 0.004, `rotation accelerated or failed to decay: ${d2.toFixed(4)} -> ${d3.toFixed(4)}`);

await page.waitForTimeout(1600);
const settledA = await orientation();
await page.waitForTimeout(320);
const settledB = await orientation();
assert.ok(angularDistance(settledA, settledB) < 0.008, 'released rotation failed to settle');

// Idle time must never start or increase rotation on its own.
await page.evaluate(() => window.__dreamUnityInteractions.reset());
await page.waitForTimeout(120);
const idleStart = await orientation();
await page.waitForTimeout(3800);
const idleEnd = await orientation();
assert.ok(angularDistance(idleStart, idleEnd) < 0.002, `idle field rotated autonomously by ${angularDistance(idleStart, idleEnd).toFixed(4)} radians`);

assert.deepEqual(errors, []);
await context.close();
await browser.close();
if (server) await new Promise(resolve => server.close(resolve));
console.log('Rotation stability validated: gesture-driven inertia strictly decays, settles, and never restarts autonomously.');
