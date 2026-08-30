import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const RELEASE = '20260830-sovereign-nocturne-14';
const RENDERER_PATH = 'visual-parts/sovereign-nocturne-14.js';
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const exists = (path) => statSync(new URL(path, root)).isFile();

for (const path of [
  'index.html',
  'styles.css',
  'unity-cycle.css',
  'unity-ui.js',
  'main.js',
  'arcade.js',
  'arcade-parts/part-02.txt',
  'arcade-parts/part-05.txt',
  RENDERER_PATH,
]) assert.ok(exists(path), `${path} missing`);

const index = read('index.html');
const loader = read('main.js');
const theme = read('unity-cycle.css');
const renderer = read(RENDERER_PATH);
const scoreRuntime = read('unity-ui.js');
const arcadeDefinitions = read('arcade-parts/part-05.txt');
const arcadeInput = read('arcade-parts/part-02.txt');
const publicText = index.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// Editorial meaning is a public contract. The visual may evolve without losing
// the lyric fragment, the essay's material/spirit cycle, or the three worlds.
for (const phrase of [
  'DREAM UNITY',
  'THE GHOST IN THE MIRROR · OF SLAVERY AND FREEDOM',
  'Somewhere out in the universe',
  'I wonder in my heart',
  'Light pierces through me',
  'AWAKEN THE TRUE WAR',
  'DREAM MACHINE',
  'PERCEIVE · MODEL · PREDICT',
  'DREAM MAKER',
  'INTEND · ACT · BECOME',
  'DREAM WORLD',
  'MATTER · STRUCTURE · EMERGE',
]) assert.ok(publicText.includes(phrase), `public meaning ${phrase} missing`);
assert.match(index, /DREAM[\s\S]*COMPRESS[\s\S]*REALISE[\s\S]*RETURN/);

