import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------- constants ----------
const LANES = [-2.6, 0, 2.6];
const LANE_SWITCH_SPEED = 14;       // x units / sec
const GRAVITY = -38;
const JUMP_VELOCITY = 14;
const SLIDE_TIME = 0.65;
const START_SPEED = 13;             // world units / sec toward player
const ACCEL = 0.18;                 // speed gain per second, forever
const SPAWN_Z = -150;
const KILL_Z = 14;
const PLAYER_Z = 0;

// ---------- renderer / scene ----------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a1045);
scene.fog = new THREE.Fog(0x2a1045, 40, 140);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(0, 5.2, 9);
camera.lookAt(0, 1.2, -12);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xff9ad5, 0x3a1a5e, 0.9));
const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
sun.position.set(-8, 18, -6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
sun.shadow.camera.top = 30;   sun.shadow.camera.bottom = -45;
sun.shadow.camera.far = 90;
scene.add(sun);

// ---------- environment ----------
// sun disc on the horizon
const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(18, 48),
  new THREE.MeshBasicMaterial({ color: 0xff7a4d, fog: false })
);
sunDisc.position.set(0, 8, -180);
scene.add(sunDisc);
const sunGlow = new THREE.Mesh(
  new THREE.CircleGeometry(30, 48),
  new THREE.MeshBasicMaterial({ color: 0xff5e7a, transparent: true, opacity: 0.35, fog: false })
);
sunGlow.position.set(0, 8, -181);
scene.add(sunGlow);

// road
const road = new THREE.Mesh(
  new THREE.PlaneGeometry(10.4, 400),
  new THREE.MeshStandardMaterial({ color: 0x3d2a63, roughness: 0.9 })
);
road.rotation.x = -Math.PI / 2;
road.position.z = -160;
road.receiveShadow = true;
scene.add(road);

// shoulders
for (const side of [-1, 1]) {
  const shoulder = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 400),
    new THREE.MeshStandardMaterial({ color: 0x241040, roughness: 1 })
  );
  shoulder.rotation.x = -Math.PI / 2;
  shoulder.position.set(side * 35.2, -0.02, -160);
  shoulder.receiveShadow = true;
  scene.add(shoulder);
}

// scrolling lane dashes
const dashes = [];
{
  const dashGeo = new THREE.BoxGeometry(0.14, 0.02, 1.6);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0x8a5cff });
  for (let i = 0; i < 36; i++) {
    for (const x of [-1.3, 1.3]) {
      const d = new THREE.Mesh(dashGeo, dashMat);
      d.position.set(x, 0.011, -i * 5);
      scene.add(d);
      dashes.push(d);
    }
  }
}

// neon edge rails
for (const side of [-1, 1]) {
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.18, 400),
    new THREE.MeshBasicMaterial({ color: 0xff4fa0 })
  );
  rail.position.set(side * 5.3, 0.09, -160);
  scene.add(rail);
}

// city blocks scrolling by on both sides
const buildings = [];
{
  const palette = [0x4b2a7a, 0x5e3391, 0x3a2066, 0x6e3aa8];
  for (let i = 0; i < 26; i++) {
    const w = 3 + Math.random() * 5;
    const h = 4 + Math.random() * 16;
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 3 + Math.random() * 4),
      new THREE.MeshStandardMaterial({ color: palette[i % palette.length], roughness: 0.8 })
    );
    const side = i % 2 === 0 ? -1 : 1;
    b.position.set(side * (8.5 + Math.random() * 9), h / 2, -i * 13 - Math.random() * 6);
    scene.add(b);
    buildings.push(b);
  }
}

// models unchecked in the gallery (models.html) don't spawn
const DISABLED_MODELS = new Set(JSON.parse(localStorage.getItem('egoRunDisabledModels') || '[]'));
// per-model role set in the gallery: 'obstacle' spawns on the 3 lanes, 'design' is roadside scenery
const MODEL_ROLES = JSON.parse(localStorage.getItem('egoRunModelRoles') || '{}');
const roleOf = (name) => MODEL_ROLES[name] || (name.startsWith('tree') ? 'design' : 'obstacle');

// ---------- tree models (Blender exports) ----------
const TREE_FILES = [
  'tree-branched', 'tree-columnar', 'tree-conical', 'tree-open', 'tree-oval',
  'tree-pyramidal', 'tree-round', 'tree-spreading', 'tree-vase',
];
const LEAF_COLORS = [0x2ea35e, 0x3ddc97, 0x47b86b, 0x1f8a4c, 0x6fcf6f];
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3b2e, roughness: 0.9 });
const treeTemplates = [];   // normalized: base at y=0, height 1
const decorTrees = [];

// decor is planted once every enabled model has finished (or failed) loading
let pendingLoads = 0;
function loadDone() { if (--pendingLoads === 0) plantDecor(); }

{
  const loader = new GLTFLoader();
  for (const name of TREE_FILES) {
    if (DISABLED_MODELS.has(name)) continue;
    pendingLoads++;
    loader.load(`assets/models/${name}.glb`, (gltf) => {
      const root = gltf.scene;
      // strip helper geometry (tree-vase ships a ground plane)
      root.traverse((o) => { if (o.name === 'ground') o.visible = false; });
      // normalize: feet on y=0, centered on x/z, height exactly 1
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const wrap = new THREE.Group();
      root.position.set(-center.x, -box.min.y, -center.z);
      wrap.add(root);
      wrap.scale.setScalar(1 / size.y);
      const holder = new THREE.Group();
      holder.add(wrap);
      treeTemplates.push({ holder, name });
      loadDone();
    }, undefined, loadDone);
  }
}

function makeTree(tpl, height, leafColor) {
  const tree = tpl.holder.clone(true);
  const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.8 });
  tree.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.material = o.name.includes('leaves') ? leafMat : trunkMat;
  });
  tree.scale.multiplyScalar(height);
  tree.rotation.y = Math.random() * Math.PI * 2;
  return tree;
}

