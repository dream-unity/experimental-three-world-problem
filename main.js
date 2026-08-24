import * as THREE from 'three';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const canvas = $('#world');
const backButton = $('#back');
const detailNumber = $('#detailNumber');
const detailName = $('#detailName');
const unityLabel = $('#unityLabel');
const hint = $('#hint');
const loading = $('#loading');
const worldLabels = {
  machine: $('#label-machine'),
  maker: $('#label-maker'),
  reality: $('#label-reality')
};
const subLabels = [$('#sub-0'), $('#sub-1'), $('#sub-2')];

const coarsePointer = matchMedia('(pointer: coarse)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lowCPU = (navigator.hardwareConcurrency || 8) <= 6;

const WORLD = {
  machine: {
    index: '01', name: 'DREAM MACHINE', color: 0x39d7ff, css: '#39d7ff', secondary: 0x246cff,
    triad: ['PERCEIVE', 'MODEL', 'PREDICT']
  },
  maker: {
    index: '02', name: 'DREAM MAKER', color: 0x62efa5, css: '#62efa5', secondary: 0x16a86c,
    triad: ['INTEND', 'ACT', 'BECOME']
  },
  reality: {
    index: '03', name: 'DREAM WORLD', color: 0xbd7cff, css: '#bd7cff', secondary: 0x7048ff,
    triad: ['MATTER', 'STRUCTURE', 'EMERGE']
  }
};

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const TAU = Math.PI * 2;
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const vD = new THREE.Vector3();
const dummy = new THREE.Object3D();

function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}
function smooth01(x) {
  x = clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !coarsePointer,
  alpha: false,
  powerPreference: 'high-performance'
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.setClearColor(0x02040a, 1);

const dprCap = coarsePointer || lowCPU ? 1.05 : 1.35;
let currentDpr = Math.min(window.devicePixelRatio || 1, dprCap);
renderer.setPixelRatio(currentDpr);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x02040a, 0.019);
const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 120);
camera.position.set(0, 0.3, 14);

scene.add(new THREE.AmbientLight(0x7890c8, 0.72));
const keyLight = new THREE.PointLight(0xffffff, 22, 35, 2);
keyLight.position.set(0, 5, 9);
scene.add(keyLight);

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(.14, 'rgba(255,255,255,.92)');
  g.addColorStop(.45, 'rgba(255,255,255,.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const glowTexture = makeGlowTexture();

function glowSprite(color, size, opacity = .34) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

function makeStars() {
  const count = coarsePointer || lowCPU ? 1500 : 3000;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const palette = [
    new THREE.Color(0x93dfff), new THREE.Color(0xbfffd8),
    new THREE.Color(0xd6b6ff), new THREE.Color(0xffedc0), new THREE.Color(0xc8d3ff)
  ];
  for (let i = 0; i < count; i++) {
    const r = 15 + Math.pow(Math.random(), .52) * 48;
    const a = Math.random() * TAU;
    const y = (Math.random() * 2 - 1) * 22;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(a) * r;
    const c = palette[(Math.random() * palette.length) | 0];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: coarsePointer ? .055 : .045,
    vertexColors: true,
    transparent: true,
    opacity: .72,
    depthWrite: false,
    sizeAttenuation: true
  });
  return new THREE.Points(geo, mat);
}
const stars = makeStars();
scene.add(stars);

const root = new THREE.Group();
scene.add(root);

function makeUnity() {
  const g = new THREE.Group();
  const glow = glowSprite(0xffe29a, 3.3, .28);
  g.add(glow);
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(.19, 2),
    new THREE.MeshBasicMaterial({ color: 0xffe8ae })
  );
  g.add(core);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe29a, transparent: true, opacity: .24, depthWrite: false });
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(.54, .012, 6, 72), ringMat);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(.82, .009, 6, 86), ringMat.clone());
  ringA.rotation.x = 1.1; ringA.rotation.y = .35;
  ringB.rotation.x = .35; ringB.rotation.y = 1.25;
  g.add(ringA, ringB);
  const membrane = new THREE.Mesh(
    new THREE.IcosahedronGeometry(5.75, 2),
    new THREE.MeshBasicMaterial({ color: 0xf4e8c8, wireframe: true, transparent: true, opacity: .025, depthWrite: false })
  );
  g.add(membrane);
  g.userData = { glow, core, ringA, ringB, membrane };
  return g;
}
const unity = makeUnity();
root.add(unity);

