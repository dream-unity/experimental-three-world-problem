(() => {
  'use strict';

  const app = document.getElementById('app');
  const canvas = document.getElementById('world');
  const hint = document.getElementById('hint');
  if (!app || !canvas || document.getElementById('fieldStage')) return;

  const field = document.createElement('div');
  field.id = 'fieldStage';
  field.setAttribute('aria-label', 'Moveable Dream Unity field');
  canvas.parentNode.insertBefore(field, canvas);

  const fieldElements = [
    canvas,
    ...document.querySelectorAll('.world-label'),
    document.getElementById('unityLabel'),
    ...document.querySelectorAll('.sub-label')
  ].filter(Boolean);
  fieldElements.forEach((element) => field.appendChild(element));

  const reset = document.createElement('button');
  reset.id = 'fieldReset';
  reset.type = 'button';
  reset.className = 'field-reset';
  reset.setAttribute('aria-label', 'Recenter the Dream Unity field');
  reset.textContent = '◎';
  app.appendChild(reset);

  const style = document.createElement('style');
  style.textContent = `
    #fieldStage{
      position:absolute;
      inset:0;
      z-index:3;
      overflow:visible;
      transform-origin:50% 50%;
      will-change:transform;
      contain:layout style;
    }
    #fieldStage.snapping{transition:transform .42s cubic-bezier(.2,.78,.18,1)}
    #app.game-open #fieldStage{visibility:hidden}
    .field-reset{
      position:absolute;
      z-index:13;
      right:max(14px,env(safe-area-inset-right));
      bottom:max(15px,env(safe-area-inset-bottom));
      width:43px;
      height:43px;
      display:grid;
      place-items:center;
      border:1px solid rgba(255,255,255,.13);
      border-radius:50%;
      background:rgba(3,7,16,.72);
      color:#cbd7ef;
      font-size:18px;
      line-height:1;
      cursor:pointer;
      opacity:0;
      pointer-events:none;
      transform:scale(.86);
      transition:opacity .2s ease,transform .2s ease,border-color .16s ease,background .16s ease;
      backdrop-filter:blur(12px);
      box-shadow:0 12px 38px rgba(0,0,0,.28);
      -webkit-tap-highlight-color:transparent;
    }
    .field-reset.visible{opacity:.82;pointer-events:auto;transform:scale(1)}
    .field-reset:hover,.field-reset:focus-visible{outline:none;opacity:1;border-color:rgba(255,255,255,.38);background:rgba(10,16,30,.9)}
    #app.detail .field-reset,#app.game-open .field-reset{opacity:0!important;pointer-events:none!important}
    @media(max-width:520px){.field-reset{width:39px;height:39px;font-size:16px;bottom:max(12px,env(safe-area-inset-bottom))}}
    @media(prefers-reduced-motion:reduce){#fieldStage.snapping{transition:none}.field-reset{transition:none}}
  `;
  document.head.appendChild(style);

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const pointers = new Map();
  const synthetic = new WeakSet();

  let panX = 0;
  let panY = 0;
  let scale = 1;
  let angle = 0;
  let panVX = 0;
  let panVY = 0;
  let angleV = 0;
  let interacting = false;
  let gestureMoved = false;
  let pinch = null;
  let lastFrame = performance.now();
  let lastInput = performance.now();
  let transformDirty = true;

  const moved = () => Math.abs(panX) > .35 || Math.abs(panY) > .35 || Math.abs(scale - 1) > .004 || Math.abs(angle) > .08;
  const isDetail = () => app.classList.contains('detail');
  const isGame = () => app.classList.contains('game-open') || window.__dreamUnityGameActive;

  function constrain() {
    const maxX = innerWidth * .38;
    const maxY = innerHeight * .34;
    panX = clamp(panX, -maxX, maxX);
    panY = clamp(panY, -maxY, maxY);
    scale = clamp(scale, .68, 1.72);
    angle = clamp(angle, -48, 48);
  }

  function applyTransform() {
    constrain();
    field.style.transform = `translate3d(${panX.toFixed(2)}px,${panY.toFixed(2)}px,0) rotate(${angle.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
    reset.classList.toggle('visible', moved() && !isDetail() && !isGame());
    transformDirty = false;
  }

  function snapToCentre() {
    panX = 0;
    panY = 0;
    scale = 1;
    angle = 0;
    panVX = 0;
    panVY = 0;
    angleV = 0;
    field.classList.add('snapping');
    transformDirty = true;
    applyTransform();
    window.setTimeout(() => field.classList.remove('snapping'), 450);
  }

  function updateHint() {
    if (!hint || isGame()) return;
    hint.textContent = isDetail()
      ? 'DRAG TO ORBIT · PINCH TO ZOOM · TAP A NODE'
      : 'DRAG TO MOVE · PINCH TO ZOOM · TAP A WORLD';
  }

  function pointerDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pointerAngle(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  function pointerMidpoint(a, b) {
    return { x: (a.x + b.x) * .5, y: (a.y + b.y) * .5 };
  }

  function beginPinch() {
    const list = [...pointers.values()];
    if (list.length < 2) { pinch = null; return; }
    const a = list[0];
    const b = list[1];
    pinch = {
      distance: Math.max(1, pointerDistance(a, b)),
      angle: pointerAngle(a, b),
      midpoint: pointerMidpoint(a, b),
      scale,
      fieldAngle: angle,
      panX,
      panY,
      detailDistance: Math.max(1, pointerDistance(a, b))
    };
  }

  function cancelMainPointer(source) {
    if (!window.PointerEvent) return;
    const event = new PointerEvent('pointercancel', {
      bubbles: true,
      cancelable: true,
      pointerId: source.pointerId || 1,
      pointerType: source.pointerType || 'touch',
      clientX: source.clientX,
      clientY: source.clientY
    });
    synthetic.add(event);
    canvas.dispatchEvent(event);
  }

  function inversePoint(clientX, clientY) {
    const cx = innerWidth * .5;
    const cy = innerHeight * .5;
    const x = clientX - cx - panX;
    const y = clientY - cy - panY;
    const radians = -angle * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      x: cx + (x * cos - y * sin) / scale,
      y: cy + (x * sin + y * cos) / scale
    };
  }

  function dispatchMappedTap(source) {
    if (!window.PointerEvent) return;
    const point = inversePoint(source.clientX, source.clientY);
    const event = new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      pointerId: source.pointerId || 1,
      pointerType: source.pointerType || 'touch',
      clientX: point.x,
      clientY: point.y,
      button: 0,
      buttons: 0,
      isPrimary: true
    });
    synthetic.add(event);
    canvas.dispatchEvent(event);
  }

  function emitDetailZoom(delta, source) {
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: source.clientX,
      clientY: source.clientY,
      deltaY: -delta * 2.1,
      deltaMode: 0
    });
    synthetic.add(event);
    canvas.dispatchEvent(event);
  }

  function onPointerDown(event) {
    if (synthetic.has(event) || isGame()) return;
    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      lastTime: performance.now()
    });
    interacting = true;
    gestureMoved = false;
    panVX = 0;
    panVY = 0;
    angleV = 0;
    lastInput = performance.now();
    if (pointers.size >= 2) beginPinch();
  }

  function onPointerMove(event) {
    if (synthetic.has(event) || isGame()) return;
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const now = performance.now();
    const dx = event.clientX - pointer.lastX;
    const dy = event.clientY - pointer.lastY;
    const dt = Math.max(.008, (now - pointer.lastTime) / 1000);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    pointer.lastTime = now;
    lastInput = now;

    const total = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
    if (total > 4) gestureMoved = true;

    if (isDetail()) {
      if (pointers.size >= 2) {
        const list = [...pointers.values()];
        const distance = pointerDistance(list[0], list[1]);
        if (!pinch) beginPinch();
        const delta = distance - (pinch?.detailDistance || distance);
        if (pinch) pinch.detailDistance = distance;
        if (Math.abs(delta) > .1) emitDetailZoom(delta, event);
        gestureMoved = true;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }

    if (pointers.size >= 2) {
      const list = [...pointers.values()];
      const a = list[0];
      const b = list[1];
      if (!pinch) beginPinch();
      const distance = Math.max(1, pointerDistance(a, b));
      const currentAngle = pointerAngle(a, b);
      const midpoint = pointerMidpoint(a, b);
      const ratio = distance / Math.max(1, pinch.distance);
      scale = pinch.scale * ratio;
      angle = pinch.fieldAngle + (currentAngle - pinch.angle) * 180 / Math.PI;
      panX = pinch.panX + midpoint.x - pinch.midpoint.x;
      panY = pinch.panY + midpoint.y - pinch.midpoint.y;
      gestureMoved = true;
      transformDirty = true;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (gestureMoved) {
      panX += dx * .74;
      panY += dy * .74;
      angle += dx * .026;
      panVX = dx * .74 / dt;
      panVY = dy * .74 / dt;
      angleV = dx * .026 / dt;
      transformDirty = true;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function finishPointer(event, cancelled = false) {
    if (synthetic.has(event) || isGame()) return;
    const wasMoved = gestureMoved || pointers.size > 1;
    pointers.delete(event.pointerId);
    if (pointers.size >= 2) beginPinch();
    else pinch = null;
    if (pointers.size === 1) {
      const remaining = [...pointers.values()][0];
      remaining.startX = remaining.lastX = remaining.x;
      remaining.startY = remaining.lastY = remaining.y;
      remaining.lastTime = performance.now();
    }
    interacting = pointers.size > 0;

    if (isDetail()) {
      if (wasMoved) {
        cancelMainPointer(event);
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }

    if (wasMoved || cancelled) {
      cancelMainPointer(event);
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (moved()) {
      cancelMainPointer(event);
      dispatchMappedTap(event);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown, { capture: true, passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
  canvas.addEventListener('pointerup', (event) => finishPointer(event, false), { capture: true, passive: false });
  canvas.addEventListener('pointercancel', (event) => finishPointer(event, true), { capture: true, passive: false });

  canvas.addEventListener('wheel', (event) => {
    if (synthetic.has(event) || isGame() || isDetail()) return;
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * .0011);
    scale *= factor;
    transformDirty = true;
    lastInput = performance.now();
  }, { capture: true, passive: false });

  reset.addEventListener('click', snapToCentre);

  const classObserver = new MutationObserver(() => {
    pointers.clear();
    interacting = false;
    pinch = null;
    if (isDetail() || isGame()) snapToCentre();
    updateHint();
  });
  classObserver.observe(app, { attributes: true, attributeFilter: ['class'] });

  function tick(now) {
    const dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (!interacting && !isDetail() && !isGame()) {
      if (Math.abs(panVX) > .5 || Math.abs(panVY) > .5 || Math.abs(angleV) > .02) {
        panX += panVX * dt;
        panY += panVY * dt;
        angle += angleV * dt;
        const decay = Math.exp(-dt * 5.4);
        panVX *= decay;
        panVY *= decay;
        angleV *= decay;
        transformDirty = true;
      }
    }
    if (transformDirty) applyTransform();
    requestAnimationFrame(tick);
  }

  updateHint();
  applyTransform();
  requestAnimationFrame(tick);
})();
