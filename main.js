import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const canvas = $('#world');
const modeButton = $('#mode');
const soundButton = $('#sound');
const qualityButton = $('#quality');
const resetButton = $('#reset');
const storyKicker = $('#storyKicker');
const storyTitle = $('#storyTitle');
const storyCopy = $('#storyCopy');
const statusText = $('#statusText');
const loading = $('#loading');
const coherenceEl = $('#coherence');
const recursionEl = $('#recursion');
const couplingEl = $('#coupling');
const performanceEl = $('#performance');
const flowFill = $('#flowFill');
const hint = $('#hint');
const labels = {
  machine: $('#label-machine'),
  maker: $('#label-maker'),
  reality: $('#label-reality')
};

const coarsePointer = matchMedia('(pointer: coarse)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lowCPU = (navigator.hardwareConcurrency || 8) <= 6;
const initialLevel = coarsePointer || lowCPU ? 1 : 2;

const QUALITY = [
  { name: 'LOW', dpr: .9, stars: 1400, vortex: 420, links: 28 },
  { name: 'MED', dpr: 1.1, stars: 2500, vortex: 760, links: 40 },
  { name: 'HIGH', dpr: 1.45, stars: 4200, vortex: 1280, links: 54 }
];
let qualityMode = 'AUTO';
let qualityLevel = initialLevel;
let autoCeiling = initialLevel;
let freeOrbit = false;
let focusedWorld = null;
let simTime = Math.random() * 30;
let previous = performance.now();
let frame = 0;
let hudAccumulator = 0;
let fpsFrames = 0;
let fpsElapsed = 0;
let displayedFPS = 60;
let slowWindows = 0;
let pointerX = 0;
let pointerY = 0;
let audio = null;

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth01 = (x) => x * x * (3 - 2 * x);
const expBlend = (speed, dt) => 1 - Math.exp(-speed * dt);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !coarsePointer,
  alpha: true,
  powerPreference: 'high-performance',
  precision: coarsePointer ? 'mediump' : 'highp'
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x000000, 0);
renderer.info.autoReset = true;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x02030a, 0.015);
const camera = new THREE.PerspectiveCamera(47, 1, .08, 120);
camera.position.set(0, 1.25, 15.4);

const controls = new OrbitControls(camera, canvas);
controls.enabled = false;
controls.enableDamping = true;
controls.dampingFactor = .07;
controls.enablePan = false;
controls.minDistance = 3.4;
controls.maxDistance = 28;
controls.target.set(0, 0, 0);

