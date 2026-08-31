(() => {
  'use strict';

  const RELEASE = '20260831-dream-maker-eye-score-31';
  const audio = document.getElementById('scoreAudio');
  const button = document.getElementById('scoreControl');
  const stateLabel = document.getElementById('scoreState');
  const worldButtons = [...document.querySelectorAll('.world-label')];
  const subButtons = [...document.querySelectorAll('.sub-label')];
  const muteKey = 'dream-unity-score-muted';
  const analysisKey = '__dreamUnityAnalysisBridge';

  let userMuted = false;
  let context = null;
  let source = null;
  let analyser = null;
  let frequencyData = null;
  let previousEnergy = 0;
  let low = 0;
  let mid = 0;
  let high = 0;
  let energy = 0;
  let flux = 0;
  let beat = 0;
  let lastSampleFrame = -1;
  let lastSample = null;

  const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
  const mix = (from, to, amount) => from + (to - from) * amount;

  try { userMuted = localStorage.getItem(muteKey) === '1'; } catch {}

  function reflect(mode) {
    if (!button || !stateLabel) return;
    const playing = mode === 'on';
    button.dataset.state = mode;
    button.setAttribute('aria-pressed', String(playing));
    button.setAttribute('aria-label', playing ? 'Turn Dream Unity music off' : 'Play Dream Unity music');
    stateLabel.textContent = playing ? 'ON' : mode === 'loading' ? 'LOADING' : mode === 'waiting' ? 'PLAY' : 'OFF';
  }

  function attachBridge(bridge) {
    if (!bridge) return false;
    context = bridge.context;
    source = bridge.source;
    analyser = bridge.analyser;
    frequencyData = bridge.frequencyData;
    return Boolean(context && source && analyser && frequencyData);
  }

  async function ensureAnalysis() {
    if (!audio) return false;
    if (attachBridge(audio[analysisKey])) {
      if (context.state === 'suspended') await context.resume().catch(() => {});
      return context.state === 'running';
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    try {
      const nextContext = new AudioContextClass({ latencyHint: 'interactive' });
      const nextSource = nextContext.createMediaElementSource(audio);
      const nextAnalyser = nextContext.createAnalyser();
      nextAnalyser.fftSize = 1024;
      nextAnalyser.smoothingTimeConstant = 0.72;
      nextSource.connect(nextAnalyser);
      nextAnalyser.connect(nextContext.destination);
      const bridge = {
        context: nextContext,
        source: nextSource,
        analyser: nextAnalyser,
        frequencyData: new Uint8Array(nextAnalyser.frequencyBinCount),
      };
      Object.defineProperty(audio, analysisKey, { value: bridge, configurable: false });
      attachBridge(bridge);
      if (context.state === 'suspended') await context.resume().catch(() => {});
      return context.state === 'running';
    } catch {
      return false;
    }
  }

  function bandRms(minimumHz, maximumHz) {
    if (!frequencyData || !analyser || !context) return 0;
    const binHz = context.sampleRate / analyser.fftSize;
    const start = Math.max(1, Math.floor(minimumHz / binHz));
    const end = Math.min(frequencyData.length - 1, Math.ceil(maximumHz / binHz));
    let sum = 0;
    let count = 0;
    for (let index = start; index <= end; index += 1) {
      const value = frequencyData[index] / 255;
      sum += value * value;
      count += 1;
    }
    return count ? Math.sqrt(sum / count) : 0;
  }

  function sampleScore() {
    const frame = Math.floor(performance.now() / 16);
    if (frame === lastSampleFrame && lastSample) return lastSample;
    lastSampleFrame = frame;

    const playing = Boolean(audio && !audio.paused && !audio.muted && !audio.ended && !userMuted);
    const live = Boolean(playing && analyser && context?.state === 'running');
    if (live) {
      try {
        analyser.getByteFrequencyData(frequencyData);
        const rawLow = clamp((bandRms(28, 190) - 0.018) * 1.85);
        const rawMid = clamp((bandRms(190, 2600) - 0.012) * 1.72);
        const rawHigh = clamp((bandRms(2600, 12000) - 0.008) * 2.02);
        const rawEnergy = clamp(rawLow * 0.44 + rawMid * 0.36 + rawHigh * 0.20);
        low = mix(low, rawLow, rawLow > low ? 0.42 : 0.10);
        mid = mix(mid, rawMid, rawMid > mid ? 0.40 : 0.11);
        high = mix(high, rawHigh, rawHigh > high ? 0.38 : 0.12);
        energy = mix(energy, rawEnergy, rawEnergy > energy ? 0.46 : 0.12);
        const rawFlux = clamp((rawEnergy - previousEnergy) * 7.8);
        flux = Math.max(rawFlux, flux * 0.72);
        previousEnergy = rawEnergy;
        beat = clamp(Math.max(flux, rawLow * 0.34));
      } catch {
        // Keep the last stable analysis values if the platform interrupts Web Audio.
      }
    } else {
      low = mix(low, 0.13, 0.025);
      mid = mix(mid, 0.11, 0.025);
      high = mix(high, 0.08, 0.025);
      energy = mix(energy, 0.12, 0.025);
      flux *= 0.84;
      beat *= 0.78;
      previousEnergy = 0;
    }

    lastSample = Object.freeze({
      low: clamp(low),
      mid: clamp(mid),
      high: clamp(high),
      air: clamp(high),
      energy: clamp(energy),
      flux: clamp(flux),
      beat: clamp(beat),
      pressure: clamp(low * 0.55 + mid * 0.45),
      bloom: clamp(high * 0.55 + flux * 0.45),
      currentTime: Number.isFinite(audio?.currentTime) ? audio.currentTime : 0,
      duration: Number.isFinite(audio?.duration) ? audio.duration : 359.448,
      playing,
      analysed: live,
      analyzed: live,
      track: 'Dream Maker Eye',
    });
    return lastSample;
  }

  window.__dreamUnityScore = Object.freeze({
    version: RELEASE,
    track: 'Dream Maker Eye',
    sample: sampleScore,
    ensureAnalysis,
  });

  async function play(fromGesture = false) {
    if (!audio || userMuted) return false;
    audio.muted = false;
    audio.volume = 0.72;
    try {
      if (fromGesture) await ensureAnalysis();
      await audio.play();
      reflect('on');
      return true;
    } catch {
      reflect(fromGesture ? 'off' : 'waiting');
      return false;
    }
  }

  if (audio) {
    if (userMuted) {
      audio.pause();
      reflect('off');
    } else {
      reflect('loading');
      play(false);
      audio.addEventListener('canplay', () => play(false), { once: true });
      audio.addEventListener('playing', () => reflect('on'));
      audio.addEventListener('pause', () => reflect(userMuted ? 'off' : 'waiting'));
      audio.addEventListener('ended', () => reflect('waiting'));
      audio.addEventListener('error', () => reflect('off'));
    }
  }

  button?.addEventListener('click', async () => {
    if (!audio) return;
    if (!audio.paused && !audio.muted) {
      userMuted = true;
      audio.pause();
      reflect('off');
      try { localStorage.setItem(muteKey, '1'); } catch {}
      return;
    }
    userMuted = false;
    try { localStorage.removeItem(muteKey); } catch {}
    await play(true);
  });

  // An explicit interaction can unlock analysis, but never changes the user's mute choice.
  document.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Element && event.target.closest('#scoreControl')) return;
    if (!userMuted && audio && !audio.paused) ensureAnalysis();
  }, { capture: true, passive: true });

  function cycleFocus(buttons, direction) {
    const visible = buttons.filter((item) => item.offsetParent !== null && getComputedStyle(item).pointerEvents !== 'none');
    if (!visible.length) return;
    const current = visible.indexOf(document.activeElement);
    visible[(current < 0 ? 0 : current + direction + visible.length) % visible.length].focus();
  }

  document.addEventListener('keydown', (event) => {
    if (window.__dreamUnityGameActive || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const detail = document.getElementById('app')?.classList.contains('detail');
    cycleFocus(detail ? subButtons : worldButtons, event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1);
    event.preventDefault();
  });
})();
