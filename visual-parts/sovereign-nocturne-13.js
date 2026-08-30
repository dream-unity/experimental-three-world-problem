(() => {
  'use strict';

  const RENDERER_ID = 'sovereign-nocturne';
  const RENDERER_VERSION = '20260830-sovereign-nocturne-4';
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
  // Begin in reconstitution rather than the cycle's visually empty gather.
  let elapsed = SILENT_CYCLE_SECONDS * 0.735;
  let lastFrame = performance.now();
  let labelTick = 0;
  let fpsFrames = 0;
  let fpsElapsed = 0;
  let slowWindows = 0;

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
  let overviewPitch = -0.075;
  let overviewRoll = -0.012;
  let overviewZoom = 0.92;
  let overviewYawVelocity = 0;
  let overviewPitchVelocity = 0;
  let overviewRollVelocity = 0;
  let detailYaw = 0;
  let detailPitch = 0;
  let detailRoll = 0;
  let detailZoom = 1;
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
    reality: { x: 3.35, y: -1.04, z: 0.35 },
  };
  const DETAIL_PINS = {
    machine: [
      { x: -0.25, y: 3.20, z: 0.05 },
      { x: 0.34, y: 2.55, z: 0.30 },
      { x: 0.62, y: 1.75, z: 0.50 },
    ],
    maker: [
      { x: 0.30, y: 0.95, z: 0.55 },
      { x: 0.58, y: 0.24, z: 0.72 },
      { x: 0.94, y: -0.52, z: 0.35 },
    ],
    reality: [
      { x: -2.40, y: -1.12, z: -0.15 },
      { x: 1.12, y: -1.10, z: 0.10 },
      { x: 3.70, y: -1.05, z: 0.45 },
    ],
  };

  function windowPulse(value, start, peak, end) {
    if (value <= start || value >= end) return 0;
    return value < peak
      ? ease((value - start) / Math.max(0.0001, peak - start))
      : 1 - ease((value - peak) / Math.max(0.0001, end - peak));
  }

  function cycleState(time) {
    const phase = reducedMotion ? 0.735 : ((time / SILENT_CYCLE_SECONDS) % 1 + 1) % 1;
    return {
      phase,
      gather: windowPulse(phase, 0.00, 0.13, 0.27),
      pressure: Math.max(windowPulse(phase, 0.12, 0.34, 0.455), holdStrength),
      subtraction: reducedMotion ? 0.06 : windowPulse(phase, 0.405, 0.485, 0.565),
      inversion: reducedMotion ? 0.28 : windowPulse(phase, 0.49, 0.575, 0.67),
      reconstitution: reducedMotion ? 0.78 : windowPulse(phase, 0.535, 0.68, 0.81),
      crown: reducedMotion ? 0.64 : windowPulse(phase, 0.67, 0.775, 0.875),
      return: reducedMotion ? 0 : ease((phase - 0.81) / 0.19),
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
        : { yaw: 0.28, pitch: 0.08 };
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
    return { x: lerp(0.06, -0.015, mix), y: lerp(-0.02, 0.015, mix) };
  }

  function isCompactLayout() {
    return width <= 760 || width / Math.max(1, height) < 0.95;
  }

  function viewportShapeScale() {
    const aspect = Math.max(0.25, width / Math.max(1, height));
    return {
      x: aspect < 0.95
        ? lerp(0.30, 0.50, smoothstep(0.46, 0.75, aspect))
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
      world: 2,
      stations: [0, 0.15, 0.31, 0.49, 0.66, 0.83, 1],
      points: [
        { x: -9.50, y: -1.38, z: 0.05 },
        { x: -6.30, y: -1.50, z: 0.35 },
        { x: -3.40, y: -1.28, z: -0.20 },
        { x: -0.65, y: -1.42, z: 0.22 },
        { x: 2.40, y: -1.18, z: -0.28 },
        { x: 6.00, y: -1.36, z: 0.42 },
        { x: 9.80, y: -1.24, z: -0.08 },
      ],
      leftWidths: [0.28, 0.22, 0.36, 0.18, 0.31, 0.24, 0.34],
      rightWidths: [8.40, 9.20, 8.70, 10.00, 8.80, 9.40, 8.30],
      banks: [-0.08, 0.10, -0.06, 0.12, -0.10, 0.07, -0.05],
      sideAxis: { x: 0, y: -0.42, z: 1 },
      camber: 0.025,
      thickness: 0.045,
    },
  ];

  // The wound is independent of the ground. It crosses the viewport, has its
  // own path-local UVs, and can therefore appear, resolve and fade cleanly.
  const SOVEREIGN_WOUND = {
    stations: [0, 0.14, 0.29, 0.45, 0.61, 0.76, 0.84, 1],
    points: [
      { x: -2.30, y: 5.00, z: -0.35 },
      { x: -1.96, y: 3.75, z: 0.15 },
      { x: -1.58, y: 2.55, z: -0.18 },
      { x: -1.18, y: 1.35, z: 0.48 },
      { x: -0.82, y: 0.18, z: 0.72 },
      { x: -0.38, y: -0.74, z: 0.28 },
      { x: 0.04, y: -1.16, z: 0.02 },
      { x: 0.62, y: -2.80, z: -0.22 },
    ],
    halfWidths: [0.004, 0.006, 0.010, 0.018, 0.035, 0.052, 0.028, 0.006],
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

    const rows = Math.max(48, latitudes);
    const columns = Math.max(18, Math.round(longitudes * 0.20));
    const stride = columns + 1;
    const vertices = [];
    const indices = [];

    LAMELLAE.forEach((config, lamellaIndex) => {
      const baseVertex = vertices.length / 13;
      const samples = [];
      const segmentRows = [];
      for (let segment = 0; segment < config.stations.length - 1; segment++) {
        const stationStart = config.stations[segment];
        const stationEnd = config.stations[segment + 1];
        const rowCount = Math.max(8, Math.round(rows * (stationEnd - stationStart)));
        const startRow = samples.length / stride;
        for (let row = 0; row <= rowCount; row++) {
          const t = lerp(stationStart, stationEnd, row / rowCount);
          for (let column = 0; column <= columns; column++) {
            const s = column / columns * 2 - 1;
            const point = lamellaPoint(lamellaIndex, t, s, segment);
            const normal = lamellaNormal(lamellaIndex, t, s, segment);
            const extrusionNormal = lamellaFrameNormal(lamellaIndex, t);
            const thicknessTaper = 0.24 + Math.pow(Math.sin(Math.PI * t), 0.62) * 0.76;
            const thickness = config.thickness * thicknessTaper;
            samples.push({ point, normal, extrusionNormal, thickness, t, s });
          }
        }
        segmentRows.push({ startRow, rowCount });
      }
      const faceCount = samples.length;
      for (let back = 0; back <= 1; back++) {
        const direction = back ? -1 : 1;
        samples.forEach(({ point, normal, extrusionNormal, thickness, t, s }) => {
          vertices.push(
            point.x + extrusionNormal.x * thickness * direction,
            point.y + extrusionNormal.y * thickness * direction,
            point.z + extrusionNormal.z * thickness * direction,
            normal.x * direction, normal.y * direction, normal.z * direction,
            t, s, config.world, back,
            extrusionNormal.x * direction,
            extrusionNormal.y * direction,
            extrusionNormal.z * direction,
          );
        });
      }

      segmentRows.forEach(({ startRow, rowCount }) => {
        for (let row = 0; row < rowCount; row++) {
          for (let column = 0; column < columns; column++) {
            const a = baseVertex + (startRow + row) * stride + column;
            const b = a + 1;
            const c = a + stride;
            const d = c + 1;
            const backA = a + faceCount;
            const backB = b + faceCount;
            const backC = c + faceCount;
            const backD = d + faceCount;
            indices.push(a, b, c, b, d, c);
            indices.push(backA, backC, backB, backB, backC, backD);
          }
        }
      });

      // The lamellae are cleaved sheets, not rubber extrusions. Their front and
      // back mineral planes remain deliberately open at the edge; interpolating
      // opposing normals across bridge walls created black caps and NaNs.
    });

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
    uniform float uPressure;
    uniform float uCrown;
    uniform float uReturn;
    uniform float uReconstitution;
    uniform float uReduced;
    uniform float uActiveWorld;
    uniform float uDetailMix;

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
      float amplitude = 0.55;
      for (int octave = 0; octave < 3; octave++) {
        value += noise(point) * amplitude;
        point = mat2(1.63, -1.12, 1.12, 1.63) * point + vec2(4.7, -2.9);
        amplitude *= 0.46;
      }
      return value;
    }

    float sdSegment(vec2 point, vec2 start, vec2 end) {
      vec2 path = end - start;
      float weight = clamp(dot(point - start, path) / max(0.00001, dot(path, path)), 0.0, 1.0);
      return length(point - start - path * weight);
    }

    float currentFamily(vec2 point, vec2 direction, float spread, float bend, float seed, float movingTime) {
      vec2 across = vec2(-direction.y, direction.x);
      float along = dot(point, direction);
      float lateral = dot(point, across);
      float extent = smoothstep(0.018, 0.085, along) * (1.0 - smoothstep(0.66, 0.94, along));
      float family = 0.0;
      for (int index = 0; index < 2; index++) {
        float strand = float(index) - 0.5;
        float fan = smoothstep(-0.015, 0.74, along);
        float irregularity = sin(along * (6.2 + strand * 0.72) + seed + strand * 1.37 + movingTime * 0.11);
        irregularity *= 0.004 + fan * (0.012 + abs(strand) * 0.0025);
        irregularity += sin(along * 14.1 + seed * 2.3 - strand * 0.81 - movingTime * 0.07) * fan * 0.0028;
        float trajectory = strand * spread * (0.22 + 0.78 * fan) + irregularity + strand * strand * along * 0.0018 + bend * along * along;
        float distanceToStrand = abs(lateral - trajectory);
        float width = 0.00058 + 0.00022 * hash21(vec2(strand + seed, seed * 3.1));
        float filament = 1.0 - smoothstep(width, width * 3.4, distanceToStrand);
        float phraseWave = 0.5 + 0.5 * sin(along * 11.7 + seed * 2.1 + strand * 1.83 - movingTime * 0.026);
        float phrasing = 0.10 + 0.90 * smoothstep(0.44, 0.76, phraseWave);
        family += filament * extent * phrasing;
      }
      return min(family, 1.35);
    }

    float currentVeil(vec2 point, vec2 direction, float spread, float bend, float seed, float movingTime) {
      vec2 across = vec2(-direction.y, direction.x);
      float along = dot(point, direction);
      float lateral = dot(point, across);
      float fan = smoothstep(-0.025, 0.72, along);
      float extent = smoothstep(-0.055, 0.035, along) * (1.0 - smoothstep(0.70, 1.02, along));
      float axis = sin(along * 4.7 + seed + movingTime * 0.018) * (0.004 + fan * spread * 0.18);
      axis += sin(along * 10.9 - seed * 1.7) * fan * spread * 0.07;
      axis += bend * along * along;
      float width = mix(0.012, spread * 2.35, fan);
      float body = exp(-pow(abs(lateral - axis) / max(0.001, width), 1.72));
      float breath = 0.42 + 0.58 * noise(vec2(along * 5.6 + seed, lateral * 19.0 - movingTime * 0.006));
      return body * extent * breath;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
      float movingTime = mix(uTime, 0.0, uReduced);
      float aspect = uResolution.x / max(1.0, uResolution.y);
      float portrait = 1.0 - smoothstep(0.78, 1.08, aspect);
      vec2 screen = vec2(uv.x, 1.0 - uv.y);
      vec2 fieldCenter = mix(vec2(0.548, 0.470), vec2(0.520, 0.500), portrait);
      vec2 fieldPoint = (screen - fieldCenter) * vec2(aspect, 1.0);
      vec2 machineLocus = mix(vec2(0.500, 0.390), vec2(0.490, 0.405), portrait);
      vec2 makerLocus = mix(vec2(0.620, 0.490), vec2(0.610, 0.505), portrait);
      vec2 worldLocus = mix(vec2(0.740, 0.600), vec2(0.720, 0.615), portrait);
      vec2 machinePoint = (screen - machineLocus) * vec2(aspect, 1.0);
      vec2 makerPoint = (screen - makerLocus) * vec2(aspect, 1.0);
      vec2 worldPoint = (screen - worldLocus) * vec2(aspect, 1.0);

      vec2 machineDirection = normalize(vec2(0.48, -0.88));
      vec2 makerDirection = normalize(vec2(0.995, 0.10));
      vec2 worldDirection = normalize(vec2(0.58, 0.82));
      float machine = currentFamily(machinePoint, machineDirection, 0.038, 0.160, 1.4, movingTime);
      float maker = currentFamily(makerPoint, makerDirection, 0.043, -0.130, 4.7, movingTime);
      float world = currentFamily(worldPoint, worldDirection, 0.047, 0.180, 8.3, movingTime);
      float machineVeil = currentVeil(machinePoint, machineDirection, 0.038, 0.160, 1.4, movingTime);
      float makerVeil = currentVeil(makerPoint, makerDirection, 0.043, -0.130, 4.7, movingTime);
      float worldVeil = currentVeil(worldPoint, worldDirection, 0.047, 0.180, 8.3, movingTime);
      machine *= 1.0 - exp(-dot(machinePoint * vec2(32.0, 24.0), machinePoint * vec2(32.0, 24.0))) * 0.96;
      maker *= 1.0 - exp(-dot(makerPoint * vec2(29.0, 23.0), makerPoint * vec2(29.0, 23.0))) * 0.96;
      world *= 1.0 - exp(-dot(worldPoint * vec2(30.0, 22.0), worldPoint * vec2(30.0, 22.0))) * 0.96;
      float machineFocus = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 1.0));
      float makerFocus = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 2.0));
      float worldFocus = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 3.0));
      machine *= mix(1.0, mix(0.74, 1.34, machineFocus), uDetailMix);
      maker *= mix(1.0, mix(0.74, 1.34, makerFocus), uDetailMix);
      world *= mix(1.0, mix(0.74, 1.34, worldFocus), uDetailMix);
      machineVeil *= mix(1.0, mix(0.70, 1.28, machineFocus), uDetailMix);
      makerVeil *= mix(1.0, mix(0.70, 1.28, makerFocus), uDetailMix);
      worldVeil *= mix(1.0, mix(0.70, 1.28, worldFocus), uDetailMix);
      float horizonY = mix(0.615, 0.640, portrait);
      vec2 reflectedScreen = vec2(screen.x, horizonY * 2.0 - screen.y);
      vec2 ghostMachinePoint = (reflectedScreen - machineLocus - mix(vec2(0.024, -0.006), vec2(0.032, -0.009), portrait)) * vec2(aspect, 1.0);
      vec2 ghostMakerPoint = (reflectedScreen - makerLocus - mix(vec2(-0.012, 0.019), vec2(-0.018, 0.024), portrait)) * vec2(aspect, 1.0);
      vec2 ghostWorldPoint = (reflectedScreen - worldLocus - mix(vec2(0.026, 0.028), vec2(0.034, 0.035), portrait)) * vec2(aspect, 1.0);
      float ghostVeil = currentVeil(ghostMachinePoint, machineDirection, 0.038, 0.160, 1.86, movingTime + 2.8)
        + currentVeil(ghostMakerPoint, makerDirection, 0.043, -0.130, 5.16, movingTime + 2.8)
        + currentVeil(ghostWorldPoint, worldDirection, 0.047, 0.180, 8.76, movingTime + 2.8);
      float belowHorizon = smoothstep(horizonY - 0.008, horizonY + 0.035, screen.y);
      float ghost = ghostVeil * belowHorizon;

      vec2 cutStart = mix(vec2(0.360, 0.030), vec2(0.340, 0.060), portrait);
      vec2 cutEnd = mix(vec2(0.560, 0.830), vec2(0.550, 0.800), portrait);
      float faultProgress = clamp((screen.y - cutStart.y) / max(0.001, cutEnd.y - cutStart.y), 0.0, 1.0);
      float faultX = mix(cutStart.x, cutEnd.x, faultProgress);
      float signedFault = screen.x - faultX;
      float faultExtent = smoothstep(mix(0.14, 0.28, portrait), mix(0.19, 0.33, portrait), screen.y)
        * (1.0 - smoothstep(mix(0.72, 0.62, portrait), mix(0.79, 0.68, portrait), screen.y));
      float faultBand = exp(-abs(signedFault) * mix(42.0, 36.0, portrait)) * faultExtent;

      float rupture = clamp(uCrown * 0.92 + uReconstitution * 0.32 + uPressure * 0.08, 0.0, 1.0);
      float ruptureWindow = smoothstep(0.24, 0.34, screen.y) * (1.0 - smoothstep(0.73, 0.84, screen.y));

      float horizonNoise = fbm(vec2(screen.x * 5.2, movingTime * 0.006));
      float horizon = exp(-abs(screen.y - horizonY - (horizonNoise - 0.5) * 0.0032) * 104.0);
      float horizonFaultX = mix(cutStart.x, cutEnd.x, clamp((horizonY - cutStart.y) / max(0.001, cutEnd.y - cutStart.y), 0.0, 1.0));
      float horizonDelta = (screen.x - horizonFaultX) / mix(0.042, 0.064, portrait);
      float horizonGap = exp(-(horizonDelta * horizonDelta));
      horizon *= mix(1.0, 0.18, horizonGap) * mix(0.42, 1.0, smoothstep(0.38, 0.72, horizonNoise));
      float atmospheric = fbm(fieldPoint * vec2(1.8, 2.6) + vec2(movingTime * 0.004, -movingTime * 0.002));
      float fieldMask = exp(-dot(fieldPoint * vec2(0.62, 0.84), fieldPoint * vec2(0.62, 0.84)));
      vec2 bloomPoint = screen - mix(vec2(0.535, 0.485), vec2(0.525, 0.500), portrait);
      bloomPoint.x += bloomPoint.y * 0.28;
      float veilUnion = min(1.0, machineVeil + makerVeil + worldVeil);
      float counterBloom = exp(-dot(bloomPoint * vec2(2.65, 2.15), bloomPoint * vec2(2.65, 2.15)));
      counterBloom *= (0.16 + veilUnion * 0.38)
        * (0.34 + 0.66 * fbm(bloomPoint * vec2(3.8, 4.6) + vec2(2.1, -1.7)));
      float climax = smoothstep(0.32, 0.94, uReconstitution * 0.70 + uCrown * 0.82 + uReturn * 0.10);
      float granular = hash21(floor(gl_FragCoord.xy * 0.56) + floor(movingTime * 0.27));

      float worldMaterialization = uDetailMix * worldFocus;
      vec2 depositCenter = mix(vec2(0.740, 0.655), vec2(0.700, 0.665), portrait);
      vec2 depositScale = mix(vec2(0.135, 0.125), vec2(0.205, 0.120), portrait)
        * (1.0 + worldMaterialization * 0.55);
      vec2 depositOffset = screen - depositCenter;
      depositOffset.x -= depositOffset.y * 0.32;
      vec2 depositUv = depositOffset / depositScale + 0.5;
      vec2 depositGrid = depositUv * vec2(12.0, 10.0);
      vec2 depositCell = floor(depositGrid);
      vec2 depositLocal = fract(depositGrid);
      float depositSeed = hash21(depositCell + vec2(19.7, 41.3));
      vec2 depositPoint = vec2(hash21(depositCell + 2.1), hash21(depositCell + 8.7));
      float depositRadius = mix(0.040, 0.120, hash21(depositCell + 14.4));
      float depositHue = hash21(depositCell + vec2(31.4, 7.6));
      vec2 depositDelta = depositLocal - depositPoint;
      float depositDistance = abs(depositDelta.x) * 0.55 + abs(depositDelta.y) * 1.65;
      float deposit = 1.0 - smoothstep(depositRadius, depositRadius * 1.9, depositDistance);
      float depositBounds = step(0.0, depositUv.x) * step(depositUv.x, 1.0)
        * step(0.0, depositUv.y) * step(depositUv.y, 1.0)
        * step(mix(0.67, 0.52, worldMaterialization), depositSeed);
      deposit *= depositBounds * (0.20 + uPressure * 0.30 + uReconstitution * 0.50 + worldMaterialization * 0.55);

      vec3 bone = vec3(0.900, 0.850, 0.755);
      vec3 coral = vec3(0.980, 0.235, 0.245);
      vec3 cyan = vec3(0.160, 0.535, 0.590);
      vec3 emerald = vec3(0.160, 0.465, 0.340);
      vec3 violet = vec3(0.345, 0.265, 0.550);
      vec3 color = vec3(0.0090, 0.0080, 0.0125);
      float radiance = 0.72 + uPressure * 0.18 + uReconstitution * 0.42 + uCrown * 0.58;
      color += vec3(0.045, 0.027, 0.043) * atmospheric * fieldMask * 0.48;
      color += mix(vec3(0.105, 0.115, 0.185), vec3(0.235, 0.095, 0.085), smoothstep(-0.22, 0.30, bloomPoint.y))
        * counterBloom * (0.030 + 0.068 * climax);
      color += mix(bone, cyan, 0.27) * machineVeil * 0.085 * radiance;
      color += mix(bone, emerald, 0.25) * makerVeil * 0.080 * radiance;
      color += mix(bone, violet, 0.30) * worldVeil * 0.092 * radiance;
      color += mix(bone, cyan, 0.32) * machine * 0.110 * radiance;
      color += mix(bone, emerald, 0.30) * maker * 0.100 * radiance;
      color += mix(bone, violet, 0.34) * world * 0.115 * radiance;
      color = mix(color, color * 0.72, faultBand * 0.16 * (1.0 - rupture * 0.20));
      color += mix(violet, bone, 0.34) * ghostVeil * belowHorizon * (0.020 + uReturn * 0.030);
      color += mix(violet, bone, 0.30) * ghost * (0.062 + uReturn * 0.040);
      color += bone * horizon * (0.024 + uReturn * 0.040 + uCrown * 0.015);
      vec3 depositColor = depositHue < 0.08 ? coral : (depositHue < 0.20 ? mix(cyan, violet, depositHue * 4.0) : bone);
      color += depositColor * deposit * (0.070 + ruptureWindow * 0.110 + worldMaterialization * 0.180);
      color += (granular - 0.5) * 0.0042;

      float edge = length((screen - vec2(0.52, 0.49)) * vec2(0.78, 1.0));
      color *= 1.0 - smoothstep(0.38, 0.91, edge) * 0.46;
      outColor = vec4(pow(max(color, vec3(0.0)), vec3(0.88)), 1.0);
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
        point += deformNormal * sin(aAlong * 18.0 + aAcross * 5.2 - movingTime * 0.035)
          * worldMask * worldChange * 0.016;
        point.y -= worldMask * worldChange * (0.035 + smoothstep(-0.15, 0.92, aAcross) * 0.045);
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
        float sheetOffset = sin(aAlong * 7.0 + 1.9) * 0.012;
        point.x = point.x * 0.985 + 0.10 + sheetOffset;
        point.y = mirrorPlane - (point.y - mirrorPlane) * 0.22;
        point.z -= 0.35;
        normal = -normalize(vec3(normal.x / 0.985, -normal.y / 0.22, normal.z));
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

    void main() {
      vec3 safeNormal = vNormal / max(length(vNormal), 0.0001);
      vec3 normal = gl_FrontFacing ? safeNormal : -safeNormal;
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
      float facing = max(0.0, dot(normal, viewDirection));
      float fresnel = pow(1.0 - facing, 4.6);
      vec3 halfDirection = normalize(keyDirection + viewDirection);
      float specular = pow(max(0.0, dot(normal, halfDirection)), 112.0);
      float movingTime = mix(uTime, 0.0, uReduced);
      float climax = smoothstep(0.32, 0.94, uReconstitution * 0.70 + uCrown * 0.82 + uReturn * 0.10);

      vec3 obsidian = vec3(0.018, 0.021, 0.032);
      vec3 graphite = vec3(0.125, 0.122, 0.150);
      vec3 ultramarine = vec3(0.046, 0.055, 0.150);
      vec3 bone = vec3(0.920, 0.860, 0.765);
      vec3 coral = vec3(0.910, 0.125, 0.135);
      vec3 cyan = vec3(0.0, 0.788, 0.910);
      vec3 emerald = vec3(0.078, 0.788, 0.545);
      vec3 violet = vec3(0.408, 0.251, 1.0);
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
        color = mix(obsidian, graphite, 0.30 + groundTone * 0.07);
        color *= mix(0.96, 1.03, groundTone) * (0.68 + wrapDiffuse * 0.38 + skyFill * 0.05);
        color += graphite * fill * 0.07;
        color += bone * warmBounce * (0.012 + groundTone * 0.004);
        color = mix(color, ultramarine, (0.045 + fresnel * 0.13) * (0.55 + groundTone * 0.35));
        color += bone * specular * (0.065 + uReconstitution * 0.025 + uCrown * 0.012);
        color *= mix(1.0, 0.84, clamp(vBack, 0.0, 1.0));
        vec3 foldUndertone = vLamella < 0.5 ? cyan : (vLamella < 1.5 ? emerald : violet);
        color = mix(color, foldUndertone, 0.006 + groundTone * 0.003);

        float nacreA = smoothstep(0.15, 0.22, vAlong) * (1.0 - smoothstep(0.43, 0.52, vAlong));
        nacreA *= smoothstep(-0.92, -0.46, vAcross) * (1.0 - smoothstep(0.18, 0.54, vAcross));
        float nacreB = smoothstep(0.58, 0.66, vAlong) * (1.0 - smoothstep(0.82, 0.90, vAlong));
        nacreB *= smoothstep(-0.40, -0.02, vAcross) * (1.0 - smoothstep(0.70, 0.92, vAcross));
        float nacreMask = vLamella < 0.5
          ? nacreA * (0.38 + groundTone * 0.16)
          : (vLamella < 1.5 ? nacreB * 0.20 : 0.0);
        vec3 nacreMat = mix(bone, vec3(0.56, 0.63, 0.76), 0.16) * (0.28 + wrapDiffuse * 0.20);
        color = mix(color, nacreMat, nacreMask * (0.11 + uCrown * 0.02));

        float machineMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 1.0));
        float makerMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 2.0));
        float worldMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 3.0));
        float machineTrace = exp(-abs(vAcross + sin(vAlong * 7.0 + vLamella) * 0.12) * 38.0);
        machineTrace *= smoothstep(0.12, 0.24, vAlong) * (1.0 - smoothstep(0.70, 0.86, vAlong));
        float makerTrace = exp(-abs(vAcross - 0.28 + sin(vAlong * 4.4) * 0.10) * 34.0);
        makerTrace *= smoothstep(0.24, 0.36, vAlong) * (1.0 - smoothstep(0.82, 0.94, vAlong));
        float worldTrace = exp(-abs(vAlong - 0.31 - sin(vAcross * 2.8) * 0.045) * 44.0);
        worldTrace *= 1.0 - smoothstep(1.45, 2.15, vLamella);
        color += cyan * machineTrace * machineMask * uDetailMix * 0.09;
        color += emerald * makerTrace * makerMask * uDetailMix * 0.09;
        color += mix(violet, bone, 0.28) * worldTrace * worldMask * uDetailMix * 0.14;

        color *= 1.0 - uSubtraction * (0.22 + groundTone * 0.10);
        float groundDepth = smoothstep(-0.86, 0.82, vAcross);
        float mirrorFaultX = -0.56 - vLocal.y * 0.38;
        float mirrorCaustic = exp(-abs(vLocal.x - mirrorFaultX) * 3.0);
        mirrorCaustic *= smoothstep(-0.75, -0.54, vAcross) * (1.0 - smoothstep(0.48, 0.62, vAcross));
        mirrorCaustic *= 0.52 + 0.48 * hash31(floor(facetCoord * 3.1 + vec3(4.2, 1.7, 9.4)));
        color += mix(violet, bone, 0.74) * mirrorCaustic * (0.010 + 0.024 * climax);
        alpha = mix(0.34, 0.57, groundDepth);
        alpha *= 1.0 - uReturn * (1.0 - groundDepth) * 0.24;
        alpha *= mix(1.0, 0.76, clamp(vBack, 0.0, 1.0));
      } else if (uMaterial < 1.5) {
        float core = pow(clamp(1.0 - abs(vAcross), 0.0, 1.0), 3.2);
        float edgeGlow = smoothstep(0.18, 0.62, abs(vAcross)) * (1.0 - smoothstep(0.72, 0.98, abs(vAcross)));
        float fade = smoothstep(0.22, 0.34, vAlong) * (1.0 - smoothstep(0.91, 1.0, vAlong));
        float heat = clamp(vBack, 0.0, 1.0);
        float phrasing = 0.90 + 0.10 * pow(max(0.0, sin(vAlong * 16.9646 + movingTime * 0.030)), 4.0);
        float discontinuity = 1.0 - 0.84 * smoothstep(0.48, 0.51, vAlong) * (1.0 - smoothstep(0.60, 0.63, vAlong));
        float pressureHeat = smoothstep(0.54, 0.64, vAlong) * (1.0 - smoothstep(0.80, 0.90, vAlong));
        vec3 sovereignGold = vec3(0.960, 0.875, 0.720);
        color = mix(vec3(0.006, 0.005, 0.008), sovereignGold, core * 0.90);
        color = mix(color, mix(coral, sovereignGold, 0.24), pow(core, 3.0) * (0.10 + heat * 0.16));
        color = mix(color, mix(coral, sovereignGold, 0.28), pressureHeat * core * (0.18 + uCrown * 0.24));
        color += coral * edgeGlow * (0.045 + heat * 0.075 + uPressure * 0.025 + uCrown * 0.055);
        color += bone * core * (underLight * (0.14 + uReconstitution * 0.070) + phrasing * (0.12 + climax * 0.16));
        alpha = (0.19 + heat * 0.20 + core * (0.69 + heat * 0.16 + uCrown * 0.10) * (0.94 + phrasing * 0.06)) * fade * discontinuity;
        alpha *= mix(1.0, 0.30, uGhost);
      } else {
        color = mix(obsidian, graphite, 0.34 + facetTone * 0.30);
        color += ultramarine * fresnel * 0.11;
        color += bone * specular * 0.08;
        float reflectionFade = smoothstep(-5.45, -2.42, vWorld.y);
        float ghostGrain = hash31(floor(facetCoord * 2.3 + vec3(floor(movingTime * 0.08))));
        alpha = (0.125 + fresnel * 0.24 + uSubtraction * 0.046)
          * (0.82 + ghostGrain * 0.18) * reflectionFade;
        alpha *= vLamella < 0.5 ? 1.0 : 0.38;
      }

      float selectedPulse = 0.5 + 0.5 * sin(movingTime * 1.12 + uActiveSub * 1.9);
      color += coral * uDetailMix * selectedPulse * 0.006;
      color += vec3(0.008, 0.007, 0.012) * uReturn;
      float outputGamma = uMaterial < 0.5 ? 0.92 : 0.84;
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
      float baseAlpha=mix(0.190,0.072,aPathWeight)*phrasing;
      float stateAlpha=uGather*0.050+uPressure*anchorInfluence*0.060+uCrown*(0.050+anchorInfluence*0.055)+uReturn*aPathWeight*0.12;
      float detailAlpha=mix(0.72,1.18,selected*uDetailMix);
      float overviewSuppression=mix(0.14,1.0,uDetailMix);
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

  function drawBackgroundGL(state) {
    const program = resources.backgroundProgram;
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(program);
    uniform2(program, 'uResolution', canvas.width, canvas.height);
    uniform1(program, 'uTime', elapsed);
    uniform1(program, 'uPressure', state.pressure);
    uniform1(program, 'uCrown', state.crown);
    uniform1(program, 'uReturn', state.return);
    uniform1(program, 'uReconstitution', state.reconstitution);
    uniform1(program, 'uReduced', reducedMotion ? 1 : 0);
    uniform1(program, 'uActiveWorld', activeWorld ? worldKeys.indexOf(activeWorld) + 1 : 0);
    uniform1(program, 'uDetailMix', ease(viewMix));
    gl.bindVertexArray(resources.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.DEPTH_BUFFER_BIT);
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
    const ghostOrientation = {
      yaw: ghostYaw,
      pitch: ghostPitch,
      roll: ghostRoll,
      zoom: orientation.zoom * 0.995,
    };
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.depthMask(false);
    drawSurfaceGL(resources.inner, 1, state, ghostOrientation, true);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    drawSurfaceGL(resources.outer, 0, state, orientation, false);
    gl.depthMask(false);
    drawSurfaceGL(resources.inner, 1, state, orientation, false);
    gl.depthMask(true);
    drawFibresGL(state);
    drawPointsGL();
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
    const layout = fallbackLayout(detail);
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
    const overviewInteractive = !activeWorld || mix <= 0.05;
    const labelHalf = mobile ? (phone ? 78 : 82) : 112;
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
      const left = clamp(anchor.x + offsetX, labelHalf, width - labelHalf);
      const top = clamp(
        anchor.y + offsets[index].y,
        height * (mobile ? (phone ? 0.30 : 0.17) : 0.15),
        height * (mobile ? 0.73 : 0.72),
      );
      placedLabels.push({ x: left, y: top });
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
      const collisionX = mobile ? (phone ? 72 : 128) : 118;
      const collisionY = mobile ? 36 : 42;
      const unityOccluded = placedLabels.some(point =>
        Math.abs(point.x - unityX) < collisionX && Math.abs(point.y - unityY) < collisionY
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

    const detailVisible = Boolean(activeWorld && mix > 0.05);
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
    detailZoom = 1;
    detailYawVelocity = detailPitchVelocity = detailRollVelocity = 0;
    impulse = 1;
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
    if (activeWorld && viewMix > 0.55) {
      const next = (activeSub + direction + subLabels.length) % subLabels.length;
      selectSub(next);
      subLabels[next]?.focus?.({ preventScroll: true });
    } else if (!event.defaultPrevented) {
      const visible = worldKeys.map((key) => labels[key]).filter((element) => element?.offsetParent !== null);
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
        detailZoom = clamp(pinchState.detailZoom * ratio, 0.90, 1.12);
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
        detailZoom = 1;
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
    if (activeWorld && viewMix > 0.55) detailZoom = clamp(detailZoom * factor, 0.90, 1.12);
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
    const cap = coarse || lowCPU ? 1.16 : 1.58;
    dpr = Math.max(0.72, Math.min(devicePixelRatio || 1, cap) * dprScale);
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
      if (!reducedMotion || needsRender || moving) {
        const state = cycleState(elapsed);
        if (gl) renderGL(state);
        else renderFallback(state);
        rendererStatus.frame++;
        needsRender = false;
      }
      if (!reducedMotion) governor(Math.min(rawDt, 0.1));
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