function plantDecor() {
  const dTrees = treeTemplates.filter(t => roleOf(t.name) === 'design');
  const dVehicles = vehicleTemplates.filter(v => roleOf(v.name) === 'design');
  const dRocks = rockTemplates.filter(r => roleOf(r.name) === 'design');
  if (!dTrees.length && !dVehicles.length && !dRocks.length) return;
  for (let i = 0; i < 22; i++) {
    const roll = Math.random();
    let item;
    if (dTrees.length && (roll < 0.6 || (!dVehicles.length && !dRocks.length))) {
      const tpl = dTrees[Math.floor(Math.random() * dTrees.length)];
      item = makeTree(tpl, 3.5 + Math.random() * 4, LEAF_COLORS[i % LEAF_COLORS.length]);
    } else if (dRocks.length && (roll < 0.8 || !dVehicles.length)) {
      item = makeRockFrom(dRocks[Math.floor(Math.random() * dRocks.length)], 1.8 + Math.random() * 2.5).mesh;
    } else {
      const v = makeVehicleFrom(dVehicles[Math.floor(Math.random() * dVehicles.length)]);
      item = v.mesh;
      item.scale.multiplyScalar(1.25);
      item.rotation.y += (Math.random() - 0.5) * 0.5;
    }
    const side = i % 2 === 0 ? -1 : 1;
    item.position.set(side * (6.8 + Math.random() * 3.5), 0, -i * 15 - Math.random() * 8);
    scene.add(item);
    decorTrees.push(item);
  }
}

// ---------- vehicle models (Blender exports) ----------
const VEHICLE_FILES = [
  'bicycle', 'bus', 'car_01', 'car_02', 'car_03', 'car_04', 'jeep_01', 'jeep_02',
  'pickup', 'truck_01', 'truck_02', 'truck_03', 'truck_04', 'truck_05',
];
const BODY_COLORS = [0xff5e7a, 0x4dd0e1, 0xffd24a, 0xb04ddb, 0xf2f2f2, 0xff8c42];
const vehicleTemplates = [];   // { tpl, height } — oriented along road, lane-width

{
  const loader = new GLTFLoader();
  for (const name of VEHICLE_FILES) {
    if (DISABLED_MODELS.has(name)) continue;
    pendingLoads++;
    loader.load(`assets/models/${name}.glb`, (gltf) => {
      const root = gltf.scene;
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const inner = new THREE.Group();
      root.position.set(-center.x, -box.min.y, -center.z);
      inner.add(root);
      if (size.x > size.z) inner.rotation.y = Math.PI / 2;  // longest axis along the road
      const width = Math.min(size.x, size.z);
      const length = Math.max(size.x, size.z);
      const s = Math.min(1.8 / width, 4.5 / length);
      const wrap = new THREE.Group();
      wrap.add(inner);
      wrap.scale.setScalar(s);
      vehicleTemplates.push({ tpl: wrap, height: size.y * s, zHalf: (length * s) / 2, name });
      loadDone();
    }, undefined, loadDone);
  }
}

function makeVehicleFrom(v) {
  const mesh = v.tpl.clone(true);
  const painted = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const body = new THREE.MeshStandardMaterial({
    color: BODY_COLORS[Math.floor(Math.random() * BODY_COLORS.length)], roughness: 0.6,
  });
  mesh.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.material = o.geometry.getAttribute('color') ? painted : body;
  });
  if (Math.random() < 0.5) mesh.rotation.y += Math.PI;
  return { mesh, height: v.height, zHalf: v.zHalf };
}

// ---------- sword models (weapon pickups) ----------
const SWORD_FILES = ['sword_1', 'sword_2', 'sword_3', 'sword_4', 'sword_5', 'sword_6', 'sword_7', 'sword_8', 'sword_9'];
const SWORD_TINTS = [0xcfd6e0, 0xffd24a, 0x9ad6ff, 0xff8c6a, 0xc8a2ff];
const swordTemplates = [];   // normalized: centered, blade along Y, length 1

{
  const loader = new GLTFLoader();
  for (const name of SWORD_FILES) {
    if (DISABLED_MODELS.has(name)) continue;
    pendingLoads++;
    loader.load(`assets/models/${name}.glb`, (gltf) => {
      const root = gltf.scene;
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      root.position.set(-center.x, -center.y, -center.z);
      const inner = new THREE.Group();
      inner.add(root);
      // turn the longest axis into Y so the blade stands upright
      if (size.x >= size.y && size.x >= size.z) inner.rotation.z = -Math.PI / 2;
      else if (size.z >= size.y && size.z >= size.x) inner.rotation.x = -Math.PI / 2;
      const wrap = new THREE.Group();
      wrap.add(inner);
      wrap.scale.setScalar(1 / Math.max(size.x, size.y, size.z));
      swordTemplates.push({ holder: wrap, name });
      loadDone();
    }, undefined, loadDone);
  }
}

function makeSword(tpl) {
  const sword = tpl.holder.clone(true);
  const painted = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.6 });
  const steel = new THREE.MeshStandardMaterial({
    color: SWORD_TINTS[Math.floor(Math.random() * SWORD_TINTS.length)],
    roughness: 0.3, metalness: 0.85,
  });
  sword.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.material = o.geometry.getAttribute('color') ? painted : steel;
  });
  return sword;
}

// ---------- rock models (real textured meshes — keep their own materials) ----------
const ROCK_FILES = ['rock_01', 'rock_02'];
const rockTemplates = [];   // { holder, name, nx, nz } — normalized to height 1

{
  const loader = new GLTFLoader();
  for (const name of ROCK_FILES) {
    if (DISABLED_MODELS.has(name)) continue;
    pendingLoads++;
    loader.load(`assets/models/${name}.glb`, (gltf) => {
      const root = gltf.scene;
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        // some packs ship without vertex normals — flat shade looks wrong without them
        if (!o.geometry.getAttribute('normal')) o.geometry.computeVertexNormals();
      });
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      root.position.set(-center.x, -box.min.y, -center.z);  // feet at y=0, centered on x/z
      const wrap = new THREE.Group();
      wrap.add(root);
      wrap.scale.setScalar(1 / size.y);   // normalize: height exactly 1
      rockTemplates.push({ holder: wrap, name, nx: size.x / size.y, nz: size.z / size.y });
      loadDone();
    }, undefined, loadDone);
  }
}

// keeps the GLB's baked texture — only scales + spins for variety
function makeRockFrom(tpl, height) {
  const rock = tpl.holder.clone(true);
  rock.scale.multiplyScalar(height);
  rock.rotation.y = Math.random() * Math.PI * 2;
  return { mesh: rock, height, zHalf: Math.max(0.5, (tpl.nz * height) / 2) };
}

// ---------- player: Ego himself (user-supplied GLB) ----------
const player = new THREE.Group();
const ego = new THREE.Group();
ego.rotation.y = Math.PI;     // face down the road, away from the camera
player.add(ego);

