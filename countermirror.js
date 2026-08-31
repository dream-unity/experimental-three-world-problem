(() => {
  'use strict';

  const app = document.getElementById('app');
  const image = document.getElementById('countermirrorImage');
  const loading = document.getElementById('loading');
  const hint = document.getElementById('hint');
  const back = document.getElementById('back');
  const detailNumber = document.getElementById('detailNumber');
  const detailName = document.getElementById('detailName');
  const detailKicker = document.getElementById('detailKicker');
  const detailStatement = document.getElementById('detailStatement');
  const detailBody = document.getElementById('detailBody');
  const worldButtons = [...document.querySelectorAll('[data-world].world-label, [data-world].portal-hotspot')];
  const labels = [...document.querySelectorAll('.world-label')];
  const subButtons = [...document.querySelectorAll('.sub-label')];
  if (!app) return;

  const worlds = {
    machine: ['01', 'DREAM MACHINE', ['PERCEIVE', 'MODEL', 'PREDICT'], 'Attention bears weight.', 'Perceive the field. Model its hidden law. Predict before the mirror decides for you.', 'CHOOSE A DISCIPLINE · MAKE THE HIDDEN SYSTEM VISIBLE'],
    maker: ['02', 'DREAM MAKER', ['INTEND', 'ACT', 'BECOME'], 'Will must acquire a body.', 'Compress desire into direction. Cross the threshold of action. Become capable of carrying the dream.', 'CHOOSE A DISCIPLINE · CONVERT WILL INTO FORM'],
    reality: ['03', 'DREAM WORLD', ['MATTER', 'STRUCTURE', 'EMERGE'], 'Matter remembers pressure.', 'Give the dream resistance, architecture and consequence—until a world exists that can answer back.', 'CHOOSE A DISCIPLINE · LET THE WORLD ANSWER BACK'],
  };

  let activeWorld = '';
  let arcadeState = 'idle';
  let pendingButton = null;

  const release = () => loading?.classList.add('hide');
  if (image && !image.complete) {
    image.addEventListener('load', release, { once: true });
    image.addEventListener('error', release, { once: true });
  } else release();
  setTimeout(release, 900);

  function setHover(world = '') {
    if (app.classList.contains('detail')) return;
    if (world) app.dataset.hover = world;
    else delete app.dataset.hover;
  }

  function enterWorld(world, focusFirst = false) {
    const data = worlds[world];
    if (!data) return;
    activeWorld = world;
    app.dataset.world = world;
    delete app.dataset.hover;
    app.classList.add('detail');
    detailNumber.textContent = data[0];
    detailName.textContent = data[1];
    detailKicker.textContent = `${data[0]} · ${data[1]}`;
    detailStatement.textContent = data[3];
    detailBody.textContent = data[4];
    hint.textContent = data[5];
    subButtons.forEach((button, index) => {
      button.querySelector('span').textContent = String(index + 1).padStart(2, '0');
      button.querySelector('strong').textContent = data[2][index];
      button.dataset.world = world;
      button.dataset.index = String(index);
      button.tabIndex = 0;
      button.setAttribute('aria-hidden', 'false');
      button.setAttribute('aria-label', `Enter ${data[1]}: ${data[2][index]}`);
    });
    back.tabIndex = 0;
    back.setAttribute('aria-hidden', 'false');
    labels.forEach((button) => { button.tabIndex = -1; });
    if (focusFirst) setTimeout(() => subButtons[0]?.focus(), 280);
  }

  function leaveWorld(restoreFocus = true) {
    const previous = activeWorld;
    activeWorld = '';
    app.classList.remove('detail');
    app.dataset.world = '';
    back.tabIndex = -1;
    back.setAttribute('aria-hidden', 'true');
    subButtons.forEach((button) => {
      button.tabIndex = -1;
      button.setAttribute('aria-hidden', 'true');
    });
    labels.forEach((button) => { button.tabIndex = 0; });
    hint.textContent = 'BEND THE COUNTERMIRROR · ENTER A WORLD';
    if (restoreFocus && previous) document.querySelector(`.world-label[data-world="${previous}"]`)?.focus();
  }

  worldButtons.forEach((button) => {
    const world = button.dataset.world;
    button.addEventListener('pointerenter', () => setHover(world));
    button.addEventListener('pointerleave', () => setHover());
    button.addEventListener('focus', () => setHover(world));
    button.addEventListener('blur', () => setHover());
    button.addEventListener('click', () => enterWorld(world, button.classList.contains('portal-hotspot')));
  });
  back.addEventListener('click', () => leaveWorld(false));

  function loadArcade(button) {
    pendingButton = button;
    if (arcadeState === 'ready') return button.click();
    if (arcadeState === 'loading') return;
    arcadeState = 'loading';
    app.classList.add('forging-world');
    hint.textContent = 'COMPRESSING A WORLD · HOLD THE FIELD';
    const script = document.createElement('script');
    script.src = './arcade.js?v=20260831-countermirror-03';
    script.async = true;
    script.onerror = () => {
      arcadeState = 'error';
      app.classList.remove('forging-world');
      hint.textContent = 'THE WORLD COULD NOT INITIALISE · TRY AGAIN';
    };
    document.head.append(script);
  }

  subButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      if (arcadeState === 'ready') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      loadArcade(button);
    }, true);
  });

  addEventListener('dreamunity:arcade-ready', () => {
    arcadeState = 'ready';
    app.classList.remove('forging-world');
    const button = pendingButton;
    pendingButton = null;
    if (button) setTimeout(() => button.click(), 0);
  });
  addEventListener('dreamunity:arcade-error', () => {
    arcadeState = 'error';
    app.classList.remove('forging-world');
    hint.textContent = 'THE WORLD COULD NOT INITIALISE · TRY AGAIN';
  });

  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let resetTimer = 0;
    app.addEventListener('pointermove', (event) => {
      if (event.target instanceof Element && event.target.closest('button,.arcade')) return;
      const x = Math.max(-1, Math.min(1, (event.clientX / innerWidth - .5) * 2));
      const y = Math.max(-1, Math.min(1, (event.clientY / innerHeight - .5) * 2));
      app.style.setProperty('--mx', x.toFixed(3));
      app.style.setProperty('--my', y.toFixed(3));
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        app.style.setProperty('--mx', 0);
        app.style.setProperty('--my', 0);
      }, 700);
    }, { passive: true });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && app.classList.contains('detail')) {
      leaveWorld(true);
      event.preventDefault();
    }
  });
})();