function basePosition(key) {
  const portrait = camera.aspect < .82;
  if (portrait) {
    if (key === 'machine') return vA.set(-2.3, 2.15, 0);
    if (key === 'maker') return vA.set(2.3, 2.15, 0);
    return vA.set(0, -2.9, .1);
  }
  if (key === 'machine') return vA.set(-4.25, 1.55, 0);
  if (key === 'maker') return vA.set(4.25, 1.55, 0);
  return vA.set(0, -3.35, .12);
}

const TRIAD_POS = [
  new THREE.Vector3(0, 2.55, .25),
  new THREE.Vector3(-2.28, -1.35, .1),
  new THREE.Vector3(2.28, -1.35, -.12)
];

function makeTriadNode(kind, color, index) {
  const g = new THREE.Group();
  let visual;
  if (kind === 'machine') {
    visual = new THREE.Mesh(
      index === 0 ? new THREE.OctahedronGeometry(.29, 1) : index === 1 ? new THREE.IcosahedronGeometry(.28, 1) : new THREE.TetrahedronGeometry(.32, 1),
      new THREE.MeshBasicMaterial({ color, wireframe: index !== 1, transparent: true, opacity: .92 })
    );
  } else if (kind === 'maker') {
    visual = new THREE.Mesh(
      index === 0 ? new THREE.TetrahedronGeometry(.34, 1) : index === 1 ? new THREE.OctahedronGeometry(.3, 1) : new THREE.DodecahedronGeometry(.28, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9 })
    );
  } else {
    visual = new THREE.Mesh(
      index === 0 ? new THREE.SphereGeometry(.27, 14, 10) : index === 1 ? new THREE.BoxGeometry(.46, .46, .46) : new THREE.IcosahedronGeometry(.3, 1),
      new THREE.MeshBasicMaterial({ color, wireframe: index === 1, transparent: true, opacity: .9 })
    );
  }
  g.add(visual);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(.48, .012, 6, 60),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .4, depthWrite: false })
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const glow = glowSprite(color, 1.55, .34);
  g.add(glow);
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(.66, 10, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  g.add(hit);
  g.userData = { visual, ring, glow, hit, pulse: 0, index };
  return g;
}

function makeMachineField(color) {
  const g = new THREE.Group();
  const nodeCount = 56;
  const pts = [];
  for (let i = 0; i < nodeCount; i++) {
    const phi = Math.acos(1 - 2 * (i + .5) / nodeCount);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r = 1.7 + .14 * Math.sin(i * 1.7);
    pts.push(new THREE.Vector3(Math.cos(theta) * Math.sin(phi) * r, Math.cos(phi) * r, Math.sin(theta) * Math.sin(phi) * r));
  }
  const segments = [];
  for (let i = 0; i < nodeCount; i++) {
    const a = pts[i];
    for (let k = 1; k <= 2; k++) {
      const b = pts[(i + 7 * k + (i % 5)) % nodeCount];
      segments.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(lines);
  const pointsGeo = new THREE.BufferGeometry().setFromPoints(pts);
  const points = new THREE.Points(pointsGeo, new THREE.PointsMaterial({ color: 0xc8f7ff, size: .035, transparent: true, opacity: .65, depthWrite: false }));
  g.add(points);
  g.userData = { lines, points };
  return g;
}

function makeMakerField(color) {
  const g = new THREE.Group();
  const shards = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(.07, 0),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .52, depthWrite: false }),
    48
  );
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * TAU * 3.2;
    const r = 1.35 + (i % 9) * .11;
    dummy.position.set(Math.cos(a) * r, Math.sin(a * 1.7) * .65, Math.sin(a) * r);
    dummy.rotation.set(a * .3, a * .6, a * .2);
    dummy.scale.setScalar(.7 + (i % 5) * .12);
    dummy.updateMatrix();
    shards.setMatrixAt(i, dummy.matrix);
  }
  shards.instanceMatrix.needsUpdate = true;
  g.add(shards);
  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1.45, .035, 150, 8, 3, 5),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .16, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  g.add(knot);
  g.userData = { shards, knot };
  return g;
}

