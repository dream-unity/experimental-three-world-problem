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
  'voice.css',
  'voice.js',
  'main.js',
  override,
  'assets/i-remember-tomorrow.mp3',
  ...parts
]) assert.ok(exists(path), `${path} missing`);

const index = read('index.html');
const loader = read('main.js');
const theme = read('unity-cycle.css');
const renderer = read(override);

assert.match(index, /I REMEMBER TOMORROW/);
assert.match(index, /Neither prophecy nor fate/);
assert.match(index, /THE GHOST IN THE MIRROR · OF SLAVERY AND FREEDOM/);
assert.match(index, /DREAM[\s\S]*COMPRESS[\s\S]*REALISE[\s\S]*RETURN/);
assert.match(index, /assets\/i-remember-tomorrow\.mp3/);
assert.match(index, /id="scoreControl"/);
assert.doesNotMatch(index, /MAKE THE<br \/>MIRROR|coralTexture|coral-sovereign-engine|phase-rail/);
assert.match(index, /data-voice-launcher/);
assert.match(index, /voice\.css\?v=20260829-unity-console-2/);
assert.match(index, /voice\.js\?v=20260829-unity-console-2/);
assert.match(loader, /VERSION = '20260829-unity-voice-2'/);
assert.match(loader, /remembered-tomorrow-10\.txt/);
assert.match(theme, /--paper:#fff/);
assert.match(theme, /--machine:#00bde8/);
assert.match(theme, /--maker:#00c983/);
assert.match(theme, /--reality:#7448ff/);
assert.match(theme, /#app>\.vignette\{display:none!important/);
assert.doesNotMatch(theme, /radial-gradient\(circle at 50% 46%/i);

for (const marker of [
  'rememberedTomorrowOverview',
  'rememberedTomorrowDetail',
  'rememberedTomorrowRender',
  'rtDrawTemporalGhost',
  'rtDrawPossibleFutures',
  'rtDrawLivingPath',
  'rtDrawDreamMembrane',
  'rtDrawCompressionBraid',
  'rtDrawEtherParticles',
  'rtDrawMatter',
  'rtDrawUnity',
  'Projected sound shells',
  "ctx.fillStyle = '#ffffff'",
  "WORLD.machine.css = '#00BDE8'",
  "WORLD.maker.css = '#00C983'",
  "WORLD.reality.css = '#7448FF'"
]) assert.ok(renderer.includes(marker), `renderer marker ${marker} missing`);

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

console.log('Returning Dream validated: temporal dream field, voice-reactive owned Unity core, score, and nine-world contracts preserved.');
