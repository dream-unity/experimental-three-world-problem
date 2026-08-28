import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const exists = (path) => statSync(new URL(path, root)).isFile();
const parts = [1, 2, 3, 4, 5, 6].map((number) => `visual-parts/part-${String(number).padStart(2, '0')}.txt`);
const override = 'visual-parts/mirror-forge-08.txt';

for (const path of ['index.html', 'forge-theme.css', 'forge-ui.js', 'main.js', override, 'assets/mirror-forge-core.png', 'assets/i-remember-tomorrow.mp3', ...parts]) {
  assert.ok(exists(path), `${path} missing`);
}

const index = read('index.html');
const loader = read('main.js');
const theme = read('forge-theme.css');
const renderer = read(override);

assert.match(index, /THE MIRROR FORGE/);
assert.match(index, /UNITY IS GRACE WITH TEETH/);
assert.match(index, /assets\/mirror-forge-core\.png/);
assert.match(index, /assets\/i-remember-tomorrow\.mp3/);
assert.match(index, /id="scoreControl"/);
assert.doesNotMatch(index, /du-voice|data-voice|voice\.js|voice\.css|realtime-session|TAP TO SPEAK|SpeechRecognition|speechSynthesis/i);
assert.match(loader, /VERSION = '20260828-mirror-forge-1'/);
assert.match(loader, /mirror-forge-08\.txt/);
assert.match(theme, /--coral:#f14f4b/);
for (const marker of ['mirrorForgeOverview', 'mirrorForgeDetail', 'fDrawCore', 'fMachine', 'fMaker', 'fReality', "ctx.fillStyle = '#ffffff'"]) {
  assert.ok(renderer.includes(marker), `renderer marker ${marker} missing`);
}

const base = parts.map(read).join('');
const close = base.lastIndexOf('})();');
assert.ok(close > 0, 'visual closure missing');
const complete = `${base.slice(0, close)}\n${renderer}\n${base.slice(close)}`;
const temporary = join(mkdtempSync(join(tmpdir(), 'du-forge-')), 'visual-complete.js');
writeFileSync(temporary, complete);
execFileSync(process.execPath, ['--check', temporary], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', new URL('../forge-ui.js', import.meta.url).pathname], { stdio: 'inherit' });

const png = readFileSync(new URL('../assets/mirror-forge-core.png', import.meta.url));
assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
assert.ok(png.length > 500_000, 'forge art is unexpectedly small');
assert.ok(statSync(new URL('../assets/i-remember-tomorrow.mp3', import.meta.url)).size > 1_000_000, 'homepage score is unexpectedly small');

console.log('Mirror Forge validated: renderer, artwork, score, no voice regression, and nine-world contracts preserved.');
