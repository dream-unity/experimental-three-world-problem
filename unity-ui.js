(() => {
  'use strict';

  const audio = document.getElementById('scoreAudio');
  const button = document.getElementById('scoreControl');
  const state = document.getElementById('scoreState');
  const app = document.getElementById('app');
  const worldButtons = [...document.querySelectorAll('.world-label')];
  const subButtons = [...document.querySelectorAll('.sub-label')];
  const muteKey = 'dream-unity-score-muted';
  const scoreDuration = 346.512;
  // I Remember Tomorrow breathes around an 87 BPM pulse. Live
  // onset energy can bend the response without turning the field into a meter.
  const scoreTempo = 86.7;
  const analysisKey = '__dreamUnityAnalysisBridge';
  const scoreSections = Object.freeze([
    { id: 'invocation', start: 0, end: 43.75, from: [0.10, 0.16, 0.22, 0.14], to: [0.38, 0.46, 0.54, 0.46] },
    { id: 'opening', start: 43.75, end: 59.60, from: [0.38, 0.50, 0.62, 0.48], to: [0.54, 0.64, 0.70, 0.64] },
    { id: 'ascent', start: 59.60, end: 101.75, from: [0.52, 0.62, 0.68, 0.64], to: [0.68, 0.76, 0.72, 0.76] },
    { id: 'first-crown', start: 101.75, end: 149.30, from: [0.68, 0.76, 0.72, 0.74], to: [0.76, 0.84, 0.78, 0.86] },
    { id: 'breath', start: 149.30, end: 151.20, from: [0.40, 0.44, 0.38, 0.40], to: [0.34, 0.36, 0.30, 0.34] },
    { id: 'rebuild', start: 151.20, end: 201.40, from: [0.50, 0.56, 0.52, 0.52], to: [0.72, 0.80, 0.74, 0.80] },
    { id: 'true-war', start: 201.40, end: 240.20, from: [0.76, 0.84, 0.78, 0.84], to: [0.82, 0.88, 0.84, 0.92] },
    { id: 'descent', start: 240.20, end: 267.80, from: [0.72, 0.78, 0.74, 0.82], to: [0.66, 0.76, 0.74, 0.84] },
    { id: 'abyss', start: 267.80, end: 276.80, from: [0.16, 0.12, 0.07, 0.13], to: [0.06, 0.05, 0.03, 0.05] },
    { id: 'awaken', start: 276.80, end: 317.60, from: [0.64, 0.74, 0.76, 0.70], to: [0.80, 0.88, 0.86, 0.92] },
    { id: 'bone-reprise', start: 317.60, end: 321.90, from: [0.18, 0.14, 0.08, 0.14], to: [0.07, 0.05, 0.03, 0.06] },
    { id: 'crown', start: 321.90, end: 343.40, from: [0.78, 0.90, 0.92, 0.92], to: [0.88, 0.96, 0.97, 1.00] },
    { id: 'return', start: 343.40, end: scoreDuration, from: [0.36, 0.40, 0.44, 0.38], to: [0.08, 0.10, 0.20, 0.08] },
  ]);
  let userMuted = false;
  let analysisContext = null;
  let analysisSource = null;
  let analyser = null;
  let frequencyData = null;
  let analysisPromise = null;
  let previousRawEnergy = 0;
  let smoothedLow = 0;
  let smoothedMid = 0;
  let smoothedHigh = 0;
  let smoothedEnergy = 0;
  let smoothedFlux = 0;
  let lastPublishedPhase = '';
  const silentClockOrigin = performance.now() / 1000;

  const scoreSample = {
    low: 0,
    mid: 0,
    high: 0,
    air: 0,
    energy: 0,
    flux: 0,
    beat: 0,
    pressure: 0,
    shell: 1,
    axis: 0,
    bone: 0,
    rupture: 0,
    fracture: 0,
    bloom: 0,
    release: 0,
    return: 0,
    currentTime: 0,
    duration: scoreDuration,
    section: scoreSections[0].id,
    id: scoreSections[0].id,
    phase: scoreSections[0].id,
    sectionIndex: 0,
    sectionProgress: 0,
    progress: 0,
    playing: false,
    analysed: false,
    analyzed: false,
  };

  const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
  const mix = (from, to, amount) => from + (to - from) * amount;
  const smoothstep = (value) => {
    const amount = clamp(value);
    return amount * amount * (3 - 2 * amount);
  };

  function sectionIndexAt(time) {
    for (let index = scoreSections.length - 1; index >= 0; index -= 1) {
      if (time >= scoreSections[index].start) return index;
    }
    return 0;
  }

  function envelope(time, start, peak, end) {
    if (time <= start || time >= end) return 0;
    if (time < peak) return smoothstep((time - start) / Math.max(0.001, peak - start));
    return 1 - smoothstep((time - peak) / Math.max(0.001, end - peak));
  }

  function fillMacroSample(time) {
    const sectionIndex = sectionIndexAt(time);
    const section = scoreSections[sectionIndex];
    const progress = clamp((time - section.start) / Math.max(0.001, section.end - section.start));
    const eased = smoothstep(progress);
    const [fromLow, fromMid, fromHigh, fromEnergy] = section.from;
    const [toLow, toMid, toHigh, toEnergy] = section.to;
    const bone = Math.max(
      envelope(time, 267.50, 271.40, 277.25),
      envelope(time, 317.25, 319.40, 322.50)
    );
    // Sovereignty is irreversible inside this cycle. The first re-entry rapidly
    // converts the mirror into structure; the later crown is a second impact,
    // not a return to captivity.
    const rupture = time < 276.80 ? 0 : smoothstep((time - 276.80) / (279.25 - 276.80));
    const bloom = Math.max(
      envelope(time, 276.80, 279.25, 300.00),
      envelope(time, 321.90, 323.10, 342.75)
    );
    const release = time < 342.75 ? 0
      : smoothstep((time - 342.75) / (scoreDuration - 342.75));

    scoreSample.low = mix(fromLow, toLow, eased);
    scoreSample.mid = mix(fromMid, toMid, eased);
    scoreSample.high = mix(fromHigh, toHigh, eased);
    scoreSample.energy = mix(fromEnergy, toEnergy, eased);
    scoreSample.flux = 0;
    scoreSample.pressure = clamp((envelope(time, 45.0, 226.0, 270.0) + rupture * 0.72) * (1 - bone * 0.78));
    scoreSample.shell = clamp(0.68 + bone * 0.28 - rupture * 0.52 + release * 0.28);
    scoreSample.axis = clamp(0.46 + envelope(time, 0, 18.0, 42.0) * 0.34 + bone * 0.46 + rupture * 0.44);
    scoreSample.bone = bone;
    scoreSample.rupture = rupture;
    scoreSample.fracture = rupture;
    scoreSample.bloom = clamp(bloom * (0.64 + scoreSample.energy * 0.36));
    scoreSample.release = release;
    scoreSample.return = release;
    scoreSample.section = section.id;
    scoreSample.id = section.id;
    scoreSample.phase = section.id;
    scoreSample.sectionIndex = sectionIndex;
    scoreSample.sectionProgress = progress;
    scoreSample.progress = progress;

    if (section.id !== lastPublishedPhase) {
      lastPublishedPhase = section.id;
      if (app) app.dataset.scorePhase = section.id;
      window.dispatchEvent(new CustomEvent('dreamunity:scorephase', {
        detail: { id: section.id, index: sectionIndex, start: section.start, end: section.end },
      }));
    }
  }

  function bandRms(minimumHz, maximumHz) {
    if (!frequencyData || !analyser || !analysisContext) return 0;
    const binHz = analysisContext.sampleRate / analyser.fftSize;
    const first = Math.max(1, Math.floor(minimumHz / binHz));
    const last = Math.min(frequencyData.length - 1, Math.ceil(maximumHz / binHz));
    let sum = 0;
    let count = 0;
    for (let index = first; index <= last; index += 1) {
      const value = frequencyData[index] / 255;
      sum += value * value;
      count += 1;
    }
    return count ? Math.sqrt(sum / count) : 0;
  }

  function shapedBand(value, floor, gain) {
    return clamp((value - floor) * gain);
  }

  function attachStoredAnalysis(bridge) {
    if (!bridge) return false;
    analysisContext = bridge.context;
    analysisSource = bridge.source;
    analyser = bridge.analyser;
    frequencyData = bridge.frequencyData;
    return Boolean(analysisContext && analysisSource && analyser && frequencyData);
  }

  async function ensureAnalysis() {
    if (!audio) return false;
    if (analyser && analysisContext) {
      if (analysisContext.state === 'suspended') await analysisContext.resume().catch(() => {});
      return analysisContext.state === 'running';
    }
    if (analysisPromise) return analysisPromise;

    analysisPromise = (async () => {
      if (attachStoredAnalysis(audio[analysisKey])) {
        if (analysisContext.state === 'suspended') await analysisContext.resume().catch(() => {});
        return analysisContext.state === 'running';
      }

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;

      try {
        const context = new AudioContextClass({ latencyHint: 'interactive' });
        const source = context.createMediaElementSource(audio);
        const nextAnalyser = context.createAnalyser();
        nextAnalyser.fftSize = 2048;
        nextAnalyser.smoothingTimeConstant = 0.72;
        source.connect(nextAnalyser);
        nextAnalyser.connect(context.destination);

        const bridge = {
          context,
          source,
          analyser: nextAnalyser,
          frequencyData: new Uint8Array(nextAnalyser.frequencyBinCount),
        };
        Object.defineProperty(audio, analysisKey, { value: bridge, configurable: false });
        attachStoredAnalysis(bridge);
        if (context.state === 'suspended') await context.resume().catch(() => {});
        return context.state === 'running';
      } catch {
        return false;
      }
    })();

    try {
      return await analysisPromise;
    } finally {
      analysisPromise = null;
    }
  }

  function sampleScore() {
    const nativeDuration = Number.isFinite(audio?.duration) && audio.duration > 0 ? audio.duration : scoreDuration;
    const nativeTime = Number.isFinite(audio?.currentTime) ? audio.currentTime : 0;
    const playing = Boolean(audio && !audio.paused && !audio.muted && !audio.ended && !userMuted);
    // Autoplay policy must never immobilise the artwork. Before an audible
    // timeline exists, a silent deterministic clock carries the same anatomy;
    // starting the score deliberately reunites image and sound at its beginning.
    const timelineTime = playing || nativeTime > 0.025
      ? nativeTime
      : performance.now() / 1000 - silentClockOrigin;
    const time = ((timelineTime % scoreDuration) + scoreDuration) % scoreDuration;
    fillMacroSample(time);

    const macroLow = scoreSample.low;
    const macroMid = scoreSample.mid;
    const macroHigh = scoreSample.high;
    const macroEnergy = scoreSample.energy;
    const live = Boolean(playing && analyser && analysisContext?.state === 'running');

    if (live) {
      try {
        analyser.getByteFrequencyData(frequencyData);
        const rawLow = shapedBand(bandRms(32, 180), 0.025, 1.8);
        const rawMid = shapedBand(bandRms(180, 2200), 0.018, 1.62);
        const rawHigh = shapedBand(bandRms(2200, 11000), 0.012, 1.9);
        const rawEnergy = clamp(rawLow * 0.42 + rawMid * 0.38 + rawHigh * 0.20);
        const attack = rawEnergy > smoothedEnergy ? 0.46 : 0.12;
        smoothedLow = mix(smoothedLow, rawLow, rawLow > smoothedLow ? 0.42 : 0.10);
        smoothedMid = mix(smoothedMid, rawMid, rawMid > smoothedMid ? 0.40 : 0.11);
        smoothedHigh = mix(smoothedHigh, rawHigh, rawHigh > smoothedHigh ? 0.38 : 0.12);
        smoothedEnergy = mix(smoothedEnergy, rawEnergy, attack);
        const rawFlux = clamp((rawEnergy - previousRawEnergy) * 7.5);
        smoothedFlux = Math.max(rawFlux, smoothedFlux * 0.76);
        previousRawEnergy = rawEnergy;

        scoreSample.low = mix(macroLow, smoothedLow, 0.76);
        scoreSample.mid = mix(macroMid, smoothedMid, 0.76);
        scoreSample.high = mix(macroHigh, smoothedHigh, 0.76);
        scoreSample.energy = clamp(mix(macroEnergy, smoothedEnergy, 0.72) + smoothedFlux * 0.08);
        scoreSample.flux = smoothedFlux;
      } catch {
        // The deterministic score anatomy remains available if the analyser is interrupted.
      }
    } else {
      previousRawEnergy = 0;
      smoothedFlux *= 0.75;
    }

    const beatPosition = ((time * scoreTempo) / 60) % 1;
    const scorePulse = playing ? Math.pow(Math.max(0, Math.cos(beatPosition * Math.PI * 2)), 12) : 0;
    scoreSample.beat = clamp(Math.max(scorePulse * (0.20 + scoreSample.energy * 0.54), scoreSample.flux));
    scoreSample.air = scoreSample.high;
    scoreSample.currentTime = time;
    scoreSample.duration = nativeDuration;
    scoreSample.playing = playing;
    scoreSample.analysed = live;
    scoreSample.analyzed = live;
    return scoreSample;
  }

  window.__dreamUnityScore = Object.freeze({
    sample: sampleScore,
    duration: scoreDuration,
    sections: scoreSections.map(({ id, start, end }) => Object.freeze({ id, start, end })),
  });

  try { userMuted = localStorage.getItem(muteKey) === '1'; } catch {}

  function reflect(mode) {
    if (!button || !state) return;
    const playing = mode === 'on';
    button.dataset.state = mode;
    button.setAttribute('aria-pressed', String(playing));
    button.setAttribute('aria-label', playing ? 'Turn the Dream Unity score off' : 'Play the Dream Unity score');
    state.textContent = playing ? 'ON' : mode === 'off' ? 'OFF' : mode === 'loading' ? 'LOADING' : 'PLAY';
  }

  async function playScore(fromGesture = false) {
    if (!audio || userMuted) return false;
    audio.muted = false;
    audio.volume = 0.7;
    try {
      const analysisReady = fromGesture ? ensureAnalysis() : null;
      const playback = audio.play();
      if (analysisReady) await analysisReady;
      await playback;
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
      playScore(false);
      audio.addEventListener('canplay', () => playScore(false), { once: true });
      audio.addEventListener('playing', () => reflect('on'));
      audio.addEventListener('pause', () => reflect(userMuted ? 'off' : 'waiting'));
      audio.addEventListener('error', () => {
        reflect('off');
        if (state) state.textContent = 'UNAVAILABLE';
      });
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
    await playScore(true);
  });

  const unlock = (event) => {
    if (
      event.target instanceof Element
      && event.target.closest('#scoreControl')
    ) return;
    if (!userMuted) {
      ensureAnalysis();
      if (audio?.paused) playScore(true);
    }
  };
  document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  document.addEventListener('keydown', unlock, { capture: true });

  function cycleFocus(buttons, direction) {
    const visible = buttons.filter((item) => item.offsetParent !== null && getComputedStyle(item).pointerEvents !== 'none');
    if (!visible.length) return;
    const current = visible.indexOf(document.activeElement);
    const next = current < 0 ? 0 : (current + direction + visible.length) % visible.length;
    visible[next].focus();
  }

  document.addEventListener('keydown', (event) => {
    if (window.__dreamUnityGameActive || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const inDetail = document.getElementById('app')?.classList.contains('detail');
    cycleFocus(inDetail ? subButtons : worldButtons, event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1);
    event.preventDefault();
  });
})();
