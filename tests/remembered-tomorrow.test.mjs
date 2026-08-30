import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const exists = (path) => statSync(new URL(path, root)).isFile();
const parts = [1, 2, 3, 4, 5, 6].map((number) => `visual-parts/part-${String(number).padStart(2, '0')}.txt`);
const overrides = [
  'visual-parts/sovereign-resonator-11.txt',
  'visual-parts/bearing-mirror-12.txt',
];

for (const path of [
  'index.html',
  'unity-cycle.css',
  'unity-ui.js',
  'light-theme.js',
  'main.js',
  ...overrides,
  'assets/i-remember-tomorrow.mp3',
  ...parts
]) assert.ok(exists(path), `${path} missing`);

const index = read('index.html');
const loader = read('main.js');
const theme = read('unity-cycle.css');
const lightSurface = read('light-theme.js');
const resonator = read(overrides[0]);
const renderer = read(overrides[1]);
const pointerInput = read('visual-parts/part-05.txt');
const inertialInput = read('visual-parts/part-06.txt');
const arcadeInput = read('arcade-parts/part-02.txt');

assert.match(index, /AWAKEN THE TRUE WAR/);
assert.match(index, /Somewhere out in the universe/);
assert.match(index, /I wonder in my heart/);
assert.match(index, /Light pierces through me/);
assert.match(index, /AWARENESS[\s\S]*MUST BEAR[\s\S]*WEIGHT/);
assert.match(index, /THE BEARING MIRROR/);
assert.match(index, /THE GHOST IN THE MIRROR · OF SLAVERY AND FREEDOM/);
assert.match(index, /DREAM[\s\S]*COMPRESS[\s\S]*REALISE[\s\S]*RETURN/);
assert.match(index, /assets\/i-remember-tomorrow\.mp3/);
assert.equal((index.match(/<audio\b/gi) || []).length, 1, 'the homepage must publish exactly one audio element');
const trackedMp3 = execFileSync('git', ['ls-files', '*.mp3'], { cwd: root, encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(Boolean);
assert.deepEqual(trackedMp3, ['assets/i-remember-tomorrow.mp3'], 'the published score is the only MP3 allowed in the repository');
assert.match(index, /id="scoreControl"/);
assert.doesNotMatch(index, /MAKE THE<br \/>MIRROR|coralTexture|coral-sovereign-engine|phase-rail/);
assert.match(index, /styles\.css\?v=20260830-bearing-mirror-1/);
assert.match(index, /unity-cycle\.css\?v=20260830-bearing-mirror-1/);
assert.match(index, /light-theme\.js\?v=20260830-bearing-mirror-1/);
assert.match(index, /unity-ui\.js\?v=20260830-bearing-mirror-1/);
assert.match(index, /main\.js\?v=20260830-bearing-mirror-1/);
assert.match(index, /<div\b(?=[^>]*\bid=["']unityLabel["'])(?=[^>]*\baria-hidden=["']true["'])[^>]*>/i, 'the owned Unity core must remain a passive visual label');
assert.doesNotMatch(index, /<button\b[^>]*\bid=["']unityLabel["']/i, 'the disabled Unity core must not remain a dead button');
assert.doesNotMatch(index, /data-voice-launcher|duVoice|du-voice|duEnhanced|du-enhanced|voice\.css|voice\.js/i, 'the homepage must not mount the archived voice interface');
assert.doesNotMatch(index, /dream-unity-voice-live\.vercel\.app|js\.puter\.com/i, 'the homepage must not preconnect to an inactive voice service');
assert.match(loader, /VERSION = '20260830-bearing-mirror-1'/);
assert.match(loader, /sovereign-resonator-11\.txt/);
assert.match(loader, /bearing-mirror-12\.txt/);
assert.match(loader, /source\.slice\(baseParts\.length\)\.join/);
assert.match(theme, /--paper:#fff/);
assert.match(theme, /--machine:#00cfff/);
assert.match(theme, /--maker:#00d88a/);
assert.match(theme, /--reality:#6633f5/);
assert.match(theme, /#app>\.vignette\{display:none!important/);
assert.match(theme, /\.arcade\{background:var\(--paper\)/);
assert.match(theme, /no neon bunker/);
assert.match(theme, /\.score-control\{[\s\S]*?height:44px/);
assert.doesNotMatch(theme, /radial-gradient\(circle at 50% 46%/i);
assert.doesNotMatch(theme, /#app\[data-score-phase=/, 'the public score must not create a contradictory visible phase clock');
assert.match(lightSurface, /this\.id === 'gameCanvas'/);
assert.match(lightSurface, /__dreamUnityLightSurface/);
assert.match(lightSurface, /!isGame/);

for (const marker of [
  'bmOverview',
  'bmDetail',
  'bmRender',
  'bmOverviewGhost',
  'bmMotionScore',
  'bmAddTeeth',
  'bmReturnFibres',
  'bmMachineGeometry',
  'bmMakerGeometry',
  'bmWorldGeometry',
  'MAKE THE GHOST BEAR WEIGHT',
  "ctx.fillStyle = '#ffffff'",
]) assert.ok(renderer.includes(marker), `renderer marker ${marker} missing`);

for (const marker of [
  'const phase = reduced ? 0.24',
  'const subtraction = score.subtraction',
  'const crown = score.crown * (1 - subtraction)',
  'Completion belongs to interaction',
  'const bmEnterWorldBase = enterWorld',
  'back?.focus?.({ preventScroll: true })',
  'labels[returnKey]?.focus?.({ preventScroll: true })',
]) assert.ok(renderer.includes(marker), `coherence/accessibility marker ${marker} missing`);

assert.doesNotMatch(
  renderer,
  /Math\.max\(\s*score\.(?:subtraction|rebuild|crown|release)\s*,\s*srForm/,
  'independent score clocks must never be max-mixed into contradictory material states',
);

for (const input of [pointerInput, inertialInput]) {
  assert.match(input, /-0\.314, 0\.314/, 'input pitch must share the renderer pitch envelope');
  assert.match(input, /0\.88, 1\.12/, 'input zoom must share the renderer zoom envelope');
  assert.doesNotMatch(input, /-1\.1[68], 1\.1[68]|0\.(?:66|72), 1\.(?:55|62)/, 'latent input dead zones must not return');
}
assert.match(pointerInput, /-0\.122, 0\.122/, 'pinch roll must share the renderer roll envelope');
assert.match(inertialInput, /-0\.122, 0\.122/, 'inertial roll must share the renderer roll envelope');
assert.match(
  arcadeInput,
  /event\.target instanceof Element[\s\S]*?closest\([\s\S]*?input, textarea, select,[\s\S]*?if \(editable\) return/,
  'global arcade shortcuts must yield to text-entry controls',
);

for (const marker of [
  "WORLD.machine.css = '#00CFFF'",
  "WORLD.maker.css = '#00D88A'",
  "WORLD.reality.css = '#6633F5'",
  'srReadForm',
]) assert.ok(resonator.includes(marker), `resonator bridge marker ${marker} missing`);

const tensions = resonator.match(/const SR_TENSIONS = \[([\s\S]*?)\n  \];/);
assert.ok(tensions, 'the structural-tension array is missing');
assert.equal((tensions[1].match(/\[/g) || []).length, 9, 'the resonator must carry exactly nine game tensions');
const teeth = renderer.match(/const placements = \[([\s\S]*?)\n    \];/);
assert.ok(teeth, 'the Bearing Mirror pressure teeth are missing');
assert.equal((teeth[1].match(/\[/g) || []).length, 9, 'the Bearing Mirror must carry exactly nine pressure teeth');

const scoreRuntime = read('unity-ui.js');
for (const marker of ['__dreamUnityScore', 'createMediaElementSource', 'createAnalyser', 'awaken', 'bone', 'return']) {
  assert.ok(scoreRuntime.includes(marker), `score bridge marker ${marker} missing`);
}
assert.match(scoreRuntime, /silentClockOrigin/);
assert.match(scoreRuntime, /276\.80[^\n]+279\.25/);
assert.doesNotMatch(scoreRuntime, /envelope\(time, 258\.0/);

assert.doesNotMatch(renderer, /\.mp3|createRadialGradient|globalCompositeOperation = 'lighter'|trefoil|helix|waveform|equalizer|coralTexture|csDrawMirrorCage|csDrawSpine|#eee9dc|black architectural wound/i);

const base = parts.map(read).join('');
const close = base.lastIndexOf('})();');
assert.ok(close > 0, 'visual closure missing');
const complete = `${base.slice(0, close)}\n${resonator}\n${renderer}\n${base.slice(close)}`;
const temporary = join(mkdtempSync(join(tmpdir(), 'du-bearing-mirror-')), 'visual-complete.js');
writeFileSync(temporary, complete);
execFileSync(process.execPath, ['--check', temporary], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', new URL('../unity-ui.js', import.meta.url).pathname], { stdio: 'inherit' });
assert.ok(statSync(new URL('../assets/i-remember-tomorrow.mp3', import.meta.url)).size > 1_000_000, 'homepage score is unexpectedly small');

console.log('Awaken the True War validated: Bearing Mirror, passive Unity core, private-audio guard, and nine-world contracts preserved.');
