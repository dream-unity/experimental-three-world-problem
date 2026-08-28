(() => {
  'use strict';

  const VOICE_ENDPOINT = 'https://dream-unity-voice-live.vercel.app/api/realtime-session';
  const MAX_SESSION_MS = 8 * 60 * 1000;
  const TURN_TIMEOUT_MS = 12_000;
  const MAX_HISTORY = 6;
  const ARRIVAL_GREETING = 'Hello, my name is Unity. What dream would you like to unify?';
  const DEFAULT_COPY = 'Ask Unity anything. Speak naturally, and Unity will answer you aloud.';
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  const app = document.getElementById('app');
  const launcher = document.querySelector('[data-voice-launcher]');
  const panel = document.getElementById('duVoicePanel');
  const closeButton = document.getElementById('duVoiceClose');
  const actionButton = document.getElementById('duVoiceAction');
  const status = document.getElementById('duVoiceStatus');
  const copy = document.getElementById('duVoiceCopy');
  const invite = document.getElementById('duOracleInvite');

  if (!app || !launcher || !panel || !closeButton || !actionButton || !status || !copy) return;

  let recognition = null;
  let active = false;
  let busy = false;
  let speaking = false;
  let sessionTimer = 0;
  let restartTimer = 0;
  let history = [];
  let endpointWarmup = null;

  const NUMBER_WORDS = Object.freeze({
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20
  });
  const SPOKEN_NUMBERS = Object.freeze(Object.fromEntries(Object.entries(NUMBER_WORDS).map(([word, number]) => [number, word])));

  function parseOperand(value) {
    const token = String(value || '').trim().toLowerCase();
    if (Object.hasOwn(NUMBER_WORDS, token)) return NUMBER_WORDS[token];
    if (/^-?\d+(?:\.\d+)?$/.test(token)) return Number(token);
    return null;
  }

  function formatCalculation(value) {
    if (!Number.isFinite(value)) return '';
    const rounded = Math.abs(value) < 1e-12 ? 0 : Number(value.toFixed(8));
    if (Number.isInteger(rounded) && Object.hasOwn(SPOKEN_NUMBERS, rounded)) {
      const word = SPOKEN_NUMBERS[rounded];
      return `${word[0].toUpperCase()}${word.slice(1)}.`;
    }
    return `${rounded}.`;
  }

  function localCalculation(message) {
    const operand = '(?:-?\\d+(?:\\.\\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)';
    const pattern = new RegExp(`^(?:what(?:'s| is)|calculate|work out)?\\s*(${operand})\\s*(plus|minus|times|multiplied by|divided by|over|[+\\-x×*÷/])\\s*(${operand})[?.!]*$`, 'i');
    const match = String(message || '').match(pattern);
    if (!match) return '';
    const left = parseOperand(match[1]);
    const right = parseOperand(match[3]);
    if (left === null || right === null) return '';
    const operator = match[2].toLowerCase();
    if ((operator === 'divided by' || operator === 'over' || operator === '/' || operator === '÷') && right === 0) return "You can't divide by zero.";
    if (operator === 'plus' || operator === '+') return formatCalculation(left + right);
    if (operator === 'minus' || operator === '-') return formatCalculation(left - right);
    if (operator === 'times' || operator === 'multiplied by' || ['x', '×', '*'].includes(operator)) return formatCalculation(left * right);
    return formatCalculation(left / right);
  }

  function instantVoiceAnswer(value) {
    const normalized = String(value || '').toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
    if (/^(?:(?:hi|hello|hey)[, ]+)?(?:how (?:are you|are you doing|are you going|is it going)|how's it going)[?.!]*$/.test(normalized)) return "I'm doing well, thank you. How are you?";
    if (/^(?:hi|hello|hey|good morning|good afternoon|good evening)(?:,? unity| there)?[?.!]*$/.test(normalized)) return 'Hello.';
    if (/^(?:are you there|can you hear me)[?.!]*$/.test(normalized)) return "Yes, I'm here.";
    if (/^(?:who|what) are you[?.!]*$|^what(?:'s| is) your name[?.!]*$/.test(normalized)) return "I'm Unity Oracle, Dream Unity's voice intelligence.";
    if (/^(?:thanks|thank you|cheers)(?: very much| so much)?[?.!]*$/.test(normalized)) return "You're welcome.";
    if (/^(?:goodbye|bye|see you|see you later)[?.!]*$/.test(normalized)) return 'Goodbye.';
    if (/^(?:what(?:'s| is) the time|what time is it|tell me the time)[?.!]*$/.test(normalized)) {
      return `It's ${new Intl.DateTimeFormat(navigator.language || 'en-AU', { hour: 'numeric', minute: '2-digit' }).format(new Date())}.`;
    }
    if (/^(?:what(?:'s| is) (?:today's )?date|what day is it|tell me the date)[?.!]*$/.test(normalized)) {
      return `It's ${new Intl.DateTimeFormat(navigator.language || 'en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}.`;
    }
    return localCalculation(normalized);
  }

  function prewarmVoiceEndpoint() {
    if (!endpointWarmup) {
      endpointWarmup = fetch(VOICE_ENDPOINT, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit'
      }).catch(() => null);
    }
    return endpointWarmup;
  }

  function setOpen(open) {
    panel.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function setPanelState(name, message) {
    panel.classList.remove('connecting', 'connected', 'listening', 'speaking', 'error');
    if (name) panel.classList.add(name);
    if (message) status.textContent = message;
    app.dataset.voiceState = name || 'idle';
    if (invite) {
      invite.textContent = name === 'speaking' ? 'UNITY IS SPEAKING'
        : name === 'listening' ? 'UNITY IS LISTENING'
          : name === 'connecting' ? 'OPENING VOICE'
            : name === 'error' ? 'TAP TO RETRY'
              : message === 'THINKING' ? 'UNITY IS THINKING'
                : message === 'TAP UNITY TO ANSWER' ? 'TAP TO ANSWER'
                  : 'TAP TO SPEAK';
    }
  }

  function clearTimers() {
    window.clearTimeout(sessionTimer);
    window.clearTimeout(restartTimer);
    sessionTimer = 0;
    restartTimer = 0;
  }

  function cancelSpeech() {
    try { window.speechSynthesis?.cancel(); } catch (_) {}
    speaking = false;
  }

  function stopRecognition() {
    if (!recognition) return;
    try { recognition.onend = null; recognition.stop(); } catch (_) {}
    try { recognition.abort(); } catch (_) {}
    recognition = null;
  }

  function cleanup({ keepPanel = true, message = 'READY TO CONNECT' } = {}) {
    active = false;
    busy = false;
    clearTimers();
    stopRecognition();
    cancelSpeech();
    panel.classList.remove('arrival');
    setPanelState('', message);
    actionButton.disabled = false;
    actionButton.textContent = message === 'SESSION COMPLETE' ? 'RECONNECT' : 'START CONVERSATION';
    if (message === 'READY TO CONNECT') copy.textContent = DEFAULT_COPY;
    if (!keepPanel) setOpen(false);
  }

  function fail(message) {
    active = false;
    busy = false;
    clearTimers();
    stopRecognition();
    cancelSpeech();
    panel.classList.remove('arrival');
    setOpen(true);
    setPanelState('error', 'VOICE LINK FAILED');
    actionButton.disabled = false;
    actionButton.textContent = 'RETRY VOICE';

    const text = String(message || '');
    if (/not-allowed|permission|denied|audio-capture/i.test(text)) {
      copy.textContent = 'Microphone or speech-recognition permission was not granted. Allow it, then try again.';
    } else if (/unsupported|SpeechRecognition/i.test(text)) {
      copy.textContent = 'This browser does not expose speech recognition. Try the current Chrome, Edge or Safari browser.';
    } else {
      copy.textContent = 'Unity could not reach an answer service. Tap retry to reconnect.';
    }
  }

  function chooseVoice(locale) {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    const language = String(locale || 'en-US').toLowerCase();
    const base = language.split('-')[0];
    return voices.find(v => String(v.lang).toLowerCase() === language)
      || voices.find(v => String(v.lang).toLowerCase().startsWith(`${base}-`))
      || voices.find(v => /google|samantha|daniel|serena|aria|natural|enhanced/i.test(v.name))
      || voices[0]
      || null;
  }

  function speak(text, turnStartedAt = 0, responsePath = 'model') {
    return new Promise(resolve => {
      const synth = window.speechSynthesis;
      if (!synth || !window.SpeechSynthesisUtterance) {
        resolve();
        return;
      }

      cancelSpeech();
      speaking = true;
      setPanelState('speaking', 'DREAM UNITY IS SPEAKING');
      const utterance = new SpeechSynthesisUtterance(String(text || '').slice(0, 1800));
      utterance.lang = navigator.language || 'en-US';
      utterance.rate = 1.02;
      utterance.pitch = 1;
      const voice = chooseVoice(utterance.lang);
      if (voice) utterance.voice = voice;

      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        speaking = false;
        resolve();
      };
      utterance.onend = done;
      utterance.onerror = done;
      utterance.onstart = () => {
        if (turnStartedAt) {
          console.info('[unity-voice] first audio', {
            path: responsePath,
            millisecondsAfterTranscript: Math.round(performance.now() - turnStartedAt)
          });
        }
      };
      window.setTimeout(done, 30_000);
      synth.speak(utterance);
    });
  }

  function scheduleListen(delay = 220) {
    if (!active || busy || speaking) return;
    window.clearTimeout(restartTimer);
    restartTimer = window.setTimeout(startListening, delay);
  }

  function startListening() {
    if (!active || busy || speaking) return;
    if (!Recognition) {
      fail('SpeechRecognition unsupported');
      return;
    }

    stopRecognition();
    const next = new Recognition();
    recognition = next;
    next.lang = navigator.language || 'en-US';
    next.continuous = false;
    next.interimResults = true;
    next.maxAlternatives = 1;

    next.onstart = () => {
      if (!active) return;
      setPanelState('listening', 'LISTENING');
      copy.textContent = 'I can hear you. Speak naturally.';
    };

    next.onresult = event => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = String(event.results[i]?.[0]?.transcript || '').trim();
        if (!transcript) continue;
        if (event.results[i].isFinal) finalText += `${transcript} `;
        else interim += `${transcript} `;
      }
      if (interim.trim()) copy.textContent = interim.trim().slice(-520);
      if (finalText.trim() && !busy) {
        busy = true;
        const heard = finalText.trim();
        copy.textContent = heard;
        try { next.stop(); } catch (_) {}
        handleUtterance(heard);
      }
    };

    next.onerror = event => {
      const code = String(event?.error || 'recognition-error');
      if (!active) return;
      if (code === 'no-speech' || code === 'aborted') {
        if (!busy) scheduleListen(320);
        return;
      }
      fail(code);
    };

    next.onspeechend = () => {
      if (!active || busy) return;
      try { next.stop(); } catch (_) {}
    };

    next.onend = () => {
      if (recognition === next) recognition = null;
      if (active && !busy && !speaking) scheduleListen(260);
    };

    try {
      next.start();
    } catch (error) {
      if (active) scheduleListen(450);
    }
  }

  async function handleUtterance(message) {
    const turnStartedAt = performance.now();
    setPanelState('connected', 'THINKING');
    copy.textContent = 'Dream Unity is thinking…';

    const instant = instantVoiceAnswer(message);
    if (instant) {
      history.push({ role: 'user', content: message }, { role: 'assistant', content: instant });
      if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
      copy.textContent = instant;
      await speak(instant, turnStartedAt, 'instant');
      busy = false;
      if (active) scheduleListen(160);
      return;
    }

    const controller = new AbortController();
    const turnTimeout = window.setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);

    try {
      const response = await fetch(VOICE_ENDPOINT, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: history.slice(-MAX_HISTORY),
          locale: navigator.language || 'en-US'
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.text) throw new Error(String(data?.code || data?.error || `Voice request failed (${response.status}).`));
      const answer = String(data.text).trim();
      history.push({ role: 'user', content: message }, { role: 'assistant', content: answer });
      if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
      copy.textContent = answer.slice(-520);
      await speak(answer, turnStartedAt, String(data.path || 'model'));
      busy = false;
      if (active) scheduleListen(160);
    } catch (error) {
      busy = false;
      fail(error instanceof Error ? error.message : String(error));
    } finally {
      window.clearTimeout(turnTimeout);
    }
  }

  function begin() {
    if (active) return;
    panel.classList.remove('arrival');
    if (!Recognition) {
      fail('SpeechRecognition unsupported');
      return;
    }
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      fail('Speech synthesis unsupported');
      return;
    }

    cancelSpeech();
    active = true;
    busy = true;
    history = [];
    setOpen(true);
    setPanelState('connecting', 'CONNECTING');
    actionButton.disabled = true;
    actionButton.textContent = 'CONNECTING';
    copy.textContent = 'Unity is opening the listening channel…';

    sessionTimer = window.setTimeout(() => {
      cleanup({ keepPanel: true, message: 'SESSION COMPLETE' });
      copy.textContent = 'Eight-minute public voice session complete. Tap below to reconnect.';
    }, MAX_SESSION_MS);

    busy = false;
    actionButton.disabled = false;
    actionButton.textContent = 'END CONVERSATION';
    startListening();
  }

  async function greetOnArrival() {
    if (app.classList.contains('detail') || app.classList.contains('game-open')) return;
    panel.classList.add('arrival');
    setOpen(true);
    copy.textContent = ARRIVAL_GREETING;
    actionButton.textContent = 'START CONVERSATION';
    setPanelState('speaking', 'UNITY IS SPEAKING');
    await speak(ARRIVAL_GREETING);
    if (!active && panel.classList.contains('arrival')) {
      setPanelState('connected', 'TAP UNITY TO ANSWER');
      copy.textContent = ARRIVAL_GREETING;
    }
  }

  launcher.addEventListener('click', () => {
    setOpen(true);
    if (!active) begin();
  });

  const setOracleHover = value => {
    app.dataset.voiceHover = value ? 'true' : 'false';
  };
  launcher.addEventListener('pointerenter', () => setOracleHover(true));
  launcher.addEventListener('pointerleave', () => setOracleHover(false));
  launcher.addEventListener('focus', () => setOracleHover(true));
  launcher.addEventListener('blur', () => setOracleHover(false));
  launcher.addEventListener('pointerdown', () => {
    app.dataset.voicePress = 'true';
    window.setTimeout(() => { app.dataset.voicePress = 'false'; }, 260);
  });

  closeButton.addEventListener('click', () => cleanup({ keepPanel: false }));

  actionButton.addEventListener('click', () => {
    if (active) cleanup({ keepPanel: true });
    else begin();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel.classList.contains('open')) cleanup({ keepPanel: false });
  });

  const observer = new MutationObserver(() => {
    if ((app.classList.contains('detail') || app.classList.contains('game-open')) && active) {
      cleanup({ keepPanel: false });
    }
  });
  observer.observe(app, { attributes: true, attributeFilter: ['class'] });

  const queueArrivalGreeting = () => window.setTimeout(greetOnArrival, 120);
  prewarmVoiceEndpoint();
  try { window.speechSynthesis?.getVoices?.(); } catch (_) {}
  if (document.visibilityState === 'hidden') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') queueArrivalGreeting();
    }, { once: true });
  } else {
    queueArrivalGreeting();
  }

  window.addEventListener('pagehide', () => cleanup({ keepPanel: false }));
})();
