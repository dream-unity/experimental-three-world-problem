(() => {
  'use strict';

  const RENDERER_ID = 'sovereign-nocturne';
  const RENDERER_VERSION = '20260830-sovereign-nocturne-19';
  const SILENT_CYCLE_SECONDS = 40;
  const TAU = Math.PI * 2;
  const $ = (selector) => document.querySelector(selector);

  let canvas = $('#world');
  const app = $('#app');
  const loading = $('#loading');
  const hint = $('#hint');
  const back = $('#back');
  const detailNumber = $('#detailNumber');
  const detailName = $('#detailName');
  const unityLabel = $('#unityLabel');
  const labels = {
    machine: $('#label-machine'),
    maker: $('#label-maker'),
    reality: $('#label-reality'),
  };
  const subLabels = [$('#sub-0'), $('#sub-1'), $('#sub-2')];

  if (!canvas || !app) {
    loading?.classList.add('hide');
    return;
  }

  const WORLD = {
    machine: {
      index: '01',
      name: 'DREAM MACHINE',
      css: '#00c9e8',
      rgb: [0, 201, 232],
      triad: ['PERCEIVE', 'MODEL', 'PREDICT'],
    },
    maker: {
      index: '02',
      name: 'DREAM MAKER',
      css: '#14c98b',
      rgb: [20, 201, 139],
      triad: ['INTEND', 'ACT', 'BECOME'],
    },
    reality: {
      index: '03',
      name: 'DREAM WORLD',
      css: '#6840ff',
      rgb: [104, 64, 255],
      triad: ['MATTER', 'STRUCTURE', 'EMERGE'],
    },
  };
  const worldKeys = ['machine', 'maker', 'reality'];
  const coarse = matchMedia('(pointer: coarse)').matches;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowCPU = (navigator.hardwareConcurrency || 8) <= 6;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const ease = (value) => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const damp = (value, target, lambda, dt) => lerp(value, target, 1 - Math.exp(-lambda * dt));
  const smoothstep = (start, end, value) => {
    const t = clamp((value - start) / Math.max(0.00001, end - start), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const hash = (value) => {
    const n = Math.sin(value * 127.1 + 311.7) * 43758.5453123;
    return n - Math.floor(n);
  };

  const rendererStatus = {
    id: RENDERER_ID,
    version: RENDERER_VERSION,
    mode: 'initializing',
    api: null,
    ready: false,
    state: 'initializing',
    reducedMotion,
    contextLost: false,
    frame: 0,
  };
  window.__dreamUnityRenderer = rendererStatus;
  app.dataset.rendererReady = 'false';
  app.dataset.rendererState = 'initializing';
  app.dataset.motion = reducedMotion ? 'reduced' : 'standard';

  let width = 1;
  let height = 1;
  let dpr = 1;
  let dprScale = 1;
  // Begin inside the score-derived cathartic crown: the three currents have
  // survived compression and are briefly phase-locked before returning.
  let elapsed = SILENT_CYCLE_SECONDS * 0.85;
  let lastFrame = performance.now();
  let labelTick = 0;
  let fpsFrames = 0;
  let fpsElapsed = 0;
  let slowWindows = 0;
  let lastDrawAt = 0;

  let activeWorld = null;
  let activeSub = 0;
  let hoverWorld = null;
  let hoverSub = -1;
  let viewMix = 0;
  let targetMix = 0;
  let impulse = 0;
  let holdStrength = 0;
  let holdTarget = 0;

  let overviewYaw = 0.16;
  let overviewPitch = -0.125;
  let overviewRoll = -0.012;
  let overviewZoom = 0.92;
  let overviewYawVelocity = 0;
  let overviewPitchVelocity = 0;
  let overviewRollVelocity = 0;
  let detailYaw = 0;
  let detailPitch = 0;
  let detailRoll = 0;
  let detailZoom = 1.45;
  let detailYawVelocity = 0;
  let detailPitchVelocity = 0;
  let detailRollVelocity = 0;
  let ghostYaw = 0.19;
  let ghostPitch = -0.055;
  let ghostRoll = -0.018;

  let gestureTravel = 0;
  let gestureHadPinch = false;
  let pinchState = null;
  let lastTapAt = 0;
  let pointerMoveTick = 0;
  const pointers = new Map();
  const worldScreen = Object.fromEntries(worldKeys.map((key) => [key, { x: 0, y: 0, r: 28, z: 0 }]));
  const subScreen = [0, 1, 2].map((index) => ({ x: 0, y: 0, r: 25, z: 0, index }));

  const WORLD_PINS = {
    machine: { x: -1.15, y: 3.55, z: 0.28 },
    maker: { x: -2.65, y: 0.42, z: 0.25 },
    reality: { x: 3.35, y: -1.68, z: 0.35 },
  };
  const DETAIL_PINS = {
    machine: [
      { x: -0.22, y: 2.12, z: 0.05 },
      { x: 0.28, y: 1.62, z: 0.30 },
      { x: 0.54, y: 1.08, z: 0.50 },
    ],
    maker: [
      { x: 0.22, y: 0.72, z: 0.55 },
      { x: 0.46, y: 0.14, z: 0.72 },
      { x: 0.72, y: -0.36, z: 0.35 },
    ],
    reality: [
      { x: -1.55, y: -2.02, z: 0.10 },
      { x: 0.42, y: -2.12, z: 0.34 },
      { x: 1.82, y: -2.06, z: 0.58 },
    ],
  };

  function windowPulse(value, start, peak, end) {
    if (value <= start || value >= end) return 0;
    return value < peak
      ? ease((value - start) / Math.max(0.0001, peak - start))
      : 1 - ease((value - peak) / Math.max(0.0001, end - peak));
  }

  function cycleState(time) {
    const phase = reducedMotion ? 0.85 : ((time / SILENT_CYCLE_SECONDS) % 1 + 1) % 1;
    return {
      phase,
      gather: windowPulse(phase, 0.00, 0.16, 0.34),
      pressure: Math.max(windowPulse(phase, 0.15, 0.43, 0.61), holdStrength),
      subtraction: reducedMotion ? 0.04 : windowPulse(phase, 0.56, 0.625, 0.70),
      inversion: reducedMotion ? 0.12 : windowPulse(phase, 0.58, 0.655, 0.73),
      reconstitution: reducedMotion ? 0.88 : windowPulse(phase, 0.70, 0.82, 0.94),
      crown: reducedMotion ? 0.92 : windowPulse(phase, 0.74, 0.855, 0.94),
      return: reducedMotion ? 0 : ease((phase - 0.93) / 0.07),
    };
  }

  function rotatePoint(point, yaw, pitch, roll) {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const x1 = point.x * cy - point.z * sy;
    const z1 = point.x * sy + point.z * cy;
    const y2 = point.y * cp - z1 * sp;
    const z2 = point.y * sp + z1 * cp;
    return {
      x: x1 * cr - y2 * sr,
      y: x1 * sr + y2 * cr,
      z: z2,
    };
  }

  function currentOrientation(detail = false, ghost = false) {
    const mix = ease(viewMix);
    const worldOffsets = activeWorld === 'machine'
      ? { yaw: 0.19, pitch: -0.04 }
      : activeWorld === 'maker'
        ? { yaw: -0.23, pitch: 0.01 }
        : { yaw: 0.28, pitch: 0.255 };
    const overview = ghost
      ? { yaw: ghostYaw, pitch: ghostPitch, roll: ghostRoll, zoom: overviewZoom }
      : { yaw: overviewYaw, pitch: overviewPitch, roll: overviewRoll, zoom: overviewZoom };
    if (!detail || !activeWorld) return overview;
    return {
      yaw: lerp(overview.yaw, detailYaw + worldOffsets.yaw, mix),
      pitch: lerp(overview.pitch, detailPitch + worldOffsets.pitch, mix),
      roll: lerp(overview.roll, detailRoll, mix),
      zoom: lerp(overview.zoom, detailZoom * 0.94, mix),
    };
  }

  function screenShift(detail = false) {
    const mix = detail ? ease(viewMix) : 0;
    const detailY = activeWorld === 'reality'
      ? (isCompactLayout() ? 0.34 : 0.39)
      : activeWorld === 'maker'
        ? 0.12
        : 0.08;
    return { x: lerp(0.06, -0.005, mix), y: lerp(-0.02, detailY, mix) };
  }

  function isCompactLayout() {
    return width <= 760 || width / Math.max(1, height) < 0.95;
  }

  function viewportShapeScale() {
    const aspect = Math.max(0.25, width / Math.max(1, height));
    return {
      x: aspect < 0.95
        ? lerp(0.56, 0.70, smoothstep(0.46, 0.75, aspect))
        : clamp(aspect * 0.68, 0.78, 1.34),
      y: aspect < 0.95
        ? lerp(0.96, 1.05, smoothstep(0.46, 0.75, aspect))
        : clamp(0.80 + aspect * 0.13, 0.92, 1.04),
    };
  }

  function projectPoint(point, detail = false, orientationOverride = null) {
    const orientation = orientationOverride || currentOrientation(detail, false);
    const viewportScale = viewportShapeScale();
    const rotated = rotatePoint(
      { x: point.x * viewportScale.x, y: point.y * viewportScale.y, z: point.z },
      orientation.yaw,
      orientation.pitch,
      orientation.roll,
    );
    const fov = 43 * Math.PI / 180;
    const focal = 1 / Math.tan(fov * 0.5);
    const aspect = Math.max(0.25, width / Math.max(1, height));
    const camera = 10;
    const scale = orientation.zoom;
    const depth = Math.max(2.2, camera - rotated.z * scale);
    const shift = screenShift(detail);
    const ndcX = rotated.x * scale * focal / (aspect * depth) + shift.x;
    const ndcY = rotated.y * scale * focal / depth + shift.y;
    return {
      x: (ndcX * 0.5 + 0.5) * width,
      y: (0.5 - ndcY * 0.5) * height,
      z: rotated.z,
      f: focal / depth,
    };
  }

  // One ground membrane crosses every viewport boundary. It is landscape, not
  // a centred artefact: only its broken horizon and near field enter the frame.
  const LAMELLAE = [
    {
      world: 3,
      layer: 0,
      stations: [0, 0.15, 0.31, 0.49, 0.66, 0.83, 1],
      points: [
        { x: -9.50, y: -2.27, z: 0.05 },
        { x: -6.30, y: -2.05, z: 0.35 },
        { x: -3.40, y: -2.43, z: -0.20 },
        { x: -0.65, y: -2.07, z: 0.22 },
        { x: 2.40, y: -2.37, z: -0.28 },
        { x: 6.00, y: -1.99, z: 0.42 },
        { x: 9.80, y: -2.29, z: -0.08 },
      ],
      leftWidths: [0.28, 0.22, 0.36, 0.18, 0.31, 0.24, 0.34],
      rightWidths: [8.40, 9.20, 8.70, 10.00, 8.80, 9.40, 8.30],
      banks: [-0.08, 0.10, -0.06, 0.12, -0.10, 0.07, -0.05],
      sideAxis: { x: 0, y: -0.42, z: 1 },
      camber: 0.025,
      thickness: 0.045,
    },
    {
      world: 3,
      layer: 1,
      stations: [0, 0.14, 0.31, 0.49, 0.68, 0.84, 1],
      points: [
        { x: -10.20, y: -1.62, z: 0.28 },
        { x: -6.60, y: -1.30, z: 0.74 },
        { x: -3.30, y: -1.77, z: 0.14 },
        { x: -0.30, y: -1.18, z: 0.88 },
        { x: 3.00, y: -1.72, z: -0.08 },
        { x: 6.50, y: -1.26, z: 0.69 },
        { x: 10.20, y: -1.55, z: 0.20 },
      ],
      leftWidths: [0.05, 0.12, 0.07, 0.16, 0.06, 0.12, 0.08],
      rightWidths: [1.05, 1.42, 0.84, 1.28, 0.76, 1.36, 0.92],
      banks: [-0.24, 0.18, -0.20, 0.29, -0.26, 0.17, -0.13],
      sideAxis: { x: 0, y: -0.36, z: 1 },
      camber: 0.07,
      thickness: 0.06,
    },
  ];

  // The wound is independent of the ground. It crosses the viewport, has its
  // own path-local UVs, and can therefore appear, resolve and fade cleanly.
  const SOVEREIGN_WOUND = {
    stations: [0, 0.14, 0.29, 0.45, 0.61, 0.76, 0.84, 1],
    points: [
      { x: -2.05, y: 4.80, z: -0.35 },
      { x: -1.66, y: 3.58, z: 0.15 },
      { x: -1.86, y: 2.42, z: -0.18 },
      { x: -1.16, y: 1.30, z: 0.48 },
      { x: -1.02, y: 0.18, z: 0.72 },
      { x: -0.18, y: -0.72, z: 0.28 },
      { x: 0.02, y: -1.18, z: 0.02 },
      { x: 0.86, y: -2.62, z: -0.22 },
    ],
    halfWidths: [0.012, 0.018, 0.028, 0.042, 0.066, 0.092, 0.052, 0.012],
    heat: [0.04, 0.10, 0.22, 0.46, 0.78, 1.00, 0.58, 0.08],
  };

  const ETHER_THREADS = [
    { world: 0, color: 0, points: [{ x: -3.40, y: 5.20, z: -0.55 }, { x: -2.25, y: 4.35, z: -0.15 }, { x: -1.88, y: 3.55, z: 0.12 }, { x: -1.52, y: 2.45, z: -0.10 }] },
    { world: 0, color: 3, points: [{ x: -1.65, y: 5.45, z: 0.20 }, { x: -1.92, y: 4.05, z: 0.34 }, { x: -1.70, y: 3.15, z: 0.02 }, { x: -1.43, y: 2.15, z: 0.08 }] },
    { world: 1, color: 1, points: [{ x: 0.45, y: 5.65, z: -0.32 }, { x: -0.32, y: 4.45, z: 0.20 }, { x: -1.10, y: 3.45, z: 0.34 }, { x: -1.60, y: 2.60, z: -0.13 }] },
    { world: 1, color: 3, points: [{ x: 2.25, y: 5.35, z: 0.28 }, { x: 1.10, y: 4.38, z: -0.12 }, { x: -0.42, y: 3.22, z: 0.22 }, { x: -1.37, y: 2.05, z: 0.12 }] },
    { world: 2, color: 2, points: [{ x: 4.10, y: 5.00, z: -0.20 }, { x: 2.55, y: 4.20, z: 0.32 }, { x: 0.25, y: 3.20, z: 0.08 }, { x: -1.25, y: 1.55, z: 0.30 }] },
  ];

  function stationSegment(config, t, preferred = null) {
    if (Number.isInteger(preferred)) return clamp(preferred, 0, config.stations.length - 2);
    for (let index = 0; index < config.stations.length - 1; index++) {
      if (t < config.stations[index + 1] || index === config.stations.length - 2) return index;
    }
    return config.stations.length - 2;
  }

  function stationValue(config, values, t, preferred = null) {
    const segment = stationSegment(config, t, preferred);
    const start = config.stations[segment];
    const end = config.stations[segment + 1];
    return lerp(values[segment], values[segment + 1], clamp((t - start) / Math.max(0.0001, end - start), 0, 1));
  }

  function stationPoint(config, t, preferred = null) {
    return {
      x: stationValue(config, config.points.map((point) => point.x), t, preferred),
      y: stationValue(config, config.points.map((point) => point.y), t, preferred),
      z: stationValue(config, config.points.map((point) => point.z), t, preferred),
    };
  }

  function stationProfileTangent(config, station) {
    const last = config.points.length - 1;
    if (station <= 0) return normalize(subtract(config.points[1], config.points[0]));
    if (station >= last) return normalize(subtract(config.points[last], config.points[last - 1]));
    const incoming = normalize(subtract(config.points[station], config.points[station - 1]));
    const outgoing = normalize(subtract(config.points[station + 1], config.points[station]));
    return normalize({
      x: incoming.x + outgoing.x,
      y: incoming.y + outgoing.y,
      z: incoming.z + outgoing.z,
    });
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function lamellaFrame(index, along, preferredSegment = null) {
    const config = LAMELLAE[index];
    const t = clamp(along, 0, 1);
    const segment = stationSegment(config, t, preferredSegment);
    const stationStart = config.stations[segment];
    const stationEnd = config.stations[segment + 1];
    const amount = clamp((t - stationStart) / Math.max(0.0001, stationEnd - stationStart), 0, 1);
    const startTangent = stationProfileTangent(config, segment);
    const endTangent = stationProfileTangent(config, segment + 1);
    const tangent = normalize({
      x: lerp(startTangent.x, endTangent.x, amount),
      y: lerp(startTangent.y, endTangent.y, amount),
      z: lerp(startTangent.z, endTangent.z, amount),
    });
    const authoredAxis = config.sideAxis || { x: 1, y: 0, z: 0 };
    const projection = dot(authoredAxis, tangent);
    const flatSide = normalize({
      x: authoredAxis.x - tangent.x * projection,
      y: authoredAxis.y - tangent.y * projection,
      z: authoredAxis.z - tangent.z * projection,
    });
    const quarterTurn = normalize(cross(tangent, flatSide));
    const bank = stationValue(config, config.banks, t, segment);
    const side = normalize({
      x: flatSide.x * Math.cos(bank) + quarterTurn.x * Math.sin(bank),
      y: flatSide.y * Math.cos(bank) + quarterTurn.y * Math.sin(bank),
      z: flatSide.z * Math.cos(bank) + quarterTurn.z * Math.sin(bank),
    });
    const frameNormal = normalize(cross(tangent, side));
    return {
      tangent,
      side,
      normal: { x: -frameNormal.x, y: -frameNormal.y, z: -frameNormal.z },
    };
  }

  function lamellaPoint(index, along, across, preferredSegment = null) {
    const config = LAMELLAE[index];
    const t = clamp(along, 0, 1);
    const s = clamp(across, -1, 1);
    const segment = stationSegment(config, t, preferredSegment);
    const center = stationPoint(config, t, segment);
    const { side, normal } = lamellaFrame(index, t, segment);
    const leftWidth = stationValue(config, config.leftWidths, t, segment);
    const rightWidth = stationValue(config, config.rightWidths, t, segment);
    const acrossOffset = s < 0 ? s * leftWidth : s * rightWidth;
    const edgeCurl = config.camber * Math.max(leftWidth, rightWidth) * (s * s - 0.18);
    return {
      x: center.x + side.x * acrossOffset + normal.x * edgeCurl,
      y: center.y + side.y * acrossOffset + normal.y * edgeCurl,
      z: center.z + side.z * acrossOffset + normal.z * edgeCurl,
    };
  }

  function normalize(vector) {
    const length = Math.max(0.000001, Math.hypot(vector.x, vector.y, vector.z));
    return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
  }

  function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }

  function lamellaNormal(index, t, s, preferredSegment = null) {
    const config = LAMELLAE[index];
    const segment = stationSegment(config, t, preferredSegment);
    const stationStart = config.stations[segment];
    const stationEnd = config.stations[segment + 1];
    const epsilon = Math.min(0.002, (stationEnd - stationStart) * 0.08);
    const beforeT = lamellaPoint(index, Math.max(stationStart, t - epsilon), s, segment);
    const afterT = lamellaPoint(index, Math.min(stationEnd, t + epsilon), s, segment);
    const beforeS = lamellaPoint(index, t, Math.max(-1, s - 0.003), segment);
    const afterS = lamellaPoint(index, t, Math.min(1, s + 0.003), segment);
    const normal = normalize(cross(subtract(afterT, beforeT), subtract(afterS, beforeS)));
    // All authored centre-lines advance upward while their side basis advances
    // toward +x. A single deterministic sign keeps the nacre/specular planes
    // continuous across every fold instead of conditionally flipping normals.
    return { x: -normal.x, y: -normal.y, z: -normal.z };
  }

  function lamellaFrameNormal(index, t) {
    return lamellaFrame(index, t).normal;
  }

  function buildSovereignWound(rows, columns) {
    const vertices = [];
    const indices = [];
    const stride = columns + 1;
    const sample = (values, t) => stationValue(SOVEREIGN_WOUND, values, t);
    const curvePoint = (t) => {
      const value = clamp(t, 0, 1);
      const segment = stationSegment(SOVEREIGN_WOUND, value);
      const start = SOVEREIGN_WOUND.stations[segment];
      const end = SOVEREIGN_WOUND.stations[segment + 1];
      const amount = clamp((value - start) / Math.max(0.0001, end - start), 0, 1);
      const p0 = SOVEREIGN_WOUND.points[Math.max(0, segment - 1)];
      const p1 = SOVEREIGN_WOUND.points[segment];
      const p2 = SOVEREIGN_WOUND.points[segment + 1];
      const p3 = SOVEREIGN_WOUND.points[Math.min(SOVEREIGN_WOUND.points.length - 1, segment + 2)];
      const amount2 = amount * amount;
      const amount3 = amount2 * amount;
      const axis = (key) => 0.5 * (
        2 * p1[key]
        + (-p0[key] + p2[key]) * amount
        + (2 * p0[key] - 5 * p1[key] + 4 * p2[key] - p3[key]) * amount2
        + (-p0[key] + 3 * p1[key] - 3 * p2[key] + p3[key]) * amount3
      );
      return { x: axis('x'), y: axis('y'), z: axis('z') };
    };
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      const current = curvePoint(t);
      const before = curvePoint(Math.max(0, t - 0.002));
      const after = curvePoint(Math.min(1, t + 0.002));
      const tangent = normalize(subtract(after, before));
      let side = normalize(cross(tangent, { x: 0, y: 0, z: 1 }));
      let normal = normalize(cross(side, tangent));
      if (normal.z < 0) {
        side = { x: -side.x, y: -side.y, z: -side.z };
        normal = { x: -normal.x, y: -normal.y, z: -normal.z };
      }
      const halfWidth = sample(SOVEREIGN_WOUND.halfWidths, t);
      const heat = sample(SOVEREIGN_WOUND.heat, t);
      for (let column = 0; column <= columns; column++) {
        const s = column / columns * 2 - 1;
        vertices.push(
          current.x + side.x * s * halfWidth,
          current.y + side.y * s * halfWidth,
          current.z + side.z * s * halfWidth,
          normal.x, normal.y, normal.z,
          t, s, 1, heat,
          normal.x, normal.y, normal.z,
        );
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const a = row * stride + column;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
    return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
  }

  function buildSurface(longitudes, latitudes, inner = false) {
    if (inner) {
      return buildSovereignWound(
        Math.max(56, Math.round(latitudes * 0.92)),
        Math.max(4, Math.round(longitudes * 0.035)),
      );
    }

    // A single continuous x/z heightfield makes Dream World physical. Its
    // ridges, escarpments and ravines share topology, so nothing can float like
    // a decorative ledge and no viewport-parallel band can survive.
    const columns = Math.max(52, Math.round(longitudes * 0.62));
    const rows = Math.max(34, Math.round(latitudes * 0.60));
    const stride = columns + 1;
    const vertices = [];
    const indices = [];
    const rotatedHeave = (x, z, cx, cz, heading, widthAlong, widthAcross, amplitude, phase) => {
      const dx = x - cx;
      const dz = z - cz;
      const c = Math.cos(heading);
      const s = Math.sin(heading);
      const along = dx * c + dz * s;
      const across = -dx * s + dz * c;
      const body = Math.exp(
        -Math.pow(along / widthAlong, 2)
        -Math.pow(across / widthAcross, 2)
      );
      const breakage = 0.91 + 0.09 * Math.sin(along * 2.35 + across * 1.10 + phase);
      return body * breakage * amplitude;
    };
    const segmentRavine = (x, z, ax, az, bx, bz, widthValue, depthValue) => {
      const vx = bx - ax;
      const vz = bz - az;
      const weight = clamp(((x - ax) * vx + (z - az) * vz)
        / Math.max(0.0001, vx * vx + vz * vz), 0, 1);
      const px = ax + vx * weight;
      const pz = az + vz * weight;
      const distance = Math.hypot(x - px, z - pz);
      const softEnds = Math.pow(Math.sin(weight * Math.PI), 0.42);
      return Math.exp(-Math.pow(distance / widthValue, 2)) * softEnds * depthValue;
    };
    const terrainAt = (x, z, depthValue) => {
      const depth = clamp(depthValue, 0, 1);
      const horizonBreak = Math.pow(1 - depth, 2.4) * (
        Math.sin(x * 0.47 + 0.4) * 0.19
        + Math.sin(x * 1.23 - 1.1) * 0.080
        + Math.sin(x * 2.71 + 0.8) * 0.032
      );
      const directionalGrain = (
        Math.sin(x * 0.72 + z * 1.18)
        + Math.sin(x * 1.64 - z * 0.66 + 1.7) * 0.46
        + Math.sin(x * 3.20 + z * 1.82 - 0.6) * 0.16
      ) * (0.046 + depth * 0.092);
      const heaveA = rotatedHeave(x, z, -4.80, -0.16,
        17 * Math.PI / 180, 1.48, 0.50, 0.58, 0.4);
      const heaveB = rotatedHeave(x, z, -0.40, 0.32,
        -11 * Math.PI / 180, 0.94, 0.43, 0.88, 1.7);
      const heaveC = rotatedHeave(x, z, 4.00, -0.02,
        23 * Math.PI / 180, 1.28, 0.50, 0.48, -0.8);
      const deepShoulderA = rotatedHeave(x, z, -2.40, 2.55,
        -18 * Math.PI / 180, 2.40, 1.22, 0.40, 2.1);
      const deepShoulderB = rotatedHeave(x, z, 3.10, 3.65,
        14 * Math.PI / 180, 2.62, 1.38, 0.35, -1.2);
      const weldRavine = segmentRavine(x, z, 1.72, -0.48,
        0.72, 2.15, 0.30, 0.64);
      const sovereignRavine = segmentRavine(x, z, 0.72, 2.15,
        -1.25, 5.55, 0.48, 0.52);
      const witnessRavine = segmentRavine(x, z, 4.25, 0.16,
        2.30, 3.90, 0.34, 0.28);
      const base = -1.90 - depth * 1.46;
      return {
        x,
        y: base + horizonBreak + directionalGrain
          + heaveA + heaveB + heaveC + deepShoulderA + deepShoulderB
          - weldRavine - sovereignRavine - witnessRavine,
        z,
      };
    };

    for (let row = 0; row <= rows; row++) {
      const linearDepth = row / rows;
      const depth = Math.pow(linearDepth, 1.14);
      const z = lerp(-0.48, 5.60, depth);
      for (let column = 0; column <= columns; column++) {
        const along = column / columns;
        const x = lerp(-10.6, 10.6, along);
        const point = terrainAt(x, z, depth);
        const xBefore = terrainAt(x - 0.045, z, depth);
        const xAfter = terrainAt(x + 0.045, z, depth);
        const zBefore = terrainAt(x, z - 0.045, clamp((z - 0.045 + 0.48) / 6.08, 0, 1));
        const zAfter = terrainAt(x, z + 0.045, clamp((z + 0.045 + 0.48) / 6.08, 0, 1));
        const tangentX = subtract(xAfter, xBefore);
        const tangentZ = subtract(zAfter, zBefore);
        const normal = normalize(cross(tangentZ, tangentX));
        vertices.push(
          point.x, point.y, point.z,
          normal.x, normal.y, normal.z,
          along, linearDepth * 2 - 1, 0, 0,
          normal.x, normal.y, normal.z,
        );
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const a = row * stride + column;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
  }

  function buildFibres() {
    const vertices = [];
    const segments = coarse || lowCPU ? 24 : 38;
    const curvePoint = (points, t) => {
      const scaled = clamp(t, 0, 1) * (points.length - 1);
      const segment = Math.min(points.length - 2, Math.floor(scaled));
      const amount = scaled - segment;
      const p0 = points[Math.max(0, segment - 1)];
      const p1 = points[segment];
      const p2 = points[segment + 1];
      const p3 = points[Math.min(points.length - 1, segment + 2)];
      const amount2 = amount * amount;
      const amount3 = amount2 * amount;
      const axis = (key) => 0.5 * (
        2 * p1[key]
        + (-p0[key] + p2[key]) * amount
        + (2 * p0[key] - 5 * p1[key] + 4 * p2[key] - p3[key]) * amount2
        + (-p0[key] + 3 * p1[key] - 3 * p2[key] + p3[key]) * amount3
      );
      return { x: axis('x'), y: axis('y'), z: axis('z') };
    };
    ETHER_THREADS.forEach((spec, index) => {
      const anchor = spec.points[spec.points.length - 1];
      const seed = (index + 0.5) / ETHER_THREADS.length;
      for (let segment = 0; segment < segments; segment++) {
        const aWeight = segment / segments;
        const bWeight = (segment + 1) / segments;
        const a = curvePoint(spec.points, 1 - aWeight);
        const b = curvePoint(spec.points, 1 - bWeight);
        vertices.push(
          anchor.x, anchor.y, anchor.z,
          a.x, a.y, a.z,
          aWeight, spec.color, seed, spec.world,
          0, 0, 1, 1 - aWeight, index / Math.max(1, ETHER_THREADS.length - 1),
        );
        vertices.push(
          anchor.x, anchor.y, anchor.z,
          b.x, b.y, b.z,
          bWeight, spec.color, seed, spec.world,
          0, 0, 1, 1 - bWeight, index / Math.max(1, ETHER_THREADS.length - 1),
        );
      }
    });
    return new Float32Array(vertices);
  }

  function perspectiveMatrix(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov * 0.5);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  }

  const BACKGROUND_VERTEX = `#version 300 es
    precision highp float;
    out vec2 vUv;
    void main() {
      vec2 point = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      vUv = point * 0.5;
      gl_Position = vec4(point * 2.0 - 1.0, 0.0, 1.0);
    }
  `;

  const BACKGROUND_FRAGMENT = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 outColor;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uGather;
    uniform float uPressure;
    uniform float uCrown;
    uniform float uReturn;
    uniform float uReconstitution;
    uniform float uReduced;
    uniform float uActiveWorld;
    uniform float uDetailMix;
    uniform float uOverlay;
    uniform vec2 uParallax;

    float hash21(vec2 point) {
      point = fract(point * vec2(123.34, 456.21));
      point += dot(point, point + 45.32);
      return fract(point.x * point.y);
    }

    float noise(vec2 point) {
      vec2 cell = floor(point);
      vec2 local = fract(point);
      local = local * local * (3.0 - 2.0 * local);
      return mix(
        mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), local.x),
        mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0)), local.x),
        local.y
      );
    }

    float fbm(vec2 point) {
      float value = 0.0;
      float amplitude = 0.58;
      for (int octave = 0; octave < 2; octave++) {
        value += noise(point) * amplitude;
        point = mat2(1.57, -1.14, 1.14, 1.57) * point + vec2(4.7, -2.9);
        amplitude *= 0.43;
      }
      return value;
    }

    float faultAt(float y, float portrait) {
      vec2 cutStart = mix(vec2(0.445, -0.080), vec2(0.575, -0.055), portrait);
      vec2 cutEnd = mix(vec2(0.680, 0.720), vec2(0.755, 0.748), portrait);
      float p = clamp((y - cutStart.y) / max(0.001, cutEnd.y - cutStart.y), 0.0, 1.0);
      return mix(cutStart.x, cutEnd.x, p)
        - sin(3.14159265 * p) * mix(0.058, 0.102, portrait)
        + sin(6.2831853 * p + 0.45) * mix(0.012, 0.021, portrait) * p * (1.0 - p)
        + (noise(vec2(p * 17.3, 7.1)) - 0.5) * mix(0.004, 0.006, portrait);
    }

    float gesture(vec2 point, vec2 center, vec2 axis, float lengthValue,
      float bend, float width, float aspect, float seed) {
      vec2 metricPoint = vec2((point.x - center.x) * aspect, point.y - center.y);
      vec2 direction = normalize(vec2(axis.x * aspect, axis.y));
      vec2 across = vec2(-direction.y, direction.x);
      float along = dot(metricPoint, direction);
      float lateral = dot(metricPoint, across);
      float phase = along / max(0.001, lengthValue) + 0.5;
      float curved = lateral - bend * (phase - 0.5) * (phase - 0.5)
        - sin(phase * 6.2831853 + seed * 9.0) * width * 0.42;
      float taper = pow(max(0.0, sin(3.14159265 * clamp(phase, 0.0, 1.0))), 0.52);
      float cap = smoothstep(0.0, 0.075, phase) * (1.0 - smoothstep(0.925, 1.0, phase));
      float dry = smoothstep(0.23, 0.70,
        noise(vec2(floor(phase * 13.0) + seed * 17.0,
          floor(abs(curved) * 420.0) + seed * 7.0)));
      float core = 1.0 - smoothstep(width * max(0.12, taper),
        width * max(0.20, taper) * 2.25, abs(curved));
      return core * cap * (0.30 + 0.70 * dry);
    }

    float vaporFold(vec2 point, vec2 center, vec2 axis, float lengthValue,
      float bend, float width, float aspect) {
      vec2 metricPoint = vec2((point.x - center.x) * aspect, point.y - center.y);
      vec2 direction = normalize(vec2(axis.x * aspect, axis.y));
      vec2 across = vec2(-direction.y, direction.x);
      float along = dot(metricPoint, direction);
      float phase = along / max(0.001, lengthValue) + 0.5;
      float lateral = dot(metricPoint, across)
        - bend * (phase - 0.5) * (phase - 0.5);
      float envelope = pow(max(0.0, sin(3.14159265 * clamp(phase, 0.0, 1.0))), 0.72);
      float core = exp(-pow(lateral / max(0.001, width * (0.42 + 0.58 * envelope)), 2.0));
      float ends = smoothstep(0.0, 0.12, phase) * (1.0 - smoothstep(0.88, 1.0, phase));
      return core * envelope * ends;
    }

    float etherGeology(float x) {
      float broad = sin(x * 5.2 + 0.5) * 0.034
        + sin(x * 10.7 - 1.2) * 0.015;
      float crownA = exp(-pow((x + 0.26) / 0.22, 2.0)) * 0.078;
      float crownB = exp(-pow((x - 0.18) / 0.13, 2.0)) * 0.106;
      float cut = exp(-pow((x - 0.02) / 0.085, 2.0)) * 0.052;
      return broad + crownA + crownB - cut;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
      vec2 screen = vec2(uv.x, 1.0 - uv.y) + uParallax;
      float movingTime = mix(uTime, 0.0, uReduced);
      float aspect = uResolution.x / max(1.0, uResolution.y);
      float portrait = 1.0 - smoothstep(0.78, 1.08, aspect);
      float worldDetail = (1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 3.0))) * uDetailMix;
      vec2 detailPivot = mix(vec2(0.535, 0.655), vec2(0.560, 0.640), portrait);
      vec2 detailScale = mix(vec2(0.660, 0.720), vec2(0.740, 0.780), portrait);
      screen = mix(screen, detailPivot + (screen - vec2(0.500)) * detailScale, worldDetail);

      float horizonY = mix(0.720, 0.748, portrait);
      float faultX = faultAt(screen.y, portrait);
      float sd = screen.x - faultX;
      vec2 cutStart = mix(vec2(0.445, -0.080), vec2(0.575, -0.055), portrait);
      vec2 cutEnd = mix(vec2(0.680, 0.720), vec2(0.755, 0.748), portrait);
      float p = clamp((screen.y - cutStart.y) / max(0.001, cutEnd.y - cutStart.y), 0.0, 1.0);
      float chip = hash21(vec2(floor(p * 41.0), 7.0));
      float halfWidth = mix(0.0038, 0.0058, portrait)
        + mix(0.0007, 0.0012, portrait) * sin(p * 53.0)
        + (chip - 0.5) * 0.0026;
      halfWidth = max(0.0024, halfWidth);
      float faultExtent = smoothstep(cutStart.y, cutStart.y + 0.040, screen.y)
        * (1.0 - smoothstep(horizonY - 0.016, horizonY + 0.005, screen.y));

      if (uOverlay > 0.5) {
        float below = smoothstep(horizonY - 0.004, horizonY + 0.035, screen.y)
          * (1.0 - smoothstep(0.97, 1.02, screen.y));
        vec2 echoPoint = vec2((screen.x - mix(0.57, 0.73, portrait)) * aspect,
          screen.y - mix(0.835, 0.855, portrait));
        float patchA = exp(-dot((echoPoint - vec2(-0.105, -0.015))
          / vec2(0.140, 0.043), (echoPoint - vec2(-0.105, -0.015))
          / vec2(0.140, 0.043)));
        float patchB = exp(-dot((echoPoint - vec2(0.055, 0.025))
          / vec2(0.105, 0.036), (echoPoint - vec2(0.055, 0.025))
          / vec2(0.105, 0.036)));
        float patchC = exp(-dot((echoPoint - vec2(0.180, 0.066))
          / vec2(0.082, 0.029), (echoPoint - vec2(0.180, 0.066))
          / vec2(0.082, 0.029)));
        float erode = smoothstep(0.28, 0.66,
          noise(vec2(echoPoint.x * 11.0 + 7.0, echoPoint.y * 17.0 - 3.0)));
        float patches = max(patchA, max(patchB, patchC)) * erode * below;
        float mirrorY = horizonY - (screen.y - horizonY) * 2.85;
        float echoFault = exp(-abs(screen.x - faultAt(mirrorY, portrait)
          - mix(0.032, 0.048, portrait)) * 95.0) * below;
        vec3 echoNacre = mix(vec3(0.80, 0.22, 0.20), vec3(0.62, 0.43, 0.70), 0.48);
        outColor = vec4(pow(echoNacre, vec3(0.84)),
          patches * (0.10 + 0.08 * uReturn) + echoFault * 0.055);
        return;
      }

      float climax = clamp(uReconstitution * 0.62 + uCrown * 0.90, 0.0, 1.0);
      vec2 strained = screen;
      strained.x -= sign(sd) * uPressure * 0.034 * exp(-abs(sd) * 8.5) * (0.35 + 0.65 * p);
      float scumble = fbm(strained * vec2(3.1, 8.7) + vec2(strained.y * 0.55, 0.0));
      float scrape = smoothstep(0.56, 0.78,
        fbm(strained * vec2(10.8, 2.4) + vec2(17.0)));

      float edgeAA = max(fwidth(sd) * 1.45, 0.00075);
      float leftMatter = (1.0 - smoothstep(-halfWidth - edgeAA,
        -halfWidth + edgeAA, sd)) * faultExtent;
      float rightMatter = smoothstep(halfWidth - edgeAA,
        halfWidth + edgeAA, sd) * faultExtent;
      float cavity = (1.0 - smoothstep(halfWidth * 0.58,
        halfWidth + edgeAA * 0.72, abs(sd))) * faultExtent;

      vec3 night = vec3(0.0025, 0.0035, 0.0090);
      vec3 left0 = vec3(0.010, 0.035, 0.048);
      vec3 left1 = vec3(0.052, 0.118, 0.128);
      vec3 right0 = vec3(0.030, 0.006, 0.017);
      vec3 right1 = vec3(0.112, 0.020, 0.042);
      vec3 bone = vec3(0.920, 0.740, 0.480);
      vec3 coral = vec3(0.770, 0.180, 0.140);
      vec3 lilac = vec3(0.460, 0.270, 0.700);
      vec3 petrol = vec3(0.140, 0.430, 0.500);

      vec3 leftColor = mix(night, left0, 0.62 + 0.13 * scumble)
        + left1 * scrape * 0.055;
      vec3 rightColor = mix(night, right0, 0.58 + 0.16 * (1.0 - scumble))
        + right1 * scrape * 0.050;
      leftColor += right0 * 0.035 * smoothstep(0.69, 0.89, scumble);
      rightColor += left0 * 0.032 * smoothstep(0.70, 0.90, 1.0 - scumble);
      vec3 color = night;
      color += leftColor * leftMatter * (0.82 + 0.10 * uGather + 0.07 * uCrown);
      color += rightColor * rightMatter * (0.82 + 0.09 * uPressure + 0.08 * uCrown);
      color = mix(color, night * 0.10, cavity * 0.985);

      float echoX = (screen.x - mix(0.39, 0.44, portrait)) * mix(1.25, 1.62, portrait);
      float echoProfile = horizonY - mix(0.205, 0.175, portrait) - etherGeology(echoX);
      float echoRidge = exp(-abs(screen.y - echoProfile) * mix(34.0, 40.0, portrait));
      float echoMass = exp(-abs(screen.y - echoProfile) * mix(12.0, 15.0, portrait));
      float echoDomain = (1.0 - smoothstep(horizonY - 0.07, horizonY, screen.y))
        * smoothstep(0.04, 0.20, p);
      float echoDraw = smoothstep(0.10, 0.78, echoMass)
        * (0.34 + 0.66 * echoRidge) * echoDomain;
      float echoConvergence = exp(-abs(sd) * 6.8) * smoothstep(0.18, 0.72, p);
      vec3 echoStone = mix(vec3(0.025, 0.075, 0.088),
        vec3(0.170, 0.120, 0.182), smoothstep(0.18, 0.82, scumble));
      color = mix(color, echoStone, echoDraw
        * (0.045 + 0.040 * uGather + 0.030 * uCrown));
      color += mix(petrol, coral, smoothstep(-0.04, 0.035, sd))
        * echoConvergence * echoRidge * (0.012 + 0.035 * uPressure);

      float pressureAura = exp(-abs(sd) * mix(5.2, 3.8, portrait))
        * faultExtent * smoothstep(0.08, 0.64, p);
      vec3 auraColor = mix(
        mix(petrol, left1, 0.55),
        mix(coral, right1, 0.62),
        smoothstep(-0.025, 0.055, sd)
      );
      color += auraColor * pressureAura
        * (0.020 + 0.032 * uPressure + 0.050 * uCrown);

      float lipWindowA = smoothstep(0.27, 0.31, p) * (1.0 - smoothstep(0.41, 0.45, p));
      float lipWindowB = smoothstep(0.58, 0.62, p) * (1.0 - smoothstep(0.69, 0.73, p));
      float lipWindows = max(lipWindowA, lipWindowB)
        * smoothstep(0.18, 0.58, hash21(vec2(floor(p * 29.0), 11.0)));
      float rightLip = exp(-abs(sd - halfWidth) / mix(0.0020, 0.0040, portrait))
        * faultExtent * lipWindows;
      float lipEnergy = 0.32 + 0.52 * (uReconstitution * 0.46 + uCrown * 0.86);
      color += mix(coral, bone, 0.56) * rightLip * lipEnergy;

      float side = max(0.0, sd - halfWidth);
      float releaseFlow = fbm(vec2(p * 5.4 + side * 2.7,
        side * 7.6 - p * 3.0 + 1.7));
      float shearPhase = p + side * mix(0.61, 0.74, portrait)
        + (releaseFlow - 0.5) * 0.072;
      float eventWindow = smoothstep(0.19, 0.33, shearPhase)
        * (1.0 - smoothstep(0.98, 1.17, shearPhase));
      float releaseGap = mix(0.014, 0.021, portrait)
        + 0.008 * smoothstep(0.42, 0.72, p);
      float releaseWidth = mix(0.082, 0.118, portrait)
        + mix(0.145, 0.122, portrait) * smoothstep(0.31, 0.82, shearPhase);
      float tail = exp(-pow(max(0.0, side - releaseGap)
        / max(0.001, releaseWidth), 1.72));
      float foldA = 0.5 + 0.5 * sin(shearPhase * 17.4
        + side * 35.0 + releaseFlow * 3.7);
      float foldB = 0.5 + 0.5 * sin(shearPhase * 8.2
        - side * 19.0 + 1.4);
      float micro = noise(vec2(shearPhase * 8.1 + 3.1,
        side * 52.0 - p * 7.6));
      float lamination = 0.44 + foldA * 0.34 + foldB * 0.14
        + (micro - 0.5) * 0.10;
      float openWash = smoothstep(releaseGap, releaseGap + 0.015, side)
        * tail * eventWindow * clamp(lamination, 0.28, 0.91);

      vec3 smokedViolet = vec3(0.115, 0.050, 0.132);
      vec3 coralPearl = vec3(0.620, 0.285, 0.255);
      vec3 lunarBone = vec3(0.750, 0.660, 0.570);
      vec3 oceanNacre = vec3(0.075, 0.225, 0.245);
      vec3 nacre = mix(smokedViolet, coralPearl, 0.24 + 0.30 * releaseFlow);
      nacre = mix(nacre, lunarBone, 0.13 + 0.24 * foldA * foldB);
      nacre = mix(nacre, oceanNacre, (1.0 - releaseFlow) * 0.13);

      float veilEnergy = 0.070 + 0.105 * uReconstitution + 0.105 * uCrown;
      color = mix(color, nacre, clamp(openWash * veilEnergy, 0.0, 0.26));
      float veinWave = 0.5 + 0.5 * cos(shearPhase * 34.0
        + side * 66.0 + releaseFlow * 4.6);
      float mineralVeins = pow(veinWave, 11.0) * openWash
        * (0.36 + 0.64 * smoothstep(0.38, 0.76, micro));
      vec3 veinColor = mix(coralPearl, lunarBone, 0.58 + 0.20 * foldB);
      color += veinColor * mineralVeins
        * (0.050 + 0.115 * uReconstitution + 0.150 * uCrown);

      float pearlRidge = smoothstep(0.80, 0.975, foldA)
        * smoothstep(0.56, 0.82, releaseFlow) * openWash;
      float causticAxis = releaseGap + 0.028
        + 0.112 * smoothstep(0.31, 0.82, shearPhase)
        + 0.012 * sin(shearPhase * 11.8 + releaseFlow * 4.1);
      float internalCaustic = exp(-pow((side - causticAxis)
        / (0.007 + 0.013 * shearPhase), 2.0))
        * eventWindow * smoothstep(0.43, 0.74, releaseFlow);
      float incarnation = exp(-pow((side - (0.070 + p * 0.092))
        / mix(0.040, 0.058, p), 2.0))
        * smoothstep(0.46, 0.79, p) * eventWindow
        * (0.55 + 0.45 * foldB);

      color += mix(lunarBone, coral, 0.24) * pearlRidge
        * (0.055 + 0.16 * uCrown);
      color += mix(bone, coral, 0.22) * internalCaustic
        * (0.060 + 0.19 * uCrown);
      color += mix(coralPearl, lunarBone, 0.52) * incarnation
        * (0.030 + 0.09 * uReconstitution + 0.11 * uCrown);
      color += mix(oceanNacre, vec3(0.050, 0.310, 0.230), 0.45)
        * openWash * releaseFlow * 0.022;

      float breathEnergy = 0.045 + 0.075 * uGather + 0.060 * uCrown;
      float dreamBreathA = vaporFold(screen, vec2(0.285, 0.270), vec2(0.90, 0.44),
        0.190, -0.030, 0.013, aspect);
      float dreamBreathB = vaporFold(screen, vec2(0.355, 0.445), vec2(0.72, 0.69),
        0.150, 0.035, 0.016, aspect);
      float makerBreath = vaporFold(screen, vec2(0.310, 0.555), vec2(0.95, -0.31),
        0.205, 0.052, 0.018, aspect);
      float returnBreathA = vaporFold(screen, vec2(0.705, 0.455), vec2(-0.48, 0.88),
        0.175, -0.044, 0.018, aspect);
      float returnBreathB = vaporFold(screen, vec2(0.735, 0.605), vec2(-0.83, -0.56),
        0.170, 0.040, 0.015, aspect);
      color = mix(color, mix(left1, bone, 0.15),
        clamp(dreamBreathA * breathEnergy + dreamBreathB * breathEnergy * 0.72, 0.0, 0.13));
      color = mix(color, mix(vec3(0.050, 0.290, 0.225), bone, 0.14),
        clamp(makerBreath * breathEnergy * 0.82, 0.0, 0.11));
      color = mix(color, mix(smokedViolet, lunarBone, 0.30),
        clamp((returnBreathA + returnBreathB * 0.74)
          * (breathEnergy + 0.045 * uReconstitution), 0.0, 0.15));

      float horizonNoise = fbm(vec2(screen.x * 6.8, movingTime * 0.004));
      float horizon = exp(-abs(screen.y - horizonY - (horizonNoise - 0.5) * 0.004) * 88.0);
      horizon *= smoothstep(0.42, 0.60, horizonNoise) * (1.0 - smoothstep(0.81, 0.94, horizonNoise));
      color += mix(bone, lilac, 0.34) * horizon * (0.045 + uReturn * 0.045);

      color *= mix(1.0, 0.92, worldDetail);
      float vignette = length((screen - vec2(0.52, 0.47)) * vec2(0.74, 1.0));
      color *= 1.0 - smoothstep(0.48, 1.02, vignette) * 0.21;
      color *= mix(1.0, 1.10, portrait);
      color += (hash21(gl_FragCoord.xy + movingTime) - 0.5) * 0.0022;
      color = 1.0 - exp(-max(color, vec3(0.0)) * 1.28);
      color = pow(color, vec3(0.78));
      outColor = vec4(color, 1.0);
    }
  `;

  const SURFACE_VERTEX = `#version 300 es
    precision highp float;
    layout(location=0) in vec3 aPosition;
    layout(location=1) in vec3 aNormal;
    layout(location=2) in float aAlong;
    layout(location=3) in float aAcross;
    layout(location=4) in float aLamella;
    layout(location=5) in float aBack;
    layout(location=6) in vec3 aDeformNormal;
    uniform mat4 uProjection;
    uniform vec4 uOrientation;
    uniform vec2 uScreenShift;
    uniform vec2 uViewportScale;
    uniform float uCameraZ;
    uniform float uTime;
    uniform float uGather;
    uniform float uPressure;
    uniform float uSubtraction;
    uniform float uInversion;
    uniform float uReconstitution;
    uniform float uCrown;
    uniform float uReturn;
    uniform float uDetailMix;
    uniform float uActiveWorld;
    uniform float uMaterial;
    uniform float uGhost;
    uniform float uReduced;
    out vec3 vWorld;
    out vec3 vLocal;
    out vec3 vNormal;
    out vec3 vLocalNormal;
    out float vAlong;
    out float vAcross;
    out float vLamella;
    out float vBack;
    out float vDepth;

    vec3 rotateY(vec3 point, float angle) {
      float c = cos(angle), s = sin(angle);
      return vec3(point.x * c - point.z * s, point.y, point.x * s + point.z * c);
    }
    vec3 rotateX(vec3 point, float angle) {
      float c = cos(angle), s = sin(angle);
      return vec3(point.x, point.y * c - point.z * s, point.y * s + point.z * c);
    }
    vec3 rotateZ(vec3 point, float angle) {
      float c = cos(angle), s = sin(angle);
      return vec3(point.x * c - point.y * s, point.x * s + point.y * c, point.z);
    }
    vec3 orient(vec3 point, vec3 angles) {
      return rotateZ(rotateX(rotateY(point, angles.x), angles.y), angles.z);
    }

    void main() {
      vec3 point = aPosition;
      vec3 normal = aNormal;
      vec3 deformNormal = aDeformNormal;
      float movingTime = mix(uTime, 0.0, uReduced);
      float envelope = sin(clamp(aAlong, 0.0, 1.0) * 3.14159265);
      float compression = clamp(uPressure + uInversion * 0.16, 0.0, 1.0);
      float machineMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 1.0));
      float makerMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 2.0));
      float worldMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 3.0));
      float worldChange = uDetailMix;

      if (uMaterial < 0.5) {
        float horizonProximity = 1.0 - smoothstep(-0.86, -0.08, aAcross);
        float faultAxis = -0.56 - point.y * 0.38;
        float faultDistance = point.x - faultAxis;
        float cleave = exp(-abs(faultDistance) * 3.5) * (0.30 + horizonProximity * 0.70);
        float cleaveSide = clamp(faultDistance * 10.0, -1.0, 1.0);
        point.x = mix(point.x, faultAxis + faultDistance * 0.78, compression * cleave * 0.18);
        point.y += cleave * (0.032 + uReconstitution * 0.065 + uCrown * 0.040) * (1.0 - abs(cleaveSide) * 0.24);
        point.z += cleaveSide * cleave * (0.040 + uPressure * 0.070 + uCrown * 0.025);
        point.z -= uSubtraction * (0.025 + horizonProximity * 0.030);
        float detailRelief = sin(aAlong * 9.1 + aAcross * 3.7 - movingTime * 0.022) * 0.050
          + sin(aAlong * 4.3 - aAcross * 5.9 + 1.7) * 0.031
          + sin(aAlong * 17.3 + aAcross * 8.1) * 0.012;
        float worldDetailScale = worldMask * worldChange;
        point += deformNormal * detailRelief * worldDetailScale * 0.12;
        point.z += worldDetailScale * (0.045 + 0.055 * (aAcross + 1.0));
        point.y += worldDetailScale * (0.035 + 0.025 * sin(aAlong * 7.4 + aAcross * 2.1));
        point.z += machineMask * worldChange * horizonProximity * 0.018;
        point.x += makerMask * worldChange * cleave * sin(aAlong * 5.4) * 0.024;
        point.y += uReturn * horizonProximity * (0.025 + cleave * 0.040);
      } else {
        float woundBreath = sin(aAlong * 9.0 - movingTime * 0.040) * envelope;
        point.x += woundBreath * uGather * 0.012;
        point += deformNormal * woundBreath * (uReconstitution * 0.012 + uCrown * 0.010);
        point.x = mix(point.x, -0.56 - point.y * 0.38, compression * envelope * 0.035);
        point.z -= uSubtraction * envelope * 0.035;
        point.y += uReturn * envelope * (0.025 + aBack * 0.020);
      }

      if (uGhost > 0.5) {
        float mirrorPlane = -1.18;
        float sheetOffset = sin(aAlong * 7.0 + 1.9) * 0.020;
        point.x = point.x * 0.980 + 0.58 + sheetOffset;
        point.y = mirrorPlane - (point.y - mirrorPlane) * 0.32;
        point.z -= 0.24;
        normal = -normalize(vec3(normal.x / 0.980, -normal.y / 0.32, normal.z));
      }

      point.xy *= uViewportScale;
      normal = normalize(vec3(
        normal.x / max(0.01, uViewportScale.x),
        normal.y / max(0.01, uViewportScale.y),
        normal.z
      ));
      point *= uOrientation.w;
      vec3 world = orient(point, uOrientation.xyz);
      vec3 worldNormal = normalize(orient(normal, uOrientation.xyz));
      vec4 clip = uProjection * vec4(world + vec3(0.0, 0.0, -uCameraZ), 1.0);
      clip.xy += uScreenShift * clip.w;
      gl_Position = clip;
      vWorld = world;
      vLocal = aPosition;
      vNormal = worldNormal;
      vLocalNormal = aNormal;
      vAlong = aAlong;
      vAcross = aAcross;
      vLamella = aLamella;
      vBack = aBack;
      vDepth = clip.w;
    }
  `;

  const SURFACE_FRAGMENT = `#version 300 es
    precision highp float;
    in vec3 vWorld;
    in vec3 vLocal;
    in vec3 vNormal;
    in vec3 vLocalNormal;
    in float vAlong;
    in float vAcross;
    in float vLamella;
    in float vBack;
    in float vDepth;
    out vec4 outColor;
    uniform float uTime;
    uniform float uMaterial;
    uniform float uPressure;
    uniform float uSubtraction;
    uniform float uReconstitution;
    uniform float uCrown;
    uniform float uReturn;
    uniform float uDetailMix;
    uniform float uActiveWorld;
    uniform float uActiveSub;
    uniform float uGhost;
    uniform float uReduced;

    float hash31(vec3 point) {
      point = fract(point * 0.1031);
      point += dot(point, point.yzx + 33.33);
      return fract((point.x + point.y) * point.z);
    }

    float rockHash(vec2 point) {
      return hash31(vec3(point, 19.19));
    }

    float rockNoise(vec2 point) {
      vec2 cell = floor(point);
      vec2 local = fract(point);
      local = local * local * (3.0 - 2.0 * local);
      return mix(
        mix(rockHash(cell), rockHash(cell + vec2(1.0, 0.0)), local.x),
        mix(rockHash(cell + vec2(0.0, 1.0)), rockHash(cell + vec2(1.0, 1.0)), local.x),
        local.y
      );
    }

    float rockFbm(vec2 point) {
      return 0.58 * rockNoise(point)
        + 0.28 * rockNoise(point * 2.07 + vec2(3.1, -1.7))
        + 0.14 * rockNoise(point * 4.37 + vec2(-5.2, 6.8));
    }

    void main() {
      vec3 safeNormal = vNormal / max(length(vNormal), 0.0001);
      vec3 localTerrainNormal = vLocalNormal / max(length(vLocalNormal), 0.0001);
      vec3 faceNormal = gl_FrontFacing ? safeNormal : -safeNormal;
      vec3 derivativeCross = cross(dFdx(vWorld), dFdy(vWorld));
      vec3 derivativeNormal = derivativeCross / max(length(derivativeCross), 0.0001);
      if (dot(derivativeNormal, safeNormal) < 0.0) derivativeNormal = -derivativeNormal;
      float worldRelief = (1.0 - step(0.5, uMaterial))
        * (1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 3.0))) * uDetailMix;
      vec3 detailNormal = gl_FrontFacing ? derivativeNormal : -derivativeNormal;
      vec3 normal = normalize(mix(faceNormal, detailNormal, worldRelief * 0.05));
      vec3 viewDirection = normalize(vec3(0.0, 0.0, 10.0) - vWorld);
      vec3 keyDirection = normalize(vec3(-0.62, 0.76, 0.20));
      vec3 fillDirection = normalize(vec3(0.74, -0.16, 0.52));
      vec3 rimDirection = normalize(vec3(0.16, -0.32, 0.93));
      float ndl = dot(normal, keyDirection);
      float wrapDiffuse = clamp((ndl + 0.18) / 1.18, 0.0, 1.0);
      float skyFill = 0.5 + 0.5 * normal.y;
      float fill = max(0.0, dot(normal, fillDirection));
      float underLight = max(0.0, dot(normal, rimDirection));
      float warmBounce = max(0.0, dot(normal, normalize(vec3(0.38, -0.78, 0.50))));
      float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
      float fresnel = pow(1.0 - facing, 4.6);
      vec3 halfDirection = normalize(keyDirection + viewDirection);
      float specular = pow(max(0.0, dot(normal, halfDirection)), 112.0);
      float movingTime = mix(uTime, 0.0, uReduced);
      float climax = smoothstep(0.32, 0.94, uReconstitution * 0.70 + uCrown * 0.82 + uReturn * 0.10);

      vec3 obsidian = vec3(0.026, 0.023, 0.034);
      vec3 graphite = vec3(0.176, 0.151, 0.194);
      vec3 ultramarine = vec3(0.071, 0.078, 0.176);
      vec3 bone = vec3(0.885, 0.828, 0.742);
      vec3 coral = vec3(0.929, 0.376, 0.306);
      vec3 cyan = vec3(0.055, 0.390, 0.510);
      vec3 emerald = vec3(0.060, 0.390, 0.285);
      vec3 violet = vec3(0.335, 0.185, 0.545);
      vec3 color;
      float alpha = 1.0;

      vec3 facetCoord = vec3(
        dot(vLocal, vec3(0.78, 0.18, -0.59)) * 1.276,
        dot(vLocal, vec3(-0.22, 0.92, 0.31)) * 0.946,
        dot(vLocal, vec3(0.42, 0.34, 0.84)) * 1.144
      );
      float facetTone = floor(hash31(floor(facetCoord + vec3(vLamella * 1.73, vBack * 2.9, 0.0))) * 3.0) / 2.0;
      float broadPlaneA = 0.5 + 0.5 * sin(vAlong * 1.31 + vAcross * 0.67 + vLamella * 0.83);
      float broadPlaneB = 0.5 + 0.5 * sin(vAlong * 0.59 - vAcross * 1.07 + vBack * 2.17 + 1.9);
      float groundTone = clamp(0.38 + broadPlaneA * 0.14 + broadPlaneB * 0.08, 0.0, 1.0);

      if (uMaterial < 0.5) {
        if (vBack > 0.5) discard;
        vec2 geologyPoint = vec2(vAlong * 3.10 + vLamella * 5.70, vAcross * 1.55);
        float macro = rockFbm(geologyPoint);
        float grit = rockNoise(geologyPoint * 6.30 + vec2(4.8, -3.2));
        float warpA = rockFbm(vec2(vAlong * 1.25 + 2.1, 1.7));
        float warpB = rockFbm(vec2(vAlong * 2.85 - 4.4, 7.2));
        float mineral = pow(1.0 - abs(2.0 * grit - 1.0), 5.0)
          * smoothstep(0.50, 0.82, macro);
        float terrainSlope = 1.0 - clamp(localTerrainNormal.y, 0.0, 1.0);
        float heightTone = smoothstep(-3.72, -1.62, vLocal.y);
        vec3 highShale = mix(vec3(0.138, 0.108, 0.158),
          vec3(0.292, 0.215, 0.282), 0.24 + macro * 0.22);
        vec3 middleStone = mix(vec3(0.076, 0.043, 0.092),
          vec3(0.186, 0.098, 0.186), 0.20 + warpB * 0.22);
        vec3 deepStone = mix(vec3(0.020, 0.016, 0.030),
          vec3(0.112, 0.040, 0.066), 0.12 + warpA * 0.15);
        vec3 rockColor = mix(deepStone, middleStone,
          smoothstep(-3.68, -2.58, vLocal.y));
        rockColor = mix(rockColor, highShale,
          smoothstep(-2.54, -1.70, vLocal.y));
        rockColor = mix(rockColor, deepStone, terrainSlope * 0.22);
        rockColor += mix(bone, ultramarine, 0.58) * mineral
          * (0.030 + 0.052 * wrapDiffuse) * (0.38 + heightTone * 0.62);
        color = rockColor * (1.00 + 0.38 * wrapDiffuse + 0.14 * skyFill + 0.07 * fill);
        float horizonCatch = 1.0 - smoothstep(-0.96, -0.40, vAcross);
        color += mix(coral, bone, 0.62) * horizonCatch
          * (0.014 + 0.030 * climax) * (0.35 + 0.65 * wrapDiffuse);

        float faultSigned = vLocal.x - (-0.56 - vLocal.y * 0.38);
        float pressureZone = exp(-abs(faultSigned) * 1.55)
          * smoothstep(-0.82, -0.45, vAcross) * (1.0 - smoothstep(0.68, 0.92, vAcross));
        float groundPhase = (vAlong * 8.60 + faultSigned * 3.40 + macro * 2.10)
          * mix(1.0, 1.65, uPressure) - movingTime * 0.018;
        vec3 groundFilm = 0.5 + 0.5 * cos(groundPhase * 0.73 + vec3(0.00, 2.15, 4.25));
        vec3 groundWeight = pow(vec3(0.15) + groundFilm * 0.85, vec3(2.0));
        vec3 groundSpectral = (cyan * groundWeight.r + emerald * groundWeight.g + violet * groundWeight.b)
          / max(0.001, groundWeight.r + groundWeight.g + groundWeight.b);
        vec3 groundNacre = mix(bone, groundSpectral, 0.44);
        float nacreMineral = mineral * pressureZone * (0.22 + 0.78 * climax);
        color = mix(color, groundNacre, nacreMineral * (0.38 + 0.34 * uCrown));
        float groundBloom = pressureZone * climax
          * smoothstep(0.46, 0.74, rockFbm(vec2(vAlong * 1.45 + 6.8, vAcross * 0.58 + 2.9)));
        color += mix(groundSpectral, bone, 0.22) * groundBloom * (0.082 + uCrown * 0.145);
        float mineralSpec = pow(max(0.0, dot(normal, halfDirection)), mix(14.0, 38.0, mineral));
        color += bone * mineralSpec * (0.012 + 0.052 * mineral);

        float machineMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 1.0));
        float makerMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 2.0));
        float worldMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 3.0));
        color = mix(color, cyan, machineMask * uDetailMix * mineral * 0.10);
        color = mix(color, emerald, makerMask * uDetailMix * pressureZone * 0.08);
        float worldCleave = worldMask * uDetailMix;
        float slopeShade = smoothstep(0.12, 0.74, terrainSlope);
        float elevationPlane = smoothstep(-3.42, -1.72, vLocal.y);
        color *= 1.0 - worldCleave * slopeShade * 0.16;
        color = mix(color, mix(graphite, violet, 0.18),
          worldCleave * (0.025 + elevationPlane * 0.028));
        float capNoise = rockNoise(vec2(vWorld.x * 0.82 + vWorld.z * 0.36,
          vWorld.z * 1.12 - vWorld.x * 0.24));
        float capGate = smoothstep(0.88, 0.965, capNoise)
          * smoothstep(0.62, 0.91, localTerrainNormal.y);
        float broadMineral = pow(max(0.0, dot(normal, halfDirection)), 18.0);
        float rareMineral = pow(max(0.0, dot(normal, halfDirection)), 48.0) * capGate;
        color += mix(violet, bone, 0.30) * worldCleave
          * (broadMineral * 0.026 + rareMineral * (0.080 + 0.080 * climax));
        float ravineOcclusion = smoothstep(0.42, 0.78, terrainSlope)
          * smoothstep(-3.20, -2.05, vLocal.y);
        color *= 1.0 - worldCleave * ravineOcclusion * 0.10;

        color *= 1.0 - uSubtraction * (0.18 + macro * 0.12);
        color *= mix(1.0, 1.16, worldCleave);
        color += mix(vec3(0.120, 0.050, 0.180), bone, 0.26)
          * worldCleave * pow(max(0.0, normal.y * 0.5 + 0.5), 2.0) * 0.035;
        float groundDepth = smoothstep(-0.86, 0.82, vAcross);
        float loadWindow = smoothstep(0.38, 0.46, vAlong)
          * (1.0 - smoothstep(0.62, 0.70, vAlong));
        float loadLamina = exp(-abs(faultSigned - 0.10) * 8.5) * pressureZone * loadWindow;
        loadLamina *= smoothstep(0.52, 0.78, rockFbm(vec2(vAlong * 2.2 + 4.5, 6.1)));
        color += mix(coral, bone, 0.38) * loadLamina
          * (0.020 + 0.040 * climax + worldCleave * 0.086);
        alpha = 1.0;
      } else if (uMaterial < 1.5) {
        if (uGhost > 0.5) discard;
        float extent = smoothstep(0.300, 0.355, vAlong)
          * (1.0 - smoothstep(0.690, 0.745, vAlong));
        float notch = 1.0 - smoothstep(0.505, 0.520, vAlong)
          * (1.0 - smoothstep(0.548, 0.565, vAlong));
        float distanceToCut = abs(vAcross);
        float voidCore = 1.0 - smoothstep(0.035, 0.120, distanceToCut);
        float mineralLip = exp(-pow((distanceToCut - 0.280) / 0.160, 2.0));
        float whiteEdge = exp(-pow((vAcross - 0.170) / 0.055, 2.0));
        float pressureHeat = smoothstep(0.48, 0.57, vAlong)
          * (1.0 - smoothstep(0.66, 0.73, vAlong));
        vec3 sovereignGold = vec3(0.960, 0.875, 0.720);
        vec3 mineralDark = mix(vec3(0.010, 0.006, 0.014), violet, 0.14);
        vec3 lipTint = mix(
          mix(cyan, bone, 0.35),
          mix(coral, sovereignGold, 0.42),
          smoothstep(-0.25, 0.25, vAcross)
        );
        color = mix(mineralDark, lipTint, mineralLip * 0.72);
        color = mix(color, mix(coral, sovereignGold, 0.36), pressureHeat * mineralLip * (0.34 + uCrown * 0.28));
        color += bone * whiteEdge * (0.22 + 0.30 * climax);
        color *= 1.0 - voidCore * 0.62;
        alpha = extent * notch * (voidCore * 0.94 + mineralLip * 0.40 + whiteEdge * 0.58)
          * (1.0 - uReturn * 0.35);
      } else {
        color = mix(obsidian, graphite, 0.34 + facetTone * 0.30);
        color += ultramarine * fresnel * 0.11;
        color += bone * specular * 0.08;
        float reflectionFade = smoothstep(-5.45, -2.42, vWorld.y);
        float ghostGrain = hash31(floor(facetCoord * 2.3 + vec3(floor(movingTime * 0.08))));
        alpha = (0.190 + fresnel * 0.27 + uSubtraction * 0.058)
          * (0.82 + ghostGrain * 0.18) * reflectionFade;
        alpha *= vLamella < 0.5 ? 1.0 : 0.38;
      }

      float selectedPulse = 0.5 + 0.5 * sin(movingTime * 1.12 + uActiveSub * 1.9);
      color += coral * uDetailMix * selectedPulse * 0.006;
      color += vec3(0.008, 0.007, 0.012) * uReturn;
      float outputGamma = uMaterial < 0.5 ? mix(0.86, 0.78, worldRelief) : 0.84;
      color = pow(max(color, vec3(0.0)), vec3(outputGamma));
      outColor = vec4(color, alpha);
    }
  `;

  const POINT_VERTEX = `#version 300 es
    precision highp float;
    layout(location=0) in vec3 aPosition;
    layout(location=1) in vec3 aColor;
    layout(location=2) in float aSize;
    uniform mat4 uProjection;
    uniform vec4 uOrientation;
    uniform vec2 uScreenShift;
    uniform vec2 uViewportScale;
    uniform float uCameraZ;
    uniform float uDetailMix;
    uniform float uDpr;
    out vec3 vColor;
    vec3 rotateY(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c-p.z*s,p.y,p.x*s+p.z*c);}
    vec3 rotateX(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);}
    vec3 rotateZ(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c-p.y*s,p.x*s+p.y*c,p.z);}
    void main(){
      vec3 point=vec3(aPosition.x*uViewportScale.x,aPosition.y*uViewportScale.y,aPosition.z)*uOrientation.w;
      point=rotateZ(rotateX(rotateY(point,uOrientation.x),uOrientation.y),uOrientation.z);
      vec4 clip=uProjection*vec4(point+vec3(0.0,0.0,-uCameraZ),1.0);
      clip.xy+=uScreenShift*clip.w;
      gl_Position=clip;
      gl_PointSize=aSize*uDpr*clamp(10.0/max(2.0,clip.w),0.72,1.35);
      vColor=aColor;
    }
  `;

  const POINT_FRAGMENT = `#version 300 es
    precision highp float;
    in vec3 vColor;
    out vec4 outColor;
    uniform float uAlpha;
    void main(){
      vec2 point=gl_PointCoord-0.5;
      float radius=length(point);
      if(radius>0.5)discard;
      float core=1.0-smoothstep(0.02,0.18,radius);
      float halo=1.0-smoothstep(0.12,0.5,radius);
      vec3 color=mix(vColor,vec3(1.0,0.91,0.82),core*0.88);
      outColor=vec4(color,(core*0.82+halo*0.24)*uAlpha);
    }
  `;

  const FIBRE_VERTEX = `#version 300 es
    precision highp float;
    layout(location=0) in vec3 aStart;
    layout(location=1) in vec3 aEnd;
    layout(location=2) in float aPathWeight;
    layout(location=3) in float aColorIndex;
    layout(location=4) in float aSeed;
    layout(location=5) in float aLamella;
    layout(location=6) in vec3 aNormal;
    layout(location=7) in float aAlong;
    layout(location=8) in float aAcross;
    uniform mat4 uProjection;
    uniform vec4 uOrientation;
    uniform vec2 uScreenShift;
    uniform vec2 uViewportScale;
    uniform float uCameraZ;
    uniform float uReturn;
    uniform float uCrown;
    uniform float uPressure;
    uniform float uInversion;
    uniform float uReconstitution;
    uniform float uGather;
    uniform float uSubtraction;
    uniform float uActiveWorld;
    uniform float uDetailMix;
    uniform float uTime;
    uniform float uReduced;
    out vec3 vColor;
    out float vAlpha;
    vec3 rotateY(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c-p.z*s,p.y,p.x*s+p.z*c);}
    vec3 rotateX(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);}
    vec3 rotateZ(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c-p.y*s,p.x*s+p.y*c,p.z);}
    void main(){
      float movingTime=mix(uTime,0.0,uReduced);
      float compression=clamp(uPressure+uInversion*0.14,0.0,1.0);
      vec3 point=aEnd;
      float axis=-0.56-point.y*0.38;
      float anchorInfluence=1.0-aPathWeight;
      point.x=mix(point.x,axis,compression*(0.025+anchorInfluence*0.18));
      point.x+=sin(movingTime*0.055+aSeed*19.0+aPathWeight*4.8)*(0.006+aPathWeight*0.026)*(1.0-compression*0.58);
      point.z+=sin(movingTime*0.043+aSeed*13.0+aPathWeight*7.2)*(0.004+aPathWeight*0.018);
      point.y+=uReturn*aPathWeight*(0.050+0.12*aSeed);
      point.x+=uReturn*aPathWeight*(aSeed-0.5)*0.16;
      point.z-=uSubtraction*anchorInfluence*0.045;
      float selected=1.0-smoothstep(0.16,0.42,abs(uActiveWorld-(aLamella+1.0)));
      point.z+=selected*uDetailMix*sin(aPathWeight*5.4+aSeed*7.0)*0.035;
      point.xy*=uViewportScale;
      point*=uOrientation.w;
      point=rotateZ(rotateX(rotateY(point,uOrientation.x),uOrientation.y),uOrientation.z);
      vec4 clip=uProjection*vec4(point+vec3(0.0,0.0,-uCameraZ),1.0);
      clip.xy+=uScreenShift*clip.w;
      gl_Position=clip;
      vec3 cyan=vec3(0.0,0.788,0.910),green=vec3(0.078,0.788,0.545),violet=vec3(0.408,0.251,1.0),bone=vec3(0.914,0.890,0.835);
      vec3 accent=aColorIndex<0.5?cyan:(aColorIndex<1.5?green:(aColorIndex<2.5?violet:bone));
      float colourAmount=aColorIndex>2.5?0.0:(0.12+uCrown*0.10+uReturn*0.07);
      vColor=mix(bone,accent,colourAmount);
      float phrasing=0.72+0.28*sin(aPathWeight*15.0+aSeed*31.0+movingTime*0.032);
      float phrasePhase=fract(aPathWeight*3.15+aSeed*5.7);
      float phraseMask=smoothstep(0.055,0.16,phrasePhase)*(1.0-smoothstep(0.64,0.84,phrasePhase));
      float endpointFade=smoothstep(0.018,0.075,aPathWeight)*(1.0-smoothstep(0.88,0.975,aPathWeight));
      float baseAlpha=mix(0.240,0.090,aPathWeight)*phrasing;
      float stateAlpha=uGather*0.050+uPressure*anchorInfluence*0.060+uCrown*(0.050+anchorInfluence*0.055)+uReturn*aPathWeight*0.12;
      float detailAlpha=mix(0.72,1.18,selected*uDetailMix);
      float overviewSuppression=mix(0.26,1.0,uDetailMix);
      float overviewPathGate=mix(1.0-step(0.49,aAcross),1.0,uDetailMix);
      vAlpha=(baseAlpha+stateAlpha)*detailAlpha*overviewSuppression*overviewPathGate*(1.0-uSubtraction*0.38)*phraseMask*endpointFade;
    }
  `;

  const FIBRE_FRAGMENT = `#version 300 es
    precision highp float;
    in vec3 vColor;
    in float vAlpha;
    out vec4 outColor;
    void main(){outColor=vec4(vColor,vAlpha);}
  `;

  let gl = null;
  let fallbackContext = null;
  let fallbackSuspended = false;
  let resources = null;
  let uniformLocations = new WeakMap();

  function compileShader(context, type, source, label) {
    const shader = context.createShader(type);
    context.shaderSource(shader, source);
    context.compileShader(shader);
    if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
      const message = context.getShaderInfoLog(shader) || 'unknown shader error';
      context.deleteShader(shader);
      throw new Error(`${label} shader failed: ${message}`);
    }
    return shader;
  }

  function createProgram(context, vertexSource, fragmentSource, label) {
    const vertex = compileShader(context, context.VERTEX_SHADER, vertexSource, `${label} vertex`);
    const fragment = compileShader(context, context.FRAGMENT_SHADER, fragmentSource, `${label} fragment`);
    const program = context.createProgram();
    context.attachShader(program, vertex);
    context.attachShader(program, fragment);
    context.linkProgram(program);
    context.deleteShader(vertex);
    context.deleteShader(fragment);
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      const message = context.getProgramInfoLog(program) || 'unknown link error';
      context.deleteProgram(program);
      throw new Error(`${label} program failed: ${message}`);
    }
    return program;
  }

  function uploadSurface(context, mesh) {
    const vao = context.createVertexArray();
    const vertexBuffer = context.createBuffer();
    const indexBuffer = context.createBuffer();
    context.bindVertexArray(vao);
    context.bindBuffer(context.ARRAY_BUFFER, vertexBuffer);
    context.bufferData(context.ARRAY_BUFFER, mesh.vertices, context.STATIC_DRAW);
    const stride = 13 * Float32Array.BYTES_PER_ELEMENT;
    context.enableVertexAttribArray(0);
    context.vertexAttribPointer(0, 3, context.FLOAT, false, stride, 0);
    context.enableVertexAttribArray(1);
    context.vertexAttribPointer(1, 3, context.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
    context.enableVertexAttribArray(2);
    context.vertexAttribPointer(2, 1, context.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT);
    context.enableVertexAttribArray(3);
    context.vertexAttribPointer(3, 1, context.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT);
    context.enableVertexAttribArray(4);
    context.vertexAttribPointer(4, 1, context.FLOAT, false, stride, 8 * Float32Array.BYTES_PER_ELEMENT);
    context.enableVertexAttribArray(5);
    context.vertexAttribPointer(5, 1, context.FLOAT, false, stride, 9 * Float32Array.BYTES_PER_ELEMENT);
    context.enableVertexAttribArray(6);
    context.vertexAttribPointer(6, 3, context.FLOAT, false, stride, 10 * Float32Array.BYTES_PER_ELEMENT);
    context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, indexBuffer);
    context.bufferData(context.ELEMENT_ARRAY_BUFFER, mesh.indices, context.STATIC_DRAW);
    context.bindVertexArray(null);
    return { vao, vertexBuffer, indexBuffer, count: mesh.indices.length };
  }

  function initGLResources() {
    if (!gl || gl.isContextLost()) throw new Error('WebGL2 context is unavailable during resource initialisation.');
    uniformLocations = new WeakMap();
    const segments = coarse || lowCPU ? { longitude: 88, latitude: 66 } : { longitude: 132, latitude: 96 };
    const outerMesh = buildSurface(segments.longitude, segments.latitude, false);
    const innerMesh = buildSurface(
      Math.max(56, Math.round(segments.longitude * 0.72)),
      Math.max(42, Math.round(segments.latitude * 0.72)),
      true,
    );
    const backgroundProgram = createProgram(gl, BACKGROUND_VERTEX, BACKGROUND_FRAGMENT, 'nocturne background');
    const surfaceProgram = createProgram(gl, SURFACE_VERTEX, SURFACE_FRAGMENT, 'nocturne surface');
    const pointProgram = createProgram(gl, POINT_VERTEX, POINT_FRAGMENT, 'nocturne portal');
    const fibreProgram = createProgram(gl, FIBRE_VERTEX, FIBRE_FRAGMENT, 'nocturne fibre');
    const emptyVao = gl.createVertexArray();
    const outer = uploadSurface(gl, outerMesh);
    const inner = uploadSurface(gl, innerMesh);

    const pointVao = gl.createVertexArray();
    const pointBuffer = gl.createBuffer();
    gl.bindVertexArray(pointVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, 7 * 6 * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
    const pointStride = 7 * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, pointStride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, pointStride, 3 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, pointStride, 6 * Float32Array.BYTES_PER_ELEMENT);
    gl.bindVertexArray(null);

    const fibreData = buildFibres();
    const fibreVao = gl.createVertexArray();
    const fibreBuffer = gl.createBuffer();
    gl.bindVertexArray(fibreVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, fibreBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, fibreData, gl.STATIC_DRAW);
    const fibreStride = 15 * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, fibreStride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, fibreStride, 3 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, fibreStride, 6 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, fibreStride, 7 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, fibreStride, 8 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, gl.FLOAT, false, fibreStride, 9 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 3, gl.FLOAT, false, fibreStride, 10 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(7);
    gl.vertexAttribPointer(7, 1, gl.FLOAT, false, fibreStride, 13 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(8);
    gl.vertexAttribPointer(8, 1, gl.FLOAT, false, fibreStride, 14 * Float32Array.BYTES_PER_ELEMENT);
    gl.bindVertexArray(null);

    resources = {
      backgroundProgram,
      surfaceProgram,
      pointProgram,
      fibreProgram,
      emptyVao,
      outer,
      inner,
      pointVao,
      pointBuffer,
      fibreVao,
      fibreBuffer,
      fibreCount: fibreData.length / 15,
    };
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  function uniformLocation(program, name) {
    let locations = uniformLocations.get(program);
    if (!locations) {
      locations = new Map();
      uniformLocations.set(program, locations);
    }
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
    return locations.get(name);
  }

  function uniform1(program, name, value) {
    gl.uniform1f(uniformLocation(program, name), value);
  }

  function uniform2(program, name, x, y) {
    gl.uniform2f(uniformLocation(program, name), x, y);
  }

  function uniform4(program, name, value) {
    gl.uniform4f(uniformLocation(program, name), value.yaw, value.pitch, value.roll, value.zoom);
  }

  function projection() {
    return perspectiveMatrix(43 * Math.PI / 180, Math.max(0.25, width / Math.max(1, height)), 0.1, 40);
  }

  function setProjectionUniforms(program, orientation, detail = false) {
    const shift = screenShift(detail);
    const viewportScale = viewportShapeScale();
    gl.uniformMatrix4fv(uniformLocation(program, 'uProjection'), false, projection());
    uniform4(program, 'uOrientation', orientation);
    uniform2(program, 'uScreenShift', shift.x, shift.y);
    uniform2(program, 'uViewportScale', viewportScale.x, viewportScale.y);
    uniform1(program, 'uCameraZ', 10);
    uniform1(program, 'uDetailMix', detail ? ease(viewMix) : 0);
  }

  function drawBackgroundGL(state, overlay = false) {
    const program = resources.backgroundProgram;
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(program);
    uniform2(program, 'uResolution', canvas.width, canvas.height);
    uniform1(program, 'uTime', elapsed);
    uniform1(program, 'uGather', state.gather);
    uniform1(program, 'uPressure', state.pressure);
    uniform1(program, 'uCrown', state.crown);
    uniform1(program, 'uReturn', state.return);
    uniform1(program, 'uReconstitution', state.reconstitution);
    uniform1(program, 'uReduced', reducedMotion ? 1 : 0);
    uniform1(program, 'uActiveWorld', activeWorld ? worldKeys.indexOf(activeWorld) + 1 : 0);
    uniform1(program, 'uDetailMix', ease(viewMix));
    uniform1(program, 'uOverlay', overlay ? 1 : 0);
    const orientation = currentOrientation(Boolean(activeWorld), false);
    uniform2(program, 'uParallax',
      (orientation.yaw - 0.16) * 0.025,
      (orientation.pitch + 0.125) * 0.035);
    gl.bindVertexArray(resources.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    if (!overlay) gl.clear(gl.DEPTH_BUFFER_BIT);
  }

  function drawSurfaceGL(surface, material, state, orientation, ghost = false) {
    const program = resources.surfaceProgram;
    gl.useProgram(program);
    setProjectionUniforms(program, orientation, Boolean(activeWorld));
    uniform1(program, 'uTime', elapsed);
    uniform1(program, 'uGather', state.gather);
    uniform1(program, 'uPressure', state.pressure);
    uniform1(program, 'uSubtraction', state.subtraction);
    uniform1(program, 'uInversion', state.inversion);
    uniform1(program, 'uReconstitution', state.reconstitution);
    uniform1(program, 'uCrown', state.crown);
    uniform1(program, 'uReturn', state.return);
    uniform1(program, 'uGhost', ghost ? 1 : 0);
    uniform1(program, 'uMaterial', material);
    uniform1(program, 'uActiveWorld', activeWorld ? worldKeys.indexOf(activeWorld) + 1 : 0);
    uniform1(program, 'uActiveSub', activeSub);
    uniform1(program, 'uReduced', reducedMotion ? 1 : 0);
    gl.bindVertexArray(surface.vao);
    gl.drawElements(gl.TRIANGLES, surface.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  function pointSet() {
    if (activeWorld && viewMix > 0.42) {
      return DETAIL_PINS[activeWorld].map((point, index) => ({
        point,
        color: index === activeSub ? [1, 0.36, 0.31] : WORLD[activeWorld].rgb.map((value) => value / 255),
        size: index === activeSub || index === hoverSub ? 18 : 13,
      }));
    }
    return worldKeys.map((key) => ({
      point: WORLD_PINS[key],
      color: WORLD[key].rgb.map((value) => value / 255),
      size: key === hoverWorld ? 18 : 13,
    }));
  }

  function drawPointsGL() {
    const points = pointSet();
    const data = [];
    points.forEach(({ point, color, size }) => {
      data.push(point.x, point.y, point.z, color[0], color[1], color[2], size);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.pointBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data));
    const program = resources.pointProgram;
    gl.useProgram(program);
    setProjectionUniforms(program, currentOrientation(Boolean(activeWorld), false), Boolean(activeWorld));
    uniform1(program, 'uDpr', dpr);
    uniform1(program, 'uAlpha', 0.62 + impulse * 0.18);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.bindVertexArray(resources.pointVao);
    gl.drawArrays(gl.POINTS, 0, points.length);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }

  function drawFibresGL(state) {
    const program = resources.fibreProgram;
    gl.useProgram(program);
    setProjectionUniforms(program, currentOrientation(Boolean(activeWorld), false), Boolean(activeWorld));
    uniform1(program, 'uReturn', state.return);
    uniform1(program, 'uCrown', state.crown);
    uniform1(program, 'uPressure', state.pressure);
    uniform1(program, 'uInversion', state.inversion);
    uniform1(program, 'uReconstitution', state.reconstitution);
    uniform1(program, 'uGather', state.gather);
    uniform1(program, 'uSubtraction', state.subtraction);
    uniform1(program, 'uActiveWorld', activeWorld ? worldKeys.indexOf(activeWorld) + 1 : 0);
    uniform1(program, 'uDetailMix', ease(viewMix));
    uniform1(program, 'uTime', elapsed);
    uniform1(program, 'uReduced', reducedMotion ? 1 : 0);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.bindVertexArray(resources.fibreVao);
    gl.drawArrays(gl.LINES, 0, resources.fibreCount);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }

  function renderGL(state) {
    if (!gl || !resources || gl.isContextLost()) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    drawBackgroundGL(state);

    const orientation = currentOrientation(Boolean(activeWorld), false);
    drawBackgroundGL(state, true);
    const environmentOrientation = activeWorld ? {
      yaw: orientation.yaw * 0.22,
      pitch: -0.18 + orientation.pitch * 0.12,
      roll: orientation.roll * 0.18,
      zoom: Math.min(1.08, orientation.zoom),
    } : orientation;
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    drawSurfaceGL(resources.outer, 0, state, environmentOrientation, false);
    if (activeWorld) drawPointsGL();
  }

  function fallbackBodyPaths(scale) {
    const field = (lamellaIndex) => {
      const path = new Path2D();
      const steps = coarse || lowCPU ? 24 : 44;
      for (let index = 0; index <= steps; index++) {
        const point = lamellaPoint(lamellaIndex, index / steps, -1);
        if (index === 0) path.moveTo(point.x * scale, -point.y * scale);
        else path.lineTo(point.x * scale, -point.y * scale);
      }
      for (let index = steps; index >= 0; index--) {
        const point = lamellaPoint(lamellaIndex, index / steps, 1);
        path.lineTo(point.x * scale, -point.y * scale);
      }
      path.closePath();
      return path;
    };

    const fields = LAMELLAE.map((_, index) => field(index));
    const [blade, sail, keel] = fields;

    const compound = new Path2D();
    fields.forEach((path) => compound.addPath(path));
    return { blade, keel, sail, fields, compound };
  }

  function fallbackWoundPath(scale, ghost = false) {
    const path = new Path2D();
    const curvePoint = (t) => {
      const value = clamp(t, 0, 1);
      const segment = stationSegment(SOVEREIGN_WOUND, value);
      const start = SOVEREIGN_WOUND.stations[segment];
      const end = SOVEREIGN_WOUND.stations[segment + 1];
      const amount = clamp((value - start) / Math.max(0.0001, end - start), 0, 1);
      const p0 = SOVEREIGN_WOUND.points[Math.max(0, segment - 1)];
      const p1 = SOVEREIGN_WOUND.points[segment];
      const p2 = SOVEREIGN_WOUND.points[segment + 1];
      const p3 = SOVEREIGN_WOUND.points[Math.min(SOVEREIGN_WOUND.points.length - 1, segment + 2)];
      const amount2 = amount * amount;
      const amount3 = amount2 * amount;
      const axis = (key) => 0.5 * (
        2 * p1[key]
        + (-p0[key] + p2[key]) * amount
        + (2 * p0[key] - 5 * p1[key] + 4 * p2[key] - p3[key]) * amount2
        + (-p0[key] + 3 * p1[key] - 3 * p2[key] + p3[key]) * amount3
      );
      let point = { x: axis('x'), y: axis('y'), z: axis('z') };
      if (ghost) {
        const mirrorPlane = -1.18;
        point = {
          x: point.x * 0.985 + 0.10 + Math.sin(value * 7 + 1.9) * 0.012,
          y: mirrorPlane - (point.y - mirrorPlane) * 0.22,
          z: point.z - 0.35,
        };
      }
      return point;
    };
    const steps = 42;
    for (let index = 0; index <= steps; index++) {
      const t = index / steps;
      const point = curvePoint(t);
      if (index === 0) path.moveTo(point.x * scale, -point.y * scale);
      else path.lineTo(point.x * scale, -point.y * scale);
    }
    return path;
  }

  function fallbackLayout(detail = false, state = cycleState(elapsed)) {
    const shift = screenShift(detail);
    const orientation = currentOrientation(detail);
    const viewportScale = viewportShapeScale();
    const focal = 1 / Math.tan(43 * Math.PI / 360);
    const scale = height * focal / 20 * orientation.zoom;
    return {
      centerX: width * (0.5 + shift.x * 0.5),
      centerY: height * (0.5 - shift.y * 0.5),
      scale,
      orientation,
      angle: orientation.roll + orientation.yaw * 0.045,
      scaleX: viewportScale.x * (1 - state.pressure * 0.105 - state.subtraction * 0.08)
        * (0.94 + Math.cos(orientation.yaw) * 0.06),
      scaleY: viewportScale.y * (1 - state.pressure * 0.035),
    };
  }

  function projectFallbackPoint(point, detail = false) {
    // Navigation anchors remain stable throughout the score-derived cycle even
    // while the fallback artwork itself compresses and releases.
    const stableState = cycleState(SILENT_CYCLE_SECONDS * 0.85);
    const layout = fallbackLayout(detail, stableState);
    const localX = point.x * layout.scale * layout.scaleX;
    const localY = -point.y * layout.scale * layout.scaleY;
    const cosine = Math.cos(layout.angle);
    const sine = Math.sin(layout.angle);
    return {
      x: layout.centerX + localX * cosine - localY * sine,
      y: layout.centerY + localX * sine + localY * cosine,
      z: point.z,
      f: layout.scale / 10,
    };
  }

  function fallbackClimax(state) {
    return ease(clamp((state.reconstitution * 0.70 + state.crown * 0.82 + state.return * 0.10 - 0.32) / 0.62, 0, 1));
  }

  function drawFallbackCounterfield(context, state) {
    const compact = isCompactLayout();
    const climax = fallbackClimax(state);
    const cx = width * (compact ? 0.56 : 0.59);
    const cy = height * (compact ? 0.48 : 0.46);
    const rx = width * (compact ? 0.38 : 0.29);
    const ry = height * (compact ? 0.30 : 0.34);
    context.save();
    context.globalCompositeOperation = 'screen';
    context.translate(cx, cy);
    context.transform(1, 0, 0.28, 1, 0, 0);
    context.scale(rx, ry);
    const upper = context.createRadialGradient(-0.16, -0.18, 0, -0.16, -0.18, 1);
    upper.addColorStop(0, `rgba(105,125,170,${0.045 + climax * 0.050})`);
    upper.addColorStop(0.44, `rgba(63,75,112,${0.026 + climax * 0.024})`);
    upper.addColorStop(1, 'rgba(10,11,18,0)');
    context.fillStyle = upper;
    context.fillRect(-1.35, -1.35, 2.7, 2.7);
    const lower = context.createRadialGradient(0.18, 0.20, 0, 0.18, 0.20, 1);
    lower.addColorStop(0, `rgba(150,55,55,${0.065 + climax * 0.075})`);
    lower.addColorStop(0.48, `rgba(92,31,40,${0.032 + climax * 0.035})`);
    lower.addColorStop(1, 'rgba(12,7,10,0)');
    context.fillStyle = lower;
    context.fillRect(-1.35, -1.35, 2.7, 2.7);
    context.restore();
  }

  function drawFallbackCurrents(context, state, reflected = false) {
    const compact = isCompactLayout();
    const horizon = compact ? 0.635 : 0.625;
    const climax = fallbackClimax(state);
    const families = [
      { color: 'rgb(178,190,187)', shadow: 'rgba(94,166,181,.34)', points: [[0.96, -0.08], [0.79, 0.02], [0.61, 0.20], [0.500, 0.390]] },
      { color: 'rgb(179,188,179)', shadow: 'rgba(86,153,126,.31)', points: [[1.08, 0.57], [0.91, 0.50], [0.76, 0.46], [0.620, 0.490]] },
      { color: 'rgb(181,176,194)', shadow: 'rgba(118,99,173,.33)', points: [[1.03, 1.02], [0.94, 0.86], [0.83, 0.71], [0.740, 0.600]] },
    ];
    const minSide = Math.min(width, height);
    context.save();
    context.globalCompositeOperation = 'screen';
    if (reflected) {
      context.beginPath();
      context.rect(0, height * horizon, width, height * (1 - horizon));
      context.clip();
    }
    families.forEach((family, familyIndex) => {
      for (let phrase = 0; phrase < 2; phrase++) {
        const offset = (phrase - 0.5) * (compact ? 0.016 : 0.0125);
        const mapped = family.points.map(([x, y], pointIndex) => {
          const fan = pointIndex / 3;
          const px = x + offset * (0.25 + fan * 1.7) + Math.sin((phrase + 1) * (pointIndex + 1) * 1.91) * 0.003;
          const authoredY = y + offset * (familyIndex === 1 ? 0.65 : 1.0) + Math.cos((phrase + 2) * (pointIndex + 1)) * 0.0025;
          const py = reflected ? horizon * 2 - authoredY + 0.010 + phrase * 0.002 : authoredY;
          return [px * width, py * height];
        });
        const path = new Path2D();
        path.moveTo(mapped[0][0], mapped[0][1]);
        path.bezierCurveTo(mapped[1][0], mapped[1][1], mapped[2][0], mapped[2][1], mapped[3][0], mapped[3][1]);
        if (!reflected) {
          context.setLineDash([]);
          context.shadowBlur = minSide * 0.020;
          context.shadowColor = family.shadow;
          context.globalAlpha = 0.022 + climax * 0.026;
          context.lineWidth = Math.max(12, minSide * (0.028 + phrase * 0.002));
          context.strokeStyle = family.color;
          context.stroke(path);
        }
        context.shadowBlur = reflected ? minSide * 0.010 : minSide * 0.007;
        context.shadowColor = family.shadow;
        context.setLineDash([
          minSide * (0.075 + phrase * 0.010),
          minSide * (0.042 + familyIndex * 0.009),
          minSide * (0.115 + familyIndex * 0.012),
          minSide * (0.050 + phrase * 0.006),
        ]);
        context.lineDashOffset = -minSide * (phrase * 0.053 + familyIndex * 0.071 + (reflected ? 0.093 : 0));
        context.globalAlpha = (0.145 + state.gather * 0.07 + state.crown * 0.095) * (reflected ? 0.38 : 1);
        context.lineWidth = Math.max(0.75, minSide * (0.00082 + phrase * 0.00008));
        context.strokeStyle = family.color;
        context.stroke(path);
      }
    });
    context.setLineDash([]);
    context.restore();
  }

  function drawFallbackHorizon(context, state) {
    const compact = isCompactLayout();
    const horizon = height * (compact ? 0.635 : 0.625);
    const fault = width * 0.505;
    const gap = width * (compact ? 0.064 : 0.046);
    const climax = fallbackClimax(state);
    const path = new Path2D();
    const samples = 96;
    let drawing = false;
    for (let index = 0; index <= samples; index++) {
      const x = width * index / samples;
      const broken = Math.abs(x - fault) < gap || (index > 17 && index < 23) || (index > 72 && index < 78);
      const y = horizon + Math.sin(index * 0.37) * height * 0.0018 + Math.sin(index * 0.11 + 2.7) * height * 0.0012;
      if (broken) {
        drawing = false;
      } else if (!drawing) {
        path.moveTo(x, y);
        drawing = true;
      } else {
        path.lineTo(x, y);
      }
    }
    context.save();
    context.globalCompositeOperation = 'screen';
    context.strokeStyle = '#d9d1c4';
    context.globalAlpha = 0.020 + climax * 0.016;
    context.shadowColor = 'rgba(210,198,178,.30)';
    context.shadowBlur = Math.max(18, Math.min(width, height) * 0.024);
    context.lineWidth = Math.max(16, Math.min(width, height) * 0.020);
    context.stroke(path);
    context.shadowBlur = 0;
    context.globalAlpha = 0.22 + climax * 0.10;
    context.lineWidth = 0.8;
    context.stroke(path);
    const fragments = [[0.08, 0.14], [0.31, 0.36], [0.69, 0.74], [0.84, 0.90]];
    fragments.forEach(([start, end], index) => {
      context.beginPath();
      context.moveTo(width * start, horizon + Math.sin(start * 31) * 2);
      context.lineTo(width * end, horizon + Math.sin(end * 29) * 2);
      context.globalAlpha = 0.34 + climax * 0.16;
      context.lineWidth = index === 2 ? 1.15 : 0.75;
      context.strokeStyle = index === 2 ? '#e4735f' : '#f0e5d1';
      context.stroke();
    });
    context.restore();
  }

  function drawFallbackMatter(context, state) {
    const compact = isCompactLayout();
    const count = compact ? 22 : 38;
    const climax = fallbackClimax(state);
    const horizon = height * (compact ? 0.635 : 0.625);
    const random = (seed) => {
      const value = Math.sin(seed * 91.733 + 17.171) * 43758.5453;
      return value - Math.floor(value);
    };
    context.save();
    context.globalCompositeOperation = 'screen';
    for (let index = 0; index < count; index++) {
      const a = random(index + 0.31);
      const b = random(index + 7.93);
      const c = random(index + 18.47);
      const y = height * (0.57 + b * 0.21);
      const x = width * (0.66 + a * 0.21 + (y / height - 0.67) * 0.16);
      const size = index < 4 ? 1.8 + c : 0.4 + c * 1.2;
      const alpha = (0.035 + c * 0.125) * (0.48 + climax * 0.52);
      context.globalAlpha = alpha;
      context.fillStyle = c < 0.055 ? '#c55f54' : c < 0.12 ? '#8394bf' : '#ddd5c7';
      context.strokeStyle = context.fillStyle;
      if (index % 5 < 3) {
        context.lineWidth = Math.max(0.45, size * 0.52);
        context.beginPath();
        context.moveTo(x - size * 1.6, y + size * 0.35);
        context.lineTo(x + size * 1.8, y - size * 0.25);
        context.stroke();
      } else {
        context.beginPath();
        context.moveTo(x, y - size);
        context.lineTo(x + size * 0.9, y + size * 0.65);
        context.lineTo(x - size * 0.55, y + size * 0.25);
        context.closePath();
        context.fill();
      }
      if (index % 3 === 0 && y < horizon) {
        context.globalAlpha = alpha * 0.35;
        const reflectedY = horizon * 2 - y;
        context.fillRect(x + width * 0.012, reflectedY, Math.max(0.6, size * 1.2), Math.max(0.45, size * 0.32));
      }
    }
    context.restore();
  }

  function renderFallback(state) {
    const context = fallbackContext;
    if (!context) return;
    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = '#07070b';
    context.fillRect(0, 0, width, height);
    const abyssGlow = context.createRadialGradient(width * 0.57, height * 0.47, 0, width * 0.57, height * 0.47, Math.max(width, height) * 0.62);
    abyssGlow.addColorStop(0, `rgba(94,35,45,${0.070 + state.pressure * 0.040 + state.crown * 0.060})`);
    abyssGlow.addColorStop(0.42, 'rgba(27,21,34,.34)');
    abyssGlow.addColorStop(1, 'rgba(7,7,11,0)');
    context.fillStyle = abyssGlow;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 1;
    drawFallbackCounterfield(context, state);
    drawFallbackCurrents(context, state, false);
    const layout = fallbackLayout(Boolean(activeWorld), state);
    const { centerX, centerY, scale, orientation } = layout;

    context.translate(centerX, centerY);
    context.rotate(layout.angle);
    context.scale(layout.scaleX, layout.scaleY);
    const paths = fallbackBodyPaths(scale);
    const body = paths.compound;
    const wound = fallbackWoundPath(scale);
    const ghostWound = fallbackWoundPath(scale, true);

    const mineralGradient = context.createLinearGradient(-scale * 2.8, -scale * 3.1, scale * 2.5, scale * 2.8);
    mineralGradient.addColorStop(0, '#060811');
    mineralGradient.addColorStop(0.26, '#111522');
    mineralGradient.addColorStop(0.52, '#222536');
    mineralGradient.addColorStop(0.74, '#121624');
    mineralGradient.addColorStop(1, '#05070d');
    context.globalAlpha = 1 - state.subtraction * 0.28;
    context.fillStyle = mineralGradient;
    context.save();
    context.lineJoin = 'round';
    context.lineWidth = Math.max(1.2, scale * 0.032);
    context.strokeStyle = '#050405';
    paths.fields.forEach((path, index) => {
      if (index > 0) context.stroke(path);
      context.fill(path);
    });
    context.restore();

    context.save();
    context.clip(body);
    context.globalCompositeOperation = 'screen';
    context.setLineDash([scale * 0.16, scale * 0.24, scale * 0.09, scale * 0.31]);
    context.lineDashOffset = -scale * (0.11 + state.inversion * 0.08);
    context.shadowColor = 'rgba(157,139,194,.30)';
    context.shadowBlur = Math.max(14, scale * 0.18);
    context.globalAlpha = 0.10 + fallbackClimax(state) * 0.08;
    context.lineWidth = Math.max(2.5, scale * 0.034);
    context.strokeStyle = '#8f879e';
    context.stroke(ghostWound);
    context.shadowBlur = 0;
    context.globalAlpha = 0.18 + fallbackClimax(state) * 0.12;
    context.lineWidth = Math.max(0.65, scale * 0.008);
    context.strokeStyle = '#c9bfd0';
    context.stroke(ghostWound);
    context.restore();

    context.save();
    context.globalAlpha = 0.12 + state.crown * 0.045;
    context.lineWidth = Math.max(0.45, scale * 0.009);
    context.strokeStyle = '#cbbda8';
    context.stroke(wound);
    context.restore();

    if (activeWorld && viewMix > 0.24) {
      context.save();
      context.globalAlpha = ease(viewMix) * 0.24;
      context.lineWidth = Math.max(0.55, scale * 0.010);
      const activeIndex = activeWorld === 'machine' ? 0 : activeWorld === 'maker' ? 1 : 2;
      context.strokeStyle = activeIndex === 0 ? '#00c9e8' : activeIndex === 1 ? '#14c98b' : '#6840ff';
      if (activeIndex === 2) context.clip(body);
      context.stroke(activeIndex === 2 ? body : wound);
      context.restore();
    }

    context.save();
    context.shadowColor = 'rgba(225,94,80,.44)';
    context.shadowBlur = scale * (0.080 + state.crown * 0.055);
    context.globalAlpha = 0.10 + state.crown * 0.12 + state.pressure * 0.035;
    context.lineWidth = Math.max(2.2, scale * 0.040);
    context.strokeStyle = '#e15e50';
    context.stroke(wound);
    context.shadowBlur = 0;
    context.setLineDash([scale * 0.24, scale * 0.055, scale * 0.42, scale * 0.08]);
    context.lineDashOffset = -scale * state.phase * 0.18;
    context.globalAlpha = 0.78 + state.reconstitution * 0.14;
    context.lineWidth = Math.max(0.75, scale * 0.012);
    context.strokeStyle = '#fff0d4';
    context.stroke(wound);
    context.restore();
    context.restore();

    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFallbackCurrents(context, state, true);
    drawFallbackHorizon(context, state);
    drawFallbackMatter(context, state);
    pointSet().forEach(({ point, color, size }) => {
      const projected = projectFallbackPoint(point, Boolean(activeWorld));
      const radius = size * 0.58;
      const gradient = context.createRadialGradient(projected.x, projected.y, 0, projected.x, projected.y, radius);
      const rgb = color.map((value) => Math.round(value * 255));
      gradient.addColorStop(0, 'rgba(255,233,214,.90)');
      gradient.addColorStop(0.25, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},.62)`);
      gradient.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      context.fillStyle = gradient;
      context.fillRect(projected.x - radius, projected.y - radius, radius * 2, radius * 2);
    });
    context.restore();
  }

  function updateProjectedTargets() {
    const projector = fallbackContext ? projectFallbackPoint : projectPoint;
    worldKeys.forEach((key) => {
      const projected = fallbackContext
        ? projector(WORLD_PINS[key], false)
        : projector(WORLD_PINS[key], false, currentOrientation(false));
      Object.assign(worldScreen[key], projected, { r: coarse ? 31 : 27 });
    });
    if (activeWorld) {
      DETAIL_PINS[activeWorld].forEach((pin, index) => {
        const projected = fallbackContext
          ? projector(pin, true)
          : projector(pin, true, currentOrientation(true));
        Object.assign(subScreen[index], projected, { r: coarse ? 30 : 25, index });
      });
    }
  }

  function updateLabels(force = false) {
    if (!force && ++labelTick % 2) return;
    const mix = ease(viewMix);
    const mobile = isCompactLayout();
    const phone = width <= 520;
    const subY = height * (mobile ? 0.775 : 0.875);
    const overviewInteractive = !activeWorld;
    const labelHalf = mobile ? (phone ? 62 : 88) : 112;
    const safeGutter = phone ? 18 : (mobile ? 20 : 24);
    const placedLabels = [];
    const offsets = mobile
      ? [
        { x: width * 0.22, y: 8 },
        { x: -width * 0.22, y: 0 },
        { x: width * 0.20, y: 5 },
      ]
      : [
        { x: width * 0.11, y: 2 },
        { x: -width * 0.12, y: 0 },
        { x: width * 0.12, y: 6 },
      ];
    worldKeys.forEach((key, index) => {
      const element = labels[key];
      if (!element) return;
      const anchor = worldScreen[key];
      let offsetX = offsets[index].x;
      if (key === 'reality' && anchor.x > width * 0.74) {
        offsetX = -width * (mobile ? 0.18 : 0.10);
      } else if (key === 'maker' && anchor.x < width * 0.24) {
        offsetX = width * (mobile ? 0.17 : 0.10);
      }
      element.style.maxWidth = `${Math.max(1, width - safeGutter * 2)}px`;
      const layoutHalf = Math.min(
        Math.max(labelHalf, (element.offsetWidth || labelHalf * 2) * 0.5),
        Math.max(1, width * 0.5 - safeGutter),
      );
      const minLeft = safeGutter + layoutHalf;
      const maxLeft = width - safeGutter - layoutHalf;
      let left = minLeft <= maxLeft
        ? clamp(anchor.x + offsetX, minLeft, maxLeft)
        : width * 0.5;
      if (phone && key === 'machine' && minLeft <= maxLeft) {
        left = Math.max(left, maxLeft);
      }
      const top = clamp(
        anchor.y + offsets[index].y,
        height * (mobile ? (phone ? 0.30 : 0.17) : 0.15),
        height * (mobile ? 0.73 : 0.72),
      );
      placedLabels.push({ x: left, y: top, half: layoutHalf });
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
      element.style.opacity = String(clamp(1 - mix * 2.1, 0, 1));
      element.style.pointerEvents = overviewInteractive ? 'auto' : 'none';
      element.tabIndex = overviewInteractive ? 0 : -1;
      element.setAttribute('aria-hidden', String(!overviewInteractive));
    });

    if (unityLabel) {
      const unityX = width * (mobile ? 0.42 : 0.52);
      const unityY = height * (mobile ? 0.58 : 0.59);
      const collisionX = mobile ? (phone ? 92 : 150) : 132;
      const collisionY = mobile ? (phone ? 38 : 44) : 44;
      const unityHalf = Math.max(24, unityLabel.getBoundingClientRect().width * 0.5);
      const unityOccluded = placedLabels.some(point =>
        Math.abs(point.x - unityX) < Math.max(collisionX, point.half + unityHalf + 8)
        && Math.abs(point.y - unityY) < collisionY
      );
      unityLabel.style.left = `${unityX}px`;
      unityLabel.style.top = `${unityY}px`;
      unityLabel.style.opacity = String(clamp(1 - mix * 2.2, 0, 1) * (unityOccluded ? 0 : 1));
    }

    subLabels.forEach((element, index) => {
      if (!element) return;
      const visible = Boolean(activeWorld && mix > 0.22);
      element.style.left = `${width * (mobile ? (index + 0.5) / 3 : 0.33 + index * 0.17)}px`;
      element.style.top = `${subY}px`;
      element.style.opacity = visible ? String(ease((mix - 0.22) / 0.5)) : '0';
      element.style.pointerEvents = visible && mix > 0.65 ? 'auto' : 'none';
      element.tabIndex = visible && mix > 0.65 ? 0 : -1;
      element.setAttribute('aria-hidden', String(!visible || mix <= 0.65));
      element.setAttribute('aria-pressed', String(visible && index === activeSub));
      element.style.setProperty('--sub-accent', activeWorld ? WORLD[activeWorld].css : WORLD.machine.css);
      element.classList.toggle('active', visible && index === activeSub);
    });

    const detailVisible = Boolean(activeWorld && (targetMix > 0 || mix > 0.05));
    if (back) {
      back.tabIndex = detailVisible ? 0 : -1;
      back.setAttribute('aria-hidden', String(!detailVisible));
    }
    app.classList.toggle('detail', detailVisible);
    app.style.setProperty('--du-view-mix', mix.toFixed(4));
  }

  function setHint() {
    if (!hint || window.__dreamUnityGameActive) return;
    hint.textContent = activeWorld
      ? 'ORBIT THE WOUND · HOLD TO COMPRESS · CHOOSE A FORCE'
      : 'ORBIT THE FIELD · HOLD TO COMPRESS · ENTER A WORLD';
  }

  function enterWorld(key) {
    if (!WORLD[key]) return;
    activeWorld = key;
    activeSub = 0;
    targetMix = 1;
    detailYaw = 0;
    detailPitch = 0;
    detailRoll = 0;
    detailZoom = 1.45;
    detailYawVelocity = detailPitchVelocity = detailRollVelocity = 0;
    impulse = 1;
    updateLabels(true);
    const config = WORLD[key];
    if (detailNumber) detailNumber.textContent = config.index;
    if (detailName) {
      detailName.textContent = config.name;
      detailName.style.color = config.css;
    }
    subLabels.forEach((element, index) => {
      if (!element) return;
      const strong = element.querySelector('strong');
      if (strong) strong.textContent = config.triad[index];
      element.style.color = config.css;
    });
    setHint();
    needsRender = true;
    const started = performance.now();
    const focusDetailBack = () => {
      if (activeWorld !== key) return;
      if (app.classList.contains('detail')) {
        back?.focus?.({ preventScroll: true });
        return;
      }
      if (performance.now() - started < 1200) requestAnimationFrame(focusDetailBack);
    };
    requestAnimationFrame(focusDetailBack);
  }

  function exitWorld() {
    const returnKey = activeWorld;
    targetMix = 0;
    hoverSub = -1;
    setHint();
    needsRender = true;
    const started = performance.now();
    const restoreWorldFocus = () => {
      if (targetMix !== 0 || !returnKey) return;
      if (!app.classList.contains('detail')) {
        labels[returnKey]?.focus?.({ preventScroll: true });
        return;
      }
      if (performance.now() - started < 1600) requestAnimationFrame(restoreWorldFocus);
    };
    requestAnimationFrame(restoreWorldFocus);
  }

  let lastLaunchedSub = 0;
  function selectSub(index) {
    if (!activeWorld || index < 0 || index > 2) return;
    activeSub = index;
    lastLaunchedSub = index;
    impulse = 1;
    subLabels.forEach((element, itemIndex) => {
      element?.classList.toggle('active', itemIndex === index);
      element?.setAttribute('aria-pressed', String(itemIndex === index));
    });
    needsRender = true;
  }

  function triggerSub(index) {
    if (!activeWorld) return;
    selectSub(index);
    window.dispatchEvent(new CustomEvent('dreamunity:launch-game', {
      detail: { world: activeWorld, index },
    }));
  }

  back?.addEventListener('click', exitWorld);
  Object.entries(labels).forEach(([key, element]) => element?.addEventListener('click', () => enterWorld(key)));
  subLabels.forEach((element, index) => {
    element?.addEventListener('click', () => triggerSub(index));
  });
  document.addEventListener('click', (event) => {
    const element = event.target instanceof Element ? event.target.closest('.sub-label') : null;
    if (!element || !activeWorld) return;
    const index = subLabels.indexOf(element);
    if (index < 0) return;
    selectSub(index);
    window.setTimeout(() => $('#gameStart')?.focus?.({ preventScroll: true }), 0);
  }, { capture: true });

  document.addEventListener('keydown', (event) => {
    if (window.__dreamUnityGameActive) return;
    const editable = event.target instanceof Element && event.target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
    );
    if (editable) return;
    if (event.key === 'Escape' && activeWorld) {
      exitWorld();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.stopImmediatePropagation();
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    if (activeWorld) {
      if (targetMix > 0 && viewMix > 0.22) {
        const next = (activeSub + direction + subLabels.length) % subLabels.length;
        selectSub(next);
        subLabels[next]?.focus?.({ preventScroll: true });
      } else {
        back?.focus?.({ preventScroll: true });
      }
    } else if (!event.defaultPrevented) {
      const visible = worldKeys.map((key) => labels[key]).filter((element) =>
        element?.offsetParent !== null
        && element.getAttribute('aria-hidden') !== 'true'
        && getComputedStyle(element).visibility !== 'hidden'
      );
      if (visible.length) {
        const current = visible.indexOf(document.activeElement);
        visible[current < 0 ? 0 : (current + direction + visible.length) % visible.length]?.focus?.({ preventScroll: true });
      }
    }
    event.preventDefault();
  }, { capture: true });

  function hitTest(x, y) {
    if (activeWorld && viewMix > 0.58) {
      let best = null;
      let bestDistance = Infinity;
      subScreen.forEach((point, index) => {
        const distance = Math.hypot(x - point.x, y - point.y);
        if (distance < point.r * 1.75 && distance < bestDistance) {
          bestDistance = distance;
          best = { type: 'sub', index };
        }
      });
      return best;
    }
    const candidates = worldKeys
      .map((key) => ({ key, point: worldScreen[key], distance: Math.hypot(x - worldScreen[key].x, y - worldScreen[key].y) }))
      .filter(({ point, distance }) => distance < point.r * 1.75)
      .sort((a, b) => b.point.z - a.point.z || a.distance - b.distance);
    return candidates.length ? { type: 'world', key: candidates[0].key } : null;
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * width / Math.max(1, rect.width),
      y: (event.clientY - rect.top) * height / Math.max(1, rect.height),
    };
  }

  function pointerDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pointerAngle(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  function pointerMidpoint(a, b) {
    return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
  }

  function beginPinch() {
    const entries = [...pointers.values()];
    if (entries.length < 2) {
      pinchState = null;
      return;
    }
    const a = entries[0];
    const b = entries[1];
    pinchState = {
      distance: Math.max(1, pointerDistance(a, b)),
      angle: pointerAngle(a, b),
      midpoint: pointerMidpoint(a, b),
      overviewZoom,
      overviewRoll,
      overviewYaw,
      overviewPitch,
      detailZoom,
      detailRoll,
      detailYaw,
      detailPitch,
    };
    gestureHadPinch = true;
  }

  function bindInteractionCanvas(target) {
  target.addEventListener('pointerdown', (event) => {
    if (window.__dreamUnityGameActive) return;
    const point = canvasPoint(event);
    pointers.set(event.pointerId, {
      ...point,
      lastX: point.x,
      lastY: point.y,
      startX: point.x,
      startY: point.y,
      lastTime: performance.now(),
      startTime: performance.now(),
    });
    canvas.setPointerCapture?.(event.pointerId);
    gestureTravel = 0;
    if (pointers.size === 1) gestureHadPinch = false;
    if (pointers.size >= 2) beginPinch();
    overviewYawVelocity = overviewPitchVelocity = overviewRollVelocity = 0;
    detailYawVelocity = detailPitchVelocity = detailRollVelocity = 0;
    holdTarget = 1;
    needsRender = true;
  }, { passive: false });

  target.addEventListener('pointermove', (event) => {
    if (window.__dreamUnityGameActive) return;
    pointerMoveTick++;
    const pointer = pointers.get(event.pointerId);
    const point = canvasPoint(event);
    if (!pointer) {
      if (!coarse && (reducedMotion || pointerMoveTick % 3 === 0)) {
        const hit = hitTest(point.x, point.y);
        hoverWorld = hit?.type === 'world' ? hit.key : null;
        hoverSub = hit?.type === 'sub' ? hit.index : -1;
        canvas.style.cursor = hit ? 'pointer' : 'grab';
        needsRender = true;
      }
      return;
    }

    const now = performance.now();
    const dx = point.x - pointer.lastX;
    const dy = point.y - pointer.lastY;
    const dt = Math.max(0.008, (now - pointer.lastTime) / 1000);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.lastX = point.x;
    pointer.lastY = point.y;
    pointer.lastTime = now;
    gestureTravel += Math.hypot(dx, dy);

    if (pointers.size >= 2) {
      const entries = [...pointers.values()];
      const a = entries[0];
      const b = entries[1];
      if (!pinchState) beginPinch();
      const distance = Math.max(1, pointerDistance(a, b));
      const angle = pointerAngle(a, b);
      const midpoint = pointerMidpoint(a, b);
      const ratio = distance / Math.max(1, pinchState.distance);
      const rotation = angle - pinchState.angle;
      const midDx = midpoint.x - pinchState.midpoint.x;
      const midDy = midpoint.y - pinchState.midpoint.y;
      if (activeWorld && viewMix > 0.55) {
        detailZoom = clamp(pinchState.detailZoom * ratio, 1.22, 1.72);
        detailRoll = clamp(pinchState.detailRoll + rotation, -0.10, 0.10);
        detailYaw = clamp(pinchState.detailYaw - midDx * 0.0024, -0.46, 0.46);
        detailPitch = clamp(pinchState.detailPitch - midDy * 0.0022, -0.24, 0.24);
      } else {
        overviewZoom = clamp(pinchState.overviewZoom * ratio, 0.80, 1.10);
        overviewRoll = clamp(pinchState.overviewRoll + rotation, -0.22, 0.18);
        overviewYaw = clamp(pinchState.overviewYaw - midDx * 0.0024, -0.72, 0.76);
        overviewPitch = clamp(pinchState.overviewPitch - midDy * 0.0022, -0.26, 0.24);
      }
      gestureHadPinch = true;
      canvas.style.cursor = 'grabbing';
      event.preventDefault();
      needsRender = true;
      return;
    }

    if (gestureTravel > 4) {
      if (activeWorld && viewMix > 0.62) {
        detailYaw = clamp(detailYaw - dx * 0.0042, -0.46, 0.46);
        detailPitch = clamp(detailPitch - dy * 0.0038, -0.24, 0.24);
        detailYawVelocity = -dx * 0.0042 / dt;
        detailPitchVelocity = -dy * 0.0038 / dt;
        hoverSub = -1;
      } else if (viewMix < 0.38) {
        overviewYaw = clamp(overviewYaw - dx * 0.0042, -0.72, 0.76);
        overviewPitch = clamp(overviewPitch - dy * 0.0038, -0.26, 0.24);
        overviewYawVelocity = -dx * 0.0042 / dt;
        overviewPitchVelocity = -dy * 0.0038 / dt;
        hoverWorld = null;
      }
      canvas.style.cursor = 'grabbing';
      event.preventDefault();
      needsRender = true;
    }
  }, { passive: false });

  function finishPointer(event, cancelled = false) {
    if (window.__dreamUnityGameActive) return;
    const pointer = pointers.get(event.pointerId);
    const pointerCount = pointers.size;
    pointers.delete(event.pointerId);
    if (pointers.size >= 2) beginPinch();
    else pinchState = null;
    if (pointers.size === 1) {
      const remaining = [...pointers.values()][0];
      remaining.startX = remaining.lastX = remaining.x;
      remaining.startY = remaining.lastY = remaining.y;
      remaining.lastTime = performance.now();
    }
    holdTarget = pointers.size ? 1 : 0;
    canvas.style.cursor = coarse ? 'default' : 'grab';
    needsRender = true;
    const duration = pointer ? performance.now() - pointer.startTime : 0;
    const moved = cancelled || gestureHadPinch || pointerCount > 1 || gestureTravel > 9 || duration > 520;
    if (moved) return;
    const point = canvasPoint(event);
    const hit = hitTest(point.x, point.y);
    if (hit?.type === 'world') {
      enterWorld(hit.key);
      return;
    }
    if (hit?.type === 'sub') {
      triggerSub(hit.index);
      return;
    }
    const now = performance.now();
    if (now - lastTapAt < 330) {
      if (activeWorld && viewMix > 0.55) {
        detailYaw = detailPitch = detailRoll = 0;
        detailZoom = 1.45;
      } else {
        overviewYaw = 0.16;
        overviewPitch = -0.075;
        overviewRoll = -0.012;
        overviewZoom = 0.92;
      }
    }
    lastTapAt = now;
  }

  target.addEventListener('pointerup', (event) => finishPointer(event, false), { passive: false });
  target.addEventListener('pointercancel', (event) => finishPointer(event, true), { passive: false });
  target.addEventListener('pointerleave', () => {
    if (!pointers.size) {
      hoverWorld = null;
      hoverSub = -1;
      needsRender = true;
    }
  });
  target.addEventListener('wheel', (event) => {
    if (window.__dreamUnityGameActive) return;
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.00085);
    if (activeWorld && viewMix > 0.55) detailZoom = clamp(detailZoom * factor, 1.22, 1.72);
    else if (viewMix < 0.45) overviewZoom = clamp(overviewZoom * factor, 0.80, 1.10);
    needsRender = true;
  }, { passive: false });
  }

  bindInteractionCanvas(canvas);

  function clearPointers() {
    pointers.clear();
    pinchState = null;
    gestureHadPinch = false;
    holdTarget = 0;
    canvas.style.cursor = coarse ? 'default' : 'grab';
  }

  function resize(force = false) {
    if (window.__dreamUnityGameActive && !force) return;
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width || innerWidth || 1);
    height = Math.max(1, rect.height || innerHeight || 1);
    const cap = coarse || lowCPU ? 1.08 : 1.32;
    const proposedDpr = Math.min(devicePixelRatio || 1, cap) * dprScale;
    const pixelBudget = coarse || lowCPU ? 900000 : 1200000;
    const budgetScale = Math.min(1, Math.sqrt(pixelBudget / Math.max(1, width * height * proposedDpr * proposedDpr)));
    dpr = Math.max(0.66, proposedDpr * budgetScale);
    const targetWidth = Math.max(1, Math.round(width * dpr));
    const targetHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    if (gl && !gl.isContextLost()) gl.viewport(0, 0, targetWidth, targetHeight);
    if (fallbackContext) fallbackContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    app.style.setProperty('--du-art-center-x', isCompactLayout() ? '50%' : '53.75%');
    app.style.setProperty('--du-art-center-y', '50%');
    updateProjectedTargets();
    updateLabels(true);
    needsRender = true;
  }

  function updateMotion(dt) {
    holdStrength = damp(holdStrength, holdTarget, holdTarget ? 7.4 : 4.2, dt);
    if (reducedMotion) {
      viewMix = targetMix;
      overviewYawVelocity = overviewPitchVelocity = overviewRollVelocity = 0;
      detailYawVelocity = detailPitchVelocity = detailRollVelocity = 0;
    } else if (!pointers.size) {
      if (activeWorld && viewMix > 0.55) {
        detailYaw = clamp(detailYaw + detailYawVelocity * dt, -0.46, 0.46);
        detailPitch = clamp(detailPitch + detailPitchVelocity * dt, -0.24, 0.24);
        const decay = Math.exp(-dt * 6.8);
        detailYawVelocity *= decay;
        detailPitchVelocity *= decay;
        detailRollVelocity *= decay;
      } else if (viewMix < 0.45) {
        overviewYaw = clamp(overviewYaw + overviewYawVelocity * dt, -0.72, 0.76);
        overviewPitch = clamp(overviewPitch + overviewPitchVelocity * dt, -0.26, 0.24);
        const decay = Math.exp(-dt * 6.8);
        overviewYawVelocity *= decay;
        overviewPitchVelocity *= decay;
        overviewRollVelocity *= decay;
      }
      viewMix = damp(viewMix, targetMix, 4.5, dt);
    } else {
      viewMix = damp(viewMix, targetMix, 4.5, dt);
    }

    if (targetMix === 0 && viewMix < 0.006 && activeWorld) {
      activeWorld = null;
      activeSub = 0;
      impulse = 0;
      setHint();
    }
    impulse *= Math.exp(-dt * 2.8);
    const targetOrientation = currentOrientation(Boolean(activeWorld), false);
    ghostYaw = damp(ghostYaw, targetOrientation.yaw, 0.82 + holdStrength * 0.42, dt);
    ghostPitch = damp(ghostPitch, targetOrientation.pitch, 0.76 + holdStrength * 0.36, dt);
    ghostRoll = damp(ghostRoll, targetOrientation.roll, 0.70 + holdStrength * 0.30, dt);
    app.style.setProperty('--du-pressure', holdStrength.toFixed(4));
  }

  function governor(dt) {
    fpsFrames++;
    fpsElapsed += dt;
    if (fpsElapsed < 2) return;
    const fps = fpsFrames / fpsElapsed;
    fpsFrames = 0;
    fpsElapsed = 0;
    if (fps < 40) slowWindows++;
    else slowWindows = Math.max(0, slowWindows - 1);
    if (slowWindows >= 2 && dprScale > 0.66) {
      dprScale = Math.max(0.66, dprScale - 0.12);
      slowWindows = 0;
      resize(true);
    }
  }

  function setReady(mode, api, restored = false) {
    rendererStatus.mode = mode;
    rendererStatus.api = api;
    rendererStatus.ready = true;
    rendererStatus.state = 'ready';
    rendererStatus.contextLost = false;
    app.dataset.renderer = mode;
    app.dataset.rendererReady = 'true';
    app.dataset.rendererState = 'ready';
    window.dispatchEvent(new CustomEvent('dreamunity:renderer-ready', {
      detail: { mode, api, version: RENDERER_VERSION, reducedMotion, restored },
    }));
  }

  let needsRender = true;
  function animate(now) {
    const rawDt = Math.max(0, (now - lastFrame) / 1000);
    lastFrame = now;
    const dt = Math.min(rawDt, 0.05);
    const gameActive = Boolean(window.__dreamUnityGameActive);
    if (fallbackContext) {
      if (gameActive && !fallbackSuspended) {
        fallbackSuspended = true;
        canvas.style.visibility = 'hidden';
        canvas.width = 1;
        canvas.height = 1;
      } else if (!gameActive && fallbackSuspended) {
        fallbackSuspended = false;
        canvas.style.visibility = '';
        resize(true);
      }
    }
    if (!document.hidden && !gameActive && rendererStatus.ready && !rendererStatus.contextLost) {
      if (!reducedMotion) elapsed += dt;
      updateMotion(dt);
      updateProjectedTargets();
      updateLabels();
      const moving = Math.abs(viewMix - targetMix) > 0.001
        || holdStrength > 0.002
        || Math.abs(overviewYawVelocity) + Math.abs(overviewPitchVelocity)
          + Math.abs(detailYawVelocity) + Math.abs(detailPitchVelocity) > 0.002;
      const renderInterval = fallbackContext ? 1000 / 18 : (lowCPU ? 1000 / 24 : 1000 / 30);
      const renderDue = now >= lastDrawAt;
      if ((needsRender || renderDue) && (!reducedMotion || needsRender || moving)) {
        const state = cycleState(elapsed);
        if (gl) renderGL(state);
        else renderFallback(state);
        rendererStatus.frame++;
        needsRender = false;
        // Budget from completion, not frame start. A slow software-rendered
        // frame therefore yields real main-thread time before the next draw.
        lastDrawAt = performance.now() + renderInterval;
      }
      if (!reducedMotion) governor(rawDt);
    }
    requestAnimationFrame(animate);
  }

  function bindContextEvents(target) {
  target.addEventListener('webglcontextlost', (event) => {
    if (target !== canvas || !gl) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    rendererStatus.ready = false;
    rendererStatus.state = 'context-lost';
    rendererStatus.contextLost = true;
    app.dataset.rendererReady = 'false';
    app.dataset.rendererState = 'context-lost';
    window.dispatchEvent(new CustomEvent('dreamunity:renderer-context-lost', {
      detail: { mode: 'webgl', api: 'webgl2', version: RENDERER_VERSION },
    }));
  });

  target.addEventListener('webglcontextrestored', () => {
    if (target !== canvas || !gl) return;
    try {
      resources = null;
      initGLResources();
      resize(!window.__dreamUnityGameActive);
      setReady('webgl', 'webgl2', true);
      needsRender = true;
      window.dispatchEvent(new CustomEvent('dreamunity:renderer-context-restored', {
        detail: { mode: 'webgl', api: 'webgl2', version: RENDERER_VERSION },
      }));
    } catch (error) {
      try {
        replaceCanvasForFallback(error);
        resize(true);
        setReady('canvas2d-fallback', 'canvas2d', true);
        needsRender = true;
        window.dispatchEvent(new CustomEvent('dreamunity:renderer-context-restored', {
          detail: { mode: 'canvas2d-fallback', api: 'canvas2d', version: RENDERER_VERSION },
        }));
      } catch (fallbackError) {
        rendererStatus.state = 'error';
        app.dataset.rendererState = 'error';
        console.error(fallbackError);
      }
    }
  });
  }

  bindContextEvents(canvas);

  function replaceCanvasForFallback(cause) {
    const retiredWebGLCanvas = canvas;
    const replacement = retiredWebGLCanvas.cloneNode(false);
    replacement.dataset.rendererSurface = 'canvas2d-fallback';
    retiredWebGLCanvas.removeAttribute('id');
    retiredWebGLCanvas.dataset.rendererSurface = 'retired-webgl';
    retiredWebGLCanvas.setAttribute('aria-hidden', 'true');
    retiredWebGLCanvas.tabIndex = -1;
    retiredWebGLCanvas.style.display = 'none';
    retiredWebGLCanvas.after(replacement);
    canvas = replacement;
    gl = null;
    resources = null;
    uniformLocations = new WeakMap();
    bindInteractionCanvas(canvas);
    fallbackContext = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!fallbackContext) throw cause || new Error('Canvas2D fallback is unavailable.');
    if (window.__dreamUnityGameActive) canvas.style.visibility = 'hidden';
    return fallbackContext;
  }

  addEventListener('resize', () => resize(false), { passive: true });
  document.addEventListener('visibilitychange', () => {
    lastFrame = performance.now();
    if (document.hidden) clearPointers();
    else needsRender = true;
  });
  window.addEventListener('dreamunity:launch-game', (event) => {
    clearPointers();
    if (fallbackContext) window.setTimeout(() => {
      if (window.__dreamUnityGameActive) canvas.style.visibility = 'hidden';
    }, 0);
    const index = Number(event.detail?.index);
    if (Number.isInteger(index) && index >= 0 && index < subLabels.length) selectSub(index);
    window.setTimeout(() => $('#gameStart')?.focus?.({ preventScroll: true }), 0);
  });
  window.addEventListener('dreamunity:game-closed', () => {
    clearPointers();
    if (fallbackContext) {
      fallbackSuspended = false;
      canvas.style.visibility = '';
    }
    lastFrame = performance.now();
    resize(true);
    setHint();
    needsRender = true;
    window.setTimeout(() => subLabels[lastLaunchedSub]?.focus?.({ preventScroll: true }), reducedMotion ? 0 : 80);
  });

  try {
    gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: !lowCPU,
      depth: true,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: lowCPU ? 'default' : 'high-performance',
    });
  } catch {
    gl = null;
  }

  try {
    if (gl) {
      try {
        initGLResources();
        setReady('webgl', 'webgl2', false);
      } catch (webglError) {
        replaceCanvasForFallback(webglError);
        setReady('canvas2d-fallback', 'canvas2d', false);
        console.warn('WebGL2 initialisation failed; using the Canvas2D sovereign field.', webglError);
      }
    } else {
      fallbackContext = canvas.getContext('2d', { alpha: false, desynchronized: true });
      if (!fallbackContext) throw new Error('Neither WebGL2 nor Canvas2D is available.');
      setReady('canvas2d-fallback', 'canvas2d', false);
    }
    canvas.style.cursor = coarse ? 'default' : 'grab';
    setHint();
    resize(true);
    updateProjectedTargets();
    updateLabels(true);
    const initialState = cycleState(elapsed);
    if (gl) renderGL(initialState);
    else renderFallback(initialState);
    loading?.classList.add('hide');
  } catch (error) {
    rendererStatus.ready = false;
    rendererStatus.state = 'error';
    app.dataset.rendererReady = 'false';
    app.dataset.rendererState = 'error';
    loading?.classList.add('hide');
    if (hint) hint.textContent = 'VISUAL FIELD COULD NOT INITIALISE';
    console.error(error);
  }

  requestAnimationFrame(animate);
})();
