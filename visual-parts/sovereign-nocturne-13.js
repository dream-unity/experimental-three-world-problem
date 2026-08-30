(() => {
  'use strict';

  const RENDERER_ID = 'sovereign-nocturne';
  const RENDERER_VERSION = '20260830-sovereign-nocturne-1';
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

  let overviewYaw = -0.18;
  let overviewPitch = -0.055;
  let overviewRoll = -0.018;
  let overviewZoom = 0.91;
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
    machine: { x: -2.34, y: 0.98, z: 1.40 },
    maker: { x: 2.42, y: 0.28, z: 1.31 },
    reality: { x: 0.34, y: -1.78, z: 1.34 },
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
      zoom: lerp(overview.zoom, detailZoom * 1.13, mix),
    };
  }

  function screenShift(detail = false) {
    const mix = detail ? ease(viewMix) : 0;
    if (isCompactLayout()) return { x: 0, y: lerp(0.015, 0.035, mix) };
    return { x: lerp(0.075, -0.018, mix), y: lerp(0, 0.015, mix) };
  }

  function isCompactLayout() {
    return width <= 760 || width / Math.max(1, height) < 0.95;
  }

  function viewportShapeScale() {
    const aspect = Math.max(0.25, width / Math.max(1, height));
    const targetWidth = lerp(0.93, 0.65, smoothstep(0.75, 1.30, aspect));
    const compactMantleCompensation = lerp(1.26, 1, smoothstep(0.75, 1.30, aspect));
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

  function woundCenter(y) {
    return 0.12 + Math.sin(y * 1.08 - 0.22) * 0.42 + Math.sin(y * 3.35 + 0.65) * 0.055;
  }

  function woundAmount(point) {
    const front = smoothstep(0.18, 1.18, point.z);
    const vertical = Math.abs((point.y + 0.02) / 1.62);
    const taper = Math.pow(clamp(1 - vertical, 0, 1), 0.58);
    const halfWidth = 0.34 + taper * 0.43;
    const lateral = Math.abs(point.x - woundCenter(point.y)) / halfWidth;
    const torn = Math.pow(lateral, 1.58) + Math.pow(vertical, 3.15)
      + Math.sin(point.y * 4.25 - point.x * 1.4) * 0.026
      + Math.sin(point.y * 7.1 + 0.8) * 0.014;
    return (1 - smoothstep(0.72, 1.04, torn)) * front;
  }

  function bodyPoint(u, v, inner = false) {
    const theta = ((u % 1) + 1) % 1 * TAU;
    const phi = clamp(v, 0, 1) * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const corrugation = 1
      + 0.030 * Math.sin(theta * 3 + phi * 1.8)
      + 0.015 * Math.sin(theta * 7 - phi * 2.4);
    const shoulder = 1 + 0.14 * Math.sin(phi * 1.35 - 0.55) * Math.sin(theta + 0.8);
    let x = 3.75 * sinPhi * Math.cos(theta) * corrugation * shoulder;
    let y = 3.05 * cosPhi
      + 0.24 * Math.sin(theta * 1.7 + 0.5) * sinPhi * sinPhi
      - 0.12 * Math.sin(phi * 3.2);
    let z = 1.65 * sinPhi * Math.sin(theta)
      * (1 + 0.11 * Math.cos(theta * 2 - phi));

    const lower = smoothstep(0.60, 0.96, v);
    x *= 1 + lower * (0.11 + 0.04 * Math.sin(theta * 2.0));
    z *= 1 + lower * 0.12;
    y -= lower * 0.24;
    y += 0.24 * Math.sin(phi * 1.7 + theta * 0.55) * sinPhi;
    const mantleFold = sinPhi * sinPhi * (0.67 * Math.sin(theta * 1.45 + 0.72) + 0.34 * Math.sin(theta * 3.3 - phi));
    x += 0.32 * Math.sin(phi * 2.1 + 0.4) - 0.18 * lower + mantleFold;
    y += 0.42 * Math.sin(theta + 0.42) * sinPhi * sinPhi;
    z += 0.24 * Math.sin(phi * 2.8 - theta * 0.7) * sinPhi;

    // One authored mantle warp: a high sheared crown, bitten right shoulder,
    // and a dense lower-left anchor. These affect silhouette, not surface noise.
    const normalizedY = clamp(y / 3.05, -1, 1);
    const upper = smoothstep(0.18, 0.90, normalizedY);
    const right = smoothstep(0.02, 0.88, x / 3.75);
    const left = smoothstep(0.02, 0.82, -x / 3.75);
    x += normalizedY * 0.46;
    x -= upper * right * 0.38;
    y -= upper * right * 0.22;
    x -= lower * left * 0.46;
    y -= lower * left * 0.12;

    const preliminary = { x, y, z };
    const wound = woundAmount(preliminary);
    if (inner) {
      const center = woundCenter(y);
      x = center + (x - center) * 0.54;
      y = y * 0.68 - 0.04;
      z = z * 0.30 - 0.35 - wound * 0.10;
    } else {
      const lip = smoothstep(0.08, 0.54, wound) * (1 - smoothstep(0.66, 0.94, wound));
      z -= wound * (0.82 + 0.13 * Math.sin(y * 3.2)) + lip * 0.16;
      x += Math.sign(x - woundCenter(y) || 1) * lip * 0.16;
      y -= wound * 0.06;
    }
    return { position: { x, y, z }, wound };
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

  function buildSurface(longitudes, latitudes, inner = false) {
    const stride = longitudes + 1;
    const vertices = [];
    for (let row = 0; row <= latitudes; row++) {
      const v = row / latitudes;
      for (let column = 0; column <= longitudes; column++) {
        const u = column / longitudes;
        const sample = bodyPoint(u, v, inner);
        const du = 0.0015;
        const dv = 0.0015;
        const beforeU = bodyPoint(u - du, v, inner).position;
        const afterU = bodyPoint(u + du, v, inner).position;
        const beforeV = bodyPoint(u, Math.max(0, v - dv), inner).position;
        const afterV = bodyPoint(u, Math.min(1, v + dv), inner).position;
        let normal = normalize(cross(subtract(afterV, beforeV), subtract(afterU, beforeU)));
        if (v < 0.0001 || v > 0.9999) normal = normalize(sample.position);
        if (normal.x * sample.position.x + normal.y * sample.position.y + normal.z * sample.position.z < 0) {
          normal = { x: -normal.x, y: -normal.y, z: -normal.z };
        }
        vertices.push(
          sample.position.x, sample.position.y, sample.position.z,
          normal.x, normal.y, normal.z,
          sample.wound,
        );
      }
    }

    const indices = [];
    for (let row = 0; row < latitudes; row++) {
      for (let column = 0; column < longitudes; column++) {
        const a = row * stride + column;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint32Array(indices),
    };
  }

  function buildFibres() {
    const vertices = [];
    const count = coarse || lowCPU ? 20 : 32;
    for (let index = 0; index < count; index++) {
      const side = index % 2 ? -1 : 1;
      const start = {
        x: 0.14 + side * (0.18 + hash(index + 3) * 0.72),
        y: 0.84 + hash(index + 17) * 1.36,
        z: 1.12 + hash(index + 29) * 0.32,
      };
      const end = {
        x: start.x + side * (0.54 + hash(index + 41) * 1.65),
        y: start.y + 1.16 + hash(index + 53) * 1.92,
        z: start.z - 0.34 - hash(index + 67) * 1.14,
      };
      const color = index % 11 === 0 ? 2 : index % 7 === 0 ? 1 : index % 5 === 0 ? 0 : 3;
      vertices.push(start.x, start.y, start.z, end.x, end.y, end.z, 0, color, index / count);
      vertices.push(start.x, start.y, start.z, end.x, end.y, end.z, 1, color, index / count);
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
    layout(location=2) in float aWound;
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
    uniform float uGhost;
    uniform float uReduced;
    out vec3 vWorld;
    out vec3 vLocal;
    out vec3 vNormal;
    out float vWound;
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
      float lowAnchor = 1.0 - smoothstep(-2.70, -0.55, point.y);
      float breath = uGather * (0.030 + 0.018 * sin(point.y * 2.1 + movingTime * 0.28));
      point += normal * breath * (1.0 - lowAnchor * 0.72);
      float compression = clamp(uPressure + uInversion * 0.18, 0.0, 1.0);
      point.x *= 1.0 - compression * (0.105 + aWound * 0.075);
      point.y -= compression * (0.055 + aWound * 0.065) * (1.0 - lowAnchor * 0.82);
      point.z -= compression * aWound * 0.43;
      point = mix(point, vec3(point.x * 0.79, point.y * 0.94, point.z * 0.70), uSubtraction * 0.48);
      float resolvedWave = sin(point.y * 3.3 + point.x * 1.7 - movingTime * 0.34);
      point += normal * resolvedWave * uReconstitution * (0.026 + aWound * 0.042);
      point += normal * uCrown * aWound * 0.055;

      if (uGhost > 0.5) {
        float mirrorPlane = -2.45;
        point.x = point.x * 0.97 - 0.12;
        point.y = mirrorPlane - (point.y - mirrorPlane) * 0.48;
        point.z -= 0.54;
        normal = normalize(vec3(normal.x / 0.97, -normal.y / 0.48, normal.z));
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
      vWound = aWound;
      vDepth = clip.w;
    }
  `;

  const SURFACE_FRAGMENT = `#version 300 es
    precision highp float;
    in vec3 vWorld;
    in vec3 vLocal;
    in vec3 vNormal;
    in float vWound;
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
    uniform float uReduced;

    float hash31(vec3 point) {
      point = fract(point * 0.1031);
      point += dot(point, point.yzx + 33.33);
      return fract((point.x + point.y) * point.z);
    }
    float valueNoise(vec3 point) {
      vec3 cell = floor(point);
      vec3 local = fract(point);
      local = local * local * (3.0 - 2.0 * local);
      float n000 = hash31(cell);
      float n100 = hash31(cell + vec3(1.0,0.0,0.0));
      float n010 = hash31(cell + vec3(0.0,1.0,0.0));
      float n110 = hash31(cell + vec3(1.0,1.0,0.0));
      float n001 = hash31(cell + vec3(0.0,0.0,1.0));
      float n101 = hash31(cell + vec3(1.0,0.0,1.0));
      float n011 = hash31(cell + vec3(0.0,1.0,1.0));
      float n111 = hash31(cell + vec3(1.0,1.0,1.0));
      return mix(
        mix(mix(n000,n100,local.x),mix(n010,n110,local.x),local.y),
        mix(mix(n001,n101,local.x),mix(n011,n111,local.x),local.y),
        local.z
      );
    }

    float analyticalWound(vec3 point) {
      float front = smoothstep(-0.15, 0.45, point.z);
      float vertical = abs((point.y + 0.02) / 1.62);
      float taper = pow(clamp(1.0 - vertical, 0.0, 1.0), 0.58);
      float halfWidth = 0.34 + taper * 0.43;
      float center = 0.12 + sin(point.y * 1.08 - 0.22) * 0.42
        + sin(point.y * 3.35 + 0.65) * 0.055;
      float lateral = abs(point.x - center) / halfWidth;
      float torn = pow(lateral, 1.58) + pow(vertical, 3.15)
        + sin(point.y * 4.25 - point.x * 1.4) * 0.026
        + sin(point.y * 7.1 + 0.8) * 0.014;
      return (1.0 - smoothstep(0.72, 1.04, torn)) * front;
    }

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDirection = normalize(vec3(0.0, 0.0, 10.0) - vWorld);
      vec3 keyDirection = normalize(vec3(-0.42, 0.72, 0.52));
      vec3 coralDirection = normalize(vec3(0.30, 0.08, 0.95));
      float diffuse = max(0.0, dot(normal, keyDirection));
      float innerLight = max(0.0, dot(normal, coralDirection));
      float fresnel = pow(1.0 - max(0.0, dot(normal, viewDirection)), 3.2);
      vec3 halfDirection = normalize(keyDirection + viewDirection);
      float specular = pow(max(0.0, dot(normal, halfDirection)), 28.0);
      float macroNoise = valueNoise(vLocal * 0.82 + vec3(1.7, 4.1, 0.6));
      float mineralNoise = valueNoise(vLocal * 2.35 + macroNoise * 1.8);
      float strataPhase = vLocal.y * 3.35 + vLocal.x * 0.72 - vLocal.z * 1.45 + macroNoise * 4.2;
      float strata = pow(max(0.0, 1.0 - abs(sin(strataPhase))), 14.0);
      float crossStrata = pow(max(0.0, 1.0 - abs(sin(vLocal.y * 1.2 - vLocal.x * 2.8 + macroNoise * 3.1))), 24.0);
      float fragmentWound = uMaterial > 0.5 && uMaterial < 1.5 ? vWound : analyticalWound(vLocal);
      float woundSoftness = max(fwidth(fragmentWound) * 1.25, 0.003);
      float opening = smoothstep(0.595 - woundSoftness, 0.665 + woundSoftness, fragmentWound);
      float woundRim = smoothstep(0.20, 0.50, fragmentWound) * (1.0 - smoothstep(0.54, 0.68, fragmentWound));
      float movingTime = mix(uTime, 0.0, uReduced);
      vec3 abyss = vec3(0.018, 0.016, 0.021);
      vec3 mineral = vec3(0.195, 0.182, 0.215);
      vec3 bone = vec3(0.840, 0.790, 0.700);
      vec3 coral = vec3(1.0, 0.305, 0.335);
      vec3 furnace = vec3(1.0, 0.455, 0.37);
      vec3 cyan = vec3(0.0, 0.788, 0.910);
      vec3 emerald = vec3(0.078, 0.788, 0.545);
      vec3 violet = vec3(0.408, 0.251, 1.0);
      vec3 color;
      float alpha = 1.0;

      if (uMaterial < 0.5) {
        alpha = 1.0 - opening;
        if (alpha < 0.012) discard;
        float boneDeposit = strata * (0.48 + mineralNoise * 0.34) + crossStrata * 0.16;
        boneDeposit *= 0.46 + 0.54 * smoothstep(-3.05, 1.92, vLocal.y);
        color = mix(abyss, mineral, 0.28 + diffuse * 0.32 + macroNoise * 0.060);
        color += vec3(0.045, 0.055, 0.140) * (0.10 + fresnel * 0.20 + macroNoise * 0.035);
        color += vec3(0.165, 0.145, 0.150) * specular * (0.26 + uReconstitution * 0.12);
        color = mix(color, bone, boneDeposit * (0.095 + diffuse * 0.105 + uCrown * 0.030));
        float suture = pow(max(0.0, 1.0 - abs(sin(vLocal.y * 10.8 - vLocal.x * 3.2 + macroNoise))), 22.0);
        color += coral * woundRim * (0.185 + uPressure * 0.21 + uCrown * 0.28);
        color += bone * woundRim * suture * (0.24 + uReconstitution * 0.14);
        color += bone * fresnel * (0.052 + uReconstitution * 0.038);

        float machineMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 1.0));
        float makerMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 2.0));
        float worldMask = 1.0 - smoothstep(0.16, 0.42, abs(uActiveWorld - 3.0));
        float axialTrace = exp(-abs(vLocal.x + vLocal.y * 0.24 + 0.92) * 10.5)
          * smoothstep(-1.8, 1.8, vLocal.y);
        float tensileTrace = exp(-abs(vLocal.y + vLocal.x * 0.46 - 0.28) * 9.5)
          * smoothstep(-2.5, 1.4, vLocal.x);
        float tectonicTrace = exp(-abs(vLocal.y + 1.46 + sin(vLocal.x * 1.55) * 0.13) * 11.5);
        color += cyan * axialTrace * machineMask * uDetailMix * 0.075;
        color += emerald * tensileTrace * makerMask * uDetailMix * 0.068;
        color += violet * tectonicTrace * worldMask * uDetailMix * 0.082;
        float ambientInterference = pow(max(0.0, 1.0 - abs(sin(vLocal.y * 5.7 + vLocal.x * 1.8 - vLocal.z * 3.4))), 34.0);
        color += mix(cyan, violet, smoothstep(-1.2, 1.2, vLocal.x)) * ambientInterference * fresnel * 0.018;
        float dissolve = hash31(floor(vLocal * 17.0) + vec3(3.0, 11.0, 7.0));
        float subtractField = uSubtraction * (0.26 + 0.40 * smoothstep(-1.65, 2.35, vLocal.y));
        if (dissolve < subtractField) discard;
      } else if (uMaterial < 1.5) {
        float throat = smoothstep(0.34, 0.88, fragmentWound);
        float caustic = pow(max(0.0, 1.0 - abs(sin(vLocal.y * 5.2 - vLocal.x * 3.6 + macroNoise * 3.2 + movingTime * 0.12))), 20.0);
        float fineCaustic = pow(max(0.0, 1.0 - abs(sin(vLocal.y * 9.4 + vLocal.x * 2.1 - macroNoise * 2.4))), 34.0);
        vec3 oxblood = vec3(0.095, 0.014, 0.022);
        vec3 throatBlack = vec3(0.010, 0.004, 0.008);
        color = mix(oxblood, throatBlack, throat * 0.90);
        color += coral * caustic * (1.0 - throat * 0.70) * (0.11 + uCrown * 0.10 + uPressure * 0.045);
        color += bone * fineCaustic * (1.0 - throat * 0.82) * (0.055 + uReconstitution * 0.065);
        color += furnace * innerLight * (0.028 + uReconstitution * 0.025);
        float sovereignCurve = 0.08 + sin(vLocal.y * 1.48 - 0.24) * 0.24;
        float sovereignRay = exp(-abs(vLocal.x - sovereignCurve) * 58.0)
          * smoothstep(-1.24, -0.92, vLocal.y) * (1.0 - smoothstep(0.92, 1.24, vLocal.y));
        color += mix(coral, bone, 0.72) * sovereignRay * (0.54 + uCrown * 0.20 + uReconstitution * 0.10);
        color *= 0.78 + diffuse * 0.10 + fresnel * 0.09;
      } else {
        if (vLocal.y < -2.54) discard;
        float ghostGrain = valueNoise(vLocal * 4.2 + vec3(0.0, movingTime * 0.018, 0.0));
        color = mix(vec3(0.040, 0.037, 0.045), vec3(0.25, 0.23, 0.24), fresnel * 0.34 + ghostGrain * 0.07);
        color += coral * woundRim * (0.095 + uCrown * 0.095);
        color += bone * woundRim * strata * 0.065;
        float reflectionFade = smoothstep(-5.6, -2.42, vWorld.y);
        alpha = (0.052 + fresnel * 0.110 + uSubtraction * 0.045)
          * (0.84 + ghostGrain * 0.16) * reflectionFade * (1.0 - opening);
      }

      float selectedPulse = 0.5 + 0.5 * sin(movingTime * 1.35 + uActiveSub * 1.9);
      color += coral * uDetailMix * selectedPulse * 0.008;
      color += vec3(0.010, 0.008, 0.012) * uReturn;
      color = max(color, vec3(0.0));
      color = pow(color, vec3(0.92));
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
      float returnAlpha=stagger*(aEndPoint>0.5?0.34:0.10)*(1.0-uReturn*0.28);
      float memoryAlpha=crownMemory*(aEndPoint>0.5?0.110:0.028);
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
    const stride = 7 * Float32Array.BYTES_PER_ELEMENT;
    context.enableVertexAttribArray(0);
    context.vertexAttribPointer(0, 3, context.FLOAT, false, stride, 0);
    context.enableVertexAttribArray(1);
    context.vertexAttribPointer(1, 3, context.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
    context.enableVertexAttribArray(2);
    context.vertexAttribPointer(2, 1, context.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT);
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
    if ((state.return <= 0.006 && state.crown <= 0.025) || reducedMotion) return;
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
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    drawSurfaceGL(resources.outer, 2, state, ghostOrientation, true);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    drawSurfaceGL(resources.inner, 1, state, orientation, false);
    drawSurfaceGL(resources.outer, 0, state, orientation, false);
    drawFibresGL(state);
    drawPointsGL();
  }

  function fallbackBodyPath(context, scale) {
    const path = new Path2D();
    path.moveTo(-1.10 * scale, -3.10 * scale);
    path.bezierCurveTo(-2.72 * scale, -3.04 * scale, -3.86 * scale, -1.82 * scale, -3.34 * scale, -0.34 * scale);
    path.bezierCurveTo(-3.70 * scale, 0.98 * scale, -2.88 * scale, 2.76 * scale, -1.20 * scale, 2.98 * scale);
    path.bezierCurveTo(-0.18 * scale, 3.52 * scale, 1.90 * scale, 3.05 * scale, 2.60 * scale, 1.64 * scale);
    path.bezierCurveTo(3.38 * scale, 0.82 * scale, 2.90 * scale, -0.40 * scale, 2.12 * scale, -1.18 * scale);
    path.bezierCurveTo(2.26 * scale, -2.20 * scale, 0.48 * scale, -2.70 * scale, -1.10 * scale, -3.10 * scale);
    path.closePath();
    return path;
  }

  function fallbackWoundPath(scale) {
    const path = new Path2D();
    path.moveTo(0.40 * scale, -1.38 * scale);
    path.bezierCurveTo(0.05 * scale, -1.18 * scale, -0.08 * scale, -0.68 * scale, -0.32 * scale, -0.32 * scale);
    path.bezierCurveTo(-0.55 * scale, 0.04 * scale, -0.43 * scale, 0.52 * scale, -0.13 * scale, 0.72 * scale);
    path.bezierCurveTo(0.08 * scale, 0.96 * scale, -0.05 * scale, 1.25 * scale, -0.28 * scale, 1.45 * scale);
    path.bezierCurveTo(0.12 * scale, 1.36 * scale, 0.38 * scale, 0.96 * scale, 0.30 * scale, 0.55 * scale);
    path.bezierCurveTo(0.18 * scale, 0.18 * scale, 0.55 * scale, -0.14 * scale, 0.66 * scale, -0.52 * scale);
    path.bezierCurveTo(0.74 * scale, -0.90 * scale, 0.63 * scale, -1.22 * scale, 0.40 * scale, -1.38 * scale);
    path.closePath();
    return path;
  }

  function fallbackLayout(detail = false, state = cycleState(elapsed)) {
    const shift = screenShift(detail);
    const compact = isCompactLayout();
    const artifactWidth = width * (compact ? 0.97 : 0.61);
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
    context.globalAlpha = 0.075 + state.crown * 0.035;
    context.fillStyle = '#4a151b';
    context.fill(wound);
    context.globalAlpha = 0.12 + state.crown * 0.04;
    context.lineWidth = Math.max(0.45, scale * 0.012);
    context.strokeStyle = '#c95b5c';
    context.stroke(wound);
    context.restore();

    const mineralGradient = context.createLinearGradient(-scale * 2.8, -scale * 3.1, scale * 2.5, scale * 2.8);
    mineralGradient.addColorStop(0, '#08070a');
    mineralGradient.addColorStop(0.36, '#201e27');
    mineralGradient.addColorStop(0.58, '#403a45');
    mineralGradient.addColorStop(0.66, '#70665d');
    mineralGradient.addColorStop(0.74, '#2d2935');
    mineralGradient.addColorStop(1, '#070609');
    context.globalAlpha = 1 - state.subtraction * 0.28;
    context.fillStyle = mineralGradient;
    context.fill(body);

    context.save();
    context.clip(body);
    context.globalAlpha = 0.055 + state.crown * 0.025;
    context.lineWidth = Math.max(0.45, scale * 0.012);
    context.strokeStyle = '#d7c9b3';
    for (let index = 0; index < 11; index++) {
      const y = (-2.62 + index * 0.53) * scale;
      context.beginPath();
      context.moveTo(-3.55 * scale, y);
      context.bezierCurveTo(
        -1.72 * scale, y - (0.22 + (index % 3) * 0.08) * scale,
        0.35 * scale, y + (0.26 - (index % 2) * 0.10) * scale,
        3.05 * scale, y - 0.13 * scale,
      );
      context.stroke();
    }
    context.restore();

    context.save();
    context.shadowColor = 'rgba(255,68,79,.42)';
    context.shadowBlur = scale * (0.10 + state.crown * 0.045);
    const innerGradient = context.createRadialGradient(0.08 * scale, 0.10 * scale, scale * 0.03, 0.08 * scale, 0.10 * scale, scale * 1.40);
    innerGradient.addColorStop(0, '#050205');
    innerGradient.addColorStop(0.46, '#0b0307');
    innerGradient.addColorStop(0.78, '#27080e');
    innerGradient.addColorStop(1, '#741f25');
    context.globalAlpha = 0.98;
    context.fillStyle = innerGradient;
    context.fill(wound);
    context.shadowBlur = 0;
    context.globalAlpha = 0.26 + state.crown * 0.10 + state.pressure * 0.08;
    context.lineWidth = Math.max(1, scale * 0.050);
    context.strokeStyle = '#ff4e57';
    context.stroke(wound);
    context.globalAlpha = 0.42 + state.reconstitution * 0.12;
    context.lineWidth = Math.max(0.55, scale * 0.010);
    context.strokeStyle = '#e6d8c2';
    context.stroke(wound);
    context.clip(wound);
    context.globalAlpha = 0.28 + state.crown * 0.10;
    context.lineWidth = Math.max(0.55, scale * 0.009);
    context.strokeStyle = '#ff7669';
    context.beginPath();
    context.moveTo(0.38 * scale, -1.22 * scale);
    context.bezierCurveTo(-0.10 * scale, -0.56 * scale, 0.32 * scale, 0.18 * scale, -0.13 * scale, 1.20 * scale);
    context.stroke();
    context.globalAlpha = 0.20 + state.reconstitution * 0.08;
    context.strokeStyle = '#e9dcc8';
    context.beginPath();
    context.moveTo(0.53 * scale, -0.84 * scale);
    context.bezierCurveTo(0.08 * scale, -0.26 * scale, 0.48 * scale, 0.40 * scale, 0.02 * scale, 0.90 * scale);
    context.stroke();
    context.restore();

    if ((state.return > 0.01 || state.crown > 0.025) && !reducedMotion) {
      context.lineWidth = 0.75;
      for (let index = 0; index < 18; index++) {
        const crownMemory = index < 7 ? state.crown * 0.28 : 0;
        const reveal = Math.max(state.return, crownMemory);
        if (reveal <= 0.006) continue;
        context.globalAlpha = state.return > crownMemory ? state.return * 0.34 : crownMemory * 0.45;
        const side = index % 2 ? -1 : 1;
        const startX = side * scale * (0.15 + hash(index + 4) * 0.5);
        const startY = -scale * (0.68 + hash(index + 8) * 0.78);
        context.strokeStyle = index % 9 === 0 ? '#6840ff' : index % 6 === 0 ? '#00c9e8' : '#e9e3d6';
        context.beginPath();
        context.moveTo(startX, startY);
        context.quadraticCurveTo(
          startX + side * scale * 0.38,
          startY - scale * 0.64 * reveal,
          startX + side * scale * (0.38 + hash(index + 15) * 0.8) * reveal,
          startY - scale * (0.78 + hash(index + 21) * 1.15) * reveal,
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
        detailZoom = clamp(pinchState.detailZoom * ratio, 0.90, 1.13);
        detailRoll = clamp(pinchState.detailRoll + rotation, -0.10, 0.10);
        detailYaw = clamp(pinchState.detailYaw - midDx * 0.0024, -0.46, 0.46);
        detailPitch = clamp(pinchState.detailPitch - midDy * 0.0022, -0.24, 0.24);
      } else {
        overviewZoom = clamp(pinchState.overviewZoom * ratio, 0.90, 1.13);
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
        overviewYaw = -0.18;
        overviewPitch = -0.055;
        overviewRoll = -0.018;
        overviewZoom = 0.91;
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
    if (activeWorld && viewMix > 0.55) detailZoom = clamp(detailZoom * factor, 0.90, 1.13);
    else if (viewMix < 0.45) overviewZoom = clamp(overviewZoom * factor, 0.90, 1.13);
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