function makeRealityField(color) {
  const g = new THREE.Group();
  const count = 49;
  const grid = new THREE.InstancedMesh(
    new THREE.BoxGeometry(.18, 1, .18),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .38 }),
    count
  );
  const cells = [];
  let n = 0;
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      cells.push({ x: x * .48, z: z * .48, phase: n * .37 });
      n++;
    }
  }
  g.add(grid);
  const cage = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.05, 2),
    new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: .07, depthWrite: false })
  );
  g.add(cage);
  g.userData = { grid, cells, cage };
  return g;
}

function makeDetail(kind, config) {
  const g = new THREE.Group();
  g.visible = false;
  g.scale.setScalar(.001);

  const field = kind === 'machine' ? makeMachineField(config.color) : kind === 'maker' ? makeMakerField(config.color) : makeRealityField(config.color);
  g.add(field);

  const nodes = TRIAD_POS.map((p, i) => {
    const node = makeTriadNode(kind, config.color, i);
    node.position.copy(p);
    node.userData.hit.userData = { type: 'sub', world: kind, index: i };
    g.add(node);
    return node;
  });

  const linePositions = new Float32Array(18);
  const triLine = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(linePositions, 3)),
    new THREE.LineBasicMaterial({ color: config.color, transparent: true, opacity: .24, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  const pairs = [[0,1],[1,2],[2,0]];
  let k = 0;
  pairs.forEach(([a,b]) => {
    const A = TRIAD_POS[a], B = TRIAD_POS[b];
    linePositions[k++] = A.x; linePositions[k++] = A.y; linePositions[k++] = A.z;
    linePositions[k++] = B.x; linePositions[k++] = B.y; linePositions[k++] = B.z;
  });
  triLine.geometry.attributes.position.needsUpdate = true;
  g.add(triLine);

  const packets = [];
  for (let i = 0; i < 9; i++) {
    const p = glowSprite(config.color, .34 + (i % 3) * .05, .42);
    g.add(p);
    packets.push(p);
  }

  g.userData = {
    kind, field, nodes, triLine, packets,
    activeIndex: 0, manualUntil: 0, lastImpulse: -99
  };
  return g;
}

function makeWorld(kind, config) {
  const g = new THREE.Group();
  const glow = glowSprite(config.color, 4.6, .28);
  g.add(glow);

  let core;
  if (kind === 'machine') {
    core = new THREE.Mesh(new THREE.IcosahedronGeometry(.84, 2), new THREE.MeshStandardMaterial({ color: config.color, emissive: config.color, emissiveIntensity: .85, metalness: .12, roughness: .28 }));
  } else if (kind === 'maker') {
    core = new THREE.Mesh(new THREE.TorusKnotGeometry(.68, .18, 120, 12, 2, 5), new THREE.MeshStandardMaterial({ color: config.color, emissive: config.color, emissiveIntensity: .72, metalness: .06, roughness: .3 }));
  } else {
    core = new THREE.Mesh(new THREE.DodecahedronGeometry(.78, 1), new THREE.MeshStandardMaterial({ color: config.color, emissive: config.color, emissiveIntensity: .75, metalness: .08, roughness: .32 }));
  }
  g.add(core);

  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.4, 2),
    new THREE.MeshBasicMaterial({ color: config.color, wireframe: true, transparent: true, opacity: .13, depthWrite: false })
  );
  g.add(shell);

  const rings = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.08 + i * .28, .013, 6, 90),
      new THREE.MeshBasicMaterial({ color: i === 1 ? config.secondary : config.color, transparent: true, opacity: .27 - i * .05, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    ring.rotation.set(.5 + i * .48, i * .72, .35 + i * .31);
    rings.add(ring);
  }
  g.add(rings);

  if (kind === 'reality') {
    const satellites = new THREE.InstancedMesh(
      new THREE.BoxGeometry(.09, .09, .09),
      new THREE.MeshBasicMaterial({ color: config.color, transparent: true, opacity: .62 }),
      18
    );
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * TAU;
      dummy.position.set(Math.cos(a) * (1.65 + (i % 3) * .1), Math.sin(a * 2) * .4, Math.sin(a) * (1.65 + (i % 3) * .1));
      dummy.scale.setScalar(.7 + (i % 4) * .12);
      dummy.updateMatrix();
      satellites.setMatrixAt(i, dummy.matrix);
    }
    satellites.instanceMatrix.needsUpdate = true;
    g.add(satellites);
    g.userData.satellites = satellites;
  }

  const hit = new THREE.Mesh(new THREE.SphereGeometry(1.72, 14, 10), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.userData = { type: 'world', world: kind };
  g.add(hit);

  const light = new THREE.PointLight(config.color, 8, 10, 2);
  g.add(light);

  const detail = makeDetail(kind, config);
  g.add(detail);

  g.userData = { kind, glow, core, shell, rings, hit, light, detail };
  return g;
}