// load the GLB and split it into limbs (arms, legs, body) so the rigid sculpt
// can run. Tripo ships merged shells, so we re-segment by spatial region while
// keeping each triangle's UVs and source texture.
const egoModel = new THREE.Group();
ego.add(egoModel);
const egoLimbs = { body: null, armL: null, armR: null, legL: null, legR: null };
// Cut settings — same shape as the limb editor's "copy settings JSON"
// (monster-3d). Paste tuned values straight in here.
const EGO_CUTS = {
  yawDeg: -90, pitchDeg: 0, rollDeg: 0,
  hip: 0.50, legInner: 0,
  armLo: 0.50, armHi: 0.80, armInner: 0.28,
  legSwing: 0.7, armSwing: 0.6,
};
{
  const loader = new GLTFLoader();
  loader.load('assets/models/ego.glb', (gltf) => {
    const root = gltf.scene;
    root.updateWorldMatrix(true, true);
    // collect all triangles: positions (rotated upright), UVs, source material
    const posChunks = [], uvChunks = [], matCounts = [];
    const srcMaterials = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      const p = g.getAttribute('position').array;
      const uv = g.getAttribute('uv') ? g.getAttribute('uv').array : new Float32Array((p.length / 3) * 2);
      posChunks.push(p);
      uvChunks.push(uv);
      matCounts.push(p.length / 9);
      srcMaterials.push(o.material);
    });
    const total = posChunks.reduce((s, c) => s + c.length, 0);
    const pos = new Float32Array(total);
    const uvs = new Float32Array(total / 3 * 2);
    const triMat = new Uint8Array(total / 9);
    let o3 = 0, o2 = 0, ot = 0;
    for (let i = 0; i < posChunks.length; i++) {
      pos.set(posChunks[i], o3); o3 += posChunks[i].length;
      uvs.set(uvChunks[i], o2); o2 += uvChunks[i].length;
      triMat.fill(i, ot, ot + matCounts[i]); ot += matCounts[i];
    }
    // rotate upright: yaw -> pitch -> roll (in place)
    const yaw = EGO_CUTS.yawDeg * Math.PI / 180, pit = EGO_CUTS.pitchDeg * Math.PI / 180, rol = EGO_CUTS.rollDeg * Math.PI / 180;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit), cr = Math.cos(rol), sr = Math.sin(rol);
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y0 = pos[i+1], z = pos[i+2];
      let rx = x * cy + z * sy, rz = -x * sy + z * cy, ry = y0;
      const py_ = ry * cp - rz * sp, pz_ = ry * sp + rz * cp; ry = py_; rz = pz_;
      const qx_ = rx * cr - ry * sr, qy_ = rx * sr + ry * cr; rx = qx_; ry = qy_;
      pos[i] = rx; pos[i+1] = ry; pos[i+2] = rz;
      if (rx<minX)minX=rx; if (rx>maxX)maxX=rx;
      if (ry<minY)minY=ry; if (ry>maxY)maxY=ry;
      if (rz<minZ)minZ=rz; if (rz>maxZ)maxZ=rz;
    }
    const cx=(minX+maxX)/2, cz=(minZ+maxZ)/2, feetY=minY, H=maxY-minY, W=maxX-minX;
    const hipY = feetY + EGO_CUTS.hip * H;
    const armLoY = feetY + EGO_CUTS.armLo * H, armHiY = feetY + EGO_CUTS.armHi * H;
    const armX = EGO_CUTS.armInner * W, legX = EGO_CUTS.legInner * W;
    // classify triangles into the 5 regions
    const idx = { body: [], armL: [], armR: [], legL: [], legR: [] };
    const triCount = pos.length / 9;
    for (let tIdx = 0; tIdx < triCount; tIdx++) {
      const b = tIdx * 9;
      const my = (pos[b+1] + pos[b+4] + pos[b+7]) / 3;
      const xr = (pos[b] + pos[b+3] + pos[b+6]) / 3 - cx;
      let key = 'body';
      if (my < hipY && Math.abs(xr) > legX) key = xr < 0 ? 'legL' : 'legR';
      else if (my >= armLoY && my < armHiY && Math.abs(xr) > armX) key = xr < 0 ? 'armL' : 'armR';
      idx[key].push(tIdx);
    }
    const centroidX = (list) => {
      if (!list.length) return cx;
      let s = 0;
      for (const tIdx of list) { const b = tIdx*9; s += (pos[b] + pos[b+3] + pos[b+6]) / 3; }
      return s / list.length;
    };
    const pivots = {
      body: [cx, feetY, cz],
      legL: [centroidX(idx.legL), hipY, cz], legR: [centroidX(idx.legR), hipY, cz],
      armL: [centroidX(idx.armL), armHiY, cz], armR: [centroidX(idx.armR), armHiY, cz],
    };
    // build one mesh per (limb, source material) so textures survive the cut
    const inner = new THREE.Group();
    for (const key of Object.keys(idx)) {
      const [px, py, pz] = pivots[key];
      const grp = new THREE.Group();
      grp.position.set(px, py, pz);
      const byMat = new Map();
      for (const tIdx of idx[key]) {
        const mi = triMat[tIdx];
        if (!byMat.has(mi)) byMat.set(mi, []);
        byMat.get(mi).push(tIdx);
      }
      for (const [mi, tlist] of byMat) {
        const arr = new Float32Array(tlist.length * 9);
        const uvArr = new Float32Array(tlist.length * 6);
        for (let i = 0; i < tlist.length; i++) {
          const b = tlist[i] * 9, ub = tlist[i] * 6;
          for (let k = 0; k < 9; k += 3) {
            arr[i*9+k]   = pos[b+k]   - px;
            arr[i*9+k+1] = pos[b+k+1] - py;
            arr[i*9+k+2] = pos[b+k+2] - pz;
          }
          for (let k = 0; k < 6; k++) uvArr[i*6+k] = uvs[ub+k];
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, srcMaterials[mi]);
        mesh.castShadow = true; mesh.receiveShadow = true;
        grp.add(mesh);
      }
      inner.add(grp);
      egoLimbs[key] = grp;
    }
    inner.position.set(-cx, -feetY, -cz);
    const container = new THREE.Group();
    container.add(inner);
    container.scale.setScalar(2.4 / H);
    egoModel.add(container);
  });
}

