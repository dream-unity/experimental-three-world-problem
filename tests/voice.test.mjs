import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const voice = fs.readFileSync(new URL('../voice.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../voice.css', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../api/realtime-session.js', import.meta.url), 'utf8');

assert.match(index, /id="duVoiceLauncher"/, 'front page must expose voice launcher');
assert.match(index, /id="duVoicePanel"/, 'front page must include voice panel');
assert.match(index, /voice\.css\?v=20260827-realtime-voice-1/, 'front page must load voice CSS');
assert.match(index, /voice\.js\?v=20260827-realtime-voice-1/, 'front page must load voice runtime');

assert.match(voice, /https:\/\/api\.openai\.com\/v1\/realtime\/calls/, 'browser must use current Realtime WebRTC calls endpoint');
assert.match(voice, /Content-Type': 'application\/sdp'/, 'browser must exchange SDP');
assert.doesNotMatch(voice, /OPENAI_API_KEY|sk-[A-Za-z0-9]/, 'browser must never contain a permanent OpenAI API key');
assert.match(voice, /MAX_SESSION_MS = 8 \* 60 \* 1000/, 'public voice sessions must have a client duration ceiling');

assert.match(api, /\/v1\/realtime\/client_secrets/, 'server must mint ephemeral client secrets');
assert.match(api, /process\.env\.OPENAI_API_KEY/, 'permanent key must remain server-side');
assert.match(api, /gpt-realtime-2\.1/, 'voice must use the current Realtime model');
assert.match(api, /seconds: TOKEN_TTL_SECONDS/, 'ephemeral secret must use explicit short TTL');
assert.match(api, /OpenAI-Safety-Identifier/, 'backend must bind a privacy-preserving safety identifier');
assert.match(api, /https:\/\/dream-unity\.github\.io/, 'backend must allow the GitHub Pages origin');
assert.doesNotMatch(api, /res\.json\([^)]*OPENAI_API_KEY/, 'backend must not return the permanent API key');

assert.match(css, /#app\.detail>.*du-voice-launcher/, 'voice must be limited to the overview');
assert.match(css, /#app\.game-open>.*du-voice-launcher/, 'voice must hide inside games');

console.log('Dream Unity realtime voice integration checks passed.');
