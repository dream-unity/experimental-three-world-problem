import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const existsAsFile = (path) => statSync(new URL(path, root)).isFile();

const basePaths = [1, 2, 3, 4, 5].map((number) => `arcade-parts/part-${String(number).padStart(2, '0')}.txt`);
const perceivePaths = [1, 2, 3].map((number) => `arcade-parts/perceive-aerial-${String(number).padStart(2, '0')}.txt`);
const required = [
  'index.html', 'styles.css', 'main.js', 'arcade.js', 'README.md', '.nojekyll',
  ...basePaths, ...perceivePaths,
];
for (const path of required) assert.ok(existsAsFile(path), `${path} must exist`);

const baseSource = basePaths.map(read).join('');
const perceiveSource = perceivePaths.map(read).join('');
const closeIndex = baseSource.lastIndexOf('})();');
assert.ok(closeIndex > 0, 'the original nine-game IIFE terminator must remain available');
const completeSource = `${baseSource.slice(0, closeIndex)}\n${perceiveSource}\n${baseSource.slice(closeIndex)}`;

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'dream-unity-arcade-'));
const completePath = join(temporaryDirectory, 'arcade-complete.js');
writeFileSync(completePath, completeSource);
execFileSync(process.execPath, ['--check', completePath], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', fileURLToPath(new URL('arcade.js', root))], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', fileURLToPath(new URL('main.js', root))], { stdio: 'inherit' });

const loader = read('arcade.js');
const index = read('index.html');
const readme = read('README.md');

assert.match(loader, /const basePaths = \[1, 2, 3, 4, 5\]/);
assert.match(loader, /const perceivePaths = \[1, 2, 3\]/);
assert.match(loader, /lastIndexOf\('\}\)\(\);'\)/);
assert.match(loader, /baseSource\.slice\(0, closeIndex\)/);
assert.match(loader, /perceiveSource/);
assert.match(loader, /Function\(completeSource\)\(\)/);

assert.match(index, /PARALLAX WING/);
assert.match(index, /Read the moving formation/);
assert.match(index, /arcade\.js\?v=20260825-perceive-1/);
assert.match(index, /DRAG TO FLY \+ FIRE · SPACE TO FIRE/);
assert.doesNotMatch(index, /SIGNAL VEIL/);
assert.doesNotMatch(index, /https?:\/\//);

const definitionKeys = baseSource.match(/key:\s*'(?:machine|maker|reality):[0-2]'/g) || [];
assert.equal(definitionKeys.length, 9, 'the shared engine must still contain exactly nine portal definitions');
for (const name of [
  'SIGNAL VEIL', 'MODEL FORGE', 'ORACLE GATES',
  'VECTOR VOW', 'IMPULSE RUN', 'METAMORPH',
  'GRAVITY FOUNDRY', 'LATTICE LOCK', 'GENESIS BLOOM',
]) assert.match(baseSource, new RegExp(name));

assert.match(perceiveSource, /function createPerceptionAerialGame/);
assert.match(perceiveSource, /GAME_BY_KEY\['machine:0'\]/);
assert.match(perceiveSource, /factory:\s*createPerceptionAerialGame/);
assert.doesNotMatch(perceiveSource, /GAME_BY_KEY\['(?:maker|reality):/);

for (const family of [
  'symmetry', 'common-fate', 'counterphase', 'anchor',
  'bridge', 'rotation', 'convergence', 'mixed',
]) assert.match(perceiveSource, new RegExp(`'${family}'`));

for (const diagnostic of [
  'unpaired-symmetry-break', 'causal-source', 'anti-phase',
  'beacon-relative-anchor', 'topological-bridge',
  'marker-opposite-local-frame', 'dual-beam-intersection',
  'connector-anti-phase', 'late-relational-acquisition',
]) assert.match(perceiveSource, new RegExp(diagnostic));

for (const capability of [
  'pointerDown', 'pointerMove', 'pointerUp', 'keyDown',
  'enemyShots', 'fireCooldown', 'CANNON HEAT', 'FALSE LOCK',
  'RELATION BROKEN', 'writeProfile', 'coarse || lowCPU',
]) assert.ok(perceiveSource.includes(capability), `missing capability marker: ${capability}`);

assert.match(perceiveSource, /enemy === encounter\.target/);
assert.match(perceiveSource, /enemy\.lockRejected = true/);
assert.match(perceiveSource, /assist:\s*clamp\(/);
assert.match(perceiveSource, /shuffled\(logical\)/);
assert.match(perceiveSource, /stats\.family/);
assert.match(perceiveSource, /stats\.errors/);
assert.match(perceiveSource, /stats\.latencies/);
assert.doesNotMatch(perceiveSource, /\bA\s+(?:is|was)\s+(?:above|below|left|right)\s+B\b/i);
assert.doesNotMatch(perceiveSource, /A\s*(?:→|->)\s*B/);
assert.doesNotMatch(perceiveSource, /correctIndex|candidate\.pattern|premise/i);

assert.match(readme, /Parallax Wing/);
assert.match(readme, /nine games/i);
assert.match(readme, /PERCEIVE/);
assert.match(readme, /MODEL/);
assert.match(readme, /PREDICT/);
assert.match(readme, /relation remains visible/i);

console.log('Validated: nine-game compatibility, Parallax Wing portal isolation, eight perceptual-relation families, fighter combat, diagnostics, syntax and static deployment surface.');
