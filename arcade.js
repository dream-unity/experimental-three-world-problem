(() => {
  'use strict';
  const VERSION = '20260825-perceive-1';
  const basePaths = [1, 2, 3, 4, 5].map((n) => `./arcade-parts/part-${String(n).padStart(2, '0')}.txt?v=${VERSION}`);
  const perceivePaths = [1, 2, 3].map((n) => `./arcade-parts/perceive-aerial-${String(n).padStart(2, '0')}.txt?v=${VERSION}`);
  const paths = [...basePaths, ...perceivePaths];

  Promise.all(paths.map((path) => fetch(path, { cache: 'force-cache' }).then((response) => {
    if (!response.ok) throw new Error(`Arcade chunk failed: ${response.status} ${path}`);
    return response.text();
  }))).then((sources) => {
    const baseSource = sources.slice(0, basePaths.length).join('');
    const perceiveSource = sources.slice(basePaths.length).join('');
    const closeIndex = baseSource.lastIndexOf('})();');
    if (closeIndex < 0) throw new Error('Arcade source terminator was not found.');

    // The original nine-game engine remains intact. The PERCEIVE replacement
    // is injected inside its private scope so it can use the same lifecycle,
    // controls, score, audio, performance caps and portal-return behaviour.
    const completeSource = `${baseSource.slice(0, closeIndex)}\n${perceiveSource}\n${baseSource.slice(closeIndex)}`;
    Function(completeSource)();
  }).catch((error) => {
    console.error(error);
    const hint = document.getElementById('hint');
    if (hint) hint.textContent = 'ARCADE COULD NOT INITIALISE';
  });
})();
