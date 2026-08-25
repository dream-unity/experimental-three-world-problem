import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const existsAsFile = (path) => statSync(new URL(path, root)).isFile();

const basePaths = [1, 2, 3, 4, 5].map((number) => `arcade-parts/part-${String(number).padStart(2, '0')}.txt`);
const roleLogicPath = 'arcade-parts/perceive-role-logic.txt';
const perceivePaths = [1, 2, 3, 4, 5, 6, 7, 8].map((number) => `arcade-parts/perceive-aerial-${String(number).padStart(2, '0')}.txt`);
const required = [
  'index.html', 'styles.css', 'main.js', 'arcade.js', 'README.md', 'package.json', '.nojekyll',
  roleLogicPath, ...basePaths, ...perceivePaths,
  'tests/role-drift.test.mjs', 'tests/validate.mjs',
  '.github/workflows/validate-and-verify.yml',
];
for (const path of required) assert.ok(existsAsFile(path), `${path} must exist`);

const baseSource = basePaths.map(read).join('');
const roleLogicSource = read(roleLogicPath);
const perceiveSource = perceivePaths.map(read).join('');
const closeIndex = baseSource.lastIndexOf('})();');
assert.ok(closeIndex > 0, 'the original nine-game IIFE terminator must remain available');
const completeSource = `${baseSource.slice(0, closeIndex)}\n${roleLogicSource}\n${perceiveSource}\n${baseSource.slice(closeIndex)}`;

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'dream-unity-arcade-'));
const completePath = join(temporaryDirectory, 'arcade-complete.js');
writeFileSync(completePath, completeSource);
execFileSync(process.execPath, ['--check', completePath], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', fileURLToPath(new URL('arcade.js', root))], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', fileURLToPath(new URL('main.js', root))], { stdio: 'inherit' });

const loader = read('arcade.js');
const index = read('index.html');
const readme = read('README.md');
const workflow = read('.github/workflows/validate-and-verify.yml');

assert.match(loader, /VERSION = '20260825-role-drift-2'/);
assert.match(loader, /const basePaths = \[1, 2, 3, 4, 5\]/);
assert.match(loader, /perceive-role-logic\.txt/);
assert.match(loader, /const perceivePaths = \[1, 2, 3, 4, 5, 6, 7, 8\]/);
assert.match(loader, /roleLogicSource/);
assert.match(loader, /perceiveSource/);
assert.match(loader, /Function\(completeSource\)\(\)/);