const COLORS = {
  machine: new THREE.Color(0x35ddff),
  maker: new THREE.Color(0xe779ff),
  reality: new THREE.Color(0xffc04d),
  unity: new THREE.Color(0xf7f4ff)
};

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(48, 48, 0, 48, 48, 48);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(.14, 'rgba(255,255,255,.95)');
  g.addColorStop(.42, 'rgba(255,255,255,.26)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 96, 96);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const glowTexture = makeGlowTexture();

function coreMaterial(color, speed = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uTime: { value: 0 },
      uSpeed: { value: speed }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vPos;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        vPos = position;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uSpeed;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vPos;
      void main(){
        float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.25);
        float bands = 0.5 + 0.5 * sin((vPos.x * 9.0 + vPos.y * 12.0 + vPos.z * 7.0) + uTime * uSpeed * 1.7);
        float sparks = smoothstep(.8, 1.0, 0.5 + 0.5 * sin(vPos.x * 24.0 - vPos.z * 19.0 + uTime * uSpeed * 2.4));
        vec3 col = uColor * (0.72 + bands * 0.58) + vec3(1.0) * (fres * 1.15 + sparks * .18);
        gl_FragColor = vec4(col, .94);
      }
    `,
    transparent: true,
    depthWrite: true
  });
}

function glowSprite(color, scale, opacity = .28) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  sprite.scale.setScalar(scale);
  sprite.userData.baseScale = scale;
  sprite.userData.baseOpacity = opacity;
  return sprite;
}

const starGeometry = new THREE.BufferGeometry();
const MAX_STARS = QUALITY[2].stars;
const starPos = new Float32Array(MAX_STARS * 3);
const starCol = new Float32Array(MAX_STARS * 3);
const starPalette = [new THREE.Color(0x9fe9ff), new THREE.Color(0xf3b8ff), new THREE.Color(0xffdda0), new THREE.Color(0xcbd5ff)];
for (let i = 0; i < MAX_STARS; i++) {
  const r = 12 + Math.pow(Math.random(), .55) * 55;
  const a = Math.random() * Math.PI * 2;
  starPos[i * 3] = Math.cos(a) * r;
  starPos[i * 3 + 1] = (Math.random() * 2 - 1) * 18;
  starPos[i * 3 + 2] = Math.sin(a) * r;
  const c = starPalette[(Math.random() * starPalette.length) | 0];
  starCol[i * 3] = c.r; starCol[i * 3 + 1] = c.g; starCol[i * 3 + 2] = c.b;
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
starGeometry.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
  size: .045,
  vertexColors: true,
  transparent: true,
  opacity: .7,
  depthWrite: false,
  sizeAttenuation: true
}));
scene.add(stars);

const root = new THREE.Group();
scene.add(root);
const worldByName = {};
const START_ANGLE = { machine: Math.PI * .9, maker: Math.PI * .1, reality: Math.PI * 1.5 };
const dummy = new THREE.Object3D();

function makeInstanced(geometry, material, count, setup) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  for (let i = 0; i < count; i++) {
    setup(dummy, i);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function makeMachine() {
  const g = new THREE.Group();
  g.userData.name = 'machine';
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.78, 2), coreMaterial(COLORS.machine, 1.15));
  const glow = glowSprite(COLORS.machine, 4.1, .34);
  const shellA = new THREE.Mesh(new THREE.IcosahedronGeometry(1.26, 1), new THREE.MeshBasicMaterial({ color: COLORS.machine, wireframe: true, transparent: true, opacity: .23, depthWrite: false }));
  const shellB = new THREE.Mesh(new THREE.IcosahedronGeometry(1.72, 1), new THREE.MeshBasicMaterial({ color: 0x9ff0ff, wireframe: true, transparent: true, opacity: .09, depthWrite: false }));
  const nodes = makeInstanced(
    new THREE.SphereGeometry(.035, 5, 4),
    new THREE.MeshBasicMaterial({ color: 0xc8f8ff, transparent: true, opacity: .82 }),
    42,
    (d, i) => {
      const phi = Math.acos(1 - 2 * (i + .5) / 42);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = 1.9 + .14 * Math.sin(i * 2.1);
      d.position.set(Math.cos(theta) * Math.sin(phi) * r, Math.cos(phi) * r, Math.sin(theta) * Math.sin(phi) * r);
      d.scale.setScalar(i % 7 === 0 ? 1.8 : 1);
      d.rotation.set(0, 0, 0);
    }
  );
  const rings = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1 + i * .34, .012, 5, 72), new THREE.MeshBasicMaterial({ color: COLORS.machine, transparent: true, opacity: .22 - i * .045, depthWrite: false }));
    ring.rotation.set(i * .55, i * .77, i * .34);
    rings.add(ring);
  }
  g.add(glow, core, shellA, shellB, nodes, rings);
  g.userData.parts = { core, glow, shellA, shellB, nodes, rings };
  return g;
}

function makeMaker() {
  const g = new THREE.Group();
  g.userData.name = 'maker';
  const core = new THREE.Mesh(new THREE.TorusKnotGeometry(.76, .15, 96, 10, 2, 5), coreMaterial(COLORS.maker, .92));
  const glow = glowSprite(COLORS.maker, 4.3, .34);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.42, 18, 12), new THREE.MeshBasicMaterial({ color: COLORS.maker, wireframe: true, transparent: true, opacity: .1, depthWrite: false }));
  const halos = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2 + i * .35, .014, 5, 84), new THREE.MeshBasicMaterial({ color: i === 1 ? 0xffc2ff : COLORS.maker, transparent: true, opacity: .2 - i * .035, depthWrite: false }));
    ring.rotation.set(.5 + i * .4, i * .55, 1.2 + i * .3);
    halos.add(ring);
  }
  const shards = makeInstanced(
    new THREE.TetrahedronGeometry(.085, 0),
    new THREE.MeshBasicMaterial({ color: 0xf6b9ff, transparent: true, opacity: .74 }),
    26,
    (d, i) => {
      const a = i * 2.399963 + .37;
      const r = 1.68 + (i % 5) * .16;
      d.position.set(Math.cos(a) * r, Math.sin(a * 1.83) * .92, Math.sin(a) * r);
      d.rotation.set(i * .7, i * .43, i * .21);
      d.scale.setScalar(.7 + (i % 4) * .18);
    }
  );
  g.add(glow, core, shell, halos, shards);
  g.userData.parts = { core, glow, shell, halos, shards };
  return g;
}

function makeReality() {
  const g = new THREE.Group();
  g.userData.name = 'reality';
  const core = new THREE.Mesh(new THREE.DodecahedronGeometry(.75, 1), coreMaterial(COLORS.reality, .78));
  const glow = glowSprite(COLORS.reality, 4.2, .34);
  const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(1.68, 1), new THREE.MeshBasicMaterial({ color: COLORS.reality, wireframe: true, transparent: true, opacity: .08, depthWrite: false }));
  const scaffold = makeInstanced(
    new THREE.BoxGeometry(.23, .23, .23),
    new THREE.MeshBasicMaterial({ color: COLORS.reality, wireframe: true, transparent: true, opacity: .2 }),
    25,
    (d, i) => {
      const x = (i % 5) - 2;
      const z = Math.floor(i / 5) - 2;
      const h = .7 + ((Math.sin(x * 4.1 + z * 2.7) + 1) * .5) * 2.6;
      d.scale.set(1, h, 1);
      d.position.set(x * .38, -.92 + h * .115, z * .38);
      d.rotation.set(0, 0, 0);
    }
  );
  const orbiters = makeInstanced(
    new THREE.OctahedronGeometry(.06, 0),
    new THREE.MeshBasicMaterial({ color: 0xffdf9a, transparent: true, opacity: .78 }),
    18,
    (d, i) => {
      const a = i / 18 * Math.PI * 2;
      const r = 1.68 + (i % 3) * .18;
      d.position.set(Math.cos(a) * r, Math.sin(a * 2.1) * .5, Math.sin(a) * r);
      d.rotation.set(i, i * .4, 0);
      d.scale.setScalar(.8 + (i % 4) * .15);
    }
  );
  g.add(glow, core, cage, scaffold, orbiters);
  g.userData.parts = { core, glow, cage, scaffold, orbiters };
  return g;
}

worldByName.machine = makeMachine();
worldByName.maker = makeMaker();
worldByName.reality = makeReality();
Object.values(worldByName).forEach((g) => root.add(g));

const membrane = new THREE.Mesh(
  new THREE.IcosahedronGeometry(7.7, 2),
  new THREE.MeshBasicMaterial({ color: 0x8ea2da, wireframe: true, transparent: true, opacity: .025, depthWrite: false })
);
root.add(membrane);

const centre = new THREE.Group();
root.add(centre);
const centreGlow = glowSprite(COLORS.unity, 5.4, 0);
const attractor = new THREE.Mesh(new THREE.TorusKnotGeometry(1.15, .04, 150, 9, 3, 7), new THREE.MeshBasicMaterial({ color: 0xf7f4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
const attractor2 = new THREE.Mesh(new THREE.TorusKnotGeometry(.72, .026, 120, 8, 5, 8), new THREE.MeshBasicMaterial({ color: 0x9feaff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
centre.add(centreGlow, attractor, attractor2);

const MAX_VORTEX = QUALITY[2].vortex;
const vortexGeometry = new THREE.BufferGeometry();
const seeds = new Float32Array(MAX_VORTEX);
const phases = new Float32Array(MAX_VORTEX);
for (let i = 0; i < MAX_VORTEX; i++) { seeds[i] = Math.random(); phases[i] = Math.random() * 8; }
vortexGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_VORTEX * 3), 3));
vortexGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
vortexGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
const vortexMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uStrength: { value: 0 }, uPixelRatio: { value: 1 } },
  vertexShader: `
    attribute float aSeed;
    attribute float aPhase;
    uniform float uTime;
    uniform float uStrength;
    uniform float uPixelRatio;
    varying float vAlpha;
    void main(){
      float u = fract(aSeed + uTime * (.010 + mod(aPhase, 5.0) * .0008));
      float angle = u * 24.0 + aPhase * 4.7 + uTime * .2;
      float radius = (1.0 - u) * (2.7 + .18 * sin(aPhase * 2.0)) + .12;
      vec3 p = vec3(cos(angle) * radius, (u - .5) * 1.7 + sin(angle * .43) * .17, sin(angle) * radius * .72);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = (1.2 + uStrength * 2.4) * uPixelRatio * (60.0 / max(6.0, -mv.z));
      vAlpha = uStrength * sin(u * 3.1415926);
    }
  `,
  fragmentShader: `
    varying float vAlpha;
    void main(){
      vec2 q = gl_PointCoord - .5;
      float d = length(q);
      if(d > .5) discard;
      float a = smoothstep(.5, .0, d) * vAlpha;
      gl_FragColor = vec4(vec3(1.0, .97, 1.0), a);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
const vortex = new THREE.Points(vortexGeometry, vortexMaterial);
centre.add(vortex);

const edges = [];
const MAX_LINK_POINTS = QUALITY[2].links;
function makeLink(aName, bName, color, seed) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_LINK_POINTS * 3), 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false });
  const line = new THREE.Line(geo, mat);
  line.userData = { aName, bName, seed };
  root.add(line);
  edges.push(line);
}
makeLink('machine', 'maker', COLORS.machine, .2);
makeLink('maker', 'reality', COLORS.maker, 2.4);
makeLink('reality', 'machine', COLORS.reality, 4.8);

