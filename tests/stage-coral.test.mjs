import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const exists = (path) => statSync(new URL(path, root)).isFile();
const parts = [1, 2, 3, 4, 5, 6].map((number) => `visual-parts/part-${String(number).padStart(2, '0')}.txt`);
const override = 'visual-parts/sovereign-coral-09.txt';

for (const path of [
  'index.html',
  'coral-theme.css',
  'coral-ui.js',
  'main.js',
  override,
  'assets/coral-sovereign-engine.webp',
  'assets/i-remember-tomorrow.mp3',
  ...parts
]) {
  assert.ok(exists(path), `${path} missing`);
}

const index = read('index.html');
const loader = read('main.js');
const theme = read('coral-theme.css');
const renderer = read(override);

assert.match(index, /MAKE THE<br \/>MIRROR<br \/><em>OBEY\.<\/em>/);
assert.match(index, /UNITY IS GRACE WITH TEETH/);
assert.match(index, /id="coralPhase"/);
assert.match(index, /assets\/coral-sovereign-engine\.webp/);
assert.match(index, /assets\/i-remember-tomorrow\.mp3/);
assert.match(index, /id="scoreControl"/);
assert.doesNotMatch(index, /du-voice|data-voice|voice\.js|voice\.css|realtime-session|TAP TO SPEAK|SpeechRecognition|speechSynthesis/i);
assert.match(loader, /VERSION = '20260828-stage-coral-2'/);
assert.match(loader, /sovereign-coral-09\.txt/);
assert.match(theme, /--coral:#ed4036/);

for (const marker of [
  'sovereignCoralOverview',
  'sovereignCoralDetail',
  'sovereignCoralRender',
  'csDrawMirrorCage',
  'csDrawSpine',
  'csDrawCrown',
  'csDrawRoots',
  'csUpdateAgency',
  'csMachinePortal',
  'csMakerPortal',
  'csRealityPortal',
  "ctx.fillStyle = '#eee9dc'",
  "'THE SHARDS ARE NOW MATERIAL · ENTER A WORLD'"
]) {
  assert.ok(renderer.includes(marker), `renderer marker ${marker} missing`);
}

const base = parts.map(read).join('');
const close = base.lastIndexOf('})();');
assert.ok(close > 0, 'visual closure missing');
const complete = `${base.slice(0, close)}\n${renderer}\n${base.slice(close)}`;
const temporary = join(mkdtempSync(join(tmpdir(), 'du-coral-')), 'visual-complete.js');
writeFileSync(temporary, complete);
execFileSync(process.execPath, ['--check', temporary], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', new URL('../coral-ui.js', import.meta.url).pathname], { stdio: 'inherit' });

const webp = readFileSync(new URL('../assets/coral-sovereign-engine.webp', import.meta.url));
assert.equal(webp.subarray(0, 4).toString('ascii'), 'RIFF');
assert.equal(webp.subarray(8, 12).toString('ascii'), 'WEBP');
assert.ok(webp.length > 100_000, 'Stage Coral sculpture is unexpectedly small');
assert.ok(statSync(new URL('../assets/i-remember-tomorrow.mp3', import.meta.url)).size > 1_000_000, 'homepage score is unexpectedly small');

console.log('Stage Coral validated: agency-driven mirror fracture, shard conversion, sovereign organism, score, no voice, and nine-world contracts preserved.');
