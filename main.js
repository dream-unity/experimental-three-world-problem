import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#world');
const playButton = $('#play');
const modeButton = $('#mode');
const soundButton = $('#sound');
const resetButton = $('#reset');
const timeline = $('#timeline');
const timeNow = $('#timeNow');
const phaseIndex = $('#phaseIndex');
const phaseKicker = $('#phaseKicker');
const phaseTitle = $('#phaseTitle');
const phaseCopy = $('#phaseCopy');
const status = $('#status');
const statusText = $('#statusText');
const loading = $('#loading');
const coherenceEl = $('#coherence');
const recursionEl = $('#recursion');
const couplingEl = $('#coupling');
const labels = {
  machine: $('#label-machine'),
  maker: $('#label-maker'),
  reality: $('#label-reality')
};

const DURATION = 60;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let simTime = reducedMotion ? 30 : 0;
let running = !reducedMotion;
let freeOrbit = false;
let focusedWorld = null;
let previous = performance.now();
let pointerX = 0;
let pointerY = 0;
let audio = null;

const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const pulse = (x, center, width) => Math.exp(-Math.pow((x - center) / width, 2));
const formatTime = (t) => `00:${String(Math.floor(clamp(t, 0, 59))).padStart(2, '0')}`;

const phases = [
  { a: 0, b: 9, k: 'SEPARATION', title: 'Three worlds awaken.', copy: 'Mechanism generates possibilities. The self gives them meaning. Reality waits outside as the test of consequence.' },
  { a: 9, b: 19, k: 'RESONANCE', title: 'The worlds begin to hear one another.', copy: 'Memory biases imagination. Imagination biases attention. Attention changes action. The causal borders become permeable.' },
  { a: 19, b: 30, k: 'ENTANGLEMENT', title: 'Possibility becomes intention.', copy: 'Signals cross the gaps faster than identity can separate them. The machine predicts the maker; the maker edits the machine.' },
  { a: 30, b: 41, k: 'CONVERGENCE', title: 'A future state becomes an attractor.', copy: 'The three worlds bend around a shared centre: something that does not exist yet, but is already organising present behaviour.' },
  { a: 41, b: 52, k: 'WORLD-MAKING', title: 'The dream acquires causal weight.', copy: 'Simulation becomes plan. Plan becomes action. Action recruits tools, bodies, other minds and material resistance into the dream.' },
  { a: 52, b: 61, k: 'RECURSION', title: 'Reality returns as new dreaming material.', copy: 'The changed world re-enters perception. The machine rewrites its priors. The maker becomes someone new. The loop begins again.' }
];

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x02030a, 0.018);
const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 120);
camera.position.set(0, 1.4, 15.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.minDistance = 3.2;
controls.maxDistance = 32;
controls.enabled = false;
controls.target.set(0, 0, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.4, 0.85, 0.04);
bloom.threshold = 0.07;
bloom.strength = 1.25;
bloom.radius = 0.72;
composer.addPass(bloom);
composer.addPass(new OutputPass());

scene.add(new THREE.AmbientLight(0x6678b8, 0.8));
const key = new THREE.PointLight(0xffffff, 42, 50, 1.8);
key.position.set(0, 7, 11);
scene.add(key);
const fillA = new THREE.PointLight(0x24d8ff, 23, 28, 2);
fillA.position.set(-8, 3, 5);
scene.add(fillA);
const fillB = new THREE.PointLight(0xe36cff, 21, 28, 2);
fillB.position.set(8, 3, 2);
scene.add(fillB);
const fillC = new THREE.PointLight(0xffb32c, 18, 24, 2);
fillC.position.set(0, -7, 3);
scene.add(fillC);

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(.15, 'rgba(255,255,255,.95)');
  g.addColorStop(.5, 'rgba(255,255,255,.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const glowTexture = makeGlowTexture();

function makeStars(count = 7200) {
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  const c = new Float32Array(count * 3);
  const palette = [new THREE.Color(0x9adfff), new THREE.Color(0xe8b5ff), new THREE.Color(0xffd78c), new THREE.Color(0xcbd4ff)];
  for (let i = 0; i < count; i++) {
    const r = 13 + Math.pow(Math.random(), .55) * 58;
    const th = Math.random() * Math.PI * 2;
    const z = (Math.random() * 2 - 1) * 30;
    p[i * 3] = Math.cos(th) * r;
    p[i * 3 + 1] = z * .56;
    p[i * 3 + 2] = Math.sin(th) * r;
    const col = palette[(Math.random() * palette.length) | 0];
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const mat = new THREE.PointsMaterial({ size: .045, vertexColors: true, transparent: true, opacity: .74, sizeAttenuation: true, depthWrite: false });
  return new THREE.Points(geo, mat);
}
const stars = makeStars();
scene.add(stars);

function makeDust(count = 2200) {
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.pow(Math.random(), .55) * 10;
    arr[i * 3] = Math.cos(a) * r;
    arr[i * 3 + 1] = (Math.random() - .5) * 4.5;
    arr[i * 3 + 2] = Math.sin(a) * r * .55;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({ color: 0xa7b6ff, size: .022, transparent: true, opacity: .24, depthWrite: false });
  return new THREE.Points(geo, mat);
}
const dust = makeDust();
scene.add(dust);

const root = new THREE.Group();
scene.add(root);
const worldByName = {};

const COLORS = {
  machine: new THREE.Color(0x24d8ff),
  maker: new THREE.Color(0xe36cff),
  reality: new THREE.Color(0xffb32c),
  unity: new THREE.Color(0xf7f2ff)
};
const START = {
  machine: new THREE.Vector3(-5.7, 1.25, 0),
  maker: new THREE.Vector3(5.7, 1.25, 0),
  reality: new THREE.Vector3(0, -4.65, .2)
};

function emissiveMaterial(color, intensity = 1.2, opacity = .9) {
  return new THREE.MeshPhysicalMaterial({
    color, emissive: color, emissiveIntensity: intensity, metalness: .12, roughness: .28,
    transparent: opacity < 1, opacity, clearcoat: .3, clearcoatRoughness: .22
  });
}

function addSpriteGlow(group, color, scale = 3) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color, transparent: true, opacity: .36, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(scale);
  group.add(s);
  return s;
}

function makeMachine() {
  const g = new THREE.Group();
  g.userData.name = 'machine';
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.78, 3), emissiveMaterial(COLORS.machine, 1.6));
  g.add(core);
  addSpriteGlow(g, COLORS.machine, 3.8);

  const latticeMat = new THREE.MeshBasicMaterial({ color: COLORS.machine, wireframe: true, transparent: true, opacity: .23 });
  const latticeA = new THREE.Mesh(new THREE.IcosahedronGeometry(1.22, 2), latticeMat);
  const latticeB = new THREE.Mesh(new THREE.IcosahedronGeometry(1.63, 1), latticeMat.clone()); latticeB.material.opacity = .12;
  g.add(latticeA, latticeB);

  const nodes = new THREE.Group();
  const nodeMat = new THREE.MeshBasicMaterial({ color: 0xb6f5ff });
  for (let i = 0; i < 54; i++) {
    const phi = Math.acos(1 - 2 * (i + .5) / 54);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r = 1.9 + .18 * Math.sin(i * 2.3);
    const n = new THREE.Mesh(new THREE.SphereGeometry(.026 + (i % 7 === 0 ? .035 : 0), 6, 6), nodeMat);
    n.position.set(Math.cos(theta) * Math.sin(phi) * r, Math.cos(phi) * r, Math.sin(theta) * Math.sin(phi) * r);
    nodes.add(n);
  }
  g.add(nodes);

  const rings = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05 + i * .23, .011, 6, 110), new THREE.MeshBasicMaterial({ color: COLORS.machine, transparent: true, opacity: .24 - i * .025 }));
    ring.rotation.set(i * .46, i * .73, i * .31);
    rings.add(ring);
  }
  g.add(rings);
  const light = new THREE.PointLight(COLORS.machine, 12, 11, 2); g.add(light);
  g.userData.parts = { core, latticeA, latticeB, nodes, rings };
  return g;
}