const packetCount = 30;
const packetGeometry = new THREE.BufferGeometry();
packetGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(packetCount * 3), 3));
const packetColors = new Float32Array(packetCount * 3);
for (let i = 0; i < packetCount; i++) {
  const c = i % 3 === 0 ? COLORS.machine : i % 3 === 1 ? COLORS.maker : COLORS.reality;
  packetColors[i * 3] = c.r; packetColors[i * 3 + 1] = c.g; packetColors[i * 3 + 2] = c.b;
}
packetGeometry.setAttribute('color', new THREE.BufferAttribute(packetColors, 3));
const packets = new THREE.Points(packetGeometry, new THREE.PointsMaterial({
  size: .16,
  map: glowTexture,
  vertexColors: true,
  transparent: true,
  opacity: .8,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true
}));
root.add(packets);

const tempA = new THREE.Vector3();
const tempB = new THREE.Vector3();
const tempMid = new THREE.Vector3();
const tempCtrl = new THREE.Vector3();
const tempDesired = new THREE.Vector3();
const tempTarget = new THREE.Vector3();
const tempProjected = new THREE.Vector3();

function quadraticPoint(a, c, b, u, out) {
  const inv = 1 - u;
  out.set(
    inv * inv * a.x + 2 * inv * u * c.x + u * u * b.x,
    inv * inv * a.y + 2 * inv * u * c.y + u * u * b.y,
    inv * inv * a.z + 2 * inv * u * c.z + u * u * b.z
  );
  return out;
}