const worlds = {};
Object.entries(WORLD).forEach(([key, cfg]) => {
  worlds[key] = makeWorld(key, cfg);
  root.add(worlds[key]);
});

const connections = [];
function addConnection(a, b, color, widthScale = 1) {
  const points = new Float32Array(49 * 3);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(points, 3)),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: .16 * widthScale, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  root.add(line);
  const packets = [];
  for (let i = 0; i < 4; i++) {
    const s = glowSprite(color, .24, .4);
    root.add(s);
    packets.push(s);
  }
  connections.push({ a, b, line, packets, seed: connections.length * 1.73, baseOpacity: .16 * widthScale });
}
addConnection('machine', 'maker', 0xb0ebff, .75);
addConnection('maker', 'reality', 0x96f7c0, .75);
addConnection('reality', 'machine', 0xc8a6ff, .75);
addConnection('unity', 'machine', WORLD.machine.color, 1);
addConnection('unity', 'maker', WORLD.maker.color, 1);
addConnection('unity', 'reality', WORLD.reality.color, 1);

let activeWorld = null;
let detailTarget = 0;
let detailMix = 0;
let simTime = 0;
let previous = performance.now();
let frame = 0;
let hoverWorld = null;
let hoverSub = -1;
let detailYaw = 0;
let detailPitch = 0;
let detailZoom = 7.2;
let dragStartX = 0;
let dragStartY = 0;
let dragLastX = 0;
let dragLastY = 0;
let dragging = false;
let dragDistance = 0;
let fpsFrames = 0;
let fpsElapsed = 0;
let fastWindows = 0;

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();

function enterWorld(key) {
  if (!WORLD[key]) return;
  activeWorld = key;
  detailTarget = 1;
  detailYaw = 0;
  detailPitch = 0;
  detailZoom = 7.2;
  const cfg = WORLD[key];
  detailNumber.textContent = cfg.index;
  detailName.textContent = cfg.name;
  detailName.style.color = cfg.css;
  subLabels.forEach((el, i) => {
    el.querySelector('strong').textContent = cfg.triad[i];
    el.style.color = cfg.css;
    el.classList.remove('active');
  });
  hint.textContent = 'TAP A NODE · DRAG TO ORBIT';
  worlds[key].userData.detail.visible = true;
}

function exitWorld() {
  if (!activeWorld) return;
  detailTarget = 0;
  hoverSub = -1;
  hint.textContent = 'TAP A WORLD';
}

function triggerSub(index) {
  if (!activeWorld) return;
  const detail = worlds[activeWorld].userData.detail.userData;
  const node = detail.nodes[index];
  node.userData.pulse = 1;
  detail.activeIndex = index;
  detail.manualUntil = simTime + 5;
  detail.lastImpulse = simTime;
  subLabels.forEach((el, i) => el.classList.toggle('active', i === index));
}