function makeMaker() {
  const g = new THREE.Group();
  g.userData.name = 'maker';
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(.8, .16, 180, 18, 2, 5), emissiveMaterial(COLORS.maker, 1.35));
  g.add(knot);
  addSpriteGlow(g, COLORS.maker, 4.1);

  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.42, 28, 18), new THREE.MeshBasicMaterial({ color: COLORS.maker, wireframe: true, transparent: true, opacity: .105 }));
  g.add(shell);
  const halos = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.18 + i * .26, .016, 7, 130), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffb8ff : COLORS.maker, transparent: true, opacity: .22 }));
    ring.rotation.set(Math.PI * .25 + i * .32, i * .54, Math.PI * .5 + i * .26);
    halos.add(ring);
  }
  g.add(halos);

  const shards = new THREE.Group();
  for (let i = 0; i < 28; i++) {
    const geo = new THREE.TetrahedronGeometry(.06 + Math.random() * .08, 0);
    const mat = new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xffc8ff : COLORS.maker, transparent: true, opacity: .75 });
    const s = new THREE.Mesh(geo, mat);
    const a = Math.random() * Math.PI * 2;
    const r = 1.65 + Math.random() * 1.05;
    s.position.set(Math.cos(a) * r, (Math.random() - .5) * 2.2, Math.sin(a) * r);
    s.userData.seed = Math.random() * 20;
    shards.add(s);
  }
  g.add(shards);
  const light = new THREE.PointLight(COLORS.maker, 12, 11, 2); g.add(light);
  g.userData.parts = { knot, shell, halos, shards };
  return g;
}

