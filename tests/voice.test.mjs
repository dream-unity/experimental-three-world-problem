import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const voice = fs.readFileSync(new URL('../voice.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../voice.css', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../api/realtime-session.js', import.meta.url), 'utf8');
const visual = fs.readFileSync(new URL('../visual-parts/light-overview-07.txt', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(index, /class="unity-label du-unity-oracle"[^>]*data-voice-launcher/, 'the central Unity symbol must be the voice launcher');
assert.match(index, /id="duVoicePanel"/, 'front page must include voice panel');
assert.doesNotMatch(index, /du-voice-launcher-copy|<strong>TALK<\/strong>/, 'the detached TALK pill must not return');
assert.match(index, /voice\.css\?v=20260827-unity-oracle-4/, 'front page must load Unity Oracle CSS');
assert.match(index, /voice\.js\?v=20260827-unity-oracle-4/, 'front page must load Unity Oracle runtime');
assert.doesNotMatch(index, /type="module" src="\.\/voice\.js/, 'voice must not depend on external module imports');

assert.match(voice, /ARRIVAL_GREETING = 'Hello, welcome to Dream Unity\. What would you like to know\?'/, 'Unity must greet every arrival with the approved wording');
assert.match(voice, /greetOnArrival/, 'Unity must initiate the arrival greeting automatically');
assert.match(voice, /querySelector\('\[data-voice-launcher\]'\)/, 'voice must bind to the central Unity control');
assert.match(voice, /SpeechRecognition \|\| window\.webkitSpeechRecognition/, 'voice must support browser speech recognition');
assert.match(voice, /speechSynthesis/, 'voice must provide spoken assistant output');
assert.match(voice, /SpeechSynthesisUtterance/, 'voice must synthesize model responses');
assert.match(voice, /dream-unity-voice-live\.vercel\.app\/api\/realtime-session/, 'voice must use the dedicated voice backend');
assert.match(voice, /MAX_SESSION_MS = 8 \* 60 \* 1000/, 'public voice sessions must have a client duration ceiling');
assert.match(voice, /history: history\.slice/, 'voice must preserve bounded conversational context');
assert.doesNotMatch(voice, /OPENAI_API_KEY|AI_GATEWAY_API_KEY|sk-[A-Za-z0-9]|experimental_useRealtime|api\.openai\.com/, 'browser voice must not depend on static provider secrets or blocked realtime transports');

assert.match(api, /https:\/\/blockrun\.ai\/api\/v1\/chat\/completions/, 'backend must use the zero-key live inference route');
assert.match(api, /nvidia\/mistral-nemotron/, 'backend must prefer the currently live free Mistral Nemotron route');
assert.match(api, /nvidia\/gpt-oss-120b/, 'backend must retain GPT-OSS as a free fallback when capacity returns');
assert.match(api, /for \(const model of MODELS\)/, 'backend must fail over across free models');
assert.match(api, /credentialMode: 'none'/, 'backend must require no provider credential');
assert.match(api, /speechMode: 'browser-native'/, 'backend health must describe browser-native speech mode');
assert.match(api, /RATE_LIMIT = 24/, 'backend must rate-limit public voice turns');
assert.match(api, /https:\/\/dream-unity\.github\.io/, 'backend must allow the GitHub Pages origin');
assert.doesNotMatch(api, /process\.env\.|OPENAI_API_KEY|AI_GATEWAY_API_KEY/, 'voice backend must not require environment secrets');

assert.equal(pkg.dependencies, undefined, 'static Dream Unity package must remain production-dependency free');
assert.deepEqual(Object.keys(pkg.devDependencies || {}), ['playwright'], 'zero-key voice must add no runtime or voice build dependencies');
assert.match(css, /\.du-unity-oracle/, 'Unity Oracle must expose a central accessible hit target');
assert.match(css, /\.du-voice-panel\.arrival/, 'arrival greeting must be visually anchored to Unity');
assert.match(css, /#app\.detail>\.du-voice-panel/, 'voice transcript must hide away from the overview');
assert.match(visual, /oracleState=app&&app\.dataset/, 'Unity core must receive live voice state');
assert.match(visual, /voice aperture/, 'Unity core must visibly articulate without being replaced');

console.log('Dream Unity central Unity Oracle voice checks passed.');
