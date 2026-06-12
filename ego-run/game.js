import * as THREE from 'three';

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
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
sun.shadow.camera.top = 20;   sun.shadow.camera.bottom = -20;
sun.shadow.camera.far = 60;
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

// ---------- player: the Ego ----------
const player = new THREE.Group();
const playerParts = {};
{
  const skin = new THREE.MeshStandardMaterial({ color: 0xffc78f, roughness: 0.7 });
  const suit = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: 0.25, metalness: 0.9 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 6, 14), suit);
  body.position.y = 0.95;
  body.castShadow = true;
  player.add(body);
  playerParts.body = body;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), skin);
  head.position.y = 1.85;
  head.castShadow = true;
  player.add(head);
  playerParts.head = head;

  // pompadour hair
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.55), dark);
  hair.position.set(0, 2.12, 0.02);
  player.add(hair);
  playerParts.hair = hair;

  // sunglasses (facing camera-away, -z)
  const shades = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.13, 0.1), dark);
  shades.position.set(0, 1.9, -0.3);
  player.add(shades);
  playerParts.shades = shades;

  // gold chain
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 20), gold);
  chain.position.set(0, 1.45, 0);
  chain.rotation.x = Math.PI / 2.4;
  player.add(chain);
  playerParts.chain = chain;

  // arms
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 4, 8), suit);
    arm.position.set(side * 0.55, 1.05, 0);
    arm.castShadow = true;
    player.add(arm);
    playerParts[side === -1 ? 'armL' : 'armR'] = arm;
  }
  // legs
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.45, 4, 8), dark);
    leg.position.set(side * 0.2, 0.35, 0);
    leg.castShadow = true;
    player.add(leg);
    playerParts[side === -1 ? 'legL' : 'legR'] = leg;
  }
}
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
  if (type === 'crate') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.4, 1.2), crateMat);
    m.position.y = 1.2;
    m.castShadow = true;
    g.add(m);
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
  obstacles.push({ mesh: g, type, lane, z });
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

function score() { return Math.floor(distance * 2 + coinCount * 50); }

function resetGame() {
  for (const o of obstacles) scene.remove(o.mesh);
  for (const c of coins) scene.remove(c.mesh);
  obstacles.length = 0;
  coins.length = 0;
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
function jump() {
  if (state === 'run' && py <= 0.01 && sliding <= 0) { vy = JUMP_VELOCITY; sfx.jump(); }
}
function slide() {
  if (state === 'run' && py <= 0.01 && sliding <= 0) { sliding = SLIDE_TIME; sfx.slide(); }
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
  if (state === 'start') { startRun(); return; }
  if (state === 'over') { if (performance.now() >= overAcceptAt) startRun(); return; }
  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) { jump(); return; }
  if (Math.abs(dx) > Math.abs(dy)) (dx > 0 ? moveRight() : moveLeft());
  else (dy < 0 ? jump() : slide());
}, { passive: true });

// ---------- collision ----------
function checkCollisions() {
  const px = player.position.x;
  for (const o of obstacles) {
    const oz = o.mesh.position.z;
    if (oz < PLAYER_Z - 0.9 || oz > PLAYER_Z + 0.9) continue;
    if (Math.abs(LANES[o.lane] - px) > 1.15) continue;
    if (o.type === 'hurdle') {
      if (py < 0.85) return true;          // didn't jump high enough
    } else if (o.type === 'beam') {
      if (sliding <= 0 || py > 0.05) return true;  // not sliding under it
    } else {
      return true;                          // crate: any contact
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
    for (const d of dashes) {
      d.position.z += speed * dt;
      if (d.position.z > 12) d.position.z -= 180;
    }
    for (const b of buildings) {
      b.position.z += speed * dt;
      if (b.position.z > 20) b.position.z -= 26 * 13;
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

    // jump
    if (py > 0 || vy > 0) {
      vy += GRAVITY * dt;
      py += vy * dt;
      if (py <= 0) { py = 0; vy = 0; }
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

    // run animation
    const bob = Math.sin(t * 14) * 0.05;
    playerParts.body.position.y = 0.95 + bob;
    playerParts.head.position.y = 1.85 + bob;
    playerParts.hair.position.y = 2.12 + bob;
    playerParts.shades.position.y = 1.9 + bob;
    playerParts.chain.position.y = 1.45 + bob;
    playerParts.armL.rotation.x = Math.sin(t * 14) * 0.9;
    playerParts.armR.rotation.x = -Math.sin(t * 14) * 0.9;
    playerParts.legL.rotation.x = -Math.sin(t * 14) * 1.1;
    playerParts.legR.rotation.x = Math.sin(t * 14) * 1.1;

    // camera sway with lane + slight speed shake
    camera.position.x += (player.position.x * 0.55 - camera.position.x) * 4 * dt;
    camera.position.y = 5.2 + Math.sin(t * 14) * 0.03;
    camera.lookAt(player.position.x * 0.6, 1.2, -12);

    if (checkCollisions()) gameOver();

    hudScore.textContent = score().toLocaleString();
    hudCoins.innerHTML = '&#9679; ' + coinCount;
  } else {
    // idle swagger on menus
    player.rotation.y = Math.sin(t * 0.8) * 0.25;
    const bob = Math.sin(t * 2) * 0.03;
    playerParts.body.position.y = 0.95 + bob;
    playerParts.head.position.y = 1.85 + bob;
  }

  renderer.render(scene, camera);
}

resetGame();
animate();