function makeReality() {
  const g = new THREE.Group();
  g.userData.name = 'reality';
  const core = new THREE.Mesh(new THREE.DodecahedronGeometry(.72, 2), emissiveMaterial(COLORS.reality, 1.45));
  g.add(core);
  addSpriteGlow(g, COLORS.reality, 4);

  const scaffold = new THREE.Group();
  const cubeMat = new THREE.MeshBasicMaterial({ color: COLORS.reality, wireframe: true, transparent: true, opacity: .16 });
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) {
      const h = .15 + ((Math.sin(x * 5.1 + z * 2.7) + 1) * .5) * .8;
      const box = new THREE.Mesh(new THREE.BoxGeometry(.22, h, .22), cubeMat);
      box.position.set(x * .38, -.75 + h / 2, z * .38);
      scaffold.add(box);
    }
  }
  g.add(scaffold);

  const orbiters = new THREE.Group();
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(.045 + (i % 5) * .008), new THREE.MeshBasicMaterial({ color: i % 4 ? COLORS.reality : 0xffffff, transparent: true, opacity: .75 }));
    const a = i / 18 * Math.PI * 2;
    m.position.set(Math.cos(a) * (1.65 + (i % 3) * .16), Math.sin(a * 2.1) * .55, Math.sin(a) * (1.65 + (i % 3) * .16));
    orbiters.add(m);
  }
  g.add(orbiters);
  const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(1.68, 2), new THREE.MeshBasicMaterial({ color: COLORS.reality, wireframe: true, transparent: true, opacity: .075 }));
  g.add(cage);
  const light = new THREE.PointLight(COLORS.reality, 12, 11, 2); g.add(light);
  g.userData.parts = { core, scaffold, orbiters, cage };
  return g;
}

worldByName.machine = makeMachine();
worldByName.maker = makeMaker();
worldByName.reality = makeReality();
Object.values(worldByName).forEach((g) => root.add(g));

