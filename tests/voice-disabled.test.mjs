import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);

function read(relativePath) {
  const url = new URL(relativePath, root);
  assert.ok(fs.existsSync(url), `${relativePath} must exist`);
  const source = fs.readFileSync(url, 'utf8');
  assert.ok(source.length > 0, `${relativePath} must not be empty`);
  return source;
}

const index = read('index.html');
const voice = read('voice.js');
const voiceCss = read('voice.css');
const backend = read('api/realtime-session.js');
const packageManifest = JSON.parse(read('package.json'));
const activeRuntime = [
  read('unity-ui.js'),
  read('main.js'),
  read('arcade.js'),
].join('\n');

// Voice is paused, so the owned Unity core is visual rather than an inert control.
const unityCore = index.match(/<div\b(?=[^>]*\bid=["']unityLabel["'])(?=[^>]*\baria-hidden=["']true["'])[^>]*>/i)?.[0] || '';
assert.ok(unityCore, 'the homepage must retain the passive owned Unity core');
assert.doesNotMatch(index, /<button\b[^>]*\bid=["']unityLabel["']/i, 'the disabled core must not remain a dead button');
assert.doesNotMatch(unityCore, /data-voice|aria-controls|aria-expanded/i, 'the passive core must not advertise unavailable interaction');

// No voice control, styling, script, provider hint or activation copy may be mounted.
assert.doesNotMatch(index, /data-voice-launcher|duVoice|du-voice|duEnhanced|du-enhanced/i, 'the homepage must contain no voice-console markup');
assert.doesNotMatch(index, /<link\b[^>]*href=["'][^"']*voice\.css(?:[?"'])/i, 'the homepage must not load archived voice styles');
assert.doesNotMatch(index, /<script\b[^>]*src=["'][^"']*voice\.js(?:[?"'])/i, 'the homepage must not execute the archived voice runtime');
assert.doesNotMatch(index, /dream-unity-voice-live\.vercel\.app|js\.puter\.com/i, 'the homepage must not contact or preconnect to voice providers');
assert.doesNotMatch(index, /SPEAK TO UNITY|ACTIVATE NEURAL UNITY|NEURAL VOICE|BEGIN LISTENING|TYPE TO UNITY/i, 'the homepage must not invite visitors into a disabled feature');

// The scripts that are still active on the homepage must not restore voice indirectly.
assert.doesNotMatch(
  activeRuntime,
  /dream-unity-voice-live\.vercel\.app|js\.puter\.com|api\/realtime-session|voice\.js|voice\.css|SpeechRecognition|webkitSpeechRecognition|speechSynthesis|puter\.ai/i,
  'active homepage scripts must not load or invoke the archived voice system',
);

// The implementation remains intact for a future deliberate restoration, but is safe if loaded without its UI.
assert.match(
  voice,
  /if\s*\(\s*!app\s*\|\|\s*!launcher\s*\|\|\s*!panel\s*\|\|\s*!status\s*\|\|\s*!copy\s*\)\s*return\s*;/,
  'the archived runtime must stop before prewarming or network work when its interface is absent',
);
assert.match(voiceCss, /\.du-voice-panel\b/, 'the archived voice stylesheet must retain the console styles for later work');

// The paused endpoint needs no production AI package or credential-bearing browser source.
assert.equal(packageManifest.dependencies, undefined, 'the paused voice backend must not retain a production AI dependency');
assert.doesNotMatch(`${voice}\n${voiceCss}\n${backend}`, /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{12,}\b/, 'archived voice files must not embed an API key');
assert.doesNotMatch(voice, /OPENAI_API_KEY|AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN|Authorization\s*:/, 'the archived browser runtime must not read provider credentials');

// The public endpoint is a reversible tombstone while voice is paused.
assert.match(backend, /20260829-unity-backend-paused-1/, 'the backend archive must expose the paused release');
assert.match(backend, /VOICE_DISABLED/, 'the backend archive must reject use with an explicit disabled code');

console.log('Unity voice is absent from the homepage; archived browser files and the paused endpoint contract are preserved.');