backButton.addEventListener('click', exitWorld);
Object.entries(worldLabels).forEach(([key, el]) => el.addEventListener('click', () => enterWorld(key)));
subLabels.forEach((el, i) => el.addEventListener('click', () => triggerSub(i)));

function updateWorlds(t, dt, mixValue) {
  const e = smooth01(mixValue);
  Object.entries(worlds).forEach(([key, g], i) => {
    const base = basePosition(key).clone();
    const selected = activeWorld === key;
    if (activeWorld) {
      if (selected) {
        g.position.copy(base).multiplyScalar(1 - e);
      } else {
        vB.copy(base).normalize().multiplyScalar(7.5 * e);
        g.position.copy(base).add(vB);
      }
    } else {
      g.position.copy(base);
    }

    const hoverBoost = hoverWorld === key && detailMix < .2 ? .08 : 0;
    const selectedBoost = selected ? .12 * e : 0;
    const scale = 1 + hoverBoost + selectedBoost - (!selected && activeWorld ? .28 * e : 0);
    g.scale.setScalar(scale);
    g.visible = !activeWorld || selected || e < .76;

    const parts = g.userData;
    const speed = reducedMotion ? .15 : 1;
    parts.core.rotation.x += dt * (.17 + i * .02) * speed;
    parts.core.rotation.y += dt * (.24 + i * .025) * speed;
    parts.shell.rotation.y -= dt * (.08 + i * .015) * speed;
    parts.rings.rotation.x = Math.sin(t * .18 + i) * .12;
    parts.rings.rotation.y += dt * (.13 + i * .02) * speed;
    parts.glow.material.opacity = .25 + .055 * Math.sin(t * 1.6 + i * 2.1) + hoverBoost * .85 + selectedBoost * .35;
    parts.light.intensity = 7 + hoverBoost * 25 + selectedBoost * 8;
    if (parts.satellites) parts.satellites.rotation.y -= dt * .16 * speed;

    const detail = parts.detail;
    if (selected) {
      const d = smooth01(clamp((e - .16) / .84, 0, 1));
      detail.visible = d > .005;
      detail.scale.setScalar(Math.max(.001, d));
      detail.rotation.y = Math.sin(t * .07) * .08;
      updateDetail(key, detail, t, dt, d);
    } else if (detail.visible && e > .15) {
      detail.visible = false;
    }
  });
}

