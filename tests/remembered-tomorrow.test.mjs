import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const exists = (path) => statSync(new URL(path, root)).isFile();
const parts = [1, 2, 3, 4, 5, 6].map((number) => `visual-parts/part-${String(number).padStart(2, '0')}.txt`);
const override = 'visual-parts/remembered-tomorrow-10.txt';

for (const path of [
  'index.html',
  'unity-cycle.css',
  'unity-ui.js',
  'light-theme.js',
  'main.js',
  override,
  'assets/i-remember-tomorrow.mp3',
  ...parts
]) assert.ok(exists(path), `${path} missing`);

const index = read('index.html');
const loader = read('main.js');
const theme = read('unity-cycle.css');
const lightSurface = read('light-theme.js');
const renderer = read(override);

assert.match(index, /AWAKEN THE TRUE WAR/);
assert.match(index, /Somewhere out in the universe/);
assert.match(index, /I wonder in my heart/);
assert.match(index, /Light pierces through me/);
assert.match(index, /THE GHOST IN THE MIRROR · OF SLAVERY AND FREEDOM/);
assert.match(index, /DREAM[\s\S]*COMPRESS[\s\S]*REALISE[\s\S]*RETURN/);
assert.match(index, /assets\/i-remember-tomorrow\.mp3/);
assert.doesNotMatch(index, /assets\/awaken-the-true-war\.mp3/, 'the reference MP3 must not become a published homepage asset');
assert.match(index, /id="scoreControl"/);
assert.doesNotMatch(index, /MAKE THE<br \/>MIRROR|coralTexture|coral-sovereign-engine|phase-rail/);
assert.match(index, /styles\.css\?v=20260830-awaken-true-war-2/);
assert.match(index, /unity-cycle\.css\?v=20260830-awaken-true-war-2/);
assert.match(index, /light-theme\.js\?v=20260830-awaken-true-war-2/);
assert.match(index, /unity-ui\.js\?v=20260830-awaken-true-war-2/);
assert.match(index, /main\.js\?v=20260830-awaken-true-war-2/);
assert.match(index, /<div\b(?=[^>]*\bid=["']unityLabel["'])(?=[^>]*\baria-hidden=["']true["'])[^>]*>/i, 'the owned Unity core must remain a passive visual label');
assert.doesNotMatch(index, /<button\b[^>]*\bid=["']unityLabel["']/i, 'the disabled Unity core must not remain a dead button');
assert.doesNotMatch(index, /data-voice-launcher|duVoice|du-voice|duEnhanced|du-enhanced|voice\.css|voice\.js/i, 'the homepage must not mount the archived voice interface');
assert.doesNotMatch(index, /dream-unity-voice-live\.vercel\.app|js\.puter\.com/i, 'the homepage must not preconnect to an inactive voice service');
assert.match(loader, /VERSION = '20260830-awaken-true-war-2'/);
assert.match(loader, /remembered-tomorrow-10\.txt/);
assert.match(theme, /--paper:#fff/);
assert.match(theme, /--machine:#00bde8/);
assert.match(theme, /--maker:#00c983/);
assert.match(theme, /--reality:#7448ff/);
assert.match(theme, /#app>\.vignette\{display:none!important/);
assert.match(theme, /\.arcade\{background:var\(--paper\)/);
assert.match(theme, /no neon bunker/);
assert.doesNotMatch(theme, /radial-gradient\(circle at 50% 46%/i);
assert.match(lightSurface, /this\.id === 'gameCanvas'/);
assert.match(lightSurface, /__dreamUnityLightSurface/);

for (const marker of [
  'rememberedTomorrowOverview',
  'rememberedTomorrowDetail',
  'rememberedTomorrowRender',
  'rtDrawTemporalGhost',
  'rtDrawSovereignShell',
  'rtDrawLightAxis',
  'rtDrawPossibleFutures',
  'rtDrawLivingPath',
  'rtDrawDreamMembrane',
  'rtDrawCompressionBraid',
  'rtDrawEtherParticles',
  'rtDrawMatter',
  'rtDrawUnity',
  "ctx.fillStyle = '#ffffff'",
  "WORLD.machine.css = '#00BDE8'",
  "WORLD.maker.css = '#00C983'",
  "WORLD.reality.css = '#7448FF'"
]) assert.ok(renderer.includes(marker), `renderer marker ${marker} missing`);

const scoreRuntime = read('unity-ui.js');
for (const marker of ['__dreamUnityScore', 'createMediaElementSource', 'createAnalyser', 'awaken', 'bone', 'return']) {
  assert.ok(scoreRuntime.includes(marker), `score bridge marker ${marker} missing`);
}
assert.match(scoreRuntime, /silentClockOrigin/);
assert.match(scoreRuntime, /276\.80[^\n]+279\.25/);
assert.doesNotMatch(scoreRuntime, /envelope\(time, 258\.0/);
assert.match(renderer, /score\.currentTime < 276\.80/);
assert.match(renderer, /60 \/ 86\.7/);

assert.doesNotMatch(renderer, /coralTexture|csDrawMirrorCage|csDrawSpine|csDrawCrown|#eee9dc|black architectural wound/i);

const base = parts.map(read).join('');
const close = base.lastIndexOf('})();');
assert.ok(close > 0, 'visual closure missing');
const complete = `${base.slice(0, close)}\n${renderer}\n${base.slice(close)}`;
const temporary = join(mkdtempSync(join(tmpdir(), 'du-returning-dream-')), 'visual-complete.js');
writeFileSync(temporary, complete);
execFileSync(process.execPath, ['--check', temporary], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', new URL('../unity-ui.js', import.meta.url).pathname], { stdio: 'inherit' });
assert.ok(statSync(new URL('../assets/i-remember-tomorrow.mp3', import.meta.url)).size > 1_000_000, 'homepage score is unexpectedly small');

console.log('Awaken the True War validated: score-driven Sovereign Fold, passive Unity core, and nine-world contracts preserved.');