function getFieldState(t) {
  const slow = .5 + .5 * Math.sin(t * .071);
  const cross = .5 + .5 * Math.sin(t * .113 + 1.45);
  const pulse = .5 + .5 * Math.sin(t * .047 - .7);
  const coupling = clamp(.18 + slow * .44 + cross * .26, 0, 1);
  const recursion = clamp(.12 + pulse * .52 + coupling * .24, 0, 1);
  const coherence = clamp(.24 + coupling * .42 + recursion * .31, 0, 1);
  const unity = smooth01(clamp((coherence - .38) / .62, 0, 1));
  return { coupling, recursion, coherence, unity };
}

function updateWorlds(t, dt, state) {
  const radius = lerp(5.55, 2.35, state.unity * .9);
  const orbit = t * (.055 + state.recursion * .035);
  const blend = expBlend(3.2, dt);
  const names = ['machine', 'maker', 'reality'];
  names.forEach((name, i) => {
    const g = worldByName[name];
    const a = START_ANGLE[name] + orbit;
    const wobble = .3 * Math.sin(t * .19 + i * 2.2);
    tempDesired.set(
      Math.cos(a) * radius,
      Math.sin(a) * radius * .53 + wobble,
      Math.sin(a * 1.7 + t * .05) * .72
    );
    g.position.lerp(tempDesired, blend);
    const s = lerp(1, .76, state.unity) * (1 + .025 * Math.sin(t * 1.8 + i * 2));
    g.scale.setScalar(s);
  });

  const m = worldByName.machine.userData.parts;
  m.core.material.uniforms.uTime.value = t;
  m.shellA.rotation.set(t * .1, t * .2, 0);
  m.shellB.rotation.set(-t * .07, -t * .13, t * .06);
  m.nodes.rotation.y = -t * .08;
  m.rings.rotation.x = t * .04;

  const mk = worldByName.maker.userData.parts;
  mk.core.material.uniforms.uTime.value = t;
  mk.core.rotation.set(t * .14, -t * .19, t * .05);
  mk.shell.rotation.y = t * .07;
  mk.halos.rotation.set(Math.sin(t * .08) * .18, t * .06, 0);
  mk.shards.rotation.y = -t * .09;

  const r = worldByName.reality.userData.parts;
  r.core.material.uniforms.uTime.value = t;
  r.core.rotation.set(t * .12, t * .17, 0);
  r.cage.rotation.set(-t * .05, t * .09, 0);
  r.scaffold.rotation.y = t * .035;
  r.orbiters.rotation.set(Math.sin(t * .07) * .16, -t * .12, 0);

  Object.values(worldByName).forEach((g) => {
    const glow = g.userData.parts.glow;
    const beat = 1 + .07 * Math.sin(t * 2 + START_ANGLE[g.userData.name]);
    glow.scale.setScalar(glow.userData.baseScale * beat * (1 + state.coupling * .12));
    glow.material.opacity = glow.userData.baseOpacity * (.78 + state.coupling * .32);
  });
}

