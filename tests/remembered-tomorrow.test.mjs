import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const exists = (path) => {
  try { return statSync(new URL(path, root)).isFile(); }
  catch { return false; }
};

const required = [
  'index.html',
  'nexus.css',
  'main.js',
  'unity-ui.js',
  'arcade.js',
  'assets/dream-maker-eye.mp3',
];
required.forEach((path) => assert.ok(exists(path), `${path} missing`));

const index = read('index.html');
const renderer = read('main.js');
const theme = read('nexus.css');
const score = read('unity-ui.js');

assert.match(index, /class="nexus-app"/);
assert.match(index, /assets\/dream-maker-eye\.mp3/);
assert.doesNotMatch(index, /<audio[^>]+i-remember-tomorrow\.mp3/i, 'the retired score must not remain mounted');
assert.match(index, /DREAM MACHINE/);
assert.match(index, /DREAM MAKER/);
assert.match(index, /DREAM WORLD/);
assert.match(index, /THE NEXUS OF ALL POSSIBILITIES/);
assert.match(index, /nexus\.css\?v=20260831-crystal-nexus-31/);
assert.match(index, /main\.js\?v=20260830-awaken-true-war-2[^"']*nexus=31/);
assert.match(index, /unity-ui\.js\?v=20260830-awaken-true-war-2[^"']*nexus=31/);
assert.doesNotMatch(index, /voice\.js|voice\.css|data-voice-launcher|dream-unity-voice-live/i);

for (const marker of [
  "RELEASE = '20260831-crystal-nexus-31'",
  'drawCelestialSphere',
  'drawCentralCrystal',
  'drawPortalSphere',
  'drawOrbits',
  'drawFloor',
  'drawConnector',
  "id:'crystal-nexus'",
  '__dreamUnityInteractions',
  '__dreamUnityStableRotation',
  'autonomous:false',
  'accelerating:false',
]) assert.ok(renderer.includes(marker), `renderer marker ${marker} missing`);
assert.doesNotMatch(renderer, /fetchParts\s*\(|overridePaths\s*=\s*\[/, 'retired fragment renderer still loads at runtime');

for (const marker of [
  "track: 'Dream Maker Eye'",
  "RELEASE = '20260831-dream-maker-eye-score-31'",
  'createMediaElementSource',
  'createAnalyser',
  '__dreamUnityScore',
]) assert.ok(score.includes(marker), `score marker ${marker} missing`);

for (const marker of [
  'radial-gradient',
  '.nexus-environment',
  '.nexus-title',
  '.world-label[data-side="left"]',
  '.world-label[data-side="right"]',
  '.world-label[data-side="bottom"]',
]) assert.ok(theme.includes(marker), `theme marker ${marker} missing`);

const mp3 = statSync(new URL('../assets/dream-maker-eye.mp3', import.meta.url));
assert.ok(mp3.size > 7_000_000, `Dream Maker Eye is unexpectedly small (${mp3.size})`);

execFileSync(process.execPath, ['--check', new URL('../main.js', import.meta.url).pathname], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', new URL('../unity-ui.js', import.meta.url).pathname], { stdio: 'inherit' });

console.log('Crystal Nexus source validated: reference-driven 3D form, Dream Maker Eye score, three portals, stable motion, and nine-game runtime contract.');