// jetpack + sword-mount attach to the real ego; the procedural body below builds
// into a detached group only to keep that rig code, and is never rendered.
const egoRig = ego;
const egoParts = (() => {
  const ego = new THREE.Group();   // shadow: procedural meshes build here, off-scene
  const mat = (color, rough = 0.65) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
  const RED      = mat(0xd94f5c);
  const RED_DARK = mat(0xa8323f);
  const WHITE    = mat(0xf2ede4, 0.8);
  const GOLD     = mat(0xe8a93c, 0.45);
  const HORN     = mat(0x8a4a2a, 0.6);
  const PURPLE   = mat(0x4a2a6a, 0.4);
  const MAGENTA  = mat(0xc04a8a, 0.55);
  const DARKMOUTH= mat(0x3a1228, 0.9);
  const BLACK    = mat(0x2a1020, 0.9);
  const sphere = (r, m, sx = 1, sy = 1, sz = 1) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), m);
    s.scale.set(sx, sy, sz);
    s.castShadow = true;
    return s;
  };

  // the whole body is one egg: white base + red "hood" dome on top
  const body = new THREE.Group();
  body.position.y = 1.35;
  ego.add(body);
  body.add(sphere(1.0, WHITE, 1.0, 1.12, 0.92));
  const hood = new THREE.Mesh(
    new THREE.SphereGeometry(1.03, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.58), RED);
  hood.scale.set(1.0, 1.12, 0.92);
  hood.castShadow = true;
  body.add(hood);
  // zigzag trim where red meets white (front)
  const trim = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const a = -0.9 + i * 0.2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 4), RED);
    tooth.position.set(Math.sin(a) * 0.99, -0.18, Math.cos(a) * 0.91);
    tooth.rotation.x = Math.PI;
    tooth.lookAt(0, -2.5, 0);
    trim.add(tooth);
  }
  trim.position.y = -0.16;
  body.add(trim);

  // face
  const face = new THREE.Group();
  face.position.set(0, 0.42, 0.66);
  body.add(face);
  function makeEye(side) {
    const g = new THREE.Group();
    g.add(sphere(0.26, PURPLE, 1, 1.05, 0.5));
    const star = new THREE.Group();
    const spikeV = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), GOLD);
    spikeV.scale.set(0.35, 1.0, 0.35);
    const spikeH = spikeV.clone();
    spikeH.rotation.z = Math.PI / 2;
    star.add(spikeV, spikeH);
    star.position.z = 0.12;
    g.add(star);
    const glint = sphere(0.045, mat(0xffffff, 0.2));
    glint.position.set(0.08, 0.1, 0.13);
    g.add(glint);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.06), GOLD);
    brow.position.set(0, 0.3, -0.02);
    brow.rotation.z = side * -0.45;
    g.add(brow);
    g.position.set(side * 0.42, 0.05, 0.12);
    g.rotation.y = side * 0.35;
    return g;
  }
  face.add(makeEye(-1), makeEye(1));
  const browStar = new THREE.Group();
  {
    const v = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), GOLD);
    v.scale.set(0.35, 1, 0.35);
    const h = v.clone(); h.rotation.z = Math.PI / 2;
    browStar.add(v, h);
  }
  browStar.position.set(0, 0.42, -0.06);
  face.add(browStar);
  const mouth = sphere(0.3, DARKMOUTH, 1.15, 0.55, 0.4);
  mouth.position.set(0, -0.42, 0.22);
  face.add(mouth);
  for (const s of [-1, 1]) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), WHITE);
    fang.position.set(s * 0.18, -0.36, 0.36);
    face.add(fang);
  }
  const tongue = sphere(0.1, mat(0xe06a8a, 0.5), 1.2, 0.6, 0.8);
  tongue.position.set(0, -0.5, 0.32);
  face.add(tongue);

  // horns
  for (const s of [-1, 1]) {
    const horn = new THREE.Group();
    const base = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 16), RED_DARK);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.2, 16), HORN);
    tip.position.y = 0.18;
    horn.add(base, tip);
    horn.position.set(s * 0.68, 1.12, 0.12);
    horn.rotation.z = s * -0.5;
    horn.children.forEach(c => c.castShadow = true);
    body.add(horn);
  }

  // arms
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    const upper = sphere(0.21, WHITE, 1, 1.7, 1);
    upper.position.y = -0.25;
    arm.add(upper);
    const paw = sphere(0.23, WHITE);
    paw.position.y = -0.62;
    arm.add(paw);
    const pad = sphere(0.1, GOLD, 1, 1, 0.5);
    pad.position.set(0, -0.62, 0.17);
    arm.add(pad);
    arm.position.set(s * 1.02, 0.05, 0.15);
    arm.rotation.z = s * 1.05;
    body.add(arm);
    arms.push(arm);
  }

  // legs
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.add(sphere(0.3, WHITE, 1, 1.25, 1));
    const foot = sphere(0.3, WHITE, 1.15, 0.7, 1.35);
    foot.position.set(0, -0.42, 0.12);
    leg.add(foot);
    const pad = sphere(0.11, GOLD, 1, 0.5, 1);
    pad.position.set(0, -0.6, 0.3);
    leg.add(pad);
    leg.position.set(s * 0.52, 0.62, 0.32);
    ego.add(leg);
    legs.push(leg);
  }

  // gold belly spots
  for (const s of [-1, 1]) {
    const spot = sphere(0.13, GOLD, 1, 1, 0.45);
    spot.position.set(s * 0.38, -0.62, 0.66);
    spot.lookAt(s * 1.2, -1.4, 2.6);
    body.add(spot);
  }
  // claw scratch + stitches on the back
  for (let i = -1; i <= 1; i++) {
    const slash = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.04), RED_DARK);
    slash.position.set(i * 0.17, 0.55 + Math.abs(i) * -0.06, -0.82);
    slash.rotation.x = -0.35;
    slash.rotation.z = i * 0.12;
    body.add(slash);
  }
  for (let i = 0; i < 3; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.03), BLACK);
    st.position.set(0, 0.95 - i * 0.12, -0.46 - i * 0.07);
    st.rotation.x = -0.5;
    body.add(st);
  }
  // purple diamond flowers on the rear
  function diamondFlower(x, y, scale) {
    const g = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), MAGENTA);
    outer.scale.set(1, 1.25, 0.35);
    const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), PURPLE);
    inner.scale.set(1, 1.25, 0.4);
    inner.position.z = -0.03;
    const dot = sphere(0.035, GOLD);
    dot.position.z = -0.07;
    g.add(outer, inner, dot);
    g.position.set(x, y, -0.78);
    g.rotation.x = 0.35;
    g.scale.setScalar(scale);
    return g;
  }
  body.add(diamondFlower(0.22, -0.55, 1.0));
  body.add(diamondFlower(-0.12, -0.72, 0.8));

  // head buddy: little magenta blob
  const buddy = new THREE.Group();
  buddy.add(sphere(0.3, MAGENTA, 1, 1.15, 0.95));
  const blobTop = sphere(0.12, MAGENTA, 1, 1.4, 1);
  blobTop.position.set(0.05, 0.32, 0);
  blobTop.rotation.z = -0.4;
  buddy.add(blobTop);
  for (const s of [-1, 1]) {
    const eye = sphere(0.05, PURPLE, 1, 1.4, 0.5);
    eye.position.set(s * 0.12, 0.02, 0.27);
    buddy.add(eye);
  }
  const buddyMouth = sphere(0.05, DARKMOUTH, 1.4, 0.5, 0.5);
  buddyMouth.position.set(0, -0.12, 0.28);
  buddy.add(buddyMouth);
  for (const [x, y] of [[0.18, 0.18], [-0.15, 0.22]]) {
    const sp = sphere(0.05, mat(0x8a2a5a, 0.6), 1, 1, 0.4);
    sp.position.set(x, y, 0.26);
    buddy.add(sp);
  }
  buddy.position.set(0.12, 2.62, 0.1);
  buddy.rotation.z = -0.15;
  ego.add(buddy);

  // jetpack — pops on while airborne
  const jetpack = new THREE.Group();
  const METAL = new THREE.MeshStandardMaterial({ color: 0x9aa4b8, roughness: 0.35, metalness: 0.8 });
  const METAL_DARK = new THREE.MeshStandardMaterial({ color: 0x4a5468, roughness: 0.5, metalness: 0.7 });
  const flames = [];
  for (const s of [-1, 1]) {
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 8, 16), METAL);
    tank.position.set(s * 0.3, 0, 0);
    tank.castShadow = true;
    jetpack.add(tank);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.225, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), RED);
    cap.position.set(s * 0.3, 0.28, 0);
    jetpack.add(cap);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.22, 16), METAL_DARK);
    nozzle.position.set(s * 0.3, -0.48, 0);
    jetpack.add(nozzle);
    const flame = new THREE.Group();
    const outer = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.7, 16),
      new THREE.MeshBasicMaterial({ color: 0xff8c2e, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    outer.rotation.x = Math.PI;
    outer.position.y = -0.35;
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.45, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe97a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.rotation.x = Math.PI;
    core.position.y = -0.22;
    flame.add(outer, core);
    flame.position.set(s * 0.3, -0.58, 0);
    jetpack.add(flame);
    flames.push(flame);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.12), METAL_DARK);
  bar.position.set(0, 0.05, 0.12);
  jetpack.add(bar);
  const jetGlow = new THREE.PointLight(0xff9c4e, 0, 6, 2);
  jetGlow.position.set(0, -0.8, 0);
  jetpack.add(jetGlow);
  jetpack.position.set(0, 1.25, -0.95);   // mid-back, behind the GLB
  jetpack.visible = false;
  egoRig.add(jetpack);

  // weapon mount near Ego's right hand — picked-up swords attach here
  const swordMount = new THREE.Group();
  swordMount.position.set(0.85, 1.15, 0.35);
  swordMount.rotation.x = -0.6;   // blade angled up-forward
  egoRig.add(swordMount);

  return { model: egoModel, jetpack, flames, jetGlow, swordMount };
})();
scene.add(player);

