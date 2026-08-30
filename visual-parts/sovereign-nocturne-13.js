(() => {
  'use strict';

  const RENDERER_ID = 'sovereign-nocturne';
  const RENDERER_VERSION = '20260830-sovereign-nocturne-2';
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
  let elapsed = SILENT_CYCLE_SECONDS * 0.705;
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

  let overviewYaw = -0.34;
  let overviewPitch = -0.08;
  let overviewRoll = -0.035;
  let overviewZoom = 0.84;
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
  let ghostYaw = overviewYaw - 0.12;
  let ghostPitch = overviewPitch + 0.035;
  let ghostRoll = overviewRoll - 0.018;

  let gestureTravel = 0;
  let gestureHadPinch = false;
  let pinchState = null;
  let lastTapAt = 0;
  let pointerMoveTick = 0;
  const pointers = new Map();
  const worldScreen = Object.fromEntries(worldKeys.map((key) => [key, { x: 0, y: 0, r: 28, z: 0 }]));
  const subScreen = [0, 1, 2].map((index) => ({ x: 0, y: 0, r: 25, z: 0, index }));

  const WORLD_PINS = {
    machine: { x: -2.08, y: 0.94, z: 1.18 },
    maker: { x: 1.70, y: 0.24, z: 1.28 },
    reality: { x: 0.26, y: -2.18, z: 1.18 },
  };
  const DETAIL_PINS = {
    machine: [
      { x: -1.68, y: 1.28, z: 1.26 },
      { x: -1.02, y: 0.18, z: 1.55 },
      { x: -1.38, y: -1.02, z: 1.30 },
    ],
    maker: [
      { x: 1.34, y: 1.10, z: 1.22 },
      { x: 1.76, y: 0.02, z: 1.30 },
      { x: 1.18, y: -1.16, z: 1.28 },
    ],
    reality: [
      { x: -0.84, y: -1.18, z: 1.34 },
      { x: 0.18, y: -1.76, z: 1.47 },
      { x: 1.12, y: -1.28, z: 1.22 },
    ],
  };

  function windowPulse(value, start, peak, end) {
    if (value <= start || value >= end) return 0;
    return value < peak
      ? ease((value - start) / Math.max(0.0001, peak - start))
      : 1 - ease((value - peak) / Math.max(0.0001, end - peak));
  }

  function cycleState(time) {
    const phase = reducedMotion ? 0.705 : ((time / SILENT_CYCLE_SECONDS) % 1 + 1) % 1;
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
        : { yaw: 0.035, pitch: 0.12 };
    const overview = ghost
      ? { yaw: ghostYaw, pitch: ghostPitch, roll: ghostRoll, zoom: overviewZoom }
      : { yaw: overviewYaw, pitch: overviewPitch, roll: overviewRoll, zoom: overviewZoom };
    if (!detail || !activeWorld) return overview;
    return {
      yaw: lerp(overview.yaw, detailYaw + worldOffsets.yaw, mix),
      pitch: lerp(overview.pitch, detailPitch + worldOffsets.pitch, mix),
      roll: lerp(overview.roll, detailRoll, mix),
      zoom: lerp(overview.zoom, detailZoom * 1.04, mix),
    };
  }

  function screenShift(detail = false) {
    const mix = detail ? ease(viewMix) : 0;
    if (isCompactLayout()) return { x: 0, y: lerp(0.015, 0.035, mix) };
    return { x: lerp(0.105, -0.010, mix), y: lerp(0, 0.015, mix) };
  }

  function isCompactLayout() {
    return width <= 760 || width / Math.max(1, height) < 0.95;
  }

  function viewportShapeScale() {
    const aspect = Math.max(0.25, width / Math.max(1, height));
    const targetWidth = lerp(0.93, 0.65, smoothstep(0.75, 1.30, aspect));
    const compactMantleCompensation = lerp(1.05, 1, smoothstep(0.75, 1.30, aspect));
    return {
      x: clamp(targetWidth * aspect / 1.21 * compactMantleCompensation, 0.34, 1),
      y: clamp(0.38 + aspect * 0.38, 0.55, 1),
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

  // Three authored mineral folds: no shared root, crown, radius or envelope.
  // Their different lengths and depth crossings keep the mantle open rather
  // than resolving into a bilateral pod.
  const LAMELLAE = [
    {
      points: [
        { x: -0.42, y: -2.74, z: 0.24 },
        { x: -2.18, y: -1.88, z: 0.72 },
        { x: -2.44, y: 0.92, z: 0.42 },
        { x: -0.88, y: 3.18, z: 0.70 },
      ],
      widths: [0.20, 0.72, 0.58, 0.18],
      banks: [0.12, -0.18, 0.22, -0.10],
      camber: 0.19,
      thickness: 0.15,
    },
    {
      points: [
        { x: 0.48, y: -2.42, z: 0.50 },
        { x: 1.58, y: -1.46, z: 0.94 },
        { x: 1.92, y: 0.52, z: 0.36 },
        { x: 0.72, y: 2.30, z: 0.84 },
      ],
      widths: [0.14, 0.50, 0.43, 0.12],
      banks: [-0.24, 0.18, -0.12, 0.24],
      camber: -0.15,
      thickness: 0.12,
    },
    {
      points: [
        { x: -1.48, y: -2.30, z: 0.02 },
        { x: -0.88, y: -2.66, z: 0.68 },
        { x: 0.22, y: -2.36, z: 0.90 },
        { x: 1.18, y: -1.56, z: 0.28 },
      ],
      widths: [0.13, 0.34, 0.28, 0.10],
      banks: [0.42, -0.16, 0.28, -0.30],
      camber: 0.12,
      thickness: 0.10,
    },
  ];

  function cubicValue(values, t) {
    const q = 1 - t;
    return q * q * q * values[0]
      + 3 * q * q * t * values[1]
      + 3 * q * t * t * values[2]
      + t * t * t * values[3];
  }

  function cubicPoint(points, t) {
    return {
      x: cubicValue(points.map((point) => point.x), t),
      y: cubicValue(points.map((point) => point.y), t),
      z: cubicValue(points.map((point) => point.z), t),
    };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function lamellaPoint(index, along, across) {
    const config = LAMELLAE[index];
    const t = clamp(along, 0, 1);
    const s = clamp(across, -1, 1);
    const center = cubicPoint(config.points, t);
    const before = cubicPoint(config.points, Math.max(0, t - 0.002));
    const after = cubicPoint(config.points, Math.min(1, t + 0.002));
    const tangent = normalize(subtract(after, before));
    const bank = cubicValue(config.banks, t);
    const rawSide = { x: Math.cos(bank), y: 0.08 * Math.sin(t * Math.PI), z: Math.sin(bank) };
    const projection = dot(rawSide, tangent);
    const side = normalize({
      x: rawSide.x - tangent.x * projection,
      y: rawSide.y - tangent.y * projection,
      z: rawSide.z - tangent.z * projection,
    });
    const normal = normalize(cross(tangent, side));
    const width = cubicValue(config.widths, t);
    const asymmetry = s + (s * s - 1) * (index === 0 ? 0.10 : index === 1 ? -0.08 : 0.06);
    const edgeCurl = config.camber * width * (s * s - 0.18);
    return {
      x: center.x + side.x * asymmetry * width + normal.x * edgeCurl,
      y: center.y + side.y * asymmetry * width + normal.y * edgeCurl,
      z: center.z + side.z * asymmetry * width + normal.z * edgeCurl,
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

  function lamellaNormal(index, t, s) {
    const beforeT = lamellaPoint(index, Math.max(0, t - 0.002), s);
    const afterT = lamellaPoint(index, Math.min(1, t + 0.002), s);
    const beforeS = lamellaPoint(index, t, Math.max(-1, s - 0.003));
    const afterS = lamellaPoint(index, t, Math.min(1, s + 0.003));
    const normal = normalize(cross(subtract(afterT, beforeT), subtract(afterS, beforeS)));
    // All authored centre-lines advance upward while their side basis advances
    // toward +x. A single deterministic sign keeps the nacre/specular planes
    // continuous across every fold instead of conditionally flipping normals.
    return { x: -normal.x, y: -normal.y, z: -normal.z };
  }

  function buildSovereignSeam(rows, columns) {
    const vertices = [];
    const indices = [];
    const stride = columns + 1;
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      const foldT = 0.13 + t * 0.79;
      const seamS = -0.34 + Math.sin(t * Math.PI * 2.15 - 0.55) * 0.14
        + Math.sin(t * Math.PI * 5.2) * 0.025;
      const halfParamWidth = 0.045 + Math.sin(Math.PI * t) * 0.040;
      for (let column = 0; column <= columns; column++) {
        const s = column / columns * 2 - 1;
        const foldS = seamS + s * halfParamWidth;
        const point = lamellaPoint(1, foldT, foldS);
        const normal = lamellaNormal(1, foldT, foldS);
        const lift = 0.145 + (1 - Math.abs(s)) * 0.008;
        vertices.push(
          point.x + normal.x * lift,
          point.y + normal.y * lift,
          point.z + normal.z * lift,
          normal.x, normal.y, normal.z,
          t, s, 1, 0,
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

  function buildSurface(longitudes, latitudes, inner = false) {
    if (inner) {
      return buildSovereignSeam(
        Math.max(42, Math.round(latitudes * 0.82)),
        Math.max(8, Math.round(longitudes * 0.075)),
      );
    }

    const rows = Math.max(48, latitudes);
    const columns = Math.max(18, Math.round(longitudes * 0.20));
    const stride = columns + 1;
    const faceCount = (rows + 1) * stride;
    const vertices = [];
    const indices = [];

    LAMELLAE.forEach((config, lamellaIndex) => {
      const baseVertex = vertices.length / 10;
      for (let row = 0; row <= rows; row++) {
        const t = row / rows;
        for (let column = 0; column <= columns; column++) {
          const s = column / columns * 2 - 1;
          const point = lamellaPoint(lamellaIndex, t, s);
          const normal = lamellaNormal(lamellaIndex, t, s);
          const thickness = config.thickness * (0.72 + Math.sin(Math.PI * t) * 0.28);
          vertices.push(
            point.x + normal.x * thickness, point.y + normal.y * thickness, point.z + normal.z * thickness,
            normal.x, normal.y, normal.z, t, s, lamellaIndex, 0,
          );
        }
      }
      for (let row = 0; row <= rows; row++) {
        const t = row / rows;
        for (let column = 0; column <= columns; column++) {
          const s = column / columns * 2 - 1;
          const point = lamellaPoint(lamellaIndex, t, s);
          const normal = lamellaNormal(lamellaIndex, t, s);
          const thickness = config.thickness * (0.72 + Math.sin(Math.PI * t) * 0.28);
          vertices.push(
            point.x - normal.x * thickness, point.y - normal.y * thickness, point.z - normal.z * thickness,
            -normal.x, -normal.y, -normal.z, t, s, lamellaIndex, 1,
          );
        }
      }

      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const a = baseVertex + row * stride + column;
          const b = a + 1;
          const c = a + stride;
          const d = c + 1;
          const backA = a + faceCount;
          const backB = b + faceCount;
          const backC = c + faceCount;
          const backD = d + faceCount;
          indices.push(a, c, b, b, c, d);
          indices.push(backA, backB, backC, backB, backD, backC);
        }
      }

      const bridge = (frontA, frontB) => {
        const backA = frontA + faceCount;
        const backB = frontB + faceCount;
        indices.push(frontA, frontB, backA, frontB, backB, backA);
      };
      for (let row = 0; row < rows; row++) {
        bridge(baseVertex + row * stride, baseVertex + (row + 1) * stride);
        bridge(baseVertex + row * stride + columns, baseVertex + (row + 1) * stride + columns);
      }
      for (let column = 0; column < columns; column++) {
        bridge(baseVertex + column, baseVertex + column + 1);
        bridge(baseVertex + rows * stride + column, baseVertex + rows * stride + column + 1);
      }
    });

    return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
  }

  function buildFibres() {
    const vertices = [];
    const count = coarse || lowCPU ? 26 : 44;
    const segments = 6;
    const quadraticPoint = (start, control, end, t) => {
      const q = 1 - t;
      return {
        x: q * q * start.x + 2 * q * t * control.x + t * t * end.x,
        y: q * q * start.y + 2 * q * t * control.y + t * t * end.y,
        z: q * q * start.z + 2 * q * t * control.z + t * t * end.z,
      };
    };
    for (let index = 0; index < count; index++) {
      const side = index % 2 ? -1 : 1;
      const verticalDirection = index % 4 < 2 ? 1 : -1;
      const lamellaIndex = index % LAMELLAE.length;
      const end = lamellaPoint(
        lamellaIndex,
        0.16 + hash(index + 41) * 0.70,
        (hash(index + 53) - 0.5) * 1.30,
      );
      const endNormal = lamellaNormal(lamellaIndex, 0.16 + hash(index + 41) * 0.70, 0);
      end.x += endNormal.x * 0.11;
      end.y += endNormal.y * 0.11;
      end.z += endNormal.z * 0.11;
      const start = {
        x: side * (3.15 + hash(index + 3) * 1.35),
        y: verticalDirection * (2.75 + hash(index + 17) * 1.45),
        z: -0.82 + hash(index + 29) * 1.75,
      };
      const control = {
        x: lerp(start.x, end.x, 0.48) - side * (0.28 + hash(index + 67) * 0.62),
        y: lerp(start.y, end.y, 0.48) + verticalDirection * (0.12 + hash(index + 71) * 0.46),
        z: lerp(start.z, end.z, 0.48) + (hash(index + 79) - 0.5) * 0.92,
      };
      const color = index % 11 === 0 ? 2 : index % 7 === 0 ? 1 : index % 5 === 0 ? 0 : 3;
      for (let segment = 0; segment < segments; segment++) {
        const a = quadraticPoint(start, control, end, segment / segments);
        const b = quadraticPoint(start, control, end, (segment + 1) / segments);
        const seed = (index + segment / segments * 0.42) / count;
        vertices.push(a.x, a.y, a.z, b.x, b.y, b.z, 0, color, seed);
        vertices.push(a.x, a.y, a.z, b.x, b.y, b.z, 1, color, seed);
      }
    }
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
    uniform float uReduced;

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

    void main() {
      vec2 uv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
      vec2 centered = uv - vec2(0.54, 0.49);
      centered.x *= uResolution.x / max(1.0, uResolution.y);
      float radius = length(centered);
      float movingTime = mix(uTime, 0.0, uReduced);
      float broadNoise = noise(centered * 2.8 + vec2(movingTime * 0.007, -movingTime * 0.004));
      float fineNoise = hash21(floor(gl_FragCoord.xy * 0.48) + floor(movingTime * 0.5));
      float mirrorHorizon = exp(-abs(uv.y - 0.145) * 44.0) * (1.0 - smoothstep(0.18, 0.92, radius));
      float brokenHorizon = mirrorHorizon * smoothstep(0.42, 0.72, broadNoise);
      float abyss = 1.0 - smoothstep(0.08, 1.16, radius);
      float woundField = exp(-dot(centered - vec2(0.025, 0.025), centered - vec2(0.025, 0.025)) * 3.8);
      float caustic = pow(max(0.0, sin(centered.x * 6.2 - centered.y * 4.4 + broadNoise * 4.0)), 12.0);
      caustic *= woundField * (0.025 + uCrown * 0.055);

      vec3 color = vec3(0.010, 0.009, 0.012);
      color += vec3(0.015, 0.012, 0.018) * abyss;
      color += vec3(0.055, 0.032, 0.030) * woundField * (0.10 + uPressure * 0.12 + uCrown * 0.18);
      color += vec3(1.0, 0.28, 0.23) * caustic;
      color += vec3(0.11, 0.095, 0.085) * mirrorHorizon * (0.12 + uReturn * 0.10);
      color += vec3(0.42, 0.17, 0.14) * brokenHorizon * (0.025 + uCrown * 0.035);
      color += (fineNoise - 0.5) * 0.006;
      color *= 1.0 - smoothstep(0.38, 1.18, radius) * 0.78;
      outColor = vec4(max(color, vec3(0.0)), 1.0);
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
      float movingTime = mix(uTime, 0.0, uReduced);
      float envelope = sin(clamp(aAlong, 0.0, 1.0) * 3.14159265);
      float lowAnchor = 1.0 - smoothstep(-2.72, -0.82, point.y);
      float breath = uGather * envelope * (0.018 + 0.012 * sin(aAlong * 8.0 + movingTime * 0.22));
      point += normal * breath * (1.0 - lowAnchor * 0.78);

      float compression = clamp(uPressure + uInversion * 0.16, 0.0, 1.0);
      point.x *= 1.0 - compression * (0.060 + aLamella * 0.010);
      point.y -= compression * 0.045 * (1.0 - lowAnchor * 0.86);
      point.z -= compression * (0.025 + envelope * 0.035);
      point = mix(point, vec3(point.x * 0.84, point.y * 0.955, point.z * 0.78), uSubtraction * 0.44);
      float resolvedWave = sin(aAlong * 12.0 + aAcross * 2.8 - movingTime * 0.30 + aLamella * 1.7);
      point += normal * resolvedWave * envelope * uReconstitution * 0.022;
      point += normal * envelope * uCrown * 0.018;

      float machineMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 1.0));
      float makerMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 2.0));
      float worldMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 3.0));
      float worldChange = uDetailMix;
      point.z += (aLamella - 1.0) * machineMask * worldChange * 0.18;
      point.x += (aLamella - 1.0) * machineMask * worldChange * 0.055;
      point.x += (aLamella - 0.85) * makerMask * worldChange * envelope * 0.12;
      point.y *= 1.0 + makerMask * worldChange * 0.035;
      point += normal * makerMask * worldChange * sin(aAlong * 6.283 + aLamella) * envelope * 0.040;
      float tectonicFacet = sign(sin(aAlong * 22.0 + aAcross * 4.4 + aLamella * 2.1));
      point += normal * worldMask * worldChange * tectonicFacet * envelope * 0.055;
      point.y -= worldMask * worldChange * smoothstep(0.0, 0.46, 1.0 - aAlong) * 0.10;

      if (uGhost > 0.5) {
        float mirrorPlane = -2.50;
        float sheetOffset = (aLamella - 1.0) * 0.13 + sin(aAlong * 7.0 + aLamella * 1.9) * 0.025;
        point.x = point.x * 0.965 - 0.10 + sheetOffset;
        point.y = mirrorPlane - (point.y - mirrorPlane) * 0.42 + (aLamella - 1.0) * 0.035;
        point.z -= 0.48 + aLamella * 0.045;
        normal = normalize(vec3(normal.x / 0.965, -normal.y / 0.42, normal.z));
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
      vec3 normal = gl_FrontFacing ? normalize(vNormal) : -normalize(vNormal);
      vec3 viewDirection = normalize(vec3(0.0, 0.0, 10.0) - vWorld);
      vec3 keyDirection = normalize(vec3(-0.48, 0.76, 0.44));
      vec3 rimDirection = normalize(vec3(0.34, -0.04, 0.94));
      float diffuse = max(0.0, dot(normal, keyDirection));
      float underLight = max(0.0, dot(normal, rimDirection));
      float fresnel = pow(1.0 - max(0.0, dot(normal, viewDirection)), 3.0);
      vec3 halfDirection = normalize(keyDirection + viewDirection);
      float specular = pow(max(0.0, dot(normal, halfDirection)), 46.0);
      float movingTime = mix(uTime, 0.0, uReduced);

      vec3 obsidian = vec3(0.010, 0.012, 0.019);
      vec3 graphite = vec3(0.050, 0.052, 0.070);
      vec3 ultramarine = vec3(0.030, 0.041, 0.118);
      vec3 bone = vec3(0.875, 0.824, 0.735);
      vec3 coral = vec3(0.910, 0.125, 0.135);
      vec3 cyan = vec3(0.0, 0.788, 0.910);
      vec3 emerald = vec3(0.078, 0.788, 0.545);
      vec3 violet = vec3(0.408, 0.251, 1.0);
      vec3 color;
      float alpha = 1.0;

      vec3 facetCoord = vec3(
        dot(vLocal, vec3(0.78, 0.18, -0.59)) * 1.12,
        dot(vLocal, vec3(-0.22, 0.92, 0.31)) * 0.76,
        dot(vLocal, vec3(0.42, 0.34, 0.84)) * 0.88
      );
      float facetTone = hash31(floor(facetCoord + vec3(vLamella * 1.73, vBack * 2.9, 0.0)));

      if (uMaterial < 0.5) {
        color = mix(obsidian, graphite, 0.22 + facetTone * 0.34);
        color *= 0.32 + diffuse * 0.76;
        color += ultramarine * fresnel * (0.13 + vLamella * 0.018);
        color += bone * specular * (0.23 + uReconstitution * 0.06);
        color *= mix(1.0, 0.56, clamp(vBack, 0.0, 1.0));

        float nacreA = smoothstep(0.15, 0.22, vAlong) * (1.0 - smoothstep(0.43, 0.52, vAlong));
        nacreA *= smoothstep(-0.92, -0.46, vAcross) * (1.0 - smoothstep(0.18, 0.54, vAcross));
        float nacreB = smoothstep(0.58, 0.66, vAlong) * (1.0 - smoothstep(0.82, 0.90, vAlong));
        nacreB *= smoothstep(-0.40, -0.02, vAcross) * (1.0 - smoothstep(0.70, 0.92, vAcross));
        float planeLight = max(nacreA * (0.30 + facetTone * 0.28), nacreB * (0.20 + (1.0 - facetTone) * 0.24));
        color += bone * planeLight * (0.050 + diffuse * 0.040 + uCrown * 0.018);

        float mineralSeam = pow(max(0.0, 1.0 - abs(sin(vAlong * 8.6 + vAcross * 1.8 + vLamella * 2.4))), 48.0);
        mineralSeam *= smoothstep(0.08, 0.24, vAlong) * (1.0 - smoothstep(0.78, 0.94, vAlong));
        color += bone * mineralSeam * (0.018 + fresnel * 0.035);
        float edge = smoothstep(0.88, 0.985, abs(vAcross));
        float serration = step(0.62, fract(vAlong * 19.0 + vLamella * 0.37));
        color += bone * edge * serration * (0.030 + fresnel * 0.055);

        float machineMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 1.0));
        float makerMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 2.0));
        float worldMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 3.0));
        float machineTrace = exp(-abs(vAcross + sin(vAlong * 7.0 + vLamella) * 0.12) * 38.0);
        machineTrace *= smoothstep(0.12, 0.24, vAlong) * (1.0 - smoothstep(0.70, 0.86, vAlong));
        float makerTrace = exp(-abs(vAcross - 0.28 + sin(vAlong * 4.4) * 0.10) * 34.0);
        makerTrace *= smoothstep(0.24, 0.36, vAlong) * (1.0 - smoothstep(0.82, 0.94, vAlong));
        float worldTrace = exp(-abs(vAlong - 0.31 - sin(vAcross * 2.8) * 0.045) * 44.0);
        worldTrace *= 1.0 - smoothstep(1.45, 2.15, vLamella);
        color += cyan * machineTrace * machineMask * uDetailMix * 0.17;
        color += emerald * makerTrace * makerMask * uDetailMix * 0.16;
        color += violet * worldTrace * worldMask * uDetailMix * 0.18;

        float rareInterference = pow(max(0.0, 1.0 - abs(sin(vAlong * 13.0 - vAcross * 2.3 + vLamella))), 72.0);
        color += mix(cyan, violet, smoothstep(0.0, 2.0, vLamella)) * rareInterference * fresnel * 0.024;
        color *= 1.0 - uSubtraction * (0.22 + facetTone * 0.10);
      } else if (uMaterial < 1.5) {
        float core = pow(clamp(1.0 - abs(vAcross), 0.0, 1.0), 5.0);
        float edgeGlow = smoothstep(0.18, 0.62, abs(vAcross)) * (1.0 - smoothstep(0.72, 0.98, abs(vAcross)));
        float fade = smoothstep(0.0, 0.09, vAlong) * (1.0 - smoothstep(0.91, 1.0, vAlong));
        color = mix(vec3(0.006, 0.005, 0.008), bone, core * 0.78);
        color += coral * edgeGlow * (0.055 + uPressure * 0.030 + uCrown * 0.035);
        color += bone * core * underLight * (0.08 + uReconstitution * 0.05);
        alpha = (0.10 + core * (0.72 + uCrown * 0.12)) * fade;
        alpha *= mix(1.0, 0.20, uGhost);
      } else {
        color = mix(obsidian, graphite, 0.18 + facetTone * 0.24);
        color += ultramarine * fresnel * 0.11;
        color += bone * specular * 0.08;
        float reflectionFade = smoothstep(-5.45, -2.42, vWorld.y);
        float ghostGrain = hash31(floor(facetCoord * 2.3 + vec3(floor(movingTime * 0.08))));
        alpha = (0.058 + fresnel * 0.145 + uSubtraction * 0.038)
          * (0.82 + ghostGrain * 0.18) * reflectionFade;
      }

      float selectedPulse = 0.5 + 0.5 * sin(movingTime * 1.12 + uActiveSub * 1.9);
      color += coral * uDetailMix * selectedPulse * 0.006;
      color += vec3(0.008, 0.007, 0.012) * uReturn;
      color = pow(max(color, vec3(0.0)), vec3(0.92));
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
    layout(location=2) in float aEndPoint;
    layout(location=3) in float aColorIndex;
    layout(location=4) in float aSeed;
    uniform mat4 uProjection;
    uniform vec4 uOrientation;
    uniform vec2 uScreenShift;
    uniform vec2 uViewportScale;
    uniform float uCameraZ;
    uniform float uReturn;
    uniform float uCrown;
    uniform float uTime;
    uniform float uReduced;
    out vec3 vColor;
    out float vAlpha;
    vec3 rotateY(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c-p.z*s,p.y,p.x*s+p.z*c);}
    vec3 rotateX(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);}
    vec3 rotateZ(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c-p.y*s,p.x*s+p.y*c,p.z);}
    void main(){
      float movingTime=mix(uTime,0.0,uReduced);
      float stagger=clamp((uReturn-aSeed*0.42)*1.72,0.0,1.0);
      float crownMemory=(1.0-smoothstep(0.24,0.29,aSeed))*uCrown;
      float reveal=max(stagger,crownMemory*0.62);
      vec3 end=mix(aStart,aEnd,reveal);
      end.x+=sin(movingTime*0.24+aSeed*18.0)*0.12*reveal;
      vec3 point=mix(aStart,end,aEndPoint);
      point.xy*=uViewportScale;
      point*=uOrientation.w;
      point=rotateZ(rotateX(rotateY(point,uOrientation.x),uOrientation.y),uOrientation.z);
      vec4 clip=uProjection*vec4(point+vec3(0.0,0.0,-uCameraZ),1.0);
      clip.xy+=uScreenShift*clip.w;
      gl_Position=clip;
      vec3 cyan=vec3(0.0,0.788,0.910),green=vec3(0.078,0.788,0.545),violet=vec3(0.408,0.251,1.0),bone=vec3(0.914,0.890,0.835);
      vColor=aColorIndex<0.5?cyan:(aColorIndex<1.5?green:(aColorIndex<2.5?violet:bone));
      float returnAlpha=stagger*(aEndPoint>0.5?0.54:0.18)*(1.0-uReturn*0.22);
      float memoryAlpha=crownMemory*(aEndPoint>0.5?0.26:0.08);
      vAlpha=max(returnAlpha,memoryAlpha);
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
    const stride = 10 * Float32Array.BYTES_PER_ELEMENT;
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
    const fibreStride = 9 * Float32Array.BYTES_PER_ELEMENT;
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
      fibreCount: fibreData.length / 9,
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
    uniform1(program, 'uReduced', reducedMotion ? 1 : 0);
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
    if (state.return <= 0.006 && state.crown <= 0.025) return;
    const program = resources.fibreProgram;
    gl.useProgram(program);
    setProjectionUniforms(program, currentOrientation(Boolean(activeWorld), false), Boolean(activeWorld));
    uniform1(program, 'uReturn', state.return);
    uniform1(program, 'uCrown', state.crown);
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
    drawSurfaceGL(resources.outer, 2, state, ghostOrientation, true);
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

  function fallbackBodyPath(context, scale) {
    const path = new Path2D();
    // Long rising blade: load-bearing, open at both crown and keel.
    path.moveTo(-0.86 * scale, 3.14 * scale);
    path.bezierCurveTo(-2.18 * scale, 2.34 * scale, -2.54 * scale, -0.46 * scale, -1.10 * scale, -2.74 * scale);
    path.bezierCurveTo(-0.91 * scale, -2.92 * scale, -0.62 * scale, -2.82 * scale, -0.49 * scale, -2.50 * scale);
    path.bezierCurveTo(-1.18 * scale, -1.10 * scale, -1.06 * scale, 0.46 * scale, -0.20 * scale, 2.66 * scale);
    path.bezierCurveTo(-0.30 * scale, 2.98 * scale, -0.58 * scale, 3.18 * scale, -0.86 * scale, 3.14 * scale);
    path.closePath();

    // Counter-rotated sail: shorter, narrower and deliberately misregistered.
    path.moveTo(0.76 * scale, 2.28 * scale);
    path.bezierCurveTo(1.82 * scale, 1.48 * scale, 2.04 * scale, -0.34 * scale, 1.20 * scale, -1.92 * scale);
    path.bezierCurveTo(1.00 * scale, -2.22 * scale, 0.68 * scale, -2.36 * scale, 0.48 * scale, -2.08 * scale);
    path.bezierCurveTo(1.04 * scale, -0.88 * scale, 1.03 * scale, 0.48 * scale, 0.36 * scale, 1.88 * scale);
    path.bezierCurveTo(0.44 * scale, 2.14 * scale, 0.61 * scale, 2.29 * scale, 0.76 * scale, 2.28 * scale);
    path.closePath();

    // Grounding keel: a third, low diagonal fold rather than a shared root.
    path.moveTo(-1.62 * scale, -1.96 * scale);
    path.bezierCurveTo(-0.72 * scale, -2.44 * scale, 0.34 * scale, -2.20 * scale, 1.30 * scale, -1.32 * scale);
    path.bezierCurveTo(1.42 * scale, -1.16 * scale, 1.28 * scale, -0.98 * scale, 1.02 * scale, -1.00 * scale);
    path.bezierCurveTo(0.18 * scale, -1.60 * scale, -0.72 * scale, -1.78 * scale, -1.74 * scale, -1.66 * scale);
    path.bezierCurveTo(-1.88 * scale, -1.72 * scale, -1.82 * scale, -1.90 * scale, -1.62 * scale, -1.96 * scale);
    path.closePath();
    return path;
  }

  function fallbackWoundPath(scale) {
    const path = new Path2D();
    path.moveTo(-0.20 * scale, 2.58 * scale);
    path.bezierCurveTo(0.10 * scale, 2.24 * scale, 0.42 * scale, 2.06 * scale, 0.70 * scale, 1.74 * scale);
    path.bezierCurveTo(0.49 * scale, 1.18 * scale, 0.92 * scale, 0.62 * scale, 0.66 * scale, 0.06 * scale);
    path.bezierCurveTo(0.48 * scale, -0.36 * scale, 0.86 * scale, -0.92 * scale, 0.70 * scale, -1.54 * scale);
    path.bezierCurveTo(0.62 * scale, -1.74 * scale, 0.38 * scale, -1.92 * scale, 0.10 * scale, -2.08 * scale);
    return path;
  }

  function fallbackLayout(detail = false, state = cycleState(elapsed)) {
    const shift = screenShift(detail);
    const compact = isCompactLayout();
    const artifactWidth = width * (compact ? 0.82 : 0.61);
    const artifactHeight = height * (compact ? 0.64 : 0.79);
    const orientation = currentOrientation(detail);
    const scale = Math.min(artifactWidth / 7.4, artifactHeight / 6.55) * orientation.zoom;
    return {
      centerX: width * (0.5 + shift.x * 0.5),
      centerY: height * (0.5 - shift.y * 0.5),
      scale,
      orientation,
      angle: orientation.roll + orientation.yaw * 0.045,
      scaleX: (1 - state.pressure * 0.105 - state.subtraction * 0.08)
        * (0.94 + Math.cos(orientation.yaw) * 0.06),
      scaleY: 1 - state.pressure * 0.035,
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

  function renderFallback(state) {
    const context = fallbackContext;
    if (!context) return;
    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = '#050405';
    context.fillRect(0, 0, width, height);
    const layout = fallbackLayout(Boolean(activeWorld), state);
    const { centerX, centerY, scale, orientation } = layout;

    context.translate(centerX, centerY);
    context.rotate(layout.angle);
    context.scale(layout.scaleX, layout.scaleY);
    const body = fallbackBodyPath(context, scale);
    const wound = fallbackWoundPath(scale);

    context.save();
    context.beginPath();
    context.rect(-scale * 4.1, scale * 2.24, scale * 8.2, scale * 4.2);
    context.clip();
    context.translate(-scale * 0.12, scale * 3.626);
    context.scale(0.97, -0.48);
    context.globalAlpha = 0.075 + state.subtraction * 0.05;
    const ghostGradient = context.createLinearGradient(-scale * 2, -scale * 3, scale * 2, scale * 3);
    ghostGradient.addColorStop(0, '#242127');
    ghostGradient.addColorStop(1, '#08070a');
    context.fillStyle = ghostGradient;
    context.fill(body);
    context.globalAlpha = 0.10 + state.crown * 0.045;
    context.lineWidth = Math.max(0.45, scale * 0.010);
    context.strokeStyle = '#d9c9ad';
    context.stroke(wound);
    context.restore();

    const mineralGradient = context.createLinearGradient(-scale * 2.8, -scale * 3.1, scale * 2.5, scale * 2.8);
    mineralGradient.addColorStop(0, '#03050a');
    mineralGradient.addColorStop(0.30, '#10131f');
    mineralGradient.addColorStop(0.56, '#262736');
    mineralGradient.addColorStop(0.68, '#111421');
    mineralGradient.addColorStop(1, '#020307');
    context.globalAlpha = 1 - state.subtraction * 0.28;
    context.fillStyle = mineralGradient;
    context.fill(body);

    context.save();
    context.clip(body);
    context.globalAlpha = 0.045 + state.crown * 0.020;
    context.fillStyle = '#e2d3bc';
    context.beginPath();
    context.moveTo(-2.22 * scale, 1.72 * scale);
    context.lineTo(-0.34 * scale, 2.56 * scale);
    context.lineTo(-0.72 * scale, 0.28 * scale);
    context.lineTo(-2.40 * scale, -0.38 * scale);
    context.closePath();
    context.fill();
    context.globalAlpha = 0.032 + state.reconstitution * 0.018;
    context.fillStyle = '#3a4c98';
    context.beginPath();
    context.moveTo(0.52 * scale, 1.84 * scale);
    context.lineTo(1.66 * scale, 0.96 * scale);
    context.lineTo(1.18 * scale, -0.84 * scale);
    context.lineTo(0.72 * scale, 0.12 * scale);
    context.closePath();
    context.fill();
    context.globalAlpha = 0.12 + state.crown * 0.045;
    context.lineWidth = Math.max(0.45, scale * 0.009);
    context.strokeStyle = '#cbbda8';
    context.beginPath();
    context.moveTo(-1.82 * scale, 0.86 * scale);
    context.bezierCurveTo(-1.12 * scale, 0.34 * scale, -1.34 * scale, -0.80 * scale, -0.74 * scale, -1.72 * scale);
    context.stroke();
    context.restore();

    if (activeWorld && viewMix > 0.24) {
      context.save();
      context.clip(body);
      context.globalAlpha = ease(viewMix) * 0.20;
      context.lineWidth = Math.max(0.55, scale * 0.012);
      if (activeWorld === 'machine') {
        context.strokeStyle = '#00c9e8';
        context.beginPath();
        context.moveTo(-1.62 * scale, 1.58 * scale);
        context.lineTo(-0.42 * scale, -1.92 * scale);
        context.moveTo(0.64 * scale, 1.42 * scale);
        context.lineTo(1.18 * scale, -1.30 * scale);
        context.stroke();
      } else if (activeWorld === 'maker') {
        context.strokeStyle = '#14c98b';
        context.beginPath();
        context.moveTo(0.48 * scale, 1.64 * scale);
        context.bezierCurveTo(1.20 * scale, 0.88 * scale, 0.62 * scale, -0.08 * scale, 1.10 * scale, -1.46 * scale);
        context.moveTo(-1.42 * scale, -0.26 * scale);
        context.bezierCurveTo(-0.92 * scale, -0.82 * scale, -0.42 * scale, -1.62 * scale, 0.82 * scale, -1.72 * scale);
        context.stroke();
      } else {
        context.strokeStyle = '#6840ff';
        context.beginPath();
        context.moveTo(-1.58 * scale, -2.30 * scale);
        context.lineTo(-0.54 * scale, -2.52 * scale);
        context.lineTo(0.40 * scale, -2.14 * scale);
        context.lineTo(1.20 * scale, -1.52 * scale);
        context.moveTo(-1.34 * scale, 0.92 * scale);
        context.lineTo(-0.70 * scale, 0.50 * scale);
        context.lineTo(-1.10 * scale, -0.04 * scale);
        context.stroke();
      }
      context.restore();
    }

    context.save();
    context.shadowColor = 'rgba(219,164,114,.22)';
    context.shadowBlur = scale * (0.055 + state.crown * 0.025);
    context.globalAlpha = 0.075 + state.crown * 0.035 + state.pressure * 0.025;
    context.lineWidth = Math.max(0.8, scale * 0.022);
    context.strokeStyle = '#9f2528';
    context.stroke(wound);
    context.shadowBlur = 0;
    context.globalAlpha = 0.68 + state.reconstitution * 0.14;
    context.lineWidth = Math.max(0.65, scale * 0.011);
    context.strokeStyle = '#eadcc3';
    context.stroke(wound);
    context.restore();

    if (state.return > 0.01 || state.crown > 0.025) {
      context.lineWidth = Math.max(0.65, scale * 0.0065);
      for (let index = 0; index < 28; index++) {
        const crownMemory = index < 11 ? state.crown * 0.36 : 0;
        const reveal = Math.max(state.return, crownMemory);
        if (reveal <= 0.006) continue;
        context.globalAlpha = state.return > crownMemory ? state.return * 0.46 : crownMemory * 0.62;
        const side = index % 2 ? -1 : 1;
        const verticalDirection = index % 4 < 2 ? 1 : -1;
        const startX = side * scale * (3.02 + hash(index + 4) * 1.08);
        const startY = verticalDirection * scale * (2.68 + hash(index + 8) * 1.16);
        const lamella = index % 3;
        const anchorX = scale * (lamella === 0 ? -1.30 : lamella === 1 ? 1.04 : -0.20)
          + side * scale * (hash(index + 12) - 0.5) * 0.22;
        const anchorY = scale * (-1.98 + hash(index + 19) * 4.22);
        const endX = lerp(startX, anchorX, reveal);
        const endY = lerp(startY, anchorY, reveal);
        context.strokeStyle = index % 11 === 0 ? '#6840ff' : index % 7 === 0 ? '#00c9e8' : index % 13 === 0 ? '#14c98b' : '#e9e3d6';
        context.beginPath();
        context.moveTo(startX, startY);
        context.quadraticCurveTo(
          lerp(startX, endX, 0.46) - side * scale * 0.38 * reveal,
          lerp(startY, endY, 0.46) - verticalDirection * scale * 0.22 * reveal,
          endX,
          endY,
        );
        context.stroke();
      }
    }
    context.restore();

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
    const worldY = height * (mobile ? 0.80 : 0.895);
    const subY = height * (mobile ? 0.775 : 0.875);
    const overviewInteractive = !activeWorld || mix <= 0.05;
    worldKeys.forEach((key, index) => {
      const element = labels[key];
      if (!element) return;
      element.style.left = `${width * (mobile ? (index + 0.5) / 3 : 0.31 + index * 0.19)}px`;
      element.style.top = `${worldY}px`;
      element.style.opacity = String(clamp(1 - mix * 2.1, 0, 1));
      element.style.pointerEvents = overviewInteractive ? 'auto' : 'none';
      element.tabIndex = overviewInteractive ? 0 : -1;
      element.setAttribute('aria-hidden', String(!overviewInteractive));
    });

    if (unityLabel) {
      unityLabel.style.left = `${width * (mobile ? 0.5 : 0.5375)}px`;
      unityLabel.style.top = `${height * (mobile ? 0.718 : 0.815)}px`;
      unityLabel.style.opacity = String(clamp(1 - mix * 2.2, 0, 1));
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
        overviewRoll = clamp(pinchState.overviewRoll + rotation, -0.10, 0.10);
        overviewYaw = clamp(pinchState.overviewYaw - midDx * 0.0024, -0.68, 0.52);
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
        overviewYaw = clamp(overviewYaw - dx * 0.0042, -0.68, 0.52);
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
        overviewYaw = -0.34;
        overviewPitch = -0.08;
        overviewRoll = -0.035;
        overviewZoom = 0.84;
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
        overviewYaw = clamp(overviewYaw + overviewYawVelocity * dt, -0.68, 0.52);
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
