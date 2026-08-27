(() => {
  'use strict';

  const TOKEN_ENDPOINT = 'https://dream-unity-become-live.vercel.app/api/realtime-session';
  const CALLS_ENDPOINT = 'https://api.openai.com/v1/realtime/calls';
  const MAX_SESSION_MS = 8 * 60 * 1000;

  const app = document.getElementById('app');
  const launcher = document.getElementById('duVoiceLauncher');
  const panel = document.getElementById('duVoicePanel');
  const closeButton = document.getElementById('duVoiceClose');
  const actionButton = document.getElementById('duVoiceAction');
  const status = document.getElementById('duVoiceStatus');
  const copy = document.getElementById('duVoiceCopy');
  const audio = document.getElementById('duVoiceAudio');

  if (!app || !launcher || !panel || !closeButton || !actionButton || !status || !copy || !audio) return;

  let peer = null;
  let channel = null;
  let microphone = null;
  let sessionTimer = 0;
  let connecting = false;
  let connected = false;
  let assistantText = '';

  const DEFAULT_COPY = 'Speak naturally. Ask what to train, how the worlds differ, or anything you want Dream Unity to reason through with you.';

  function setPanelState(name, message) {
    panel.classList.remove('connecting', 'connected', 'listening', 'speaking', 'error');
    if (name) panel.classList.add(name);
    if (message) status.textContent = message;
  }

  function setOpen(open) {
    panel.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function send(event) {
    if (channel?.readyState === 'open') channel.send(JSON.stringify(event));
  }

  function renderEvent(event) {
    const type = String(event?.type || '');

    if (type === 'input_audio_buffer.speech_started') {
      setPanelState('listening', 'LISTENING');
      copy.textContent = 'I can hear you.';
      assistantText = '';
      return;
    }

    if (type === 'input_audio_buffer.speech_stopped') {
      setPanelState('connected', 'THINKING');
      copy.textContent = 'Working through what you said…';
      return;
    }

    if ((type.includes('output_audio') || type.includes('audio')) && type.endsWith('.delta') && String(event?.delta || '')) {
      setPanelState('speaking', 'DREAM UNITY IS SPEAKING');
    }

    if (type.includes('transcript') && type.endsWith('.delta') && typeof event?.delta === 'string') {
      assistantText = (assistantText + event.delta).slice(-520);
      if (assistantText.trim()) copy.textContent = assistantText.trim();
    }

    if (type.includes('transcript') && type.endsWith('.done')) {
      const transcript = String(event?.transcript || event?.text || assistantText || '').trim();
      if (transcript) copy.textContent = transcript.slice(0, 520);
    }

    if (type === 'response.done') {
      setPanelState('connected', 'LISTENING');
      if (!copy.textContent.trim() || copy.textContent === 'Working through what you said…') {
        copy.textContent = 'Your turn.';
      }
      assistantText = '';
      return;
    }

    if (type === 'error') {
      const message = String(event?.error?.message || 'Realtime voice error.');
      fail(message);
    }
  }

  function cleanup({ keepPanel = true, message = 'READY TO CONNECT' } = {}) {
    window.clearTimeout(sessionTimer);
    sessionTimer = 0;
    connecting = false;
    connected = false;
    assistantText = '';

    try { channel?.close(); } catch (_) {}
    channel = null;

    try { peer?.close(); } catch (_) {}
    peer = null;

    if (microphone) {
      for (const track of microphone.getTracks()) track.stop();
    }
    microphone = null;
    audio.srcObject = null;

    setPanelState('', message);
    actionButton.disabled = false;
    actionButton.textContent = 'START VOICE';
    if (message === 'READY TO CONNECT') copy.textContent = DEFAULT_COPY;
    if (!keepPanel) setOpen(false);
  }

  function fail(message) {
    cleanup({ keepPanel: true, message: 'VOICE LINK FAILED' });
    panel.classList.add('error');
    const friendly = /permission|denied|notallowed/i.test(message)
      ? 'Microphone permission was not granted. Allow microphone access, then try again.'
      : /not configured|503|VOICE_NOT_CONFIGURED/i.test(message)
        ? 'The secure voice backend needs its OpenAI API key configured before public voice can start.'
        : 'The realtime connection could not start. Tap retry to try again.';
    copy.textContent = friendly;
    actionButton.textContent = 'RETRY VOICE';
  }

  async function getEphemeralKey() {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ source: 'dream-unity-front-page' })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.value) {
      const error = new Error(String(data?.code || data?.error || `Voice token request failed (${response.status}).`));
      error.status = response.status;
      throw error;
    }
    return data.value;
  }

  async function connect() {
    if (connecting || connected) return;
    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
      fail('This browser does not support WebRTC microphone voice.');
      return;
    }

    connecting = true;
    setOpen(true);
    setPanelState('connecting', 'CONNECTING');
    copy.textContent = 'Opening a secure realtime voice link…';
    actionButton.disabled = true;
    actionButton.textContent = 'CONNECTING';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      microphone = stream;
      const ephemeralKey = await getEphemeralKey();

      peer = new RTCPeerConnection();
      channel = peer.createDataChannel('oai-events');

      peer.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        audio.play().catch(() => {});
      };

      peer.onconnectionstatechange = () => {
        const state = peer?.connectionState;
        if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          if (connected) fail(`WebRTC ${state}.`);
        }
      };

      for (const track of microphone.getTracks()) peer.addTrack(track, microphone);

      channel.addEventListener('message', (event) => {
        try { renderEvent(JSON.parse(event.data)); } catch (_) {}
      });

      channel.addEventListener('open', () => {
        connecting = false;
        connected = true;
        setPanelState('connected', 'LISTENING');
        actionButton.disabled = false;
        actionButton.textContent = 'END VOICE';
        copy.textContent = 'Connected. Speak whenever you are ready.';

        sessionTimer = window.setTimeout(() => {
          cleanup({ keepPanel: true, message: 'SESSION COMPLETE' });
          copy.textContent = 'Eight-minute public voice session complete. Tap below to reconnect.';
          actionButton.textContent = 'RECONNECT';
        }, MAX_SESSION_MS);

        send({
          type: 'response.create',
          response: {
            instructions: 'Greet the visitor as Dream Unity in one short sentence, then invite them to speak.'
          }
        });
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      const sdpResponse = await fetch(CALLS_ENDPOINT, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp'
        }
      });

      if (!sdpResponse.ok) {
        throw new Error(`Realtime SDP exchange failed (${sdpResponse.status}).`);
      }

      await peer.setRemoteDescription({
        type: 'answer',
        sdp: await sdpResponse.text()
      });
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }

  launcher.addEventListener('click', () => {
    setOpen(true);
    connect();
  });

  closeButton.addEventListener('click', () => cleanup({ keepPanel: false }));

  actionButton.addEventListener('click', () => {
    if (connected || connecting) cleanup({ keepPanel: true });
    else connect();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel.classList.contains('open')) cleanup({ keepPanel: false });
  });

  const observer = new MutationObserver(() => {
    if ((app.classList.contains('detail') || app.classList.contains('game-open')) && (connected || connecting)) {
      cleanup({ keepPanel: false });
    }
  });
  observer.observe(app, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener('pagehide', () => cleanup({ keepPanel: false }));
})();