// ---------- obstacles & coins ----------
const obstacles = [];   // { mesh, type, lane, z }
const coins = [];       // { mesh, lane, z, taken }
const obstaclePool = scene;

const crateMat = new THREE.MeshStandardMaterial({ color: 0xb04ddb, roughness: 0.6 });
const hurdleMat = new THREE.MeshStandardMaterial({ color: 0xff5e7a, roughness: 0.5 });
const beamMat = new THREE.MeshStandardMaterial({ color: 0x4dd0e1, roughness: 0.5 });
const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.8 });
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: 0.2, metalness: 0.85, emissive: 0x6b4a00 });
const coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 20);

// type: 'crate' (dodge), 'hurdle' (jump), 'beam' (slide)
function makeObstacle(type, lane, z) {
  const g = new THREE.Group();
  let height = 99;   // blocking height for 'crate'-type obstacles (jump clears ~2.5)
  let zHalf = 0.6;   // half-length along the road, for collision + standing on top
  if (type === 'crate') {
    const oVehicles = vehicleTemplates.filter(v => roleOf(v.name) === 'obstacle');
    const oTrees = treeTemplates.filter(t => roleOf(t.name) === 'obstacle');
    const oRocks = rockTemplates.filter(r => roleOf(r.name) === 'obstacle');
    const kinds = [];
    if (oVehicles.length) kinds.push('vehicle', 'vehicle');   // vehicles weighted heavier
    if (oRocks.length) kinds.push('rock');
    if (oTrees.length) kinds.push('tree');
    const kind = kinds.length ? kinds[Math.floor(Math.random() * kinds.length)] : 'box';
    if (kind === 'vehicle') {
      const v = makeVehicleFrom(oVehicles[Math.floor(Math.random() * oVehicles.length)]);
      g.add(v.mesh);
      height = v.height;
      zHalf = v.zHalf;
    } else if (kind === 'rock') {
      const r = makeRockFrom(oRocks[Math.floor(Math.random() * oRocks.length)], 2.0 + Math.random() * 1.2);
      g.add(r.mesh);
      height = r.height;
      zHalf = r.zHalf;
    } else if (kind === 'tree') {
      height = 2.6 + Math.random() * 0.7;
      const tpl = oTrees[Math.floor(Math.random() * oTrees.length)];
      g.add(makeTree(tpl, height, LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)]));
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.4, 1.2), crateMat);
      m.position.y = 1.2;
      m.castShadow = true;
      g.add(m);
      height = 2.4;
    }
  } else if (type === 'hurdle') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.22, 0.22), hurdleMat);
    bar.position.y = 0.75;
    bar.castShadow = true;
    g.add(bar);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.75, 0.14), postMat);
      post.position.set(s * 0.95, 0.375, 0);
      g.add(post);
    }
  } else { // beam — must slide under
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.35, 0.35), beamMat);
    bar.position.y = 1.45;
    bar.castShadow = true;
    g.add(bar);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.45, 0.14), postMat);
      post.position.set(s * 0.95, 0.725, 0);
      g.add(post);
    }
  }
  g.position.set(LANES[lane], 0, z);
  obstaclePool.add(g);
  obstacles.push({ mesh: g, type, lane, z, height, zHalf });
}

const swordPickups = [];   // { mesh, lane, taken, tpl }
let swordsPicked = 0;
let equippedSword = null;  // the sword mesh in Ego's hand, or null
let slashTimer = 0;        // arm-swing timer for the slash animation
const debris = [];         // flying shards + the flung sword: { mesh, vx,vy,vz, spin, life, max }

function makeSwordPickup(lane, z) {
  if (!swordTemplates.length) return;
  const tpl = swordTemplates[Math.floor(Math.random() * swordTemplates.length)];
  const g = new THREE.Group();
  const sword = makeSword(tpl);
  sword.scale.setScalar(1.5);
  g.add(sword);
  g.position.set(LANES[lane], 1.2, z);
  g.rotation.z = 0.35;
  scene.add(g);
  swordPickups.push({ mesh: g, lane, taken: false, tpl });
}