function updateLinks(t, state) {
  const active = QUALITY[qualityLevel].links;
  edges.forEach((line) => {
    const a = worldByName[line.userData.aName].position;
    const b = worldByName[line.userData.bName].position;
    tempMid.copy(a).lerp(b, .5);
    const dx = b.x - a.x, dz = b.z - a.z;
    const invLen = 1 / Math.max(.001, Math.hypot(dx, dz));
    const nx = -dz * invLen, nz = dx * invLen;
    const wobble = (1.25 - state.unity * .72) * Math.sin(t * .38 + line.userData.seed);
    tempCtrl.set(
      tempMid.x + nx * wobble,
      tempMid.y + Math.sin(t * .31 + line.userData.seed) * .58,
      tempMid.z + nz * wobble
    );
    const arr = line.geometry.attributes.position.array;
    for (let i = 0; i < active; i++) {
      const u = i / (active - 1);
      quadraticPoint(a, tempCtrl, b, u, tempA);
      arr[i * 3] = tempA.x; arr[i * 3 + 1] = tempA.y; arr[i * 3 + 2] = tempA.z;
    }
    line.geometry.setDrawRange(0, active);
    line.geometry.attributes.position.needsUpdate = true;
    line.material.opacity = .06 + state.coupling * .34;
  });

  const parr = packets.geometry.attributes.position.array;
  for (let i = 0; i < packetCount; i++) {
    const edgeIdx = i % 3;
    const line = edges[edgeIdx];
    const a = worldByName[line.userData.aName].position;
    const b = worldByName[line.userData.bName].position;
    tempMid.copy(a).lerp(b, .5);
    const dx = b.x - a.x, dz = b.z - a.z;
    const invLen = 1 / Math.max(.001, Math.hypot(dx, dz));
    const wobble = (1.25 - state.unity * .72) * Math.sin(t * .38 + line.userData.seed);
    tempCtrl.set(tempMid.x - dz * invLen * wobble, tempMid.y + Math.sin(t * .31 + line.userData.seed) * .58, tempMid.z + dx * invLen * wobble);
    const u = (t * (.07 + edgeIdx * .006) + i / packetCount * 3) % 1;
    quadraticPoint(a, tempCtrl, b, u, tempA);
    parr[i * 3] = tempA.x; parr[i * 3 + 1] = tempA.y; parr[i * 3 + 2] = tempA.z;
  }
  packets.geometry.attributes.position.needsUpdate = true;
  packets.material.opacity = .26 + state.coupling * .64;
  packets.material.size = .1 + state.coupling * .12;
}

