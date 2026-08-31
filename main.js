(() => {
  'use strict';
  const VERSION = '20260830-awaken-true-war-2';
  const BASE_INTERACTION_VERSION = '20260831-fluid-base-interaction-25c';
  const SOVEREIGN_RETURN_VERSION = '20260831-sovereign-return-21';
  const INTERACTION_RECOVERY_VERSION = '20260831-fluid-whole-field-orbit-25';
  const FLUID_RESPONSE_VERSION = '20260831-fluid-response-hold-25c';
  const WORLD_EMBLEM_VERSION = '20260831-world-emblems-26';
  const WORLD_EMBLEM_POLISH_VERSION = '20260831-world-emblems-polish-26b';
  const WORLD_TITLE_VERSION = '20260831-world-title-hierarchy-27b';
  const baseParts = Array.from({ length: 6 }, (_, index) => {
    const part = String(index + 1).padStart(2, '0');
    const cacheVersion = index >= 4 ? BASE_INTERACTION_VERSION : VERSION;
    return `./visual-parts/part-${part}.txt?v=${cacheVersion}`;
  });
  const overridePaths = [
    `./visual-parts/remembered-tomorrow-10.txt?v=${VERSION}`,
    ...[1, 2, 3].map((part) => `./visual-parts/sovereign-return-21-${String(part).padStart(2, '0')}.txt?v=${SOVEREIGN_RETURN_VERSION}`),
    `./visual-parts/interaction-recovery-22.txt?v=${INTERACTION_RECOVERY_VERSION}`,
    `./visual-parts/fluid-response-25.txt?v=${FLUID_RESPONSE_VERSION}`,
    `./visual-parts/world-emblems-26.txt?v=${WORLD_EMBLEM_VERSION}`,
    `./visual-parts/world-emblems-polish-26b.txt?v=${WORLD_EMBLEM_POLISH_VERSION}`,
    `./visual-parts/world-title-hierarchy-27.txt?v=${WORLD_TITLE_VERSION}`,
  ];
  const parts = [...baseParts, ...overridePaths];
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
      const overrides = source.slice(baseParts.length).join('\n');
      const closeIndex = baseSource.lastIndexOf('})();');
      if (closeIndex < 0) throw new Error('Visual engine terminator was not found.');
      Function(`${baseSource.slice(0, closeIndex)}\n${overrides}\n${baseSource.slice(closeIndex)}`)();
    })
    .catch((error) => {
      console.error(error);
      release();
      if (hint) hint.textContent = 'VISUAL FIELD COULD NOT INITIALISE';
    });

  window.setTimeout(release, 2100);
})();