function equipSword(tpl) {
  while (egoParts.swordMount.children.length) egoParts.swordMount.remove(egoParts.swordMount.children[0]);
  const sword = makeSword(tpl);
  sword.scale.setScalar(0.5);
  sword.position.y = 0.16;   // grip in the paw, blade up
  egoParts.swordMount.add(sword);
  equippedSword = sword;
}

// slash through one obstacle: destroy it, shatter the held sword, swing the arm
const shardMat = new THREE.MeshStandardMaterial({ color: 0xeaf2ff, roughness: 0.3, metalness: 0.8 });
const shardGeo = new THREE.TetrahedronGeometry(0.22);
const flashGeo = new THREE.PlaneGeometry(3.4, 3.4);
function slashObstacle(o) {
  // remove the obstacle
  scene.remove(o.mesh);
  const idx = obstacles.indexOf(o);
  if (idx >= 0) obstacles.splice(idx, 1);

  const hit = o.mesh.position.clone();

  // fling the held sword out of the hand, spinning
  if (equippedSword) {
    const wp = new THREE.Vector3();
    equippedSword.getWorldPosition(wp);
    egoParts.swordMount.remove(equippedSword);
    equippedSword.position.copy(wp);
    equippedSword.scale.setScalar(0.5 * 0.78); // keep apparent size after reparent from scaled ego
    scene.add(equippedSword);
    debris.push({ mesh: equippedSword, vx: 3, vy: 7, vz: 5, spin: 14, life: 0, max: 0.8 });
    equippedSword = null;
  }

  // burst of metal shards at the impact point
  for (let i = 0; i < 9; i++) {
    const shard = new THREE.Mesh(shardGeo, shardMat);
    shard.position.copy(hit).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 1 + Math.random(), (Math.random() - 0.5) * 1.2));
    shard.castShadow = true;
    scene.add(shard);
    debris.push({
      mesh: shard,
      vx: (Math.random() - 0.5) * 9, vy: 3 + Math.random() * 7, vz: (Math.random() - 0.5) * 9,
      spin: 8 + Math.random() * 14, life: 0, max: 0.55 + Math.random() * 0.25,
    });
  }

  // white slash flash facing the camera
  const flash = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  flash.position.copy(hit).setY(1.3);
  flash.rotation.z = Math.random() * Math.PI;
  scene.add(flash);
  debris.push({ mesh: flash, vx: 0, vy: 0, vz: 0, spin: 0, life: 0, max: 0.25, flash: true });

  slashTimer = 0.32;
  sfx.slash2();
}

function makeCoin(lane, z) {
  const m = new THREE.Mesh(coinGeo, coinMat);
  m.rotation.z = Math.PI / 2;
  m.position.set(LANES[lane], 1.1, z);
  scene.add(m);
  coins.push({ mesh: m, lane, z, taken: false });
}

// spawn a wave: 1-2 obstacles across lanes (always a survivable path) + maybe coins
let nextSpawnZ = -40;
function spawnWave(z) {
  const lanes = [0, 1, 2];
  const types = ['crate', 'hurdle', 'beam'];
  const count = Math.random() < 0.45 ? 2 : 1;
  const used = [];
  for (let i = 0; i < count; i++) {
    const lane = lanes.splice(Math.floor(Math.random() * lanes.length), 1)[0];
    const type = types[Math.floor(Math.random() * types.length)];
    makeObstacle(type, lane, z);
    used.push(lane);
  }
  // coin line in a free lane
  if (Math.random() < 0.65 && lanes.length) {
    const lane = lanes[Math.floor(Math.random() * lanes.length)];
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) makeCoin(lane, z - i * 2.2);
  }
  // rare sword pickup in a free lane
  if (Math.random() < 0.12 && lanes.length) {
    const lane = lanes[Math.floor(Math.random() * lanes.length)];
    makeSwordPickup(lane, z - 9);
  }
}

// ---------- audio (synthesized, no assets) ----------
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
function beep(freq, dur, type = 'square', vol = 0.18, sweepTo = null) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const gn = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  gn.gain.setValueAtTime(vol, t);
  gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(gn).connect(audioCtx.destination);
  o.start(t); o.stop(t + dur);
}
const sfx = {
  sword: () => { beep(900, 0.08, 'sawtooth', 0.1, 2200); setTimeout(() => beep(1400, 0.18, 'sine', 0.12, 2800), 60); },
  slash2: () => {  // metallic swipe + shatter
    beep(2600, 0.12, 'sawtooth', 0.16, 400);
    setTimeout(() => { beep(1800, 0.08, 'triangle', 0.12, 3200); beep(3400, 0.1, 'square', 0.06, 5000); }, 30);
  },
  jump:  () => beep(300, 0.25, 'square', 0.12, 620),
  slide: () => beep(220, 0.2, 'sawtooth', 0.1, 120),
  coin:  () => { beep(880, 0.09, 'sine', 0.16); setTimeout(() => beep(1320, 0.14, 'sine', 0.16), 70); },
  crash: () => {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const len = 0.5;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const gn = audioCtx.createGain();
    gn.gain.setValueAtTime(0.3, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(gn).connect(audioCtx.destination);
    src.start(t);
    beep(160, 0.4, 'sawtooth', 0.2, 50);
  },
};

// ---------- game state ----------
const hud = document.getElementById('hud');
const hudScore = document.getElementById('hud-score');
const hudCoins = document.getElementById('hud-coins');
const hudSword = document.getElementById('hud-sword');
const startOverlay = document.getElementById('start-overlay');
const overOverlay = document.getElementById('over-overlay');
const finalScore = document.getElementById('final-score');
const bestLine = document.getElementById('best-line');

let state = 'start';            // 'start' | 'run' | 'over'
let speed = START_SPEED;
let distance = 0;
let coinCount = 0;
let lane = 1;                   // target lane index
let py = 0, vy = 0;             // jump physics
let sliding = 0;                // time left in slide
let runTime = 0;
let best = Number(localStorage.getItem('egoRunBest') || 0);

function score() { return Math.floor(distance * 2 + coinCount * 50 + swordsPicked * 150); }

function resetGame() {
  for (const o of obstacles) scene.remove(o.mesh);
  for (const c of coins) scene.remove(c.mesh);
  for (const p of swordPickups) scene.remove(p.mesh);
  obstacles.length = 0;
  coins.length = 0;
  for (const d of debris) scene.remove(d.mesh);
  swordPickups.length = 0;
  debris.length = 0;
  swordsPicked = 0;
  equippedSword = null;
  slashTimer = 0;
  while (egoParts.swordMount.children.length) egoParts.swordMount.remove(egoParts.swordMount.children[0]);
  speed = START_SPEED;
  distance = 0;
  coinCount = 0;
  lane = 1;
  py = 0; vy = 0; sliding = 0; runTime = 0;
  player.position.set(0, 0, PLAYER_Z);
  player.rotation.set(0, 0, 0);
  player.scale.set(1, 1, 1);
  nextSpawnZ = -40;
  for (let z = -40; z > -140; z -= 22) { spawnWave(z); nextSpawnZ = z; }
}

function startRun() {
  ensureAudio();
  resetGame();
  state = 'run';
  startOverlay.classList.add('hidden');
  overOverlay.classList.add('hidden');
  hud.classList.remove('hidden');
}

function gameOver() {
  state = 'over';
  sfx.crash();
  const s = score();
  const isBest = s > best;
  if (isBest) { best = s; localStorage.setItem('egoRunBest', String(best)); }
  finalScore.textContent = s.toLocaleString();
  bestLine.textContent = isBest ? 'NEW BEST!' : `best ${best.toLocaleString()}`;
  bestLine.classList.toggle('new-best', isBest);
  hud.classList.add('hidden');
  // brief delay so a buffered keypress doesn't instantly restart
  overAcceptAt = performance.now() + 600;
  overOverlay.classList.remove('hidden');
}
let overAcceptAt = 0;

// ---------- input ----------
function moveLeft()  { if (state === 'run' && lane > 0) lane--; }
function moveRight() { if (state === 'run' && lane < 2) lane++; }
// grounded = standing still vertically, whether on the road or a rooftop
function jump() {
  if (state === 'run' && vy === 0 && sliding <= 0) { vy = JUMP_VELOCITY; sfx.jump(); }
}
function slide() {
  if (state === 'run' && vy === 0 && py <= 0.01 && sliding <= 0) { sliding = SLIDE_TIME; sfx.slide(); }
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (state === 'start') { startRun(); return; }
  if (state === 'over') { if (performance.now() >= overAcceptAt) startRun(); return; }
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': moveLeft(); break;
    case 'ArrowRight': case 'KeyD': moveRight(); break;
    case 'ArrowUp': case 'KeyW': case 'Space': jump(); break;
    case 'ArrowDown': case 'KeyS': slide(); break;
  }
});

