(() => {
  'use strict';

  const VOICE_ENDPOINT = 'https://dream-unity-voice-live.vercel.app/api/realtime-session';
  const MAX_SESSION_MS = 8 * 60 * 1000;
  const TURN_TIMEOUT_MS = 30_000;
  const MAX_HISTORY = 10;
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
    } else if (/429|rate/i.test(text)) {
      copy.textContent = 'Dream Unity voice is briefly rate-limited. Try again shortly.';
    } else {
      copy.textContent = 'The voice conversation could not continue. Tap retry to reconnect.';
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

  function speak(text) {
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
    setPanelState('connected', 'THINKING');
    copy.textContent = 'Dream Unity is thinking…';
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
      if (!response.ok || !data?.text) {
        throw new Error(String(data?.code || data?.error || `Voice request failed (${response.status}).`));
      }

      const answer = String(data.text).trim();
      history.push({ role: 'user', content: message }, { role: 'assistant', content: answer });
      if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
      copy.textContent = answer.slice(-520);
      await speak(answer);
      busy = false;
      if (active) scheduleListen(260);
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
