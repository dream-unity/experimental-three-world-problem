(() => {
  'use strict';
  const VERSION = '20260825-role-drift-become-1';
  const BECOME_VERSION = '20260826-become-compressed-13';
  const basePaths = [1, 2, 3, 4, 5].map((n) => `./arcade-parts/part-${String(n).padStart(2, '0')}.txt?v=${VERSION}`);
  const roleLogicPath = `./arcade-parts/perceive-role-logic.txt?v=${VERSION}`;
  const perceivePaths = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `./arcade-parts/perceive-aerial-${String(n).padStart(2, '0')}.txt?v=${VERSION}`);
  const becomeCorePath = `./arcade-parts/become-lab-01.txt?v=${VERSION}`;
  const becomeDiversityPath = `./arcade-parts/become-diversity-09.txt?v=${BECOME_VERSION}`;
  const becomeSocialPath = `./arcade-parts/become-social-agency-10.txt?v=${BECOME_VERSION}`;
  const becomeIntegrationPath = `./arcade-parts/become-social-integration-11.txt?v=${BECOME_VERSION}`;
  const becomeCompressionPath = `./arcade-parts/become-compressed-12.txt?v=${BECOME_VERSION}`;
  const paths = [...basePaths, roleLogicPath, ...perceivePaths, becomeCorePath, becomeDiversityPath, becomeSocialPath, becomeIntegrationPath, becomeCompressionPath];

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

    // BECOME: core lifecycle → orthogonal worlds → social maximin planner →
    // contextual integration → hard ten-second compression. No cloud path.
    const completeSource = `${baseSource.slice(0, closeIndex)}\n${roleLogicSource}\n${perceiveSource}\n${becomeSource}\n${baseSource.slice(closeIndex)}`;
    Function(completeSource)();
  }).catch((error) => {
    console.error(error);
    const hint = document.getElementById('hint');
    if (hint) hint.textContent = 'ARCADE COULD NOT INITIALISE';
  });
})();
