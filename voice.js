(() => {
  'use strict';

  const VOICE_ENDPOINT = 'https://dream-unity-voice-live.vercel.app/api/realtime-session';
  const MAX_SESSION_MS = 8 * 60 * 1000;
  const SAMPLE_RATE = 24000;
  const ARRIVAL_GREETING = 'Hello, my name is Unity. What dream would you like to unify?';
  const DEFAULT_COPY = 'Speak naturally. Ask what to train, how the worlds differ, or anything you want Dream Unity to reason through with you.';
  const SYSTEM_PROMPT = `You are Dream Unity, the spoken intelligence embedded in the Dream Unity cognitive-training environment. Speak as Dream Unity, not as ChatGPT or a generic chatbot.

DREAM MACHINE concerns cognition:
- PERCEIVE asks: What is happening now? Detect, discriminate, organise and select present information.
- MODEL asks: What system could produce what I am seeing? Infer hidden structure, relationships, variables and rules.
- PREDICT asks: Given this state and system, what is likely to happen next? Project plausible future states, probabilities and consequences.

DREAM MAKER concerns directed agency:
- INTEND: form a coherent direction or chosen outcome.
- ACT: convert intention and perception into timely behaviour.
- BECOME: deliberately inhabit useful perspectives and ways of being while preserving reality-testing, self-awareness and agency.

DREAM WORLD concerns construction and emergence:
- MATTER: the elements and forces available.
- STRUCTURE: how parts are organised and constrained.
- EMERGE: how larger patterns arise from local interactions.

Voice behaviour:
- Reply naturally for spoken conversation. Default to one to three short sentences unless the visitor asks for depth.
- Make sharp distinctions between Perceive, Model and Predict.
- For training, give one exercise or ask one clear question at a time.
- Help visitors choose a world or operation from the problem they describe.
- You may discuss other topics when asked; do not force every answer back to Dream Unity.
- Never claim access to game state, scores, account data, personal history or sensors that were not actually supplied.
- Do not claim Dream Unity is a validated clinical, neurological, psychometric or IQ intervention.
- If asked what you are, say you are Dream Unity's realtime voice intelligence.
- Reply in the visitor's language when practical.
- Keep spoken wording easy to follow and avoid dense formatting.`;

  const app = document.getElementById('app');
  const launcher = document.querySelector('[data-voice-launcher]');
  const panel = document.getElementById('duVoicePanel');
  const closeButton = document.getElementById('duVoiceClose');
  const actionButton = document.getElementById('duVoiceAction');
  const status = document.getElementById('duVoiceStatus');
  const copy = document.getElementById('duVoiceCopy');
  const invite = document.getElementById('duOracleInvite');

  if (!app || !launcher || !panel || !closeButton || !actionButton || !status || !copy) return;

  let socket = null;
  let microphone = null;
  let captureContext = null;
  let captureSource = null;
  let captureProcessor = null;
  let captureMute = null;
  let playbackContext = null;
  let playbackTime = 0;
  let playbackStartedAt = 0;
  let playbackQueueDepth = 0;
  let playbackSources = new Set();
  let currentResponseItemId = null;
  let sessionTimer = 0;
  let active = false;
  let connecting = false;
  let connected = false;
  let intentionalClose = false;
  let assistantTranscript = '';
  let arrivalSpeaking = false;

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
    sessionTimer = 0;
  }

  function chooseArrivalVoice(locale) {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    const language = String(locale || 'en-US').toLowerCase();
    const base = language.split('-')[0];
    return voices.find(v => String(v.lang).toLowerCase() === language)
      || voices.find(v => String(v.lang).toLowerCase().startsWith(`${base}-`))
      || voices.find(v => /google|samantha|daniel|serena|aria|natural|enhanced/i.test(v.name))
      || voices[0]
      || null;
  }

  function cancelArrivalSpeech() {
    try { window.speechSynthesis?.cancel(); } catch (_) {}
    arrivalSpeaking = false;
  }

  function speakArrival(text) {
    return new Promise(resolve => {
      const synth = window.speechSynthesis;
      if (!synth || !window.SpeechSynthesisUtterance) {
        resolve();
        return;
      }
      cancelArrivalSpeech();
      arrivalSpeaking = true;
      setPanelState('speaking', 'UNITY IS SPEAKING');
      const utterance = new SpeechSynthesisUtterance(String(text || '').slice(0, 400));
      utterance.lang = navigator.language || 'en-US';
      utterance.rate = 1.02;
      utterance.pitch = 1;
      const voice = chooseArrivalVoice(utterance.lang);
      if (voice) utterance.voice = voice;
      let doneOnce = false;
      const done = () => {
        if (doneOnce) return;
        doneOnce = true;
        arrivalSpeaking = false;
        resolve();
      };
      utterance.onend = done;
      utterance.onerror = done;
      window.setTimeout(done, 15_000);
      synth.speak(utterance);
    });
  }

  function send(event) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  }

  function encodePcm16(samples) {
    const buffer = new ArrayBuffer(samples.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function decodePcm16(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const pcm = new Int16Array(bytes.buffer);
    const samples = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 32768;
    return samples;
  }

  function resample(input, inputRate, outputRate) {
    if (inputRate === outputRate) return new Float32Array(input);
    const ratio = inputRate / outputRate;
    const outputLength = Math.round(input.length / ratio);
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const sourceIndex = i * ratio;
      const floor = Math.floor(sourceIndex);
      const ceil = Math.min(floor + 1, input.length - 1);
      const fraction = sourceIndex - floor;
      output[i] = input[floor] * (1 - fraction) + input[ceil] * fraction;
    }
    return output;
  }

  async function ensurePlaybackContext() {
    if (!playbackContext || playbackContext.state === 'closed') {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('Web Audio unsupported');
      playbackContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      playbackTime = playbackContext.currentTime;
    }
    if (playbackContext.state === 'suspended') await playbackContext.resume();
  }

  function setSpeakingFromPlayback() {
    if (!active || !connected) return;
    if (playbackSources.size > 0 || playbackQueueDepth > 0) {
      setPanelState('speaking', 'DREAM UNITY IS SPEAKING');
    } else {
      setPanelState('listening', 'LISTENING');
    }
  }

  async function playAudio(base64) {
    await ensurePlaybackContext();
    const samples = decodePcm16(base64);
    if (!samples.length) return;
    const buffer = playbackContext.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(samples);
    const source = playbackContext.createBufferSource();
    source.buffer = buffer;
    source.connect(playbackContext.destination);
    const startTime = Math.max(playbackTime, playbackContext.currentTime);
    if (playbackSources.size === 0) playbackStartedAt = startTime;
    source.start(startTime);
    playbackTime = startTime + buffer.duration;
    playbackQueueDepth++;
    playbackSources.add(source);
    setSpeakingFromPlayback();
    source.onended = () => {
      playbackSources.delete(source);
      playbackQueueDepth = Math.max(0, playbackQueueDepth - 1);
      if (playbackSources.size === 0) {
        playbackTime = playbackContext?.currentTime || 0;
        setSpeakingFromPlayback();
      }
    };
  }

  function stopPlayback({ truncate = false } = {}) {
    const playedMs = playbackContext ? Math.max(0, (playbackContext.currentTime - playbackStartedAt) * 1000) : 0;
    for (const source of playbackSources) {
      try { source.stop(); } catch (_) {}
    }
    playbackSources.clear();
    playbackQueueDepth = 0;
    if (playbackContext) playbackTime = playbackContext.currentTime;
    if (truncate && currentResponseItemId && playedMs > 0) {
      send({
        type: 'conversation-item-truncate',
        itemId: currentResponseItemId,
        contentIndex: 0,
        audioEndMs: Math.round(playedMs)
      });
    }
    currentResponseItemId = null;
  }

  function stopCapture() {
    try { captureProcessor?.disconnect(); } catch (_) {}
    try { captureSource?.disconnect(); } catch (_) {}
    try { captureMute?.disconnect(); } catch (_) {}
    try { captureContext?.close(); } catch (_) {}
    captureProcessor = null;
    captureSource = null;
    captureMute = null;
    captureContext = null;
    if (microphone) {
      for (const track of microphone.getTracks()) track.stop();
    }
    microphone = null;
  }

  function startCapture(stream) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Web Audio unsupported');
    captureContext = new AudioContext();
    captureSource = captureContext.createMediaStreamSource(stream);
    captureProcessor = captureContext.createScriptProcessor(4096, 1, 1);
    captureMute = captureContext.createGain();
    captureMute.gain.value = 0;
    captureProcessor.onaudioprocess = event => {
      if (!active || !connected || socket?.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      const samples = resample(new Float32Array(input), captureContext.sampleRate, SAMPLE_RATE);
      send({ type: 'input-audio-append', audio: encodePcm16(samples) });
    };
    captureSource.connect(captureProcessor);
    captureProcessor.connect(captureMute);
    captureMute.connect(captureContext.destination);
  }

  function closeSocket() {
    if (!socket) return;
    try { socket.onopen = null; socket.onmessage = null; socket.onerror = null; socket.onclose = null; socket.close(); } catch (_) {}
    socket = null;
  }

  function cleanup({ keepPanel = true, message = 'READY TO CONNECT' } = {}) {
    intentionalClose = true;
    active = false;
    connecting = false;
    connected = false;
    assistantTranscript = '';
    clearTimers();
    cancelArrivalSpeech();
    stopCapture();
    stopPlayback();
    closeSocket();
    panel.classList.remove('arrival');
    setPanelState('', message);
    actionButton.disabled = false;
    actionButton.textContent = message === 'SESSION COMPLETE' ? 'RECONNECT' : 'START CONVERSATION';
    if (message === 'READY TO CONNECT') copy.textContent = DEFAULT_COPY;
    if (!keepPanel) setOpen(false);
    queueMicrotask(() => { intentionalClose = false; });
  }

  function fail(message) {
    const text = String(message || '');
    intentionalClose = true;
    active = false;
    connecting = false;
    connected = false;
    clearTimers();
    cancelArrivalSpeech();
    stopCapture();
    stopPlayback();
    closeSocket();
    panel.classList.remove('arrival');
    setOpen(true);
    setPanelState('error', 'VOICE LINK FAILED');
    actionButton.disabled = false;
    actionButton.textContent = 'RETRY VOICE';

    if (/notallowed|permission|denied|audio-capture/i.test(text)) {
      copy.textContent = 'Microphone permission was not granted. Allow microphone access, then try again.';
    } else if (/402|payment|credit|budget/i.test(text)) {
      copy.textContent = 'Dream Unity voice has reached its current AI Gateway usage allowance. Try again after usage is available.';
    } else if (/429|rate/i.test(text)) {
      copy.textContent = 'Dream Unity voice is briefly rate-limited. Try again shortly.';
    } else if (/401|403|auth|oidc/i.test(text)) {
      copy.textContent = 'Dream Unity could not authenticate its secure realtime voice link.';
    } else if (/unsupported|WebSocket|Web Audio/i.test(text)) {
      copy.textContent = 'This browser does not support the realtime audio connection Dream Unity needs.';
    } else {
      copy.textContent = 'The realtime voice conversation could not continue. Tap retry to reconnect.';
    }
    queueMicrotask(() => { intentionalClose = false; });
  }

  function handleRealtimeEvent(event) {
    const type = String(event?.type || '');
    if (type === 'session-updated') {
      if (connected) return;
      connecting = false;
      connected = true;
      actionButton.disabled = false;
      actionButton.textContent = 'END CONVERSATION';
      copy.textContent = 'Connected. Speak whenever you are ready.';
      try {
        startCapture(microphone);
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        return;
      }
      setPanelState('listening', 'LISTENING');
      sessionTimer = window.setTimeout(() => {
        cleanup({ keepPanel: true, message: 'SESSION COMPLETE' });
        copy.textContent = 'Eight-minute public voice session complete. Tap below to reconnect.';
      }, MAX_SESSION_MS);
      return;
    }

    if (type === 'speech-started') {
      if (playbackSources.size > 0) stopPlayback({ truncate: true });
      assistantTranscript = '';
      setPanelState('listening', 'LISTENING');
      copy.textContent = 'I can hear you. Speak naturally.';
      return;
    }

    if (type === 'speech-stopped') {
      setPanelState('connected', 'THINKING');
      copy.textContent = 'Dream Unity is thinking…';
      return;
    }

    if (type === 'input-transcription-completed') {
      const transcript = String(event?.transcript || '').trim();
      if (transcript) copy.textContent = transcript.slice(-520);
      return;
    }

    if (type === 'audio-delta' && typeof event?.delta === 'string') {
      currentResponseItemId = event.itemId || currentResponseItemId;
      playAudio(event.delta).catch(error => fail(error instanceof Error ? error.message : String(error)));
      return;
    }

    if (type === 'audio-transcript-delta' && typeof event?.delta === 'string') {
      assistantTranscript = (assistantTranscript + event.delta).slice(-1200);
      if (assistantTranscript.trim()) copy.textContent = assistantTranscript.trim().slice(-520);
      return;
    }

    if (type === 'audio-transcript-done') {
      const transcript = String(event?.transcript || assistantTranscript || '').trim();
      if (transcript) copy.textContent = transcript.slice(-520);
      return;
    }

    if (type === 'response-done') {
      assistantTranscript = '';
      if (playbackSources.size === 0) setPanelState('listening', 'LISTENING');
      return;
    }

    if (type === 'error') {
      fail(event?.message || event?.code || 'Realtime model error');
    }
  }

  async function getGatewaySession() {
    const response = await fetch(VOICE_ENDPOINT, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'dream-unity-front-page' })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.token || !data?.url) {
      throw new Error(String(data?.code || data?.error || `Voice session request failed (${response.status}).`));
    }
    return data;
  }

  async function begin() {
    if (active || connecting || connected) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.WebSocket) {
      fail('Realtime WebSocket microphone voice unsupported');
      return;
    }

    cancelArrivalSpeech();
    panel.classList.remove('arrival');
    active = true;
    connecting = true;
    setOpen(true);
    setPanelState('connecting', 'CONNECTING');
    actionButton.disabled = true;
    actionButton.textContent = 'CONNECTING';
    copy.textContent = 'Unity is opening the realtime listening channel…';

    try {
      await ensurePlaybackContext();
      microphone = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      });
      const session = await getGatewaySession();
      if (!active) return;
      const protocols = ['ai-gateway-realtime.v1', `ai-gateway-auth.${session.token}`];
      socket = new WebSocket(session.url, protocols);

      socket.onopen = () => {
        if (!active) return;
        send({
          type: 'session-update',
          config: {
            instructions: `${SYSTEM_PROMPT}\nVisitor locale: ${navigator.language || 'unknown'}.`,
            voice: 'marin',
            outputModalities: ['audio'],
            inputAudioFormat: { type: 'audio/pcm', rate: SAMPLE_RATE },
            inputAudioTranscription: { model: 'gpt-realtime-whisper' },
            outputAudioFormat: { type: 'audio/pcm', rate: SAMPLE_RATE },
            turnDetection: {
              type: 'server-vad',
              threshold: 0.45,
              silenceDurationMs: 500,
              prefixPaddingMs: 300
            },
            providerOptions: { max_output_tokens: 900 }
          }
        });
      };

      socket.onmessage = message => {
        try { handleRealtimeEvent(JSON.parse(message.data)); } catch (_) {}
      };
      socket.onerror = () => {
        if (active && !intentionalClose) fail('Realtime WebSocket connection error');
      };
      socket.onclose = event => {
        socket = null;
        if (active && !intentionalClose) fail(`Realtime WebSocket closed (${event.code || 0})`);
      };
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }

  async function greetOnArrival() {
    if (app.classList.contains('detail') || app.classList.contains('game-open')) return;
    panel.classList.add('arrival');
    setOpen(true);
    copy.textContent = ARRIVAL_GREETING;
    actionButton.textContent = 'START CONVERSATION';
    setPanelState('speaking', 'UNITY IS SPEAKING');
    await speakArrival(ARRIVAL_GREETING);
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
    if (active || connecting || connected) cleanup({ keepPanel: true });
    else begin();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel.classList.contains('open')) cleanup({ keepPanel: false });
  });

  const observer = new MutationObserver(() => {
    if ((app.classList.contains('detail') || app.classList.contains('game-open')) && panel.classList.contains('open')) {
      cleanup({ keepPanel: false });
    }
  });
  observer.observe(app, { attributes: true, attributeFilter: ['class'] });

  const queueArrivalGreeting = () => window.setTimeout(greetOnArrival, 120);
  if (document.visibilityState === 'hidden') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') queueArrivalGreeting();
    }, { once: true });
  } else {
    queueArrivalGreeting();
  }

  window.addEventListener('pagehide', () => cleanup({ keepPanel: false }));
})();
