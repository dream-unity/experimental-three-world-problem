import React, { useCallback, useEffect, useMemo, useRef } from 'https://esm.sh/react@19.2.8';
import { createRoot } from 'https://esm.sh/react-dom@19.2.8/client?deps=react@19.2.8';
import { experimental_useRealtime } from 'https://esm.sh/@ai-sdk/react@4.0.82?bundle&deps=react@19.2.8,ai@7.0.79';
import { gateway } from 'https://esm.sh/@ai-sdk/gateway@4.0.62?bundle';

const TOKEN_ENDPOINT = 'https://dream-unity-become-live.vercel.app/api/realtime-session';
const MAX_SESSION_MS = 8 * 60 * 1000;
const MODEL = 'openai/gpt-realtime-2.1';
const DEFAULT_COPY = 'Speak naturally. Ask what to train, how the worlds differ, or anything you want Dream Unity to reason through with you.';
const SYSTEM_PROMPT = `You are Dream Unity, the spoken intelligence embedded inside the Dream Unity cognitive-training environment. Speak as Dream Unity, not as ChatGPT.

Your job is to help a visitor understand, navigate and train the operations represented by the three worlds.

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
- Be natural, intelligent and concise. Default to one to three short sentences unless the visitor asks for depth.
- For training, ask one clear question or give one exercise at a time.
- Make sharp distinctions between Perceive, Model and Predict. Do not collapse modelling into prediction or perception.
- Help the visitor choose a world or operation based on the cognitive problem they describe.
- You may discuss other topics when asked; do not force every answer back to Dream Unity.
- Never pretend you can see a game state, score, personal history, account data or sensor information you have not actually received.
- Do not claim Dream Unity is a validated clinical, neurological, psychometric or IQ intervention. It is an experimental training environment.
- If the visitor asks what you are, say you are Dream Unity's realtime voice intelligence.
- Keep spoken wording easy to follow. Avoid dense lists unless specifically requested.`;

const app = document.getElementById('app');
const launcher = document.getElementById('duVoiceLauncher');
const panel = document.getElementById('duVoicePanel');
const closeButton = document.getElementById('duVoiceClose');
const actionButton = document.getElementById('duVoiceAction');
const statusLabel = document.getElementById('duVoiceStatus');
const copy = document.getElementById('duVoiceCopy');

if (app && launcher && panel && closeButton && actionButton && statusLabel && copy) {
  const bridge = document.createElement('div');
  bridge.id = 'duVoiceRealtimeBridge';
  bridge.hidden = true;
  document.body.appendChild(bridge);
  createRoot(bridge).render(React.createElement(DreamUnityRealtimeBridge));
}