assert.equal((index.match(/<button\b[^>]*\bclass=["'][^"']*\bworld-label\b[^"']*["']/gi) || []).length, 3, 'the overview must expose exactly three world portals');
for (const id of ['label-machine', 'label-maker', 'label-reality', 'sub-0', 'sub-1', 'sub-2', 'back']) {
  assert.match(index, new RegExp(`id=["']${id}["']`), `${id} navigation control missing`);
}
assert.match(index, /<div\b(?=[^>]*\bid=["']unityLabel["'])(?=[^>]*\baria-hidden=["']true["'])[^>]*>/i, 'Unity must remain a passive visual label');
assert.doesNotMatch(index, /<button\b[^>]*\bid=["']unityLabel["']/i, 'Unity must not become a dead button');

// One release identity must invalidate every active overview resource together.
for (const asset of ['styles.css', 'become.css', 'unity-cycle.css', 'unity-ui.js', 'main.js', 'arcade.js']) {
  assert.match(index, new RegExp(`${asset.replace('.', '\\.')}\\?v=${RELEASE}`), `${asset} does not use the Nocturne release`);
}
assert.match(loader, new RegExp(`VERSION\\s*=\\s*['"]${RELEASE}['"]`));
assert.match(loader, /visual-parts\/sovereign-nocturne-14\.js/);
assert.doesNotMatch(loader, /bearing-mirror|sovereign-resonator|visual-parts\/part-0[1-6]\.txt|\bFunction\s*\(|fetchParts/i, 'the loader must not concatenate a retired Canvas2D renderer');

// Near-black material field with bone and concentrated Coral accents.
for (const [name, value] of [
  ['void', '#050505'],
  ['basalt', '#111010'],
  ['bone', '#e9e3d6'],
  ['coral-hot', '#ff4e57'],
  ['coral', '#ff765f'],
]) assert.match(theme, new RegExp(`--${name}\\s*:\\s*${value}`, 'i'), `${name} palette token missing`);
assert.doesNotMatch(theme, /--paper\s*:\s*#fff(?:fff)?\b/i, 'the overview must not regress to a white presentation field');
assert.match(index, /<meta\b(?=[^>]*\bname=["']theme-color["'])(?=[^>]*\bcontent=["']#050505["'])[^>]*>/i);

// Renderer contracts are observable by tests and assistive/fallback UI; these
// checks deliberately avoid prescribing meshes, vertex counts, or composition.
for (const marker of [
  'sovereign-nocturne',
  RELEASE,
  'SILENT_CYCLE_SECONDS',
  'webgl2',
  'canvas2d-fallback',
  'rendererReady',
  'rendererState',
  'dreamunity:renderer-ready',
  'webglcontextlost',
  'webglcontextrestored',
  'dreamunity:renderer-context-lost',
  'dreamunity:renderer-context-restored',
  '__dreamUnityRenderer',
  'prefers-reduced-motion: reduce',
]) assert.ok(renderer.includes(marker), `renderer behavior contract ${marker} missing`);
assert.match(renderer, /getContext\(\s*['"]webgl2['"]/);
assert.match(renderer, /getContext\(\s*['"]2d['"]/);
assert.match(renderer, /preventDefault\s*\(/, 'WebGL context loss must be explicitly handled');
assert.match(renderer, /reducedMotion[\s\S]*dataset\.motion|dataset\.motion[\s\S]*reducedMotion/i, 'reduced-motion state must be observable');

// Reject the literal construction-kit vocabulary that made the previous form
// read as gears, blocks, interface frames, leader cards, loops and ribbons.
assert.doesNotMatch(
  renderer,
  /\b(?:gear|cog|sprocket|tooth|teeth|leader[-_ ]?card|callout[-_ ]?card|ribbon)\b|(?:gear|cog|block|frame|loop|ribbon)(?:Geometry|Mesh)|(?:draw|build|make|create)(?:Gear|Cog|Block|Frame|Loop|Ribbon)/i,
  'a forbidden mechanical/UI motif returned to the Nocturne sculpture',
);

// The private reference track informs the art but is never copied, requested,
// decoded, analysed, or coupled to the renderer. The existing public score is
// the sole tracked MP3 and remains independently controlled by unity-ui.js.
const trackedMp3 = execFileSync('git', ['ls-files', '*.mp3'], { cwd: root, encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(Boolean);
assert.deepEqual(trackedMp3, ['assets/i-remember-tomorrow.mp3'], 'a private or unapproved MP3 entered the repository');
const repositoryMp3 = execFileSync(
  'find',
  ['.', '(', '-path', './.git', '-o', '-path', './node_modules', ')', '-prune', '-o', '-type', 'f', '-iname', '*.mp3', '-print'],
  { cwd: root, encoding: 'utf8' },
).trim().split(/\r?\n/).filter(Boolean).map(path => path.replace(/^\.\//, '')).sort();
assert.deepEqual(repositoryMp3, ['assets/i-remember-tomorrow.mp3'], 'a private MP3 was copied into the repository, even if untracked');
assert.doesNotMatch(trackedMp3.join('\n'), /awaken[ _-]*the[ _-]*true[ _-]*war|\(2\)/i);
assert.doesNotMatch(renderer, /\.mp3\b|scoreAudio|AudioContext|webkitAudioContext|createMediaElementSource|decodeAudioData/i, 'the visual renderer must be non-auditory');
assert.match(index, /id="scoreControl"/);
assert.match(index, /assets\/i-remember-tomorrow\.mp3/);
for (const marker of ['__dreamUnityScore', 'createMediaElementSource', 'createAnalyser']) {
  assert.ok(scoreRuntime.includes(marker), `existing public score control ${marker} missing`);
}

// The archived voice experiment stays unmounted and network-silent.
assert.doesNotMatch(index, /data-voice-launcher|duVoice|du-voice|duEnhanced|du-enhanced|voice\.css|voice\.js/i, 'the homepage mounted the archived voice interface');
assert.doesNotMatch(index, /dream-unity-voice-live\.vercel\.app|js\.puter\.com/i, 'the homepage preconnected to an inactive voice service');

// Preserve all nine game identities and the editable-control keyboard guard.
const games = [
  ['machine:0', 'FIGHTER JET'],
  ['machine:1', 'MODEL FORGE'],
  ['machine:2', 'ORACLE GATES'],
  ['maker:0', 'VECTOR VOW'],
  ['maker:1', 'IMPULSE RUN'],
  ['maker:2', 'BECOME'],
  ['reality:0', 'GRAVITY FOUNDRY'],
  ['reality:1', 'LATTICE LOCK'],
  ['reality:2', 'GENESIS BLOOM'],
];
assert.equal((arcadeDefinitions.match(/key:\s*['"](?:machine|maker|reality):[0-2]['"]/g) || []).length, 9, 'the arcade must define exactly nine portal slots');
for (const [key, name] of games) {
  assert.ok(arcadeDefinitions.includes(`key: '${key}'`), `${key} game slot missing`);
  if (key !== 'machine:0' && key !== 'maker:2') assert.ok(arcadeDefinitions.includes(`name: '${name}'`), `${name} game identity missing`);
}
assert.match(
  arcadeInput,
  /event\.target instanceof Element[\s\S]*?closest\([\s\S]*?input, textarea, select,[\s\S]*?if \(editable\) return/,
  'global arcade shortcuts must yield to Become and other text-entry controls',
);

execFileSync(process.execPath, ['--check', new URL(`../${RENDERER_PATH}`, import.meta.url).pathname], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', new URL('../main.js', import.meta.url).pathname], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', new URL('../unity-ui.js', import.meta.url).pathname], { stdio: 'inherit' });

console.log('Sovereign Nocturne validated: WebGL/fallback, reduced motion, private-audio exclusion, three worlds, and nine games.');