function updateDetail(kind, detailGroup, t, dt, strength) {
  const d = detailGroup.userData;
  const autoIndex = d.manualUntil > t ? d.activeIndex : Math.floor(t / 3.7) % 3;
  if (d.manualUntil <= t) d.activeIndex = autoIndex;

  d.nodes.forEach((node, i) => {
    node.userData.pulse *= Math.exp(-dt * 2.4);
    const active = i === d.activeIndex ? 1 : 0;
    const hover = hoverSub === i ? 1 : 0;
    const pulse = node.userData.pulse;
    const s = 1 + pulse * .36 + active * (.045 + .025 * Math.sin(t * 2.5 + i)) + hover * .11;
    node.scale.setScalar(s);
    node.userData.visual.rotation.x += dt * (.32 + i * .07);
    node.userData.visual.rotation.y += dt * (.42 + i * .05);
    node.userData.ring.rotation.z += dt * (.28 + i * .05);
    node.userData.ring.material.opacity = .28 + active * .22 + hover * .2 + pulse * .3;
    node.userData.glow.material.opacity = (.22 + active * .14 + hover * .16 + pulse * .2) * strength;
  });

  const packetSpeed = d.manualUntil > t ? .29 : .18;
  d.packets.forEach((p, j) => {
    const u = (t * packetSpeed + j / d.packets.length) % 1;
    const edgeF = u * 3;
    const edge = Math.floor(edgeF) % 3;
    const local = edgeF - Math.floor(edgeF);
    const A = TRIAD_POS[edge];
    const B = TRIAD_POS[(edge + 1) % 3];
    p.position.lerpVectors(A, B, local);
    p.position.z += Math.sin(local * Math.PI) * .34;
    p.material.opacity = strength * (.18 + .34 * Math.sin(local * Math.PI));
  });

  if (kind === 'machine') {
    d.field.rotation.y += dt * .1;
    d.field.rotation.x = Math.sin(t * .11) * .08;
    d.field.userData.lines.material.opacity = (.09 + .06 * Math.sin(t * 1.4) ** 2 + d.nodes[d.activeIndex].userData.pulse * .08) * strength;
  } else if (kind === 'maker') {
    d.field.rotation.y -= dt * (.14 + d.nodes[d.activeIndex].userData.pulse * .18);
    d.field.userData.knot.rotation.x += dt * .2;
    d.field.userData.knot.rotation.z -= dt * .11;
    const pulseScale = 1 + d.nodes[d.activeIndex].userData.pulse * .14;
    d.field.userData.shards.scale.setScalar(pulseScale);
  } else {
    const { grid, cells, cage } = d.field.userData;
    const impulse = d.nodes[d.activeIndex].userData.pulse;
    if (frame % 2 === 0) {
      cells.forEach((cell, i) => {
        const dist = Math.hypot(cell.x, cell.z);
        const wave = .5 + .5 * Math.sin(t * 2.1 - dist * 2.4 + cell.phase + d.activeIndex * 1.1);
        const h = .22 + wave * .65 + impulse * Math.max(0, 1 - dist / 2.4) * .85;
        dummy.position.set(cell.x, -1.5 + h * .5, cell.z);
        dummy.scale.set(1, h, 1);
        dummy.rotation.set(0, .08 * Math.sin(t + i), 0);
        dummy.updateMatrix();
        grid.setMatrixAt(i, dummy.matrix);
      });
      grid.instanceMatrix.needsUpdate = true;
    }
    cage.rotation.y += dt * .09;
  }
}

function endpoint(name, out) {
  if (name === 'unity') return out.set(0, 0, 0);
  return worlds[name].getWorldPosition(out);
}

function updateConnections(t, mixValue) {
  const fade = 1 - smooth01(clamp((mixValue - .18) / .65, 0, 1));
  connections.forEach((c, idx) => {
    const A = endpoint(c.a, vA);
    const B = endpoint(c.b, vB);
    vC.copy(A).lerp(B, .5);
    const dx = B.x - A.x;
    const dz = B.z - A.z;
    vD.set(-dz, .7 + Math.sin(t * .4 + c.seed) * .35, dx).normalize().multiplyScalar(.52 + .18 * Math.sin(t * .31 + idx));
    vC.add(vD);
    const arr = c.line.geometry.attributes.position.array;
    for (let i = 0; i < 49; i++) {
      const u = i / 48;
      const one = 1 - u;
      const wA = one * one;
      const wC = 2 * one * u;
      const wB = u * u;
      arr[i * 3] = A.x * wA + vC.x * wC + B.x * wB;
      arr[i * 3 + 1] = A.y * wA + vC.y * wC + B.y * wB;
      arr[i * 3 + 2] = A.z * wA + vC.z * wC + B.z * wB;
    }
    c.line.geometry.attributes.position.needsUpdate = true;
    c.line.material.opacity = c.baseOpacity * fade;
    c.packets.forEach((p, j) => {
      const u = (t * (.075 + idx * .004) + j / c.packets.length) % 1;
      const one = 1 - u;
      const wA = one * one;
      const wC = 2 * one * u;
      const wB = u * u;
      p.position.set(
        A.x * wA + vC.x * wC + B.x * wB,
        A.y * wA + vC.y * wC + B.y * wB,
        A.z * wA + vC.z * wC + B.z * wB
      );
      p.material.opacity = fade * (.12 + .28 * Math.sin(u * Math.PI));
    });
  });
}