// touch: swipe
let touchX = 0, touchY = 0;
window.addEventListener('touchstart', (e) => {
  touchX = e.touches[0].clientX;
  touchY = e.touches[0].clientY;
}, { passive: true });
window.addEventListener('touchend', (e) => {
  if (e.target.closest && e.target.closest('a')) return;  // let links work without starting a run
  if (state === 'start') { startRun(); return; }
  if (state === 'over') { if (performance.now() >= overAcceptAt) startRun(); return; }
  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) { jump(); return; }
  if (Math.abs(dx) > Math.abs(dy)) (dx > 0 ? moveRight() : moveLeft());
  else (dy < 0 ? jump() : slide());
}, { passive: true });

// height of whatever the player could stand on at x (vehicle rooftops), 0 = road
function supportHeightAt(px) {
  let h = 0;
  for (const o of obstacles) {
    if (o.type !== 'crate' || o.height > 90) continue;
    if (Math.abs(o.mesh.position.z - PLAYER_Z) > o.zHalf) continue;
    if (Math.abs(LANES[o.lane] - px) > 1.0) continue;
    if (o.height > h) h = o.height;
  }
  return h;
}

// ---------- collision ----------
function checkCollisions() {
  const px = player.position.x;
  for (const o of obstacles) {
    const oz = o.mesh.position.z;
    const halfZ = o.type === 'crate' ? o.zHalf + 0.3 : 0.9;
    if (Math.abs(oz - PLAYER_Z) > halfZ) continue;
    if (Math.abs(LANES[o.lane] - px) > 1.15) continue;
    let lethal;
    if (o.type === 'hurdle') {
      lethal = py < 0.85;                    // didn't jump high enough
    } else if (o.type === 'beam') {
      const slidUnder = sliding > 0 && py <= 0.05;
      const jumpedOver = py > 1.5;               // feet above the bar (top ~1.62)
      lethal = !slidUnder && !jumpedOver;
    } else {
      lethal = py < o.height - 0.35;        // low vehicles can be hopped, tall ones can't
    }
    if (lethal) {
      if (equippedSword) { slashObstacle(o); return false; }  // armed: cut through it instead of dying
      return true;
    }
  }
  for (const c of coins) {
    if (c.taken) continue;
    const cz = c.mesh.position.z;
    if (Math.abs(cz - PLAYER_Z) < 1.0 && Math.abs(LANES[c.lane] - px) < 0.9 && py < 1.6) {
      c.taken = true;
      c.mesh.visible = false;
      coinCount++;
      sfx.coin();
    }
  }
  for (const p of swordPickups) {
    if (p.taken) continue;
    const pz = p.mesh.position.z;
    if (Math.abs(pz - PLAYER_Z) < 1.0 && Math.abs(LANES[p.lane] - px) < 0.9 && py < 1.8) {
      p.taken = true;
      p.mesh.visible = false;
      swordsPicked++;
      equipSword(p.tpl);
      sfx.sword();
    }
  }
  return false;
}