function updateCentre(t, state) {
  const strength = clamp((state.unity - .18) / .82, 0, 1);
  centreGlow.material.opacity = .04 + strength * .29;
  centreGlow.scale.setScalar(4.2 + strength * 2.4 + Math.sin(t * 1.25) * .15);
  attractor.material.opacity = strength * .67;
  attractor2.material.opacity = strength * .38;
  attractor.rotation.set(t * .09, t * .15, -t * .05);
  attractor2.rotation.set(-t * .13, t * .08, t * .04);
  const scale = .55 + strength * .95;
  attractor.scale.setScalar(scale);
  attractor2.scale.setScalar(scale * .92);
  vortexMaterial.uniforms.uTime.value = t;
  vortexMaterial.uniforms.uStrength.value = strength;
  membrane.material.opacity = .012 + state.coherence * .028;
  membrane.rotation.set(t * .006, -t * .009, t * .004);
}

function updateCamera(t, dt, state) {
  if (freeOrbit) {
    controls.update();
    return;
  }
  const blend = expBlend(focusedWorld ? 5.0 : 2.0, dt);
  if (focusedWorld) {
    const target = worldByName[focusedWorld].position;
    const offsets = {
      machine: [2.7, 1.1, 4.8],
      maker: [-2.7, 1.1, 4.8],
      reality: [0, 2.6, 5.2]
    };
    const o = offsets[focusedWorld];
    tempDesired.set(target.x + o[0], target.y + o[1], target.z + o[2]);
    tempTarget.copy(target);
  } else {
    const angle = t * .018;
    const radius = 14.2 - state.unity * 2.05;
    tempDesired.set(
      Math.sin(angle) * (2.1 + state.recursion * .8) + pointerX * .45,
      1.5 + Math.sin(t * .045) * .32 - pointerY * .3,
      radius + Math.cos(angle) * .55
    );
    tempTarget.set(0, -.18 + state.unity * .12, 0);
  }
  camera.position.lerp(tempDesired, blend);
  controls.target.lerp(tempTarget, expBlend(3.2, dt));
  camera.lookAt(controls.target);
}

function updateLabels() {
  const rect = canvas.getBoundingClientRect();
  Object.entries(worldByName).forEach(([name, g]) => {
    const label = labels[name];
    tempProjected.copy(g.position);
    tempProjected.y += 1.55 * g.scale.x;
    tempProjected.project(camera);
    const x = (tempProjected.x * .5 + .5) * rect.width + rect.left;
    const y = (-tempProjected.y * .5 + .5) * rect.height + rect.top;
    label.style.left = `${x}px`;
    label.style.top = `${y}px`;
    const onscreen = tempProjected.z > -1 && tempProjected.z < 1 && x > -120 && x < rect.width + 120 && y > 0 && y < rect.height;
    label.style.opacity = onscreen ? (focusedWorld && focusedWorld !== name ? '.14' : '.93') : '0';
    label.style.pointerEvents = onscreen ? 'auto' : 'none';
  });
}

