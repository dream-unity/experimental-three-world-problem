(() => {
  'use strict';
  const VERSION = '20260825-role-drift-2';
  const basePaths = [1, 2, 3, 4, 5].map((n) => `./arcade-parts/part-${String(n).padStart(2, '0')}.txt?v=${VERSION}`);
  const roleLogicPath = `./arcade-parts/perceive-role-logic.txt?v=${VERSION}`;
  const perceivePaths = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `./arcade-parts/perceive-aerial-${String(n).padStart(2, '0')}.txt?v=${VERSION}`);
  const paths = [...basePaths, roleLogicPath, ...perceivePaths];

  Promise.all(paths.map((path) => fetch(path, { cache: 'force-cache' }).then((response) => {
    if (!response.ok) throw new Error(`Arcade chunk failed: ${response.status} ${path}`);
    return response.text();
  }))).then((sources) => {
    const baseSource = sources.slice(0, basePaths.length).join('');
    const roleLogicSource = sources[basePaths.length];
    const perceiveSource = sources.slice(basePaths.length + 1).join('');
    const closeIndex = baseSource.lastIndexOf('})();');
    if (closeIndex < 0) throw new Error('Arcade source terminator was not found.');

    // The original nine-game engine remains intact. The testable relational
    // geometry and the PERCEIVE replacement are injected inside its private
    // scope, retaining one lifecycle, input, score, audio and GPU budget.
    const completeSource = `${baseSource.slice(0, closeIndex)}\n${roleLogicSource}\n${perceiveSource}\n${baseSource.slice(closeIndex)}`;
    Function(completeSource)();
  }).catch((error) => {
    console.error(error);
    const hint = document.getElementById('hint');
    if (hint) hint.textContent = 'ARCADE COULD NOT INITIALISE';
  });
})();