// ---------- main loop ----------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (state === 'run') {
    runTime += dt;
    speed += ACCEL * dt;
    distance += speed * dt;

    // move world
    for (const o of obstacles) o.mesh.position.z += speed * dt;
    for (const c of coins) {
      c.mesh.position.z += speed * dt;
      c.mesh.rotation.y += dt * 5;
    }
    for (const p of swordPickups) {
      p.mesh.position.z += speed * dt;
      p.mesh.rotation.y += dt * 3.2;
    }
    // slash debris: gravity + spin + scroll with the road, fade out, then cull
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.life += dt;
      if (d.life >= d.max) { scene.remove(d.mesh); debris.splice(i, 1); continue; }
      if (d.flash) {
        d.mesh.material.opacity = 0.9 * (1 - d.life / d.max);
        d.mesh.scale.setScalar(1 + d.life * 6);
        d.mesh.position.z += speed * dt;
        continue;
      }
      d.vy += GRAVITY * dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += (d.vz + speed) * dt;
      d.mesh.rotation.x += d.spin * dt;
      d.mesh.rotation.y += d.spin * 0.7 * dt;
    }
    for (const d of dashes) {
      d.position.z += speed * dt;
      if (d.position.z > 12) d.position.z -= 180;
    }
    for (const b of buildings) {
      b.position.z += speed * dt;
      if (b.position.z > 20) b.position.z -= 26 * 13;
    }
    for (const t of decorTrees) {
      t.position.z += speed * dt;
      if (t.position.z > 20) t.position.z -= 22 * 15;
    }

    // cull & spawn
    for (let i = obstacles.length - 1; i >= 0; i--) {
      if (obstacles[i].mesh.position.z > KILL_Z) {
        scene.remove(obstacles[i].mesh);
        obstacles.splice(i, 1);
      }
    }
    for (let i = coins.length - 1; i >= 0; i--) {
      if (coins[i].mesh.position.z > KILL_Z) {
        scene.remove(coins[i].mesh);
        coins.splice(i, 1);
      }
    }
    for (let i = swordPickups.length - 1; i >= 0; i--) {
      if (swordPickups[i].mesh.position.z > KILL_Z) {
        scene.remove(swordPickups[i].mesh);
        swordPickups.splice(i, 1);
      }
    }
    nextSpawnZ += speed * dt;
    if (nextSpawnZ > SPAWN_Z + (18 + Math.min(speed, 40) * 0.35)) {
      spawnWave(SPAWN_Z);
      nextSpawnZ = SPAWN_Z;
    }

    // player x toward target lane
    const targetX = LANES[lane];
    const dx = targetX - player.position.x;
    const step = LANE_SWITCH_SPEED * dt;
    player.position.x += Math.abs(dx) < step ? dx : Math.sign(dx) * step;
    player.rotation.z = -dx * 0.12;

    // jump physics + landing on rooftops
    const support = supportHeightAt(player.position.x);
    const prevPy = py;
    if (py > support || vy > 0) {
      vy += GRAVITY * dt;
      py += vy * dt;
      // land on a roof only when falling onto it from above
      if (vy < 0 && py <= support && prevPy >= support - 0.01) { py = support; vy = 0; }
      if (py < 0) { py = 0; vy = 0; }
    }
    player.position.y = py;

    // slide
    if (sliding > 0) {
      sliding -= dt;
      player.scale.y = 0.45;
      player.rotation.x = 0.5;
    } else {
      player.scale.y = 1;
      player.rotation.x = 0;
    }

    // Ego's run motion: limbs swing from the joints, plus a hop bob + forward lean
    const stride = t * 13;
    const airborne = py > 0.05;
    ego.position.y = airborne ? 0.05 : Math.abs(Math.sin(stride)) * 0.1;
    ego.rotation.x = airborne ? -0.28 : -0.12 - Math.sin(stride * 2) * 0.04;  // lean into the run
    ego.rotation.z = Math.sin(stride) * 0.05;                                 // subtle shoulder roll
    if (egoLimbs.legL) {
      const sw = airborne ? EGO_CUTS.legSwing * 0.4 : EGO_CUTS.legSwing;
      const a = Math.sin(stride) * sw;
      egoLimbs.legL.rotation.x = a;
      egoLimbs.legR.rotation.x = -a;
      const armA = Math.sin(stride) * (airborne ? EGO_CUTS.armSwing * 0.4 : EGO_CUTS.armSwing);
      egoLimbs.armL.rotation.x = -armA;          // arms counter the legs
      egoLimbs.armR.rotation.x = armA;
    }
    egoParts.swordMount.rotation.x = -0.6;
    // fast downward chop right after a slash (swings the sword arm too)
    if (slashTimer > 0) {
      slashTimer -= dt;
      const k = Math.max(0, slashTimer) / 0.32;       // 1 -> 0
      egoParts.swordMount.rotation.x = -0.6 - 2.0 * Math.sin(k * Math.PI);
      if (egoLimbs.armR) egoLimbs.armR.rotation.x = -2.2 * Math.sin(k * Math.PI);
    }
    egoParts.jetpack.visible = airborne;
    if (airborne) {
      for (let i = 0; i < egoParts.flames.length; i++) {
        const fl = 0.75 + Math.sin(t * 31 + i * 2.1) * 0.15 + Math.sin(t * 47 + i) * 0.1;
        egoParts.flames[i].scale.set(1, fl, 1);
      }
      egoParts.jetGlow.intensity = 2.2 + Math.sin(t * 37) * 0.6;
    } else {
      egoParts.jetGlow.intensity = 0;
    }

    // camera sway with lane + slight speed shake
    camera.position.x += (player.position.x * 0.55 - camera.position.x) * 4 * dt;
    camera.position.y = 5.2 + Math.sin(t * 14) * 0.03;
    camera.lookAt(player.position.x * 0.6, 1.2, -12);

    if (checkCollisions()) gameOver();

    hudScore.textContent = score().toLocaleString();
    hudCoins.innerHTML = '&#9679; ' + coinCount;
    hudSword.classList.toggle('hidden', !equippedSword);
  } else {
    // idle bob + slow turntable on menus; limbs settle with a gentle sway
    player.rotation.y = Math.sin(t * 0.8) * 0.25;
    ego.position.y = Math.max(0, Math.sin(t * 3.2)) * 0.06;
    ego.rotation.x = 0;
    ego.rotation.z = 0;
    if (egoLimbs.legL) {
      const sway = Math.sin(t * 2) * 0.06;
      egoLimbs.legL.rotation.x = egoLimbs.legR.rotation.x = 0;
      egoLimbs.armL.rotation.x = sway;
      egoLimbs.armR.rotation.x = -sway;
    }
    egoParts.jetpack.visible = false;
    egoParts.jetGlow.intensity = 0;
    egoParts.swordMount.rotation.x = -0.6;
  }

  renderer.render(scene, camera);
}

resetGame();
animate();

// debug introspection (used by automated checks)
window.__egoDebug = () => ({
  state, speed, distance, coinCount, swordsPicked, py, vy, lane,
  obstacles: obstacles.length, coins: coins.length, swordsOnRoad: swordPickups.length,
  swordEquipped: !!equippedSword,
  debris: debris.length,
  limbsBuilt: Object.values(egoLimbs).filter(Boolean).length,
  limbTris: Object.fromEntries(Object.entries(egoLimbs).map(([k, g]) => [k, g ? g.children.reduce((s, m) => s + m.geometry.getAttribute('position').count / 3, 0) : 0])),
  __slash: (lane) => { if (swordTemplates.length) equipSword(swordTemplates[0]); const o = obstacles.find(o => o.type === 'crate'); if (o && equippedSword) { slashObstacle(o); return 'slashed ' + o.type; } return 'no crate obstacle'; },
  decor: decorTrees.length, treeTpls: treeTemplates.length,
  vehicleTpls: vehicleTemplates.length, swordTpls: swordTemplates.length,
  rockTpls: rockTemplates.length,
});