function updateUnity(t, mixValue) {
  const fade = 1 - smooth01(clamp((mixValue - .05) / .65, 0, 1));
  const u = unity.userData;
  u.ringA.rotation.z += .0025;
  u.ringB.rotation.y -= .0018;
  u.core.rotation.y += .004;
  u.glow.material.opacity = fade * (.22 + .05 * Math.sin(t * 2.2));
  u.ringA.material.opacity = fade * .24;
  u.ringB.material.opacity = fade * .17;
  u.membrane.material.opacity = fade * (.018 + .009 * Math.sin(t * .7) ** 2);
  unity.visible = fade > .01;
}

function updateCamera(t, dt, mixValue) {
  const e = smooth01(mixValue);
  const portrait = camera.aspect < .82;
  const overviewZ = portrait ? 14.4 : 13.2;
  const overviewAngle = reducedMotion ? 0 : t * .018;
  const overview = vA.set(
    Math.sin(overviewAngle) * .8,
    .2 + Math.sin(t * .024) * .2,
    overviewZ + Math.cos(overviewAngle) * .35
  );
  const detailAngle = detailYaw + (reducedMotion ? 0 : t * .045);
  const detail = vB.set(
    Math.sin(detailAngle) * detailZoom,
    .65 + detailPitch * 2.1 + Math.sin(t * .12) * .12,
    Math.cos(detailAngle) * detailZoom
  );
  vC.lerpVectors(overview, detail, e);
  const follow = 1 - Math.exp(-8 * dt);
  camera.position.lerp(vC, follow);
  camera.lookAt(0, 0, 0);
}

function projectObject(obj, localOffset, element, visibleAlpha = 1) {
  obj.getWorldPosition(vA);
  if (localOffset) vA.add(localOffset);
  vA.project(camera);
  const x = (vA.x * .5 + .5) * innerWidth;
  const y = (-vA.y * .5 + .5) * innerHeight;
  const visible = vA.z > -1 && vA.z < 1 && x > -100 && x < innerWidth + 100 && y > -40 && y < innerHeight + 60;
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  element.style.opacity = visible ? String(visibleAlpha) : '0';
  element.style.pointerEvents = visible && visibleAlpha > .25 ? 'auto' : 'none';
}

function updateLabels(mixValue) {
  const e = smooth01(mixValue);
  if (e < .55) {
    Object.entries(worlds).forEach(([key, g]) => projectObject(g, vD.set(0, 1.72 * g.scale.x, 0), worldLabels[key], 1 - e * 1.8));
    projectObject(unity, null, unityLabel, 1 - e * 1.9);
  } else {
    Object.values(worldLabels).forEach((el) => { el.style.opacity = '0'; el.style.pointerEvents = 'none'; });
    unityLabel.style.opacity = '0';
  }

  if (activeWorld && e > .28) {
    const d = worlds[activeWorld].userData.detail.userData;
    const alpha = smooth01((e - .28) / .55);
    d.nodes.forEach((node, i) => projectObject(node, vD.set(0, .72, 0), subLabels[i], alpha));
  } else {
    subLabels.forEach((el) => { el.style.opacity = '0'; el.style.pointerEvents = 'none'; });
  }

  app.classList.toggle('detail', Boolean(activeWorld && (detailTarget > 0 || detailMix > .18)));
}

function raycastAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  if (activeWorld && detailMix > .55) {
    const hits = worlds[activeWorld].userData.detail.userData.nodes.map((n) => n.userData.hit);
    return raycaster.intersectObjects(hits, false)[0]?.object.userData || null;
  }
  const hits = Object.values(worlds).map((w) => w.userData.hit).filter((h) => h.parent?.visible);
  return raycaster.intersectObjects(hits, false)[0]?.object.userData || null;
}

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  dragStartX = dragLastX = e.clientX;
  dragStartY = dragLastY = e.clientY;
  dragDistance = 0;
  canvas.setPointerCapture?.(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (dragging && activeWorld && detailMix > .75) {
    const dx = e.clientX - dragLastX;
    const dy = e.clientY - dragLastY;
    dragDistance += Math.hypot(dx, dy);
    if (dragDistance > 4) {
      detailYaw -= dx * .006;
      detailPitch = clamp(detailPitch - dy * .004, -.62, .62);
    }
    dragLastX = e.clientX;
    dragLastY = e.clientY;
    hoverSub = -1;
    canvas.style.cursor = 'grabbing';
    return;
  }
  if (!coarsePointer && frame % 3 === 0) {
    const hit = raycastAt(e.clientX, e.clientY);
    hoverWorld = hit?.type === 'world' ? hit.world : null;
    hoverSub = hit?.type === 'sub' ? hit.index : -1;
    canvas.style.cursor = hit ? 'pointer' : 'default';
  }
});

