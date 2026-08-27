import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const voice = fs.readFileSync(new URL('../voice.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../voice.css', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../api/realtime-session.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(index, /id="duVoiceLauncher"/, 'front page must expose voice launcher');
assert.match(index, /id="duVoicePanel"/, 'front page must include voice panel');
assert.match(index, /voice\.css\?v=20260827-realtime-voice-1/, 'front page must load voice CSS');
assert.match(index, /voice\.js\?v=20260827-zero-key-voice-3/, 'front page must load zero-key voice runtime');
assert.doesNotMatch(index, /type="module" src="\.\/voice\.js/, 'voice must not depend on external module imports');

assert.match(voice, /SpeechRecognition \|\| window\.webkitSpeechRecognition/, 'voice must support browser speech recognition');
assert.match(voice, /speechSynthesis/, 'voice must provide spoken assistant output');
assert.match(voice, /SpeechSynthesisUtterance/, 'voice must synthesize model responses');
assert.match(voice, /dream-unity-voice-live\.vercel\.app\/api\/realtime-session/, 'voice must use the dedicated voice backend');
assert.match(voice, /MAX_SESSION_MS = 8 \* 60 \* 1000/, 'public voice sessions must have a client duration ceiling');
assert.match(voice, /history: history\.slice/, 'voice must preserve bounded conversational context');
assert.doesNotMatch(voice, /OPENAI_API_KEY|AI_GATEWAY_API_KEY|sk-[A-Za-z0-9]|experimental_useRealtime|api\.openai\.com/, 'browser voice must not depend on static provider secrets or blocked realtime transports');

assert.match(api, /https:\/\/blockrun\.ai\/api\/v1\/chat\/completions/, 'backend must use the zero-key live inference route');
assert.match(api, /nvidia\/gpt-oss-120b/, 'backend must use the GPT-OSS 120B model');
assert.match(api, /credentialMode: 'none'/, 'backend must require no provider credential');
assert.match(api, /speechMode: 'browser-native'/, 'backend health must describe browser-native speech mode');
assert.match(api, /RATE_LIMIT = 24/, 'backend must rate-limit public voice turns');
assert.match(api, /https:\/\/dream-unity\.github\.io/, 'backend must allow the GitHub Pages origin');
assert.doesNotMatch(api, /process\.env\.|OPENAI_API_KEY|AI_GATEWAY_API_KEY/, 'voice backend must not require environment secrets');

assert.equal(pkg.dependencies, undefined, 'static Dream Unity package must remain production-dependency free');
assert.equal(pkg.devDependencies, undefined, 'zero-key voice must not require build dependencies');
assert.match(css, /#app\.detail>.*du-voice-launcher/, 'voice must be limited to the overview');
assert.match(css, /#app\.game-open>.*du-voice-launcher/, 'voice must hide inside games');

console.log('Dream Unity zero-key browser-native voice integration checks passed.');
