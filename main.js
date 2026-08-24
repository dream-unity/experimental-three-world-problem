(() => {
  'use strict';
  const VERSION = '20260824-11';
  const parts = Array.from({ length: 6 }, (_, index) =>
    `./visual-parts/part-${String(index + 1).padStart(2, '0')}.txt?v=${VERSION}`
  );
  const loader = document.getElementById('loading');
  const hint = document.getElementById('hint');
  const release = () => loader?.classList.add('hide');

  async function fetchParts(cache) {
    return Promise.all(parts.map(async (path) => {
      const response = await fetch(path, { cache });
      if (!response.ok) throw new Error(`Visual engine part failed: ${response.status} ${path}`);
      return response.text();
    }));
  }

  fetchParts('force-cache')
    .catch(() => new Promise((resolve) => setTimeout(resolve, 180)).then(() => fetchParts('no-store')))
    .then((source) => {
      Function(source.join(''))();
    })
    .catch((error) => {
      console.error(error);
      release();
      if (hint) hint.textContent = 'VISUAL FIELD COULD NOT INITIALISE';
    });

  window.setTimeout(release, 1800);
})();
