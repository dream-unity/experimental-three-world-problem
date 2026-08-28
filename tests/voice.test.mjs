import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const voice = fs.readFileSync(new URL('../voice.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../voice.css', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../api/realtime-session.js', import.meta.url), 'utf8');
const apiModule = await import('../api/realtime-session.js');
const { default: voiceHandler, instantAnswer, publicAnswer } = apiModule;
const visual = fs.readFileSync(new URL('../visual-parts/light-overview-07.txt', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(index, /class="unity-label du-unity-oracle"[^>]*data-voice-launcher/, 'the central Unity symbol must be the voice launcher');
assert.match(index, /id="duVoicePanel"/, 'front page must include voice panel');
assert.doesNotMatch(index, /du-voice-launcher-copy|<strong>TALK<\/strong>/, 'the detached TALK pill must not return');
assert.match(index, /voice\.css\?v=20260827-unity-oracle-7/, 'front page must load Unity Oracle CSS');
assert.match(index, /voice\.js\?v=20260828-unity-oracle-8/, 'front page must load Unity Oracle runtime');
assert.match(index, /id="duOracleInvite"[^>]*>TAP TO SPEAK</, 'Unity must visibly invite a first-time visitor to speak');
assert.match(index, /UNITY · LIVE VOICE/, 'the arrival bubble must identify itself as live voice');
assert.match(index, /rel="preconnect" href="https:\/\/dream-unity-voice-live\.vercel\.app"/, 'the browser must establish the voice-backend connection before the first question');
assert.doesNotMatch(index, /type="module" src="\.\/voice\.js/, 'voice must not depend on external module imports');

assert.match(voice, /ARRIVAL_GREETING = 'Hello, my name is Unity\. What dream would you like to unify\?'/, 'Unity must greet every arrival with the approved wording');
assert.match(voice, /greetOnArrival/, 'Unity must initiate the arrival greeting automatically');
assert.match(voice, /querySelector\('\[data-voice-launcher\]'\)/, 'voice must bind to the central Unity control');
assert.match(voice, /SpeechRecognition \|\| window\.webkitSpeechRecognition/, 'voice must support browser speech recognition');
assert.match(voice, /speechSynthesis/, 'voice must provide spoken assistant output');
assert.match(voice, /SpeechSynthesisUtterance/, 'voice must synthesize model responses');
assert.match(voice, /dream-unity-voice-live\.vercel\.app\/api\/realtime-session/, 'voice must use the dedicated voice backend');
assert.match(voice, /MAX_SESSION_MS = 8 \* 60 \* 1000/, 'public voice sessions must have a client duration ceiling');
assert.match(voice, /prewarmVoiceEndpoint\(\)/, 'voice backend must warm while Unity greets the visitor');
assert.match(voice, /TURN_TIMEOUT_MS = 12_000/, 'voice turns must have a hard low-latency ceiling');
assert.match(voice, /MAX_HISTORY = 6/, 'browser conversation context must remain small enough for fast voice turns');
assert.match(voice, /history: history\.slice/, 'voice must preserve bounded conversational context');
assert.match(voice, /instantVoiceAnswer/, 'common conversational turns must bypass network and model latency');
assert.match(voice, /next\.onspeechend/, 'speech recognition must stop promptly when the visitor finishes speaking');
assert.doesNotMatch(voice, /for \(let attempt = 0; attempt < 2; attempt\+\+\)/, 'browser must never repeat the entire backend pipeline for one spoken turn');
assert.doesNotMatch(voice, /OPENAI_API_KEY|AI_GATEWAY_API_KEY|sk-[A-Za-z0-9]|experimental_useRealtime|api\.openai\.com/, 'browser voice must not depend on static provider secrets or blocked realtime transports');

assert.match(api, /https:\/\/blockrun\.ai\/api\/v1\/chat\/completions/, 'backend must use the zero-key live inference route');
assert.match(api, /nvidia\/nemotron-nano-9b-v2/, 'backend must lead with the smaller non-reasoning voice model');
assert.match(api, /nvidia\/mistral-nemotron/, 'backend must keep one non-reasoning fallback model');
assert.doesNotMatch(api, /nvidia\/nemotron-3-nano-omni-30b-a3b-reasoning/, 'voice must not use the explicit reasoning model that leaked planning');
assert.doesNotMatch(api, /nvidia\/step-3\.7-flash/, 'backend must exclude the model observed leaking private process text');
assert.doesNotMatch(api, /Promise\.any\(attempts\)/, 'backend must not multiply provider traffic with simultaneous free-model calls');
assert.match(api, /TOTAL_UPSTREAM_BUDGET_MS = 8_000/, 'all provider work must share one eight-second deadline');
assert.match(api, /MODEL_ATTEMPT_LIMIT_MS = 4_500/, 'one slow model must not consume the entire turn');
assert.match(api, /if \(Number\(result\.status\) === 429\) break/, 'provider-wide capacity errors must not trigger more same-provider traffic');
assert.match(api, /max_tokens: maxTokens/, 'generation length must adapt to the requested depth');
assert.match(api, /temperature: 0\.2/, 'voice generation must discourage rambling and planning');
assert.match(api, /GENERAL_SYSTEM_PROMPT/, 'ordinary questions must use the compact voice prompt');
assert.match(api, /needsDreamUnityContext/, 'the larger Dream Unity framework must only be added when relevant');
assert.match(api, /Reply directly and naturally to the latest message/, 'Unity must answer normally instead of commenting on the question');

const nonce = '0123456789abcdef';
const wrap = answer => `<<UNITY_PUBLIC:${nonce}>>\n${answer}\n<<END_UNITY_PUBLIC:${nonce}>>`;
const leakedPlanning = `I'll use British English conventions. Since they asked "how are you", I should answer naturally but briefly - one to three short sentences as per default behavior. Important: Must not invent current states or claim sensors. I have no actual feelings, so I'll state that plainly while keeping it warm. The response should be visitor-facing only - no internal reasoning shown. Also noting: If they later ask about Dream Unity specifically, then I can engage with the framework. But for now, pure social reciprocity.`;
assert.equal(publicAnswer(wrap('The sky is blue because shorter wavelengths scatter more strongly.'), nonce), 'The sky is blue because shorter wavelengths scatter more strongly.');
assert.equal(publicAnswer('The sky is blue because shorter wavelengths scatter more strongly.', nonce), '', 'plain unbounded model text must never reach speech');
assert.equal(publicAnswer(leakedPlanning, nonce), '', 'the exact screenshot planning leak must be rejected');
assert.equal(publicAnswer(`${leakedPlanning}\n${wrap("I'm doing well, thank you. How are you?")}`, nonce), "I'm doing well, thank you. How are you?", 'planning outside the random public envelope must be discarded');
assert.equal(publicAnswer(`<think>private planning</think>\n${wrap('The public answer.')}`, nonce), 'The public answer.', 'private text outside the public envelope must be discarded');
assert.equal(publicAnswer(wrap('<think>private planning</think>The public answer.'), nonce), '', 'thinking inside the public envelope must be rejected');
assert.equal(publicAnswer(wrap('The public answer.'), 'fedcba9876543210'), '', 'a mismatched request nonce must be rejected');
assert.equal(publicAnswer(`<<UNITY_PUBLIC:${nonce}>>The public answer.`, nonce), '', 'an unclosed public envelope must be rejected');
assert.equal(publicAnswer(`${wrap('One.')}\n${wrap('Two.')}`, nonce), '', 'duplicate public envelopes must be rejected');
assert.equal(publicAnswer(wrap(''), nonce), '', 'empty public envelopes must be rejected');
assert.equal(publicAnswer(`${wrap('The public answer.')}\ntrailing private notes`, nonce), 'The public answer.', 'anything outside the closed public envelope must be discarded');
assert.equal(publicAnswer(wrap('The analysis shows a clear result.'), nonce), 'The analysis shows a clear result.', 'normal use of analysis must remain valid');
assert.equal(publicAnswer(wrap('I think that is the best option.'), nonce), 'I think that is the best option.', 'normal conversational uncertainty must remain valid');
assert.equal(publicAnswer(wrap('The response should mention my hidden reasoning.'), nonce), '', 'construction meta-language inside the envelope must be rejected');

assert.equal(instantAnswer('How are you?'), "I'm doing well, thank you. How are you?", 'the screenshot question must answer instantly without model inference');
assert.equal(instantAnswer('Hello'), 'Hello.');
assert.equal(instantAnswer('What is two plus two?'), 'Four.');
assert.equal(instantAnswer('What is 12 divided by 3?'), 'Four.');
assert.equal(instantAnswer('Explain quantum entanglement'), '', 'substantive questions must continue to the model');

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; }
  };
}

async function invokeVoice(body) {
  const res = mockResponse();
  await voiceHandler({ method: 'POST', headers: { host: 'dream-unity-voice-live.vercel.app' }, body }, res);
  return res;
}

const originalFetch = globalThis.fetch;
const originalLog = console.log;
const originalError = console.error;
try {
  let providerCalls = 0;
  globalThis.fetch = async (_url, options) => {
    providerCalls += 1;
    const request = JSON.parse(options.body);
    const system = request.messages.find(item => item.role === 'system')?.content || '';
    const requestNonce = system.match(/<<UNITY_PUBLIC:([a-f0-9]{16})>>/)?.[1];
    const content = providerCalls === 1
      ? `<<UNITY_PUBLIC:${requestNonce}>>${leakedPlanning}<<END_UNITY_PUBLIC:${requestNonce}>>`
      : `<<UNITY_PUBLIC:${requestNonce}>>A clean fallback answer.<<END_UNITY_PUBLIC:${requestNonce}>>`;
    return { ok: true, status: 200, json: async () => ({ model: request.model, choices: [{ message: { content } }] }) };
  };
  console.log = () => {};
  console.error = () => {};

  const instantResponse = await invokeVoice({ message: 'How are you?', history: [], locale: 'en-AU' });
  assert.equal(instantResponse.statusCode, 200);
  assert.equal(instantResponse.body.path, 'instant');
  assert.equal(providerCalls, 0, 'instant turns must make zero provider calls');

  const fallbackResponse = await invokeVoice({ message: 'Explain why leaves are green.', history: [], locale: 'en-AU' });
  assert.equal(fallbackResponse.statusCode, 200);
  assert.equal(fallbackResponse.body.text, 'A clean fallback answer.');
  assert.equal(fallbackResponse.body.attemptCount, 2, 'unsafe primary output must use exactly one fallback');
  assert.equal(providerCalls, 2);

  providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return { ok: false, status: 429, json: async () => ({ error: 'capacity' }) };
  };
  const busyResponse = await invokeVoice({ message: 'Explain gravity.', history: [], locale: 'en-AU' });
  assert.equal(busyResponse.statusCode, 503);
  assert.equal(busyResponse.body.code, 'VOICE_BACKENDS_BUSY');
  assert.equal(providerCalls, 1, 'a provider-wide 429 must not rotate models or multiply traffic');
} finally {
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  console.error = originalError;
}
assert.match(api, /credentialMode: 'none'/, 'backend must require no provider credential');
assert.match(api, /speechMode: 'browser-native'/, 'backend health must describe browser-native speech mode');
assert.doesNotMatch(api, /RATE_LIMIT|RATE_WINDOW|rateBuckets|rateLimited/, 'backend must not impose an application voice-turn limit');
assert.match(api, /applicationRateLimit: 'none'/, 'backend health must report that the application limiter is disabled');
assert.match(api, /responseStrategy: 'instant-local-or-eight-second-bounded-failover'/, 'backend health must expose the bounded low-latency strategy');
assert.doesNotMatch(voice, /briefly rate-limited/, 'voice UI must not strand visitors on a rate-limit message');
assert.match(api, /https:\/\/dream-unity\.github\.io/, 'backend must allow the GitHub Pages origin');
assert.doesNotMatch(api, /process\.env\.|OPENAI_API_KEY|AI_GATEWAY_API_KEY/, 'voice backend must not require environment secrets');

assert.equal(pkg.dependencies, undefined, 'static Dream Unity package must remain production-dependency free');
assert.deepEqual(Object.keys(pkg.devDependencies || {}), ['playwright'], 'zero-key voice must add no runtime or voice build dependencies');
assert.match(css, /\.du-unity-oracle/, 'Unity Oracle must expose a central accessible hit target');
assert.match(css, /width:clamp\(122px,16vmin,156px\)/, 'Unity must expose a real, generously sized hit target');
assert.match(css, /\.du-oracle-invite/, 'Unity must carry its talk affordance inside the centrepiece');
assert.match(css, /\.du-voice-panel\.arrival/, 'arrival greeting must be visually anchored to Unity');
assert.match(css, /#app\.detail>\.du-voice-panel/, 'voice transcript must hide away from the overview');
assert.match(visual, /oracleState=app&&app\.dataset/, 'Unity core must receive live voice state');
assert.match(visual, /Projected sound shells/, 'Unity core must visibly broadcast voice');
assert.match(visual, /glassy oracle iris/, 'Unity core must visibly articulate without losing its identity');
assert.match(visual, /drawOrbitStage\(false\)[\s\S]*drawOrbitStage\(true\)/, 'Unity orbits must occlude around the core for real depth');

console.log('Dream Unity central Unity Oracle voice checks passed.');