canvas.addEventListener('pointerup', (e) => {
  const moved = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
  dragging = false;
  canvas.style.cursor = 'default';
  if (moved > 9 || dragDistance > 9) return;
  const hit = raycastAt(e.clientX, e.clientY);
  if (!hit) return;
  if (hit.type === 'world') enterWorld(hit.world);
  if (hit.type === 'sub') triggerSub(hit.index);
});
canvas.addEventListener('pointercancel', () => { dragging = false; canvas.style.cursor = 'default'; });
canvas.addEventListener('wheel', (e) => {
  if (!activeWorld || detailMix < .7) return;
  e.preventDefault();
  detailZoom = clamp(detailZoom + e.deltaY * .006, 5.4, 10.2);
}, { passive: false });

function resize() {
  const w = Math.max(1, innerWidth);
  const h = Math.max(1, innerHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize, { passive: true });
resize();

function performanceGovernor(rawDt) {
  fpsFrames++;
  fpsElapsed += rawDt;
  if (fpsElapsed < 2) return;
  const fps = fpsFrames / fpsElapsed;
  fpsFrames = 0;
  fpsElapsed = 0;
  if (fps < 43 && currentDpr > .78) {
    currentDpr = Math.max(.78, currentDpr - .12);
    renderer.setPixelRatio(currentDpr);
    resize();
    fastWindows = 0;
  } else if (fps > 58 && currentDpr < dprCap) {
    fastWindows++;
    if (fastWindows >= 3) {
      currentDpr = Math.min(dprCap, currentDpr + .08);
      renderer.setPixelRatio(currentDpr);
      resize();
      fastWindows = 0;
    }
  } else {
    fastWindows = Math.max(0, fastWindows - 1);
  }
}

function animate(now) {
  const rawDt = Math.max(0, (now - previous) / 1000);
  previous = now;
  const dt = Math.min(rawDt, 1 / 30);
  if (!document.hidden) simTime += reducedMotion ? dt * .18 : dt;

  detailMix = damp(detailMix, detailTarget, 4.25, dt);
  if (detailTarget === 0 && detailMix < .008 && activeWorld) {
    worlds[activeWorld].userData.detail.visible = false;
    activeWorld = null;
    hoverSub = -1;
    subLabels.forEach((el) => el.classList.remove('active'));
  }

  updateWorlds(simTime, dt, detailMix);
  if (frame % 2 === 0) updateConnections(simTime, detailMix);
  updateUnity(simTime, detailMix);
  updateCamera(simTime, dt, detailMix);
  if (frame % 2 === 0) updateLabels(detailMix);

  stars.rotation.y = simTime * .0015;
  stars.rotation.x = Math.sin(simTime * .01) * .025;
  renderer.render(scene, camera);

  if (!document.hidden) performanceGovernor(Math.min(rawDt, .1));
  frame++;
  requestAnimationFrame(animate);
}

document.addEventListener('visibilitychange', () => { previous = performance.now(); });
canvas.addEventListener('webglcontextlost', (e) => e.preventDefault(), false);
canvas.addEventListener('webglcontextrestored', resize, false);

updateWorlds(0, 1 / 60, 0);
updateConnections(0, 0);
updateUnity(0, 0);
updateCamera(0, 1 / 60, 0);
updateLabels(0);
setTimeout(() => loading.classList.add('hide'), 180);
setTimeout(() => { if (!activeWorld) hint.style.opacity = '.45'; }, 4200);
requestAnimationFrame(animate);
