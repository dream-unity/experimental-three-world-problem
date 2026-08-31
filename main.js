(() => {
  'use strict';

  const VERSION = '20260830-sovereign-nocturne-20';
  const source = `./visual-parts/sovereign-nocturne-20.js?v=${VERSION}`;
  const app = document.getElementById('app');
  const loader = document.getElementById('loading');
  const hint = document.getElementById('hint');
  const plate = document.querySelector('#materialPlate img');

  let rendererSettled = false;
  let plateSettled = !plate;
  let released = false;

  const maybeRelease = () => {
    if (released || !rendererSettled || !plateSettled) return;
    released = true;
    loader?.classList.add('hide');
  };
  const settleRenderer = () => {
    rendererSettled = true;
    maybeRelease();
  };
  const settlePlate = (status) => {
    if (plateSettled) return;
    plateSettled = true;
    if (status === true) app?.setAttribute('data-plate-ready', 'true');
    if (status === false) app?.classList.add('plate-error');
    maybeRelease();
  };

  window.__dreamUnityRelease = settleRenderer;

  if (plate) {
    const ready = async () => {
      if (typeof plate.decode === 'function') {
        try { await plate.decode(); } catch {}
      }
      settlePlate(plate.naturalWidth > 0);
    };
    if (plate.complete) ready();
    else {
      plate.addEventListener('load', ready, { once: true });
      plate.addEventListener('error', () => settlePlate(false), { once: true });
    }
  }

  const script = document.createElement('script');
  script.src = source;
  script.async = false;
  script.dataset.dreamUnityRenderer = VERSION;
  script.addEventListener('load', settleRenderer, { once: true });
  script.addEventListener('error', () => {
    settleRenderer();
    if (hint) hint.textContent = 'VISUAL FIELD COULD NOT INITIALISE';
  }, { once: true });
  document.head.append(script);

  // Bound the opening curtain without treating a merely slow image as broken.
  window.setTimeout(() => {
    settleRenderer();
    if (!plateSettled) settlePlate(null);
  }, 2200);
})();
