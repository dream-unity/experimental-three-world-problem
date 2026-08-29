import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);

function read(relativePath) {
  const url = new URL(relativePath, root);
  assert.ok(fs.existsSync(url), `${relativePath} must exist`);
  return fs.readFileSync(url, 'utf8');
}

function assertAny(value, patterns, message) {
  assert.ok(patterns.some(pattern => pattern.test(value)), message);
}

const index = read('index.html');
const voice = read('voice.js');
const css = read('voice.css');
const siteCss = read('styles.css');
const api = read('api/realtime-session.js');
const visual = read('visual-parts/remembered-tomorrow-10.txt');
const combinedBrowser = `${index}\n${voice}\n${css}`;

// The owned core is the only primary launcher, and it remains keyboard/screen-reader usable.
const unityLauncher = index.match(/<button\b(?=[^>]*\bid=["']unityLabel["'])(?=[^>]*\bdata-voice-launcher\b)[^>]*>/i)?.[0] || '';
assert.ok(unityLauncher, 'the central Unity core must be a button marked data-voice-launcher');
assert.match(unityLauncher, /aria-label=["'][^"']+(?:Unity|speak|talk|voice)[^"']*["']/i, 'the Unity launcher must have an informative accessible name');
assert.match(unityLauncher, /aria-controls=["']duVoicePanel["']/i, 'the Unity launcher must identify the panel it controls');
assert.match(unityLauncher, /aria-expanded=["']false["']/i, 'the Unity launcher must expose its initial collapsed state');
assert.match(index, /<(?:section|aside|dialog)\b(?=[^>]*\bid=["']duVoicePanel["'])(?=[^>]*\baria-label=)[^>]*>/i, 'the page must include an accessible Unity voice panel');
assert.match(index, /voice\.css(?:\?[^"']*)?["']/i, 'the page must load voice styles');
assert.match(index, /voice\.js(?:\?[^"']*)?["']/i, 'the page must load the voice runtime');
assert.match(
  index,
  /<meta\b(?=[^>]*\bname=["']viewport["'])(?=[^>]*\bcontent=["'][^"']*interactive-widget=resizes-content[^"']*["'])[^>]*>/i,
  'the mobile viewport must resize around the software keyboard so replies remain visible'
);

// Typing is a first-class fallback when speech recognition is absent or unwanted.
const textControl = index.match(/<(?:input|textarea)\b(?=[^>]*\bid=["']duVoiceInput["'])[^>]*>/i)?.[0] || '';
assert.ok(textControl, 'the voice panel must include a text input fallback');
assert.ok(
  /aria-label=["'][^"']+["']/i.test(textControl)
    || /aria-labelledby=["'][^"']+["']/i.test(textControl)
    || /<label\b[^>]*for=["']duVoiceInput["']/i.test(index),
  'the text input fallback must have an accessible name'
);
assert.match(index, /<form\b[^>]*\bid=["']duVoiceForm["'][^>]*>/i, 'typed questions must use a semantic form');
assert.match(index, /<button\b(?=[^>]*\btype=["']submit["'])[^>]*>[\s\S]{0,120}(?:send|ask)/i, 'the text form must expose a submit button');
assert.match(index, /aria-live=["'](?:polite|assertive)["']/i, 'voice state or transcript changes must be announced accessibly');
assert.match(voice, /(?:duVoiceForm|getElementById\(["']duVoiceForm["']\)|querySelector\(["']#duVoiceForm["']\))/, 'the runtime must bind the typed-question form');
assert.match(voice, /addEventListener\(["']submit["']/, 'the typed-question form must be wired to the assistant turn flow');
assert.match(voice, /textInput\?\.addEventListener\(["']compositionend["']\s*,\s*syncControls\)/, 'IME-composed text must refresh the send controls when composition ends');

// Voice presence: the exact approved introduction, browser-native ears, and a British voice preference.
assert.match(
  voice,
  /ARRIVAL_GREETING\s*=\s*["']Hello, my name is Unity\. What dream would you like to unify\?["']/,
  'Unity must greet arrivals with the exact approved wording'
);
assert.match(voice, /(?:window\.)?SpeechRecognition\s*\|\|\s*(?:window\.)?webkitSpeechRecognition/, 'Unity must support the standard and prefixed SpeechRecognition APIs');
assert.match(voice, /speechSynthesis/, 'Unity must use browser-native speech synthesis');
assert.match(voice, /SpeechSynthesisUtterance/, 'Unity must synthesize its replies');
assert.match(voice, /speechSynthesis[\s\S]{0,24}getVoices(?:\?\.)?\(\)/, 'Unity must inspect installed voices instead of accepting an arbitrary default');
assert.match(voice, /en-GB/i, 'Unity must prefer British English speech');
assertAny(
  voice,
  [
    /Google UK English Male/i,
    /Microsoft (?:Ryan|George|Arthur|Oliver)/i,
    /\bDaniel\b/i,
    /(?:British|UK|en-GB)[\s\S]{0,180}(?:male|Daniel|Ryan|George|Arthur|Oliver)/i
  ],
  'Unity must rank at least one recognisable British male voice where the browser provides it'
);
assert.match(
  voice,
  /recognitionStartTimer\s*=\s*window\.setTimeout\([\s\S]{0,900}?MICROPHONE DID NOT START · TEXT READY[\s\S]{0,600}?,\s*3_500\s*\)/,
  'native speech recognition must have a bounded startup watchdog with a visible text fallback'
);
assert.match(
  voice,
  /bounded\(streamRequest\s*,\s*8_000\s*,\s*["']Microphone permission["']\)/,
  'microphone permission requests must time out instead of leaving the interface inert'
);
assert.match(
  voice,
  /function startVoiceActivityDetection\([^)]+\)[\s\S]{0,1800}?createAnalyser\(\)[\s\S]{0,1800}?getByteTimeDomainData\([^)]+\)/,
  'recorded-audio listening must analyse live microphone levels for automatic voice activity detection'
);
assert.match(
  voice,
  /heardSpeech[\s\S]{0,500}?now\s*-\s*silenceStartedAt\s*>=\s*1_050[\s\S]{0,180}?stopEnhancedRecording\(\)/,
  'recorded-audio listening must stop automatically after speech is followed by a short silence'
);

// Neural Unity uses a stable British voice route, a bounded fallback, and a low-latency answer model.
assert.match(
  voice,
  /UNITY_NEURAL_VOICE\s*=\s*Object\.freeze\(\{[\s\S]{0,500}?provider:\s*["']elevenlabs["'][\s\S]{0,500}?model:\s*["']eleven_multilingual_v2["'][\s\S]{0,500}?voice:\s*["']onwK4e9ZLuTAKqWW03F9["']/,
  'the primary neural voice must be ElevenLabs Daniel'
);
assert.match(
  voice,
  /UNITY_NEURAL_FALLBACK\s*=\s*Object\.freeze\(\{[\s\S]{0,500}?provider:\s*["']openai["'][\s\S]{0,500}?model:\s*["']gpt-4o-mini-tts["'][\s\S]{0,500}?voice:\s*["']onyx["']/,
  'the neural voice fallback must use OpenAI Onyx'
);
assert.match(
  voice,
  /window\.puter\.ai\.chat\([\s\S]{0,500}?model:\s*["']openai\/gpt-5\.6-luna["'][\s\S]{0,300}?reasoning_effort:\s*["']none["'][\s\S]{0,300}?verbosity:\s*["']low["'][\s\S]{0,300}?max_tokens:\s*512/,
  'Neural Unity must use Luna with reasoning disabled, low verbosity, and enough output tokens for a visible answer'
);
assert.match(voice, /["']PLAY REPLY["']/, 'blocked neural autoplay must expose a direct Play Reply control');
assert.match(
  index,
  /NEURAL MODE USES AN AI-GENERATED VOICE/i,
  'the interface must disclose that Neural Unity speech is AI-generated'
);

// Provider credentials stay server-side. The static page must never contain a usable key.
assert.doesNotMatch(combinedBrowser, /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{12,}\b/, 'browser assets must not embed an API key');
assert.doesNotMatch(voice, /OPENAI_API_KEY|AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN|Authorization\s*:/, 'browser voice must not read or transmit provider credentials');
assert.doesNotMatch(voice, /api\.openai\.com|ai-gateway\.vercel\.sh|blockrun\.ai/i, 'the browser must talk only to the dedicated Dream Unity backend');

// Compatible desktop browsers may answer with an already-installed local model,
// but the site must never trigger a large background model download implicitly.
assert.match(voice, /window\.LanguageModel/, 'Unity should feature-detect the browser Prompt API');
assert.match(voice, /LanguageModel\.availability\(/, 'Unity must check on-device model availability before use');
assert.match(voice, /\[['"]available['"],\s*['"]readily['"]\]\.includes\(availability\)/, 'Unity must use only an already-ready on-device model');
assert.match(voice, /path:\s*['"]on-device['"]/, 'on-device answers must expose a diagnostic response path');

// Speaking temporarily ducks the existing score, then restores the visitor's prior choice/level.
assert.match(voice, /getElementById\(["']scoreAudio["']\)|querySelector\(["']#scoreAudio["']\)/, 'voice must integrate with the existing score audio element');
assertAny(voice, [/duckScore/i, /scoreDuck/i, /duck(?:ing|ed)?\s*(?:the\s*)?score/i], 'voice must implement score ducking');
assert.match(voice, /\.volume\b|volume\s*:/, 'score ducking must operate on the score level');
assertAny(voice, [/restoreScore/i, /releaseScore/i, /unduck/i, /priorScore/i, /previousVolume/i, /scoreVolume/i], 'voice must restore the score after speaking');
const duckScoreBody = voice.match(/function duckScore\(shouldDuck\)\s*\{([\s\S]*?)\n\s*\}\n\n\s*function restoreScore/)?.[1] || '';
assert.match(duckScoreBody, /scoreAudio\.volume\s*=\s*0/, 'score ducking must silence by volume so playback position is preserved');
assert.doesNotMatch(duckScoreBody, /\.(?:pause|play)\s*\(/, 'score ducking must not pause or restart the soundtrack');

// The console stays inside the viewport on desktop, while short mobile viewports may shrink the app safely.
const desktopPanelRule = css.match(/\.du-voice-panel\s*\{(?=[^}]*position:\s*absolute)([^}]*)\}/)?.[1] || '';
assert.match(desktopPanelRule, /bottom:\s*max\(12px,\s*env\(safe-area-inset-bottom\)\)/, 'the desktop voice panel must be bottom-bounded above the safe area');
assert.match(desktopPanelRule, /max-height:\s*min\(560px,\s*calc\(100dvh\s*-\s*max\(24px,\s*env\(safe-area-inset-bottom\)\)\)\)/, 'the desktop voice panel must fit within the dynamic viewport height');
assert.match(siteCss, /#app\s*\{[^}]*min-height:\s*min\(480px,\s*100dvh\)/, 'the app minimum height must yield to short mobile and keyboard-resized viewports');

// Authorization cannot be started twice or speak a stale preview over a newer visitor turn.
assert.match(voice, /enhancedButton\.disabled\s*=\s*busy\s*\|\|\s*Boolean\(enhancedConnectPromise\)/, 'Neural Unity activation must be disabled while authorization or another turn is pending');
assert.match(
  voice,
  /const connected\s*=\s*await connectEnhanced\(\);[\s\S]{0,500}?previewRequest\s*===\s*enhancedPreviewSequence[\s\S]{0,200}?previewTurn\s*===\s*turnSequence[\s\S]{0,200}?&&\s*!busy/,
  'a completed authorization may preview speech only when its request and turn are still current'
);

// Spoken navigation is deliberately allowlisted to Dream Unity's three worlds and nine games.
assertAny(voice, [/(?:SITE|LOCAL|VOICE)_COMMANDS?/, /(?:WORLD|GAME)_COMMANDS?/, /(?:COMMAND|WORLD|GAME)_TARGETS?/, /LOCAL_ACTIONS?/, /commandMap/i], 'local site actions must be driven by an explicit command map');
for (const world of ['machine', 'maker', 'reality']) {
  assert.match(voice, new RegExp(`(?:['\"]${world}['\"]|\\b${world}\\s*:)`, 'i'), `local commands must recognise the ${world} world`);
}
for (const game of ['perceive', 'model', 'predict', 'intend', 'act', 'become', 'matter', 'structure', 'emerge']) {
  assert.match(voice, new RegExp(`(?:['\"]${game}['\"]|\\b${game}\\s*:)`, 'i'), `local commands must recognise the ${game} game`);
}
assert.match(voice, /new CustomEvent\(["']dreamunity:launch-game["']\s*,\s*\{\s*detail\s*:/, 'game commands must use the established Dream Unity launch event');
assertAny(voice, [/#gameBack/, /getElementById\(["']gameBack["']\)/], 'Unity must be able to return from an active game');
assert.doesNotMatch(voice, /\beval\s*\(|\bnew Function\s*\(/, 'voice commands must never execute generated code');
assert.doesNotMatch(voice, /(?:location|window\.location)\s*=|location\.(?:assign|replace)\s*\(/, 'voice commands must not navigate to arbitrary URLs');
assert.match(voice, /local-strategy/, 'Unity must keep an instant strategic-planning fallback when model capacity is unavailable');
assert.match(voice, /session-memory/, 'Unity must expose bounded short-session recall commands');

// The visual system receives a small explicit state machine for listening/thinking/speaking.
assert.match(voice, /dataset\.voiceState\s*=/, 'the voice runtime must publish state on the app dataset');
for (const state of ['idle', 'listening', 'thinking', 'speaking']) {
  assert.match(voice, new RegExp(`['\"]${state}['\"]`), `the voice state machine must include ${state}`);
}
assert.match(visual, /dataset(?:\?\.)?\.voiceState|dataset\[['\"]voiceState['\"]\]/, 'the Unity renderer must read the live voice state');
for (const state of ['listening', 'thinking', 'speaking']) {
  assert.match(visual, new RegExp(state, 'i'), `the Unity renderer must react to ${state}`);
}
assertAny(visual, [/Projected sound shells/i, /sound shells/i, /voice shells/i, /broadcast shells/i], 'the Unity core must visibly project voice shells');
assert.match(visual, /\b(?:arc|ellipse)\s*\(/, 'the projected voice treatment must be drawn as layered curved geometry');

// The server uses a bounded, layered route: Vercel AI Gateway, Blockrun, then public Wikipedia grounding.
assertAny(api, [/@ai-sdk\/gateway/i, /ai-gateway\.vercel\.sh/i, /\bgateway\s*\(/i, /generateText\s*\(/], 'the backend must use Vercel AI Gateway as its primary inference route');
assert.match(api, /https:\/\/blockrun\.ai\/api\/v1\/chat\/completions/i, 'the backend must retain the zero-key Blockrun model fallback');
assert.match(api, /wikipedia\.org/i, 'the backend must retain a public Wikipedia knowledge fallback');
assertAny(api, [/fallback/i, /PROVIDER_ROUTES?/i, /answerWithGateway[\s\S]{0,8000}answerWithBlockrun/i], 'the backend must make provider fallback explicit');
assertAny(api, [/AbortController/, /AbortSignal\.timeout/, /Promise\.race\s*\(/], 'every upstream request must have a hard abort or race deadline');
assert.match(api, /(?:TIMEOUT|BUDGET|DEADLINE)/, 'the backend must name and document its latency ceiling in code');
assert.match(api, /setTimeout\s*\(|AbortSignal\.timeout\s*\(/, 'the latency ceiling must be actively enforced');

// CORS is restricted to the deployed front end, inputs/history are bounded, and model internals are filtered.
assert.match(api, /Access-Control-Allow-Origin/, 'the backend must set an explicit CORS origin');
assert.match(api, /https:\/\/dream-unity\.github\.io/i, 'the deployed GitHub Pages origin must be allowlisted');
assert.match(api, /Access-Control-Allow-Methods/, 'the backend must publish its allowed methods');
assert.match(api, /Access-Control-Allow-Headers/, 'the backend must publish its allowed headers');
assertAny(api, [/sanitizeHistory/i, /cleanHistory/i, /normaliseHistory/i, /normalizeHistory/i], 'conversation history must pass through a dedicated sanitizer');
assertAny(api, [/publicAnswer/i, /sanitizePublicAnswer/i, /extractPublicAnswer/i], 'model output must pass through a public-answer sanitizer');
assert.match(api, /\.slice\s*\(\s*0\s*,\s*(?:[A-Z_][A-Z_0-9]*|\d[\d_]*)\s*\)|\.slice\s*\(\s*-(?:[A-Z_][A-Z_0-9]*|\d[\d_]*)\s*\)/, 'messages or history must have a fixed size bound');
assert.doesNotMatch(api, /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{12,}\b/, 'the backend source must not contain a hard-coded provider key');
assert.doesNotMatch(api, /console\.(?:log|info|error|warn)\s*\([^\n]*(?:process\.env|authorization|api[_-]?key|oidc[_-]?token)/i, 'backend logs must not expose credentials');
assert.doesNotMatch(api, /\.json\s*\(\s*\{[^}]{0,500}(?:apiKey|api_key|accessToken|access_token|oidcToken|oidc_token)\s*:/i, 'backend responses must not expose credentials');

// Keep the historical output-envelope protection as a pure, deterministic regression test.
const apiModule = await import(new URL('api/realtime-session.js', root));
const publicAnswer = apiModule.publicAnswer
  || apiModule.sanitizePublicAnswer
  || apiModule.extractPublicAnswer;
assert.equal(typeof publicAnswer, 'function', 'the backend must export its public-answer sanitizer for deterministic testing');

const nonce = '0123456789abcdef';
const wrap = answer => `<<UNITY_PUBLIC:${nonce}>>\n${answer}\n<<END_UNITY_PUBLIC:${nonce}>>`;
const cleanAnswer = publicAnswer(wrap('A concise visitor-facing answer.'), nonce);
assert.equal(cleanAnswer, 'A concise visitor-facing answer.', 'a valid public answer envelope must survive unchanged');

const planningLeak = "I should answer naturally. The response should be visitor-facing only. Here is my hidden reasoning.";
assert.equal(publicAnswer(planningLeak, nonce), '', 'unenveloped model planning must never reach speech');
assert.equal(publicAnswer(`<think>private chain of thought</think>\n${wrap('The public answer.')}`, nonce), 'The public answer.', 'private text outside the public envelope must be discarded');
assert.equal(
  publicAnswer(`Planning repeated ${wrap('an example, not the answer')}\n${wrap('The final public answer.')}`, nonce),
  'The final public answer.',
  'only the final complete nonce-bound envelope may reach speech'
);
assert.equal(publicAnswer(wrap('<think>private chain of thought</think>The public answer.'), nonce), '', 'private reasoning inside the public envelope must be rejected');
assert.equal(publicAnswer(wrap('The public answer.'), 'fedcba9876543210'), '', 'a response bearing the wrong request nonce must be rejected');
assert.equal(publicAnswer(`<<UNITY_PUBLIC:${nonce}>>The public answer.`, nonce), '', 'an unclosed public envelope must be rejected');

console.log('Dream Unity Jarvis-class voice contract passed.');
