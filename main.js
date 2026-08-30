(() => {
  'use strict';
  const VERSION = '20260830-awaken-true-war-2';
  const baseParts = Array.from({ length: 6 }, (_, index) =>
    `./visual-parts/part-${String(index + 1).padStart(2, '0')}.txt?v=${VERSION}`
  );
  const overridePath = `./visual-parts/remembered-tomorrow-10.txt?v=${VERSION}`;
  const parts = [...baseParts, overridePath];
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
      const baseSource = source.slice(0, baseParts.length).join('');
      const overrideSource = source[baseParts.length];
      const closeIndex = baseSource.lastIndexOf('})();');
      if (closeIndex < 0) throw new Error('Visual engine terminator was not found.');
      Function(`${baseSource.slice(0, closeIndex)}\n${overrideSource}\n${baseSource.slice(closeIndex)}`)();
    })
    .catch((error) => {
      console.error(error);
      release();
      if (hint) hint.textContent = 'VISUAL FIELD COULD NOT INITIALISE';
    });

  window.setTimeout(release, 1800);
})();
