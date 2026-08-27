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
assert.match(index, /<script type="module" src="\.\/voice\.js\?v=20260827-realtime-voice-2"><\/script>/, 'front page must load module voice runtime');

assert.match(voice, /experimental_useRealtime/, 'browser must use AI SDK realtime transport');
assert.match(voice, /gateway\.experimental_realtime\(MODEL\)/, 'browser must connect through Vercel AI Gateway');
assert.match(voice, /openai\/gpt-realtime-2\.1/, 'browser must request the current OpenAI realtime model through Gateway');
assert.match(voice, /MAX_SESSION_MS = 8 \* 60 \* 1000/, 'public voice sessions must have a client duration ceiling');
assert.doesNotMatch(voice, /OPENAI_API_KEY|AI_GATEWAY_API_KEY|sk-[A-Za-z0-9]/, 'browser must never contain a permanent provider or Gateway key');
assert.doesNotMatch(voice, /api\.openai\.com\/v1\/realtime\/calls/, 'browser must not bypass AI Gateway with direct OpenAI WebRTC');

assert.match(api, /gateway\.experimental_realtime\.getToken/, 'server must mint short-lived AI Gateway realtime tokens');
assert.match(api, /expiresAfterSeconds: TOKEN_TTL_SECONDS/, 'Gateway client secret must use explicit short TTL');
assert.match(api, /vercel-oidc-ai-gateway/, 'backend must document Vercel OIDC credential mode');
assert.match(api, /providerCredentialsRequired: false/, 'backend must not require a provider API key');
assert.match(api, /openai\/gpt-realtime-2\.1/, 'voice backend must use current realtime model');
assert.match(api, /https:\/\/dream-unity\.github\.io/, 'backend must allow the GitHub Pages origin');
assert.doesNotMatch(api, /process\.env\.OPENAI_API_KEY|process\.env\.AI_GATEWAY_API_KEY/, 'backend must rely on Vercel OIDC instead of static secrets');
assert.equal(pkg.dependencies?.ai, '7.0.79', 'Vercel backend must pin the AI SDK used for Gateway token minting');

assert.match(css, /#app\.detail>.*du-voice-launcher/, 'voice must be limited to the overview');
assert.match(css, /#app\.game-open>.*du-voice-launcher/, 'voice must hide inside games');

console.log('Dream Unity Vercel-OIDC realtime voice integration checks passed.');
