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
assert.match(index, /voice\.css\?v=20260827-unity-oracle-5/, 'front page must retain Unity Oracle CSS');
assert.match(index, /voice\.js\?v=20260827-unity-oracle-realtime-6/, 'front page must load keyless realtime Unity runtime');
assert.match(index, /id="duOracleInvite"[^>]*>TAP TO SPEAK</, 'Unity must visibly invite a first-time visitor to speak');
assert.match(index, /UNITY · LIVE VOICE/, 'the arrival bubble must identify itself as live voice');
assert.match(index, /MICROPHONE AUDIO IS SENT THROUGH VERCEL AI GATEWAY TO OPENAI ONLY WHILE CONNECTED/, 'privacy copy must describe realtime audio routing accurately');
assert.doesNotMatch(index, /type="module" src="\.\/voice\.js/, 'voice must remain a dependency-free classic script');

assert.match(voice, /ARRIVAL_GREETING = 'Hello, my name is Unity\. What dream would you like to unify\?'/, 'Unity must preserve the approved arrival greeting');
assert.match(voice, /greetOnArrival/, 'Unity must keep the automatic arrival greeting');
assert.match(voice, /querySelector\('\[data-voice-launcher\]'\)/, 'voice must bind to the central Unity control');
assert.match(voice, /dream-unity-voice-live\.vercel\.app\/api\/realtime-session/, 'voice must use the dedicated voice backend');
assert.match(voice, /ai-gateway-realtime\.v1/, 'browser must use the AI Gateway realtime WebSocket protocol');
assert.match(voice, /ai-gateway-auth\.\$\{session\.token\}/, 'browser must authenticate with only the short-lived Gateway token');
assert.match(voice, /type: 'session-update'/, 'browser must configure a normalized realtime session');
assert.match(voice, /type: 'input-audio-append'/, 'browser must stream live microphone audio');
assert.match(voice, /type === 'audio-delta'/, 'browser must play streamed model audio');
assert.match(voice, /gpt-realtime-whisper/, 'realtime session must enable input transcription');
assert.match(voice, /type: 'server-vad'/, 'realtime session must use server voice-activity detection');
assert.match(voice, /SAMPLE_RATE = 24000/, 'realtime audio must use 24 kHz PCM');
assert.match(voice, /conversation-item-truncate/, 'speaking over Unity must truncate interrupted playback context');
assert.match(voice, /MAX_SESSION_MS = 8 \* 60 \* 1000/, 'public voice sessions must have a client duration ceiling');
assert.doesNotMatch(voice, /SpeechRecognition|webkitSpeechRecognition/, 'conversation must not depend on browser speech recognition');
assert.doesNotMatch(voice, /OPENAI_API_KEY|AI_GATEWAY_API_KEY|sk-[A-Za-z0-9]|experimental_useRealtime|api\.openai\.com/, 'browser must contain no provider secret or direct OpenAI API transport');
assert.match(voice, /SpeechSynthesisUtterance/, 'browser synthesis may remain only for the automatic arrival greeting');

assert.match(api, /https:\/\/ai-gateway\.vercel\.sh\/v1\/realtime\/client-secrets/, 'backend must mint short-lived AI Gateway realtime tokens');
assert.match(api, /openai\/gpt-realtime-2\.1/, 'backend must bind sessions to GPT Realtime 2.1');
assert.match(api, /x-vercel-oidc-token/, 'backend must accept Vercel request-scoped OIDC');
assert.match(api, /process\.env\.VERCEL_OIDC_TOKEN/, 'backend must support Vercel deployment OIDC fallback');
assert.match(api, /'ai-gateway-auth-method': 'oidc'/, 'backend must explicitly identify OIDC authentication to AI Gateway');
assert.match(api, /'ai-gateway-protocol-version': '0\.0\.1'/, 'backend must use the current Gateway protocol header');
assert.match(api, /expiresIn: TOKEN_TTL_SECONDS/, 'Gateway client secret must be explicitly short lived');
assert.match(api, /credentialMode: 'vercel-oidc'/, 'health endpoint must report keyless Vercel OIDC auth');
assert.match(api, /permanentProviderKeyRequired: false/, 'backend must require no permanent OpenAI provider key');
assert.match(api, /speechMode: 'realtime-websocket'/, 'health endpoint must report actual realtime speech mode');
assert.match(api, /RATE_LIMIT = 6/, 'backend must rate-limit public realtime sessions');
assert.match(api, /https:\/\/dream-unity\.github\.io/, 'backend must allow the GitHub Pages origin');
assert.doesNotMatch(api, /OPENAI_API_KEY|AI_GATEWAY_API_KEY|sk-[A-Za-z0-9]/, 'backend must not require a copied static provider or Gateway key');

assert.equal(pkg.dependencies, undefined, 'static Dream Unity package must remain production-dependency free');
assert.deepEqual(Object.keys(pkg.devDependencies || {}), ['playwright'], 'realtime voice must add no runtime or voice build dependencies');
assert.match(css, /\.du-unity-oracle/, 'Unity Oracle must expose a central accessible hit target');
assert.match(css, /width:clamp\(122px,16vmin,156px\)/, 'Unity must expose a real, generously sized hit target');
assert.match(css, /\.du-oracle-invite/, 'Unity must carry its talk affordance inside the centrepiece');
assert.match(css, /\.du-voice-panel\.arrival/, 'arrival greeting must remain visually anchored to Unity');
assert.match(css, /#app\.detail>\.du-voice-panel/, 'voice panel must hide away from the overview');
assert.match(visual, /oracleState=app&&app\.dataset/, 'Unity core must receive live voice state');
assert.match(visual, /Projected sound shells/, 'Unity core must visibly broadcast voice');
assert.match(visual, /glassy oracle iris/, 'Unity core must visibly articulate without losing its identity');
assert.match(visual, /drawOrbitStage\(false\)[\s\S]*drawOrbitStage\(true\)/, 'Unity orbits must occlude around the core for real depth');

console.log('Dream Unity keyless GPT realtime Unity Oracle checks passed.');