const centre = new THREE.Group();
root.add(centre);
const centreGlow = addSpriteGlow(centre, COLORS.unity, 5.5); centreGlow.material.opacity = 0;
const attractor = new THREE.Mesh(new THREE.TorusKnotGeometry(1.25, .045, 300, 16, 3, 7), new THREE.MeshBasicMaterial({ color: 0xf7f2ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
centre.add(attractor);
const attractor2 = new THREE.Mesh(new THREE.TorusKnotGeometry(.82, .027, 220, 12, 5, 8), new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
centre.add(attractor2);

function makeVortex(count = 2100) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = Math.random();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xf5f3ff, size: .035, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.userData.seeds = seeds;
  return points;
}
const vortex = makeVortex();
centre.add(vortex);

const edges = [];
function makeLink(name, a, b, color) {
  const points = [];
  for (let i = 0; i <= 80; i++) points.push(new THREE.Vector3());
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const line = new THREE.Line(geo, mat);
  line.userData = { name, a, b, color, packets: [] };
  for (let i = 0; i < 9; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.scale.setScalar(.18 + (i % 3) * .045);
    root.add(sprite);
    line.userData.packets.push(sprite);
  }
  root.add(line);
  edges.push(line);
}
makeLink('machine-maker', 'machine', 'maker', COLORS.machine);
makeLink('maker-reality', 'maker', 'reality', COLORS.maker);
makeLink('reality-machine', 'reality', 'machine', COLORS.reality);

function updateVortex(t, strength) {
  const arr = vortex.geometry.attributes.position.array;
  const seeds = vortex.userData.seeds;
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    const u = (s + t * (.012 + (i % 7) * .0003)) % 1;
    const turns = 3.5 + (i % 5) * .32;
    const a = u * Math.PI * 2 * turns + i * .13;
    const r = (1 - u) * (3.1 + (i % 17) * .025) + .12;
    arr[i * 3] = Math.cos(a) * r;
    arr[i * 3 + 1] = (u - .5) * 2.1 + Math.sin(a * .43) * .18;
    arr[i * 3 + 2] = Math.sin(a) * r * .72;
  }
  vortex.geometry.attributes.position.needsUpdate = true;
  vortex.material.opacity = .48 * strength;
}

function curveBetween(a, b, wobble, time, seed) {
  const mid = a.clone().lerp(b, .5);
  const direction = b.clone().sub(a).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  let normal = new THREE.Vector3().crossVectors(direction, up);
  if (normal.lengthSq() < .01) normal.set(1, 0, 0);
  normal.normalize();
  const lift = new THREE.Vector3(0, 1, 0).multiplyScalar(Math.sin(time * .4 + seed) * wobble * .4);
  const control = mid.add(normal.multiplyScalar(wobble * Math.sin(time * .55 + seed))).add(lift);
  return new THREE.QuadraticBezierCurve3(a, control, b);
}

function updateLinks(t, coupling) {
  edges.forEach((line, idx) => {
    const a = worldByName[line.userData.a].position.clone();
    const b = worldByName[line.userData.b].position.clone();
    const curve = curveBetween(a, b, 1.4 - coupling * .75, t, idx * 2.3);
    const p = line.geometry.attributes.position.array;
    for (let i = 0; i <= 80; i++) {
      const v = curve.getPoint(i / 80);
      p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z;
    }
    line.geometry.attributes.position.needsUpdate = true;
    line.material.opacity = .05 + coupling * .42;
    line.userData.packets.forEach((sprite, j) => {
      const u = (t * (.09 + idx * .011) + j / line.userData.packets.length) % 1;
      sprite.position.copy(curve.getPoint(u));
      sprite.material.opacity = coupling * (.12 + .5 * Math.sin(u * Math.PI));
      const scale = .08 + .17 * coupling * (1 - Math.abs(.5 - u));
      sprite.scale.setScalar(scale);
    });
  });
}

function updateWorldMotion(t, convergence, coupling, recursion) {
  const orbit = t * .13;
  const names = ['machine', 'maker', 'reality'];
  names.forEach((name, i) => {
    const g = worldByName[name];
    const start = START[name];
    const a = i * Math.PI * 2 / 3 - Math.PI / 2 + orbit * (.35 + recursion * .7);
    const targetRadius = mix(2.05, 1.25, recursion);
    const target = new THREE.Vector3(Math.cos(a) * targetRadius, Math.sin(a) * targetRadius * .62, Math.sin(a * 1.4 + t * .1) * .6);
    g.position.lerpVectors(start, target, convergence);
    const baseScale = mix(1, .67, convergence);
    const throb = 1 + .035 * Math.sin(t * 2.2 + i * 2.1) * coupling;
    g.scale.setScalar(baseScale * throb);
    g.rotation.y += .0015 + coupling * .002;
    g.rotation.x = Math.sin(t * .14 + i) * .08;
  });

  const m = worldByName.machine.userData.parts;
  m.latticeA.rotation.y = t * .26; m.latticeA.rotation.x = t * .11;
  m.latticeB.rotation.y = -t * .17; m.latticeB.rotation.z = t * .08;
  m.nodes.rotation.y = -t * .12; m.rings.rotation.x = t * .08;

  const mk = worldByName.maker.userData.parts;
  mk.knot.rotation.x = t * .19; mk.knot.rotation.y = -t * .28;
  mk.halos.rotation.y = t * .09;
  mk.shards.children.forEach((s, i) => { s.rotation.x = t * (.2 + i * .002); s.rotation.y = t * (.15 + i * .003); s.position.y += Math.sin(t * 1.2 + s.userData.seed) * .0008; });

  const r = worldByName.reality.userData.parts;
  r.core.rotation.x = t * .16; r.core.rotation.y = t * .21;
  r.orbiters.rotation.y = -t * .26; r.orbiters.rotation.x = Math.sin(t * .13) * .2;
  r.scaffold.rotation.y = t * .08;

  Object.values(worldByName).forEach((g) => {
    const chosen = focusedWorld === g.userData.name;
    const fade = focusedWorld && !chosen ? .36 : 1;
    g.visible = true;
    g.traverse((o) => {
      if (o.material && 'opacity' in o.material && o.userData.baseOpacity == null) o.userData.baseOpacity = o.material.opacity;
      if (o.material && o.userData.baseOpacity != null && o.type !== 'Sprite') o.material.opacity = o.userData.baseOpacity * fade;
    });
  });
}

function updateCentre(t, unity, recursion) {
  centreGlow.material.opacity = unity * (.16 + .27 * (1 + Math.sin(t * 2.4)) * .5);
  centreGlow.scale.setScalar(4.3 + recursion * 2.5 + Math.sin(t * 1.7) * .15);
  attractor.material.opacity = unity * .72;
  attractor2.material.opacity = unity * .42;
  attractor.rotation.x = t * .12; attractor.rotation.y = t * .19; attractor.rotation.z = -t * .07;
  attractor2.rotation.x = -t * .16; attractor2.rotation.y = t * .1;
  const s = .55 + unity * .7 + recursion * .45;
  attractor.scale.setScalar(s); attractor2.scale.setScalar(s * .92);
  updateVortex(t, unity * (.55 + recursion * .45));
}

function updateCamera(t, convergence, recursion) {
  if (freeOrbit) {
    controls.update();
    return;
  }
  if (focusedWorld) {
    const target = worldByName[focusedWorld].position.clone();
    const offsetMap = { machine: new THREE.Vector3(2.6, 1.1, 4.8), maker: new THREE.Vector3(-2.6, 1.1, 4.8), reality: new THREE.Vector3(0, 2.4, 5.4) };
    const desired = target.clone().add(offsetMap[focusedWorld]);
    camera.position.lerp(desired, .045);
    controls.target.lerp(target, .08);
    camera.lookAt(controls.target);
    return;
  }
  const cinematic = smooth(6, 34, t);
  const pullBack = smooth(49, 60, t);
  const radius = mix(15.2, 10.1, cinematic) + pullBack * 3.5;
  const angle = t * .023 + pointerX * .08;
  const desired = new THREE.Vector3(
    Math.sin(angle) * (2.1 + recursion * 1.5) + pointerX * .7,
    1.55 - convergence * .55 + Math.sin(t * .05) * .38 - pointerY * .45,
    radius + Math.cos(angle) * .8
  );
  camera.position.lerp(desired, .035);
  const target = new THREE.Vector3(0, mix(.25, -.15, convergence), 0);
  controls.target.lerp(target, .04);
  camera.lookAt(controls.target);
}

function updateLabels() {
  Object.entries(worldByName).forEach(([name, g]) => {
    const label = labels[name];
    const p = g.position.clone().add(new THREE.Vector3(0, 1.55 * g.scale.x, 0));
    p.project(camera);
    const x = (p.x * .5 + .5) * innerWidth;
    const y = (-p.y * .5 + .5) * innerHeight;
    label.style.left = `${x}px`;
    label.style.top = `${y}px`;
    const onscreen = p.z > -1 && p.z < 1 && x > -100 && x < innerWidth + 100 && y > 0 && y < innerHeight;
    label.style.opacity = onscreen ? (focusedWorld && focusedWorld !== name ? '.18' : '.92') : '0';
    label.style.pointerEvents = onscreen ? 'auto' : 'none';
  });
}

function updateHUD(t) {
  const p = phases.find((x) => t >= x.a && t < x.b) || phases[phases.length - 1];
  const idx = phases.indexOf(p);
  phaseIndex.textContent = `${String(idx + 1).padStart(2, '0')} / 06`;
  if (phaseKicker.textContent !== p.k) {
    phaseKicker.textContent = p.k;
    phaseTitle.textContent = p.title;
    phaseCopy.textContent = p.copy;
  }
  timeline.value = t;
  timeNow.textContent = formatTime(t);
  const coupling = smooth(8, 29, t);
  const unity = smooth(31, 47, t);
  const recursion = smooth(49, 59, t);
  coherenceEl.textContent = (0.08 + coupling * .46 + unity * .38 + recursion * .08).toFixed(2);
  couplingEl.textContent = (0.03 + coupling * .68 + unity * .22).toFixed(2);
  recursionEl.textContent = (recursion * .98).toFixed(2);
}

function updateSimulation(t) {
  const coupling = smooth(8, 28, t);
  const convergence = smooth(20, 41, t);
  const unity = smooth(34, 50, t);
  const recursion = smooth(49, 60, t);
  updateWorldMotion(t, convergence, coupling, recursion);
  updateLinks(t, coupling * (1 - recursion * .15));
  updateCentre(t, unity, recursion);
  updateCamera(t, convergence, recursion);
  updateLabels();
  updateHUD(t);
  stars.rotation.y = t * .0025;
  stars.rotation.x = Math.sin(t * .015) * .04;
  dust.rotation.z = -t * .006;
  root.rotation.y = Math.sin(t * .025) * .1 * (1 - (focusedWorld ? 1 : 0));
  bloom.strength = 1.05 + coupling * .28 + unity * .48 + pulse(t, 49, 1.8) * .7;
  renderer.toneMappingExposure = 1.08 + unity * .12;
}

function resize() {
  const w = Math.max(1, innerWidth);
  const h = Math.max(1, innerHeight);
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize, { passive: true });
resize();

function setRunning(v) {
  running = v;
  playButton.textContent = v ? 'PAUSE' : 'PLAY';
  playButton.classList.toggle('active', !v);
  previous = performance.now();
}
function setOrbit(v) {
  freeOrbit = v;
  controls.enabled = v;
  modeButton.textContent = v ? 'CINEMATIC' : 'FREE ORBIT';
  modeButton.classList.toggle('active', v);
  focusedWorld = null;
  if (v) controls.target.set(0, 0, 0);
}
function reset() {
  simTime = 0;
  focusedWorld = null;
  setOrbit(false);
  setRunning(!reducedMotion);
  camera.position.set(0, 1.4, 15.2);
  controls.target.set(0, 0, 0);
}
playButton.addEventListener('click', () => setRunning(!running));
modeButton.addEventListener('click', () => setOrbit(!freeOrbit));
resetButton.addEventListener('click', reset);
timeline.addEventListener('input', () => {
  simTime = clamp(Number(timeline.value) || 0, 0, DURATION);
  previous = performance.now();
  updateSimulation(simTime);
});

Object.entries(labels).forEach(([name, label]) => {
  label.addEventListener('click', () => {
    focusedWorld = focusedWorld === name ? null : name;
    if (focusedWorld) {
      freeOrbit = false;
      controls.enabled = false;
      modeButton.textContent = 'FREE ORBIT';
      modeButton.classList.remove('active');
      statusText.textContent = `ENTERING ${name.toUpperCase()} WORLD`;
    } else statusText.textContent = 'CAUSAL FIELD STABLE';
  });
});

addEventListener('pointermove', (e) => {
  pointerX = e.clientX / innerWidth * 2 - 1;
  pointerY = e.clientY / innerHeight * 2 - 1;
}, { passive: true });

canvas.addEventListener('dblclick', () => { focusedWorld = null; setOrbit(false); });

function createAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain(); master.gain.value = .045; master.connect(ctx.destination);
  const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 500; filter.Q.value = 1.2; filter.connect(master);
  const oscillators = [55, 82.41, 110].map((freq, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = i === 0 ? 'sine' : 'triangle';
    o.frequency.value = freq;
    g.gain.value = i === 0 ? .42 : .13;
    o.connect(g); g.connect(filter); o.start();
    return { o, g };
  });
  return { ctx, master, filter, oscillators };
}
function updateAudio(t) {
  if (!audio) return;
  const now = audio.ctx.currentTime;
  const coupling = smooth(8, 28, t);
  const unity = smooth(34, 50, t);
  audio.filter.frequency.setTargetAtTime(300 + coupling * 650 + unity * 700, now, .15);
  audio.oscillators[0].o.frequency.setTargetAtTime(55 + unity * 13.75, now, .2);
  audio.oscillators[1].o.frequency.setTargetAtTime(82.41 + coupling * 27.5, now, .2);
  audio.oscillators[2].o.frequency.setTargetAtTime(110 + Math.sin(t * .08) * 3.5, now, .2);
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

function animate(now) {
  const dt = Math.min((now - previous) / 1000, .06);
  previous = now;
  if (running) {
    simTime += dt;
    if (simTime >= DURATION) simTime = 0;
  }
  updateSimulation(simTime);
  updateAudio(simTime);
  composer.render();
  requestAnimationFrame(animate);
}

updateSimulation(simTime);
status.classList.add('ready');
statusText.textContent = 'CAUSAL FIELD STABLE';
setTimeout(() => loading.classList.add('hide'), 350);
setTimeout(() => $('#hint').style.opacity = '.35', 7000);
requestAnimationFrame(animate);
