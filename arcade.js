(() => {
  'use strict';
  const VERSION = '20260825-role-drift-become-1';
  const basePaths = [1, 2, 3, 4, 5].map((n) => `./arcade-parts/part-${String(n).padStart(2, '0')}.txt?v=${VERSION}`);
  const roleLogicPath = `./arcade-parts/perceive-role-logic.txt?v=${VERSION}`;
  const perceivePaths = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `./arcade-parts/perceive-aerial-${String(n).padStart(2, '0')}.txt?v=${VERSION}`);
  const becomePaths = [1].map((n) => `./arcade-parts/become-lab-${String(n).padStart(2, '0')}.txt?v=${VERSION}`);
  const paths = [...basePaths, roleLogicPath, ...perceivePaths, ...becomePaths];

  Promise.all(paths.map((path) => fetch(path, { cache: 'force-cache' }).then((response) => {
    if (!response.ok) throw new Error(`Arcade chunk failed: ${response.status} ${path}`);
    return response.text();
  }))).then((sources) => {
    const baseEnd = basePaths.length;
    const roleLogicSource = sources[baseEnd];
    const perceiveEnd = baseEnd + 1 + perceivePaths.length;
    const baseSource = sources.slice(0, baseEnd).join('');
    const perceiveSource = sources.slice(baseEnd + 1, perceiveEnd).join('');
    const becomeSource = sources.slice(perceiveEnd).join('');
    const closeIndex = baseSource.lastIndexOf('})();');
    if (closeIndex < 0) throw new Error('Arcade source terminator was not found.');

    // The original nine-game engine remains intact. The testable PERCEIVE
    // geometry, fighter replacement and BECOME laboratory are injected inside
    // its private scope, preserving one lifecycle and seven sibling portals.
    const completeSource = `${baseSource.slice(0, closeIndex)}\n${roleLogicSource}\n${perceiveSource}\n${becomeSource}\n${baseSource.slice(closeIndex)}`;
    Function(completeSource)();
  }).catch((error) => {
    console.error(error);
    const hint = document.getElementById('hint');
    if (hint) hint.textContent = 'ARCADE COULD NOT INITIALISE';
  });
})();
