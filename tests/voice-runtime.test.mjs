import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const voiceSource = fs.readFileSync(new URL('voice.js', root), 'utf8');

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.defaultPrevented = false;
    Object.assign(this, init);
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

class FakeEventTarget {
  #listeners = new Map();

  addEventListener(type, listener, options = {}) {
    if (typeof listener !== 'function') return;
    const listeners = this.#listeners.get(type) || [];
    listeners.push({ listener, once: Boolean(options?.once) });
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.#listeners.get(type) || [];
    this.#listeners.set(type, listeners.filter((entry) => entry.listener !== listener));
  }

  dispatchEvent(event) {
    const value = typeof event === 'string' ? new FakeEvent(event) : event;
    if (!value?.type) throw new TypeError('An event type is required.');
    value.target ||= this;
    value.currentTarget = this;
    const listeners = [...(this.#listeners.get(value.type) || [])];
    for (const entry of listeners) {
      entry.listener.call(this, value);
      if (entry.once) this.removeEventListener(value.type, entry.listener);
    }
    return !value.defaultPrevented;
  }
}

class FakeClassList {
  #values = new Set();

  add(...values) {
    values.forEach((value) => this.#values.add(value));
  }

  remove(...values) {
    values.forEach((value) => this.#values.delete(value));
  }

  contains(value) {
    return this.#values.has(value);
  }

  toggle(value, force) {
    const enabled = force === undefined ? !this.contains(value) : Boolean(force);
    if (enabled) this.add(value);
    else this.remove(value);
    return enabled;
  }
}

class FakeElement extends FakeEventTarget {
  constructor(id = '') {
    super();
    this.id = id;
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.dataset = {};
    this.disabled = false;
    this.muted = false;
    this.paused = true;
    this.textContent = '';
    this.value = '';
    this.volume = 1;
    this.focusCalls = [];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  click() {
    this.dispatchEvent(new FakeEvent('click'));
  }

  focus(options) {
    this.focusCalls.push(options);
  }
}

class FakeDocument extends FakeEventTarget {
  constructor(elements) {
    super();
    this.appendedScripts = [];
    this.body = new FakeElement('body');
    this.head = {
      append: (element) => {
        this.appendedScripts.push(element);
        this.onScriptAppend?.(element);
      },
    };
    this.onScriptAppend = null;
    this.visibilityState = 'hidden';
    this.elements = elements;
  }

  createElement(tagName) {
    const element = new FakeElement();
    element.tagName = String(tagName || '').toUpperCase();
    return element;
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  querySelector(selector) {
    if (selector === '[data-voice-launcher]') return this.elements.get('unityLabel') || null;
    if (selector.startsWith('#')) return this.getElementById(selector.slice(1));
    return null;
  }
}

class FakeSpeechSynthesis extends FakeEventTarget {
  constructor({ speakFailure = null, voices = [] } = {}) {
    super();
    this.speakFailure = speakFailure;
    this.spoken = [];
    this.voices = voices;
  }

  cancel() {}

  getVoices() {
    return [...this.voices];
  }

  setVoices(voices) {
    this.voices = [...voices];
    this.dispatchEvent(new FakeEvent('voiceschanged'));
  }

  speak(utterance) {
    if (this.speakFailure) throw this.speakFailure;
    this.spoken.push(utterance);
    queueMicrotask(() => {
      utterance.onstart?.();
      utterance.onend?.();
    });
  }
}

class FakeUtterance {
  constructor(text) {
    this.text = text;
    this.lang = '';
    this.voice = null;
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.onend = null;
    this.onerror = null;
    this.onstart = null;
  }
}

const DEFAULT_VOICES = [
  {
    name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)',
    lang: 'en-GB',
    localService: false,
  },
];

function createRecognition({ startFailure = null, emitStart = true } = {}) {
  const instances = [];
  class FakeRecognition {
    constructor() {
      instances.push(this);
      this.continuous = false;
      this.interimResults = false;
      this.lang = '';
      this.maxAlternatives = 1;
      this.onend = null;
      this.onerror = null;
      this.onresult = null;
      this.onspeechend = null;
      this.onstart = null;
    }

    abort() {}

    start() {
      if (startFailure) throw startFailure;
      if (emitStart) queueMicrotask(() => this.onstart?.());
    }

    stop() {
      queueMicrotask(() => this.onend?.());
    }
  }
  return { Recognition: FakeRecognition, instances };
}

function createMediaRecorder({ emitData = true } = {}) {
  const instances = [];
  class FakeMediaRecorder {
    constructor(stream) {
      this.stream = stream;
      this.state = 'inactive';
      this.ondataavailable = null;
      this.onerror = null;
      this.onstop = null;
      instances.push(this);
    }

    start() {
      this.state = 'recording';
    }

    stop() {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      if (emitData) this.ondataavailable?.({ data: new Blob(['unity-voice'], { type: 'audio/webm' }) });
      this.onstop?.();
    }
  }
  return { MediaRecorder: FakeMediaRecorder, instances };
}

function createElements() {
  return new Map([
    ['app', new FakeElement('app')],
    ['unityLabel', new FakeElement('unityLabel')],
    ['duVoicePanel', new FakeElement('duVoicePanel')],
    ['duVoiceClose', new FakeElement('duVoiceClose')],
    ['duVoiceAction', new FakeElement('duVoiceAction')],
    ['duVoiceStatus', new FakeElement('duVoiceStatus')],
    ['duVoiceTranscript', new FakeElement('duVoiceTranscript')],
    ['duOracleInvite', new FakeElement('duOracleInvite')],
    ['duVoiceInput', new FakeElement('duVoiceInput')],
    ['duVoiceSend', new FakeElement('duVoiceSend')],
    ['duVoiceForm', new FakeElement('duVoiceForm')],
    ['duVoicePreview', new FakeElement('duVoicePreview')],
    ['duEnhancedButton', new FakeElement('duEnhancedButton')],
    ['duEnhancedHint', new FakeElement('duEnhancedHint')],
    ['scoreAudio', new FakeElement('scoreAudio')],
  ]);
}

let activeHarness = null;

function createHarness({
  AudioContext,
  fetchImpl,
  MediaRecorder,
  mediaDevices,
  puter,
  puterOnLoad,
  recognition,
  speakFailure = null,
  voices = DEFAULT_VOICES,
} = {}) {
  const elements = createElements();
  const document = new FakeDocument(elements);
  const speechSynthesis = new FakeSpeechSynthesis({ speakFailure, voices });
  const windowEvents = new FakeEventTarget();
  const logs = [];

  const browserSetTimeout = (callback, delay, ...args) => {
    const timer = setTimeout(callback, delay, ...args);
    timer.unref?.();
    return timer;
  };

  const sandbox = {
    AbortController,
    Blob,
    CustomEvent: FakeEvent,
    Date,
    DOMException,
    HTMLElement: FakeElement,
    Intl,
    SpeechSynthesisUtterance: FakeUtterance,
    URL,
    URLSearchParams,
    clearTimeout,
    console: {
      error: (...args) => logs.push(['error', ...args]),
      info: (...args) => logs.push(['info', ...args]),
      log: (...args) => logs.push(['log', ...args]),
      warn: (...args) => logs.push(['warn', ...args]),
    },
    document,
    fetch: fetchImpl || (async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })),
    navigator: { language: 'en-GB', ...(mediaDevices ? { mediaDevices } : {}) },
    performance,
    queueMicrotask,
    setTimeout: browserSetTimeout,
    speechSynthesis,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = windowEvents.addEventListener.bind(windowEvents);
  sandbox.removeEventListener = windowEvents.removeEventListener.bind(windowEvents);
  sandbox.dispatchEvent = windowEvents.dispatchEvent.bind(windowEvents);
  if (MediaRecorder) sandbox.MediaRecorder = MediaRecorder;
  if (AudioContext) sandbox.AudioContext = AudioContext;
  if (puter) sandbox.puter = puter;
  if (recognition?.Recognition) sandbox.SpeechRecognition = recognition.Recognition;
  document.onScriptAppend = (script) => {
    queueMicrotask(() => {
      if (puterOnLoad) {
        sandbox.puter = puterOnLoad;
        script.onload?.();
      } else {
        script.onerror?.();
      }
    });
  };

  vm.createContext(sandbox);
  vm.runInContext(voiceSource, sandbox, { filename: 'voice.js' });

  const harness = {
    document,
    elements,
    logs,
    recognition,
    speechSynthesis,
    window: sandbox,
    cleanup() {
      sandbox.dispatchEvent(new FakeEvent('pagehide'));
    },
  };
  activeHarness = harness;
  return harness;
}

function event(type, init = {}) {
  return new FakeEvent(type, init);
}

function finalRecognitionEvent(text) {
  const result = [{ transcript: text }];
  result.isFinal = true;
  return { resultIndex: 0, results: [result] };
}

function interimRecognitionEvent(text) {
  const result = [{ transcript: text }];
  result.isFinal = false;
  return { resultIndex: 0, results: [result] };
}

async function waitFor(predicate, message, timeout = 700) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(predicate(), message);
}

function enterText(harness, value) {
  const input = harness.elements.get('duVoiceInput');
  input.value = value;
  input.dispatchEvent(event('input'));
  return input;
}

const failures = [];
let passed = 0;
const unhandledRejections = [];
const recordUnhandledRejection = (reason) => unhandledRejections.push(reason);
process.on('unhandledRejection', recordUnhandledRejection);

async function run(name, test) {
  activeHarness = null;
  try {
    await test();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL ${name}\n${error.stack || error}`);
  } finally {
    activeHarness?.cleanup?.();
    activeHarness = null;
  }
}

await run('typed form submission and SEND both produce visible local replies', async () => {
  const harness = createHarness();
  const form = harness.elements.get('duVoiceForm');
  const send = harness.elements.get('duVoiceSend');
  const status = harness.elements.get('duVoiceStatus');
  const transcript = harness.elements.get('duVoiceTranscript');

  enterText(harness, 'hello');
  assert.equal(send.disabled, false, 'typing should enable SEND');
  const submit = event('submit');
  form.dispatchEvent(submit);
  assert.equal(submit.defaultPrevented, true, 'the runtime must own the semantic form submit');
  await waitFor(() => transcript.textContent === 'Hello. I am ready.', 'form submission did not produce its local reply');
  await waitFor(() => status.textContent === 'READY FOR TEXT', 'form submission did not return to text-ready state');
  assert.equal(harness.elements.get('duVoiceInput').value, '', 'a submitted message should clear the composer');
  assert.equal(harness.speechSynthesis.spoken.at(-1)?.text, 'Hello. I am ready.');

  enterText(harness, 'where am i');
  assert.equal(send.disabled, false, 'the composer should unlock after the first reply');
  send.click();
  await waitFor(
    () => transcript.textContent === 'You are at the Unity core, where the three worlds meet.',
    'the SEND click path did not produce its local reply'
  );
  return harness;
});

await run('an active text-only launcher click visibly restores and focuses text mode', async () => {
  const harness = createHarness();
  const launcher = harness.elements.get('unityLabel');
  const panel = harness.elements.get('duVoicePanel');
  const input = harness.elements.get('duVoiceInput');
  const status = harness.elements.get('duVoiceStatus');
  const transcript = harness.elements.get('duVoiceTranscript');

  launcher.click();
  await waitFor(() => status.textContent === 'TEXT MODE READY', 'the first launcher click did not open text mode');
  enterText(harness, 'unfinished thought');
  transcript.textContent = 'sentinel that the active launcher must replace';

  launcher.click();
  assert.equal(panel.getAttribute('aria-hidden'), 'false');
  assert.equal(status.textContent, 'TEXT MODE READY');
  assert.match(transcript.textContent, /browser does not expose speech recognition.*text mode/i);
  assert.equal(input.value, 'unfinished thought', 'returning to text mode should retain the draft');
  assert.equal(input.focusCalls.length, 1, 'the active text-only launcher did not focus the composer');
  assert.equal(input.focusCalls[0]?.preventScroll, true);
  return harness;
});

await run('a synchronous recognition start failure visibly falls back to text', async () => {
  const startFailure = new DOMException('Recognition could not start.', 'NotAllowedError');
  const recognition = createRecognition({ startFailure });
  const harness = createHarness({ recognition });
  const launcher = harness.elements.get('unityLabel');
  const status = harness.elements.get('duVoiceStatus');
  const transcript = harness.elements.get('duVoiceTranscript');

  launcher.click();
  await waitFor(
    () => status.textContent === 'TEXT MODE READY',
    'recognition start failure did not enter visible text mode',
    400
  );
  assert.match(
    transcript.textContent,
    /speech recognition did not start.*text input is ready|(?:microphone|listening).*(?:type|text)|type.*(?:microphone|listening)/i
  );
  assert.ok(recognition.instances.length >= 1, 'the launcher did not attempt to start recognition');

  enterText(harness, 'hello');
  harness.elements.get('duVoiceForm').dispatchEvent(event('submit'));
  await waitFor(() => transcript.textContent === 'Hello. I am ready.', 'text fallback was not usable after recognition failed');
  return harness;
});

await run('recognition that never starts is bounded by a visible text-ready watchdog', async () => {
  const recognition = createRecognition({ emitStart: false });
  const harness = createHarness({ recognition });
  const status = harness.elements.get('duVoiceStatus');
  const transcript = harness.elements.get('duVoiceTranscript');

  harness.elements.get('unityLabel').click();
  await waitFor(
    () => status.textContent === 'MICROPHONE DID NOT START · TEXT READY',
    'silent browser recognition was not recovered by the start watchdog',
    3_900
  );
  assert.match(transcript.textContent, /did not start speech recognition.*Type below/i);

  enterText(harness, 'hello');
  harness.elements.get('duVoiceForm').dispatchEvent(event('submit'));
  await waitFor(() => transcript.textContent === 'Hello. I am ready.', 'text was not usable after the recognition watchdog');
  await waitFor(() => status.textContent === 'READY FOR TEXT', 'watchdog recovery did not return to text-ready state');
  return harness;
});

await run('the final interim transcript is submitted when recognition ends', async () => {
  const recognition = createRecognition();
  const harness = createHarness({ recognition });
  const status = harness.elements.get('duVoiceStatus');
  const transcript = harness.elements.get('duVoiceTranscript');

  harness.elements.get('unityLabel').click();
  await waitFor(() => status.textContent === 'LISTENING', 'native recognition never entered listening state');
  const instance = recognition.instances.at(-1);
  instance.onresult(interimRecognitionEvent('hello'));
  assert.equal(transcript.textContent, 'hello');
  instance.onend();

  await waitFor(() => transcript.textContent === 'Hello. I am ready.', 'the last interim transcript was discarded on end');
  await waitFor(() => status.textContent === 'READY FOR TEXT', 'interim finalisation did not finish the turn');
  return harness;
});

await run('a synchronous speech synthesis exception cannot lock the text composer', async () => {
  const unhandledAtStart = unhandledRejections.length;
  const speakFailure = new DOMException('Speech output is blocked.', 'NotAllowedError');
  const harness = createHarness({ speakFailure });
  const transcript = harness.elements.get('duVoiceTranscript');
  const send = harness.elements.get('duVoiceSend');

  enterText(harness, 'hello');
  harness.elements.get('duVoiceForm').dispatchEvent(event('submit'));
  await waitFor(() => transcript.textContent === 'Hello. I am ready.', 'the textual answer should survive speech output failure');
  await new Promise((resolve) => setTimeout(resolve, 20));
  enterText(harness, 'where am i');
  assert.equal(send.disabled, false, 'speech output failure left the composer busy-locked');
  assert.notEqual(harness.document.body.dataset.voiceState, 'speaking', 'speech output failure left Unity in speaking state');
  assert.equal(unhandledRejections.length, unhandledAtStart, 'speech output failure escaped as an unhandled rejection');

  send.click();
  await waitFor(
    () => transcript.textContent === 'You are at the Unity core, where the three worlds meet.',
    'a second typed turn did not work after speech output failed'
  );
  return harness;
});

await run('voices loaded after startup select Microsoft Ryan in British English', async () => {
  const harness = createHarness({ voices: [] });
  assert.equal(harness.speechSynthesis.getVoices().length, 0, 'the test must begin before voices are available');
  await Promise.resolve();
  harness.speechSynthesis.setVoices([
    { name: 'Samantha', lang: 'en-US', localService: true },
    { name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', lang: 'en-GB', localService: false },
    { name: 'Daniel', lang: 'en-GB', localService: true },
  ]);

  enterText(harness, 'hello');
  harness.elements.get('duVoiceForm').dispatchEvent(event('submit'));
  await waitFor(() => harness.speechSynthesis.spoken.length === 1, 'the reply was not sent to speech synthesis');
  const utterance = harness.speechSynthesis.spoken[0];
  assert.equal(utterance.voice?.name, 'Microsoft Ryan Online (Natural) - English (United Kingdom)');
  assert.equal(utterance.lang, 'en-GB');
  return harness;
});

await run('Neural Unity prewarms without auth, then authorises on one direct click and answers', async () => {
  let signedIn = false;
  const signInCalls = [];
  const chatCalls = [];
  const puter = {
    auth: {
      isSignedIn: () => signedIn,
      signIn: async (options) => {
        signInCalls.push(options);
        signedIn = true;
        return { success: true };
      },
    },
    ai: {
      chat: async (messages, options) => {
        chatCalls.push({ messages, options });
        return {
          message: {
            content: [
              { type: 'text', text: '<think>Private comparison that must never be exposed.</think>' },
              { type: 'text', text: 'Titanium keeps its strength with remarkably little weight.' },
            ],
          },
        };
      },
    },
  };
  const harness = createHarness({ puterOnLoad: puter });
  const enhanced = harness.elements.get('duEnhancedButton');
  const hint = harness.elements.get('duEnhancedHint');
  const status = harness.elements.get('duVoiceStatus');
  const transcript = harness.elements.get('duVoiceTranscript');

  assert.equal(harness.document.appendedScripts.length, 1, 'startup should prewarm exactly one Puter SDK script');
  assert.equal(harness.document.appendedScripts[0].src, 'https://js.puter.com/v2/');
  assert.equal(signInCalls.length, 0, 'SDK prewarming must not open authentication');
  await waitFor(
    () => enhanced.textContent === 'ACTIVATE NEURAL UNITY',
    'the prewarmed SDK did not expose the one-tap activation control'
  );
  assert.match(hint.textContent, /One tap creates a temporary Puter session or connects an existing one/i);

  enhanced.click();
  await waitFor(
    () => enhanced.dataset.connected === 'true',
    'one direct click did not activate Neural Unity'
  );
  assert.equal(signInCalls.length, 1);
  assert.equal(signInCalls[0].attempt_temp_user_creation, true);
  assert.equal(enhanced.textContent, 'NEURAL UNITY · ACTIVE');

  enterText(harness, 'Write one sentence about titanium.');
  harness.elements.get('duVoiceForm').dispatchEvent(event('submit'));
  await waitFor(
    () => transcript.textContent === 'Titanium keeps its strength with remarkably little weight.',
    'the enhanced chat answer did not become visible'
  );
  await waitFor(() => status.textContent === 'READY FOR TEXT', 'neural chat did not release the text composer');
  assert.equal(chatCalls.length, 1, 'the neural prompt should produce one chat request');
  assert.equal(chatCalls[0].options.model, 'openai/gpt-5.6-luna');
  assert.equal(chatCalls[0].options.reasoning_effort, 'none');
  assert.equal(chatCalls[0].options.verbosity, 'low');
  assert.equal(chatCalls[0].options.max_tokens, 512);
  assert.equal(chatCalls[0].messages.at(-1).content, 'Write one sentence about titanium.');
  assert.equal(
    harness.speechSynthesis.spoken.at(-1)?.text,
    'Titanium keeps its strength with remarkably little weight.',
    'native speech should remain available when neural TTS is absent'
  );
  return harness;
});

await run('a text turn submitted during Neural Unity auth owns the final answer and audio', async () => {
  let signedIn = false;
  let resolveAuth;
  let resolveBackend;
  const signInCalls = [];
  const backendRequests = [];
  const authRequest = new Promise((resolve) => { resolveAuth = resolve; });
  const backendResponse = new Promise((resolve) => { resolveBackend = resolve; });
  const puter = {
    auth: {
      isSignedIn: () => signedIn,
      signIn: (options) => {
        signInCalls.push(options);
        return authRequest;
      },
    },
    ai: {},
  };
  const harness = createHarness({
    puter,
    fetchImpl: async (url, options = {}) => {
      if ((options.method || 'GET') === 'POST') {
        backendRequests.push(String(url));
        return backendResponse;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    },
  });
  const enhanced = harness.elements.get('duEnhancedButton');
  const status = harness.elements.get('duVoiceStatus');
  const transcript = harness.elements.get('duVoiceTranscript');

  await waitFor(() => enhanced.textContent === 'ACTIVATE NEURAL UNITY', 'Neural Unity was not ready to authorise');
  enhanced.click();
  await waitFor(() => signInCalls.length === 1, 'the direct activation did not start authorization');
  assert.equal(enhanced.disabled, true, 'the activation control should be single-flight while authorization is pending');

  enterText(harness, 'Give me a compact systems check.');
  harness.elements.get('duVoiceForm').dispatchEvent(event('submit'));
  await waitFor(() => backendRequests.length === 1, 'text did not enter the normal answer path during authorization');
  assert.equal(transcript.textContent, 'Unity is thinking…');

  signedIn = true;
  resolveAuth({ success: true });
  await waitFor(() => enhanced.dataset.connected === 'true', 'authorization did not complete');
  assert.equal(
    transcript.textContent,
    'Unity is thinking…',
    'authorization completion overwrote the in-flight text turn'
  );
  assert.equal(
    harness.speechSynthesis.spoken.some((utterance) => /Neural Unity is online/i.test(utterance.text)),
    false,
    'authorization completion played a stale neural preview over the text turn'
  );

  resolveBackend({
    ok: true,
    status: 200,
    json: async () => ({ text: 'All core systems are responsive.', path: 'test-backend' }),
  });
  await waitFor(
    () => transcript.textContent === 'All core systems are responsive.',
    'the text answer did not remain the owning response after authorization'
  );
  await waitFor(() => status.textContent === 'READY FOR TEXT', 'the text turn did not return to ready state');
  assert.deepEqual(
    harness.speechSynthesis.spoken.map((utterance) => utterance.text),
    ['All core systems are responsive.'],
    'only the owning text answer should be spoken'
  );
  return harness;
});

await run('blocked Neural Unity autoplay exposes Play Reply without duplicate native speech', async () => {
  const unhandledAtStart = unhandledRejections.length;
  const ttsCalls = [];
  let playCalls = 0;
  const audio = {
    pause() {},
    play() {
      playCalls += 1;
      if (playCalls === 1) {
        return Promise.reject(new DOMException('Audio playback was blocked.', 'NotAllowedError'));
      }
      queueMicrotask(() => {
        audio.onplay?.();
        audio.onended?.();
      });
      return Promise.resolve();
    },
  };
  const puter = {
    auth: { isSignedIn: () => true, signIn: async () => ({ success: true }) },
    ai: {
      txt2speech: async (text, options) => {
        ttsCalls.push({ text, options });
        return audio;
      },
    },
  };
  const harness = createHarness({ puter });
  const enhanced = harness.elements.get('duEnhancedButton');
  const send = harness.elements.get('duVoiceSend');
  const status = harness.elements.get('duVoiceStatus');
  const transcript = harness.elements.get('duVoiceTranscript');
  const preview = harness.elements.get('duVoicePreview');

  await waitFor(() => enhanced.dataset.connected === 'true', 'pre-authorised Neural Unity did not auto-activate');
  enterText(harness, 'hello');
  harness.elements.get('duVoiceForm').dispatchEvent(event('submit'));
  await waitFor(() => ttsCalls.length === 1, 'neural TTS was not attempted');
  await waitFor(() => preview.textContent === 'PLAY REPLY', 'blocked autoplay did not expose Play Reply');
  await waitFor(() => status.textContent === 'READY FOR TEXT', 'blocked autoplay did not release the turn');
  assert.equal(transcript.textContent, 'Hello. I am ready.');
  assert.equal(ttsCalls[0].options.provider, 'elevenlabs');
  assert.equal(ttsCalls[0].options.model, 'eleven_multilingual_v2');
  assert.equal(ttsCalls[0].options.voice, 'onwK4e9ZLuTAKqWW03F9');
  assert.equal(
    harness.speechSynthesis.spoken.filter((utterance) => utterance.text === 'Hello. I am ready.').length,
    0,
    'blocked generated audio should not produce a duplicate native reading'
  );
  assert.equal(send.disabled, true, 'the cleared composer should remain ready for new input');
  assert.notEqual(harness.document.body.dataset.voiceState, 'speaking');
  assert.equal(unhandledRejections.length, unhandledAtStart, 'blocked autoplay escaped as an unhandled rejection');

  preview.click();
  await waitFor(() => playCalls === 2, 'Play Reply did not retry the pending generated audio');
  await waitFor(() => status.textContent === 'READY FOR TEXT', 'manual playback did not return to text-ready state');
  assert.equal(preview.textContent, 'PREVIEW VOICE');
  assert.equal(unhandledRejections.length, unhandledAtStart, 'manual playback escaped as an unhandled rejection');
  return harness;
});

await run('Neural Unity falls back from ElevenLabs Daniel to OpenAI onyx', async () => {
  const ttsCalls = [];
  const audio = {
    pause() {},
    play() {
      queueMicrotask(() => {
        audio.onplay?.();
        audio.onended?.();
      });
      return Promise.resolve();
    },
  };
  const puter = {
    auth: { isSignedIn: () => true, signIn: async () => ({ success: true }) },
    ai: {
      txt2speech: async (text, options) => {
        ttsCalls.push({ text, options });
        if (ttsCalls.length === 1) throw new Error('ElevenLabs unavailable');
        return audio;
      },
    },
  };
  const harness = createHarness({ puter });
  const enhanced = harness.elements.get('duEnhancedButton');
  const status = harness.elements.get('duVoiceStatus');

  await waitFor(() => enhanced.dataset.connected === 'true', 'pre-authorised Neural Unity did not auto-activate');
  enterText(harness, 'hello');
  harness.elements.get('duVoiceForm').dispatchEvent(event('submit'));
  await waitFor(() => ttsCalls.length === 2, 'OpenAI voice fallback was not attempted');
  await waitFor(() => status.textContent === 'READY FOR TEXT', 'fallback voice did not finish the turn');

  assert.equal(ttsCalls[0].options.provider, 'elevenlabs');
  assert.equal(ttsCalls[0].options.model, 'eleven_multilingual_v2');
  assert.equal(ttsCalls[0].options.voice, 'onwK4e9ZLuTAKqWW03F9');
  assert.equal(ttsCalls[1].options.provider, 'openai');
  assert.equal(ttsCalls[1].options.model, 'gpt-4o-mini-tts');
  assert.equal(ttsCalls[1].options.voice, 'onyx');
  assert.match(ttsCalls[1].options.instructions, /original adult British male synthetic voice/i);
  assert.equal(
    harness.speechSynthesis.spoken.filter((utterance) => utterance.text === 'Hello. I am ready.').length,
    0,
    'a successful neural fallback should not also invoke native synthesis'
  );
  return harness;
});

await run('core text replies do not wait for or initiate Puter authentication', async () => {
  let signInCalls = 0;
  const puter = {
    auth: {
      isSignedIn: () => false,
      signIn: () => {
        signInCalls += 1;
        return new Promise(() => {});
      },
    },
    ai: {},
  };
  const harness = createHarness({ puter });
  const enhanced = harness.elements.get('duEnhancedButton');
  const status = harness.elements.get('duVoiceStatus');
  const transcript = harness.elements.get('duVoiceTranscript');

  await waitFor(() => enhanced.textContent === 'ACTIVATE NEURAL UNITY', 'unsigned Puter state was not reflected');
  enterText(harness, 'hello');
  harness.elements.get('duVoiceForm').dispatchEvent(event('submit'));
  await waitFor(() => transcript.textContent === 'Hello. I am ready.', 'core text waited for neural authentication');
  await waitFor(() => status.textContent === 'READY FOR TEXT', 'core text did not return to ready state');
  assert.equal(signInCalls, 0, 'text submission must not initiate Puter authentication');
  assert.equal(enhanced.dataset.connected, 'false');
  return harness;
});

await run('Enhanced Unity records and transcribes when native SpeechRecognition is absent', async () => {
  const recorder = createMediaRecorder();
  const stoppedTracks = [];
  const speechToTextCalls = [];
  const stream = {
    getTracks: () => [{ stop: () => stoppedTracks.push('stopped') }],
  };
  const mediaDevices = {
    getUserMedia: async (constraints) => {
      assert.equal(constraints.audio, true);
      return stream;
    },
  };
  const puter = {
    auth: { isSignedIn: () => true, signIn: async () => ({ success: true }) },
    ai: {
      speech2txt: async (blob, options) => {
        speechToTextCalls.push({ blob, options });
        return { text: 'hello' };
      },
    },
  };
  const harness = createHarness({
    MediaRecorder: recorder.MediaRecorder,
    mediaDevices,
    puter,
  });
  const action = harness.elements.get('duVoiceAction');
  const enhanced = harness.elements.get('duEnhancedButton');
  const status = harness.elements.get('duVoiceStatus');
  const transcript = harness.elements.get('duVoiceTranscript');

  await waitFor(() => enhanced.dataset.connected === 'true', 'pre-authorised neural microphone fallback did not auto-activate');
  action.click();
  await waitFor(
    () => status.textContent === 'LISTENING · TAP FINISH WHEN DONE',
    'MediaRecorder fallback did not enter listening state'
  );
  assert.equal(action.textContent, 'FINISH LISTENING');
  assert.equal(recorder.instances.length, 1);
  assert.equal(recorder.instances[0].state, 'recording');

  action.click();
  await waitFor(() => speechToTextCalls.length === 1, 'recorded audio was not sent for enhanced transcription');
  await waitFor(() => transcript.textContent === 'Hello. I am ready.', 'the transcript did not enter the normal turn path');
  assert.ok(speechToTextCalls[0].blob instanceof Blob);
  assert.ok(speechToTextCalls[0].blob.size > 0);
  assert.equal(speechToTextCalls[0].options.model, 'gpt-4o-mini-transcribe');
  assert.equal(speechToTextCalls[0].options.language, 'en');
  assert.ok(stoppedTracks.length >= 1, 'the microphone stream was not released');
  assert.ok(
    harness.speechSynthesis.spoken.some((utterance) => utterance.text === 'Hello. I am ready.'),
    'the transcribed turn did not reach reply speech'
  );
  return harness;
});

await run('voice activity detection auto-stops after speech followed by silence', async () => {
  const recorder = createMediaRecorder();
  const speechToTextCalls = [];
  let stoppedTracks = 0;
  let sampleReads = 0;
  let sourceDisconnects = 0;
  let analyserDisconnects = 0;
  let contextCloses = 0;
  const stream = {
    getTracks: () => [{ stop: () => { stoppedTracks += 1; } }],
  };
  const analyser = {
    fftSize: 0,
    smoothingTimeConstant: 0,
    disconnect() { analyserDisconnects += 1; },
    getByteTimeDomainData(samples) {
      sampleReads += 1;
      // Four loud frames yield two qualifying speech frames after the VAD's
      // startup guard. All following frames are digital silence.
      samples.fill(sampleReads <= 4 ? 160 : 128);
    },
  };
  const source = {
    connect(target) { assert.equal(target, analyser); },
    disconnect() { sourceDisconnects += 1; },
  };
  class FakeAudioContext {
    createMediaStreamSource(receivedStream) {
      assert.equal(receivedStream, stream);
      return source;
    }

    createAnalyser() {
      return analyser;
    }

    resume() {
      return Promise.resolve();
    }

    close() {
      contextCloses += 1;
      return Promise.resolve();
    }
  }
  const puter = {
    auth: { isSignedIn: () => true, signIn: async () => ({ success: true }) },
    ai: {
      speech2txt: async (blob, options) => {
        speechToTextCalls.push({ blob, options });
        return { text: 'hello' };
      },
    },
  };
  const harness = createHarness({
    AudioContext: FakeAudioContext,
    MediaRecorder: recorder.MediaRecorder,
    mediaDevices: { getUserMedia: async () => stream },
    puter,
  });
  const enhanced = harness.elements.get('duEnhancedButton');
  const status = harness.elements.get('duVoiceStatus');
  const transcript = harness.elements.get('duVoiceTranscript');

  await waitFor(() => enhanced.dataset.connected === 'true', 'pre-authorised Neural Unity did not auto-activate');
  harness.elements.get('duVoiceAction').click();
  await waitFor(
    () => status.textContent === 'LISTENING · SPEAK, THEN PAUSE',
    'AudioContext did not activate automatic silence detection'
  );
  assert.equal(recorder.instances.length, 1);

  await waitFor(
    () => recorder.instances[0].state === 'inactive',
    'speech followed by silence did not auto-stop recording',
    2_400
  );
  await waitFor(() => speechToTextCalls.length === 1, 'auto-stopped audio was not transcribed');
  await waitFor(() => transcript.textContent === 'Hello. I am ready.', 'the auto-stopped transcript did not enter the turn path');
  assert.ok(sampleReads >= 10, 'the VAD did not observe a sustained silent tail');
  assert.ok(sourceDisconnects >= 1, 'the VAD media source was not disconnected');
  assert.ok(analyserDisconnects >= 1, 'the VAD analyser was not disconnected');
  assert.ok(contextCloses >= 1, 'the VAD AudioContext was not closed');
  assert.ok(stoppedTracks >= 1, 'the VAD auto-stop did not release the microphone stream');
  assert.ok(speechToTextCalls[0].blob.size > 0);
  return harness;
});

await run('a stale recognition result after closing the panel cannot start a turn', async () => {
  const recognition = createRecognition();
  const harness = createHarness({ recognition });
  const status = harness.elements.get('duVoiceStatus');
  const transcript = harness.elements.get('duVoiceTranscript');

  harness.elements.get('unityLabel').click();
  await waitFor(() => status.textContent === 'LISTENING', 'native recognition never entered listening state');
  const instance = recognition.instances.at(-1);
  const staleResultHandler = instance.onresult;
  assert.equal(typeof staleResultHandler, 'function');

  harness.elements.get('duVoiceClose').click();
  assert.equal(harness.elements.get('duVoicePanel').getAttribute('aria-hidden'), 'true');
  assert.equal(status.textContent, 'READY TO CONNECT');

  staleResultHandler(finalRecognitionEvent('hello'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(status.textContent, 'READY TO CONNECT', 'a queued result reopened or changed the closed session');
  assert.notEqual(transcript.textContent, 'Hello. I am ready.', 'a queued result entered the normal turn path');
  assert.equal(harness.speechSynthesis.spoken.length, 0, 'a queued result produced speech after close');
  return harness;
});

await run('a pending microphone grant is single-flight and is discarded when Enhanced Unity is disabled', async () => {
  const recorder = createMediaRecorder();
  let resolveMicrophone;
  let getUserMediaCalls = 0;
  let stoppedTracks = 0;
  const microphoneRequest = new Promise((resolve) => { resolveMicrophone = resolve; });
  const mediaDevices = {
    getUserMedia: () => {
      getUserMediaCalls += 1;
      return microphoneRequest;
    },
  };
  const puter = {
    auth: { isSignedIn: () => true, signIn: async () => ({ success: true }) },
    ai: { speech2txt: async () => ({ text: 'hello' }) },
  };
  const harness = createHarness({ MediaRecorder: recorder.MediaRecorder, mediaDevices, puter });
  const enhanced = harness.elements.get('duEnhancedButton');
  const action = harness.elements.get('duVoiceAction');
  const launcher = harness.elements.get('unityLabel');

  await waitFor(() => enhanced.dataset.connected === 'true', 'pre-authorised Neural Unity did not auto-activate');
  action.click();
  await waitFor(() => getUserMediaCalls === 1, 'the first microphone request did not start');
  assert.equal(action.textContent, 'AWAITING MICROPHONE…');

  launcher.click();
  launcher.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(getUserMediaCalls, 1, 'repeated listening requests opened duplicate permission prompts');

  enhanced.click();
  await waitFor(() => enhanced.dataset.connected === 'false', 'Enhanced Unity did not disable while permission was pending');
  resolveMicrophone({
    getTracks: () => [{ stop: () => { stoppedTracks += 1; } }],
  });
  await waitFor(() => stoppedTracks === 1, 'the late microphone stream was not immediately stopped');
  assert.equal(recorder.instances.length, 0, 'a recorder was created after Enhanced Unity was disabled');
  assert.equal(harness.elements.get('duVoiceStatus').textContent, 'NATIVE UNITY ONLINE');
  assert.notEqual(action.textContent, 'AWAITING MICROPHONE…');
  return harness;
});

await run('an empty MediaRecorder stop visibly returns to retry and leaves text usable', async () => {
  const recorder = createMediaRecorder({ emitData: false });
  let speechToTextCalls = 0;
  const stream = { getTracks: () => [{ stop() {} }] };
  const puter = {
    auth: { isSignedIn: () => true, signIn: async () => ({ success: true }) },
    ai: {
      speech2txt: async () => {
        speechToTextCalls += 1;
        return { text: 'hello' };
      },
    },
  };
  const harness = createHarness({
    MediaRecorder: recorder.MediaRecorder,
    mediaDevices: { getUserMedia: async () => stream },
    puter,
  });
  const enhanced = harness.elements.get('duEnhancedButton');
  const action = harness.elements.get('duVoiceAction');
  const status = harness.elements.get('duVoiceStatus');
  const transcript = harness.elements.get('duVoiceTranscript');

  await waitFor(() => enhanced.dataset.connected === 'true', 'pre-authorised Neural Unity did not auto-activate');
  action.click();
  await waitFor(() => status.textContent === 'LISTENING · TAP FINISH WHEN DONE', 'recording did not start');
  action.click();
  await waitFor(
    () => status.textContent === 'NO SPEECH CAPTURED · TAP TO TRY AGAIN',
    'an empty recording did not expose a retry state'
  );
  assert.match(transcript.textContent, /No audio was captured.*retry.*type below/i);
  assert.equal(action.textContent, 'START LISTENING');
  assert.equal(speechToTextCalls, 0, 'empty audio should not be sent to transcription');

  enterText(harness, 'hello');
  harness.elements.get('duVoiceForm').dispatchEvent(event('submit'));
  await waitFor(() => transcript.textContent === 'Hello. I am ready.', 'text was not usable after empty audio');
  return harness;
});

await run('an asynchronous native recognition network error starts the authorised recorder fallback', async () => {
  const recognition = createRecognition();
  const recorder = createMediaRecorder();
  let getUserMediaCalls = 0;
  const stream = { getTracks: () => [{ stop() {} }] };
  const puter = {
    auth: { isSignedIn: () => true, signIn: async () => ({ success: true }) },
    ai: { speech2txt: async () => ({ text: 'hello' }) },
  };
  const harness = createHarness({
    recognition,
    MediaRecorder: recorder.MediaRecorder,
    mediaDevices: {
      getUserMedia: async () => {
        getUserMediaCalls += 1;
        return stream;
      },
    },
    puter,
  });
  const enhanced = harness.elements.get('duEnhancedButton');
  const status = harness.elements.get('duVoiceStatus');

  await waitFor(() => enhanced.dataset.connected === 'true', 'pre-authorised Neural Unity did not auto-activate');
  harness.elements.get('duVoiceAction').click();
  await waitFor(() => status.textContent === 'LISTENING', 'native recognition did not begin');
  const instance = recognition.instances.at(-1);
  instance.onerror({ error: 'network' });

  await waitFor(() => recorder.instances.length === 1, 'network failure did not construct MediaRecorder');
  await waitFor(
    () => status.textContent === 'LISTENING · TAP FINISH WHEN DONE',
    'network failure did not enter enhanced recording mode'
  );
  assert.equal(getUserMediaCalls, 1);
  assert.equal(recorder.instances[0].state, 'recording');
  assert.equal(harness.elements.get('duVoiceAction').textContent, 'FINISH LISTENING');
  return harness;
});

await run('voice preview cancels listening and ignores a recognition result already queued by the browser', async () => {
  const recognition = createRecognition();
  const harness = createHarness({ recognition });
  const preview = harness.elements.get('duVoicePreview');
  const status = harness.elements.get('duVoiceStatus');
  const transcript = harness.elements.get('duVoiceTranscript');

  harness.elements.get('unityLabel').click();
  await waitFor(() => status.textContent === 'LISTENING', 'native recognition never entered listening state');
  const instance = recognition.instances.at(-1);
  const staleResultHandler = instance.onresult;

  preview.click();
  staleResultHandler(finalRecognitionEvent('hello'));
  await waitFor(
    () => harness.speechSynthesis.spoken.some((utterance) => /voice systems are online/i.test(utterance.text)),
    'voice preview speech did not start'
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.notEqual(transcript.textContent, 'Hello. I am ready.', 'preview audio was accepted as a recognition turn');
  assert.equal(
    harness.speechSynthesis.spoken.filter((utterance) => utterance.text === 'Hello. I am ready.').length,
    0,
    'a stale recognition result produced an assistant reply during preview'
  );
  assert.equal(status.textContent, 'READY FOR TEXT');
  return harness;
});

await run('a resilient backend factual reply can recover through relevant browser grounding', async () => {
  const calls = [];
  const harness = createHarness({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method || 'GET' });
      if (String(url).includes('dream-unity-voice-live.vercel.app')) {
        if ((options.method || 'GET') === 'POST') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ text: 'Local answer channel only.', path: 'resilient-local' }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      if (String(url).includes('/w/api.php')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ query: { search: [{ title: 'Alan Turing' }] } }),
        };
      }
      if (String(url).includes('/page/summary/Alan%20Turing')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ extract: 'Alan Turing was an English mathematician and computer scientist. He helped formalise computation.' }),
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  enterText(harness, 'Who was Alan Turing?');
  harness.elements.get('duVoiceForm').dispatchEvent(event('submit'));
  await waitFor(
    () => /Wikipedia's summary of Alan Turing says/i.test(harness.elements.get('duVoiceTranscript').textContent),
    'a relevant browser knowledge result did not replace the limited backend reply',
  );
  assert.ok(calls.some((call) => call.method === 'POST'), 'the backend reply route was not attempted');
  assert.ok(calls.some((call) => call.url.includes('/w/api.php')), 'the browser grounding search was not attempted');
  assert.ok(calls.some((call) => call.url.includes('/page/summary/Alan%20Turing')), 'the relevant summary was not fetched');
  return harness;
});

process.removeListener('unhandledRejection', recordUnhandledRejection);
console.log(`Unity runtime regression: ${passed}/${passed + failures.length} passed.`);
if (failures.length) process.exitCode = 1;