const stories = [
  ['LIVE FIELD', 'Three worlds, one causal circuit.', 'The system continuously converges, separates and exchanges information. Nothing is waiting for a timeline cue.'],
  ['COUPLING', 'Possibility leaks across boundaries.', 'Memory biases imagination; imagination redirects attention; attention alters action; action changes the next input.'],
  ['RECURSION', 'The maker is changed by what it makes.', 'Reality returns through perception and rewrites both the machine that predicts and the self that chooses.'],
  ['UNIFICATION', 'The dream becomes a world-making loop.', 'Mind and world remain distinct, but causation now passes through all three as one recursive architecture.']
];
let lastStory = -1;
function updateHUD(state) {
  coherenceEl.textContent = state.coherence.toFixed(2);
  recursionEl.textContent = state.recursion.toFixed(2);
  couplingEl.textContent = state.coupling.toFixed(2);
  flowFill.style.transform = `scaleX(${(.12 + state.coherence * .88).toFixed(3)})`;
  const storyIndex = state.unity > .72 ? 3 : state.recursion > .68 ? 2 : state.coupling > .6 ? 1 : 0;
  if (storyIndex !== lastStory) {
    const s = stories[storyIndex];
    storyKicker.textContent = s[0];
    storyTitle.textContent = s[1];
    storyCopy.textContent = s[2];
    lastStory = storyIndex;
  }
}

function applyQuality(level, reason = '') {
  qualityLevel = clamp(level, 0, 2);
  const q = QUALITY[qualityLevel];
  const deviceDpr = Math.max(1, window.devicePixelRatio || 1);
  renderer.setPixelRatio(Math.min(deviceDpr, q.dpr));
  starGeometry.setDrawRange(0, q.stars);
  vortexGeometry.setDrawRange(0, q.vortex);
  vortexMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  resize();
  qualityButton.textContent = `QUALITY ${qualityMode === 'AUTO' ? 'AUTO' : q.name}`;
  performanceEl.textContent = `${Math.round(displayedFPS)} FPS · ${q.name}${reason ? '↓' : ''}`;
}

function cycleQualityMode() {
  if (qualityMode === 'AUTO') {
    qualityMode = 'LOW'; applyQuality(0);
  } else if (qualityMode === 'LOW') {
    qualityMode = 'MED'; applyQuality(1);
  } else if (qualityMode === 'MED') {
    qualityMode = 'HIGH'; applyQuality(2);
  } else {
    qualityMode = 'AUTO'; qualityLevel = autoCeiling; applyQuality(qualityLevel);
  }
}

function resize() {
  const w = Math.max(1, canvas.clientWidth || innerWidth);
  const h = Math.max(1, canvas.clientHeight || innerHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize, { passive: true });

function setOrbit(v) {
  freeOrbit = v;
  controls.enabled = v;
  focusedWorld = null;
  app.classList.toggle('orbiting', v);
  modeButton.textContent = v ? 'AUTO CAMERA' : 'FREE ORBIT';
  modeButton.classList.toggle('active', v);
  if (!v) controls.target.set(0, 0, 0);
  statusText.textContent = v ? 'MANUAL ORBIT ENGAGED' : 'AUTONOMOUS FIELD RUNNING';
}

function recenter() {
  focusedWorld = null;
  setOrbit(false);
  camera.position.set(0, 1.25, 15.4);
  controls.target.set(0, 0, 0);
  statusText.textContent = 'AUTONOMOUS FIELD RUNNING';
}

modeButton.addEventListener('click', () => setOrbit(!freeOrbit));
qualityButton.addEventListener('click', cycleQualityMode);
resetButton.addEventListener('click', recenter);

Object.entries(labels).forEach(([name, label]) => {
  label.addEventListener('click', () => {
    focusedWorld = focusedWorld === name ? null : name;
    if (focusedWorld) {
      freeOrbit = false;
      controls.enabled = false;
      app.classList.remove('orbiting');
      modeButton.textContent = 'FREE ORBIT';
      modeButton.classList.remove('active');
      statusText.textContent = `ENTERING ${name.toUpperCase()} WORLD`;
    } else {
      statusText.textContent = 'AUTONOMOUS FIELD RUNNING';
    }
  });
});

if (!coarsePointer) {
  addEventListener('pointermove', (e) => {
    pointerX = e.clientX / Math.max(1, innerWidth) * 2 - 1;
    pointerY = e.clientY / Math.max(1, innerHeight) * 2 - 1;
  }, { passive: true });
}
canvas.addEventListener('dblclick', recenter);

function createAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = .035;
  master.connect(ctx.destination);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 420; filter.Q.value = 1.1;
  filter.connect(master);
  const oscillators = [55, 82.41, 110].map((freq, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = i === 0 ? 'sine' : 'triangle';
    o.frequency.value = freq;
    g.gain.value = i === 0 ? .42 : .11;
    o.connect(g); g.connect(filter); o.start();
    return { o, g };
  });
  return { ctx, filter, oscillators };
}