function DreamUnityRealtimeBridge() {
  const microphoneRef = useRef(null);
  const timerRef = useRef(0);
  const endingRef = useRef(false);

  const model = useMemo(() => gateway.experimental_realtime(MODEL), []);
  const sessionConfig = useMemo(() => ({
    instructions: SYSTEM_PROMPT,
    inputAudioTranscription: {},
    voice: 'marin',
    turnDetection: { type: 'server-vad' }
  }), []);

  const realtime = experimental_useRealtime({
    model,
    api: { token: TOKEN_ENDPOINT },
    sessionConfig,
    maxEvents: 80,
    onError: error => {
      console.error('Dream Unity realtime voice error', error?.message || error);
      if (!endingRef.current) showFailure(error?.message || String(error));
    }
  });

  const setOpen = useCallback(open => {
    panel.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
  }, []);

  const setPanelState = useCallback((name, message) => {
    panel.classList.remove('connecting', 'connected', 'listening', 'speaking', 'error');
    if (name) panel.classList.add(name);
    if (message) statusLabel.textContent = message;
  }, []);

  const stopTracks = useCallback(() => {
    const stream = microphoneRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    microphoneRef.current = null;
  }, []);

  const resetTimer = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = 0;
  }, []);

  const end = useCallback(({ keepPanel = true, message = 'READY TO CONNECT' } = {}) => {
    endingRef.current = true;
    resetTimer();
    try { realtime.stopAudioCapture(); } catch (_) {}
    try { realtime.stopPlayback(); } catch (_) {}
    try { realtime.disconnect(); } catch (_) {}
    stopTracks();
    setPanelState('', message);
    actionButton.disabled = false;
    actionButton.textContent = message === 'SESSION COMPLETE' ? 'RECONNECT' : 'START VOICE';
    if (message === 'READY TO CONNECT') copy.textContent = DEFAULT_COPY;
    if (!keepPanel) setOpen(false);
    queueMicrotask(() => { endingRef.current = false; });
  }, [realtime, resetTimer, setOpen, setPanelState, stopTracks]);

  const begin = useCallback(async () => {
    if (realtime.status === 'connecting' || realtime.status === 'connected') return;
    if (!navigator.mediaDevices?.getUserMedia || !window.WebSocket) {
      showFailure('This browser does not support realtime microphone voice.');
      return;
    }

    setOpen(true);
    setPanelState('connecting', 'CONNECTING');
    copy.textContent = 'Opening a secure Dream Unity voice link…';
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
      microphoneRef.current = stream;
      await realtime.connect();
      realtime.startAudioCapture(stream);
      actionButton.disabled = false;
      actionButton.textContent = 'END VOICE';
      copy.textContent = 'Connected. Speak whenever you are ready.';
      timerRef.current = window.setTimeout(() => {
        end({ keepPanel: true, message: 'SESSION COMPLETE' });
        copy.textContent = 'Eight-minute public voice session complete. Tap below to reconnect.';
      }, MAX_SESSION_MS);
    } catch (error) {
      stopTracks();
      try { realtime.disconnect(); } catch (_) {}
      showFailure(error instanceof Error ? error.message : String(error));
    }
  }, [end, realtime, setOpen, setPanelState, stopTracks]);

  function showFailure(message) {
    resetTimer();
    stopTracks();
    setOpen(true);
    setPanelState('error', 'VOICE LINK FAILED');
    actionButton.disabled = false;
    actionButton.textContent = 'RETRY VOICE';
    const friendly = /permission|denied|notallowed/i.test(String(message))
      ? 'Microphone permission was not granted. Allow microphone access, then try again.'
      : /402|payment|credit|budget/i.test(String(message))
        ? 'Voice is temporarily unavailable because the Dream Unity AI Gateway needs available usage credit.'
        : /401|403|auth|oidc|gateway/i.test(String(message))
          ? 'The secure Dream Unity AI Gateway could not authenticate this session.'
          : 'The realtime connection could not start. Tap retry to try again.';
    copy.textContent = friendly;
  }

  useEffect(() => {
    if (realtime.status === 'connecting') {
      setPanelState('connecting', 'CONNECTING');
    } else if (realtime.status === 'connected') {
      if (realtime.isPlaying) setPanelState('speaking', 'DREAM UNITY IS SPEAKING');
      else if (realtime.isCapturing) setPanelState('listening', 'LISTENING');
      else setPanelState('connected', 'CONNECTED');
    } else if (realtime.status === 'error' && !endingRef.current) {
      setPanelState('error', 'VOICE LINK FAILED');
    }
  }, [realtime.status, realtime.isCapturing, realtime.isPlaying, setPanelState]);

  useEffect(() => {
    const lastAssistant = [...realtime.messages].reverse().find(message => message.role === 'assistant');
    if (!lastAssistant) return;
    const text = lastAssistant.parts
      .filter(part => part.type === 'text')
      .map(part => part.text || '')
      .join('')
      .trim();
    if (text) copy.textContent = text.slice(-520);
  }, [realtime.messages]);

  useEffect(() => {
    const onLauncher = () => { setOpen(true); begin(); };
    const onClose = () => end({ keepPanel: false });
    const onAction = () => {
      if (realtime.status === 'connected' || realtime.status === 'connecting') end({ keepPanel: true });
      else begin();
    };
    const onKeyDown = event => {
      if (event.key === 'Escape' && panel.classList.contains('open')) end({ keepPanel: false });
    };

    launcher.addEventListener('click', onLauncher);
    closeButton.addEventListener('click', onClose);
    actionButton.addEventListener('click', onAction);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      launcher.removeEventListener('click', onLauncher);
      closeButton.removeEventListener('click', onClose);
      actionButton.removeEventListener('click', onAction);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [begin, end, realtime.status, setOpen]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      if ((app.classList.contains('detail') || app.classList.contains('game-open')) &&
          (realtime.status === 'connected' || realtime.status === 'connecting')) {
        end({ keepPanel: false });
      }
    });
    observer.observe(app, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [end, realtime.status]);

  useEffect(() => {
    const onPageHide = () => end({ keepPanel: false });
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [end]);

  return null;
}
