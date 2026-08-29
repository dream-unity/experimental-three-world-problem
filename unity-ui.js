(() => {
  'use strict';

  const audio = document.getElementById('scoreAudio');
  const button = document.getElementById('scoreControl');
  const state = document.getElementById('scoreState');
  const worldButtons = [...document.querySelectorAll('.world-label')];
  const subButtons = [...document.querySelectorAll('.sub-label')];
  const muteKey = 'dream-unity-score-muted';
  let userMuted = false;

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
    if (!userMuted && audio?.paused) playScore(true);
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