function updateAudio(state) {
  if (!audio || audio.ctx.state !== 'running') return;
  const now = audio.ctx.currentTime;
  audio.filter.frequency.setTargetAtTime(300 + state.coupling * 520 + state.recursion * 580, now, .2);
  audio.oscillators[0].o.frequency.setTargetAtTime(55 + state.unity * 9, now, .25);
  audio.oscillators[1].o.frequency.setTargetAtTime(82.41 + state.coupling * 18, now, .25);
  audio.oscillators[2].o.frequency.setTargetAtTime(110 + state.recursion * 12, now, .25);
}

soundButton.addEventListener('click', async () => {
  if (!audio) {
    audio = createAudio();
    if (!audio) { soundButton.textContent = 'NO AUDIO'; return; }
    await audio.ctx.resume();
    soundButton.textContent = 'SOUND ON';
    soundButton.classList.add('active');
  } else if (audio.ctx.state === 'running') {
    await audio.ctx.suspend();
    soundButton.textContent = 'SOUND OFF';
    soundButton.classList.remove('active');
  } else {
    await audio.ctx.resume();
    soundButton.textContent = 'SOUND ON';
    soundButton.classList.add('active');
  }
});

function performanceGovernor(dt) {
  fpsFrames++;
  fpsElapsed += dt;
  if (fpsElapsed < 1.25) return;
  displayedFPS = fpsFrames / fpsElapsed;
  fpsFrames = 0;
  fpsElapsed = 0;
  performanceEl.textContent = `${Math.round(displayedFPS)} FPS · ${QUALITY[qualityLevel].name}`;
  if (qualityMode !== 'AUTO') return;
  if (displayedFPS < 43) slowWindows++; else slowWindows = Math.max(0, slowWindows - 1);
  if (slowWindows >= 2 && qualityLevel > 0) {
    qualityLevel--;
    autoCeiling = Math.min(autoCeiling, qualityLevel);
    slowWindows = 0;
    applyQuality(qualityLevel, 'auto');
    statusText.textContent = `PERFORMANCE ADAPTED · ${QUALITY[qualityLevel].name}`;
    setTimeout(() => { if (!focusedWorld && !freeOrbit) statusText.textContent = 'AUTONOMOUS FIELD RUNNING'; }, 1800);
  }
}

function updateScene(t, dt) {
  const state = getFieldState(t);
  updateWorlds(t, dt, state);
  if (frame % 2 === 0) updateLinks(t, state);
  updateCentre(t, state);
  updateCamera(t, dt, state);
  stars.rotation.y = t * .0016;
  stars.rotation.x = Math.sin(t * .013) * .025;
  root.rotation.y = Math.sin(t * .021) * .075 * (focusedWorld ? 0 : 1);
  updateAudio(state);
  hudAccumulator += dt;
  if (hudAccumulator >= .08) {
    hudAccumulator = 0;
    updateLabels();
    updateHUD(state);
  }
  renderer.render(scene, camera);
}

function animate(now) {
  const rawDt = Math.max(0, (now - previous) / 1000);
  previous = now;
  const dt = Math.min(rawDt, 1 / 30);
  if (!document.hidden && !reducedMotion) simTime += dt;
  updateScene(simTime, dt);
  if (!document.hidden) performanceGovernor(Math.min(rawDt, .1));
  frame++;
  requestAnimationFrame(animate);
}

document.addEventListener('visibilitychange', () => { previous = performance.now(); });
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); statusText.textContent = 'GRAPHICS CONTEXT PAUSED'; }, false);
canvas.addEventListener('webglcontextrestored', () => { statusText.textContent = 'AUTONOMOUS FIELD RESTORED'; resize(); }, false);

applyQuality(qualityLevel);
resize();
updateScene(simTime, 1 / 60);
setTimeout(() => loading.classList.add('hide'), 220);
setTimeout(() => { hint.style.opacity = '.34'; }, 6500);
requestAnimationFrame(animate);
