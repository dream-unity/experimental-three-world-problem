(() => {
  'use strict';

  const VERSION = '20260830-sovereign-nocturne-4';
  const source = `./visual-parts/sovereign-nocturne-13.js?v=${VERSION}`;
  const loader = document.getElementById('loading');
  const hint = document.getElementById('hint');
  const release = () => loader?.classList.add('hide');

  const script = document.createElement('script');
  script.src = source;
  script.async = false;
  script.dataset.dreamUnityRenderer = VERSION;
  script.addEventListener('load', release, { once: true });
  script.addEventListener('error', () => {
    release();
    if (hint) hint.textContent = 'VISUAL FIELD COULD NOT INITIALISE';
  }, { once: true });
  document.head.append(script);

  window.setTimeout(release, 1800);
})();