assert.match(index, /PARALLAX WING/);
assert.match(index, /nearest escort on the outside/i);
assert.match(index, /role changes as they cross/i);
assert.match(index, /arcade\.js\?v=20260825-role-drift-2/);
assert.match(index, /MOVE \/ AIM · TAP OR SPACE TO FIRE/);
assert.doesNotMatch(index, /SIGNAL VEIL/);
assert.doesNotMatch(index, /https?:\/\//);

const definitionKeys = baseSource.match(/key:\s*'(?:machine|maker|reality):[0-2]'/g) || [];
assert.equal(definitionKeys.length, 9, 'the shared engine must still contain exactly nine portal definitions');
for (const name of [
  'SIGNAL VEIL', 'MODEL FORGE', 'ORACLE GATES',
  'VECTOR VOW', 'IMPULSE RUN', 'METAMORPH',
  'GRAVITY FOUNDRY', 'LATTICE LOCK', 'GENESIS BLOOM',
]) assert.match(baseSource, new RegExp(name));

assert.match(roleLogicSource, /function roleDriftGeometry/);
assert.match(roleLogicSource, /function roleDriftClassifyShot/);
assert.match(roleLogicSource, /outside/);
assert.match(roleLogicSource, /insideNearestId/);
assert.match(roleLogicSource, /stale-role-perseveration/);

assert.match(perceiveSource, /function createPerceptionAerialGame/);
assert.match(perceiveSource, /GAME_BY_KEY\['machine:0'\]/);
assert.match(perceiveSource, /factory:\s*createPerceptionAerialGame/);
assert.doesNotMatch(perceiveSource, /GAME_BY_KEY\['(?:maker|reality):/);
assert.match(perceiveSource, /roleDriftGeometry\(/);
assert.match(perceiveSource, /roleDriftClassifyShot\(/);
assert.match(perceiveSource, /committedTurnSign/);
assert.match(perceiveSource, /outsideAxis/);
assert.match(perceiveSource, /distanceToLeader/);
assert.match(perceiveSource, /candidateDwell/);
assert.match(perceiveSource, /targetStableFor/);
assert.match(perceiveSource, /roleSwitchAt/);
assert.match(perceiveSource, /reacquisitionLatencies/);
assert.match(perceiveSource, /ROLE SHIFTS/);
assert.match(perceiveSource, /SHIELD NETWORK COLLAPSED/);
assert.match(perceiveSource, /inside-outside-reversal/);
assert.match(perceiveSource, /outside-distance-substitution/);
assert.match(perceiveSource, /reference-object-substitution/);
assert.match(perceiveSource, /screen-position-substitution/);
assert.match(perceiveSource, /late-relational-acquisition/);

for (const capability of [
  'pointerDown', 'pointerMove', 'pointerUp', 'keyDown',
  'enemyShots', 'fireCooldown', 'CANNON HEAT', 'writeProfile',
  'coarse || lowCPU', 'drawFighter', 'drawLeaderTrail', 'drawOutsideRelation',
]) assert.ok(perceiveSource.includes(capability), `missing capability marker: ${capability}`);

assert.doesNotMatch(perceiveSource, /unpaired-symmetry-break|causal-source|anti-phase|topological-bridge|dual-beam-intersection/);
assert.doesNotMatch(perceiveSource, /correctIndex|candidate\.pattern|premise|odd[- ]one[- ]out/i);
assert.doesNotMatch(perceiveSource, /escort\.(?:color|shape|kind)\s*=\s*.*target/i);

assert.match(readme, /Relational Identity Drift/);
assert.match(readme, /nearest to the leader while occupying the outside/i);
assert.match(readme, /role moves/i);
assert.match(readme, /stale-role perseveration/i);
assert.match(readme, /nine-game cognitive division of labour/i);
assert.match(workflow, /perceive-role-logic\.txt/);
assert.match(workflow, /roleDriftGeometry/);
assert.match(workflow, /relational_identity_drift/);

// Instantiate the replacement in isolation and run its lifecycle with a fake canvas.
const runtimeContext = {
  Math,
  Map,
  Set,
  Number,
  String,
  Array,
  Object,
  JSON,
  Date,
  performance,
  localStorage: { getItem: () => null, setItem: () => {} },
};
vm.createContext(runtimeContext);
const runtimePrelude = `
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a = 1, b = 0) => b + Math.random() * (a - b);
  const choose = (arr) => arr[(Math.random() * arr.length) | 0];
  const dist = (a, b, c, d) => Math.hypot(a - c, b - d);
  const rgba = (rgb, alpha) => 'rgba(' + rgb.join(',') + ',' + alpha + ')';
  const coarse = false;
  const lowCPU = false;
  const GAME_BY_KEY = { 'machine:0': {} };
`;
vm.runInContext(`${runtimePrelude}\n${roleLogicSource}\n${perceiveSource}\nthis.definition = GAME_BY_KEY['machine:0'];`, runtimeContext);
assert.equal(runtimeContext.definition.id, 'parallax-wing-role-drift');
const game = runtimeContext.definition.factory();
const events = [];
const E = {
  w: 1280,
  h: 720,
  u: 720,
  top: 76,
  bottom: 692,
  t: 0,
  rgb: [70, 220, 255],
  secondary: [184, 126, 255],
  keys: new Set(),
  toast: (...args) => events.push(['toast', ...args]),
  setMetric: (...args) => events.push(['metric', ...args]),
  shake: () => {},
  flash: () => {},
  burst: () => {},
  sfx: () => {},
  end: (...args) => events.push(['end', ...args]),
  addScore: () => {},
  level: (...args) => events.push(['level', ...args]),
  glow: () => {},
  line: () => {},
};
const gradient = { addColorStop: () => {} };
const context2d = new Proxy({ createRadialGradient: () => gradient }, {
  get(target, property) {
    if (property in target) return target[property];
    return () => {};
  },
  set(target, property, value) {
    target[property] = value;
    return true;
  },
});

game.reset(E);
for (let frame = 0; frame < 720; frame += 1) {
  E.t = frame / 60;
  if (frame === 20) game.pointerMove(E, 610, 260, false);
  if (frame === 40) game.pointerDown(E, 610, 260);
  if (frame === 42) game.pointerUp(E);
  if (frame === 90) game.keyDown(E, ' ');
  game.update(E, 1 / 60);
  game.draw(E, context2d);
}
game.resize(E);
game.ambient(E, 0.1);
assert.ok(events.some(([type]) => type === 'metric'));
assert.ok(events.some(([type]) => type === 'toast'));

console.log('Validated: nine-game compatibility, Relational Identity Drift geometry, fighter combat lifecycle, diagnostics, syntax and static deployment surface.');
