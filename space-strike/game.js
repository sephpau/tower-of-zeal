import * as THREE from 'three';

// ---------- constants ----------
const BOUNDS_X = 14;
const BOUNDS_Y = 7.5;
const SHIP_LERP = 9;              // how fast the ship eases toward the pointer
const BULLET_SPEED = 190;
const BOLT_SPEED = 46;            // enemy fire
const FIRE_INTERVAL = 0.15;
const RAPID_INTERVAL = 0.075;
const POWER_TIME = 9;             // seconds a weapon power core lasts
const SPAWN_Z = -260;
const KILL_Z = 24;
const WAVE_TIME = 20;             // seconds per wave
const MAX_SHIELD = 100;
const BEST_KEY = 'space-strike-best';

// ---------- renderer / scene ----------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0520);
scene.fog = new THREE.Fog(0x0b0520, 160, 340);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(0, 2.4, 17);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

scene.add(new THREE.AmbientLight(0x8877ff, 0.55));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
keyLight.position.set(6, 10, 8);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xff4ecd, 0.7);
rimLight.position.set(-8, -4, -6);
scene.add(rimLight);

// ---------- helpers ----------
function glowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.4, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
const cyanGlowTex = glowTexture('rgba(255,255,255,1)', 'rgba(80,220,255,0.55)');
const pinkGlowTex = glowTexture('rgba(255,255,255,1)', 'rgba(255,78,205,0.55)');
const orangeGlowTex = glowTexture('rgba(255,240,200,1)', 'rgba(255,140,60,0.55)');

function makeGlowSprite(tex, size, color = 0xffffff) {
  const mat = new THREE.SpriteMaterial({ map: tex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

// ---------- backdrop: retro sun + nebula + starfield ----------
(function buildSun() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 60, 0, 452);
  grad.addColorStop(0, '#ffe97a');
  grad.addColorStop(0.45, '#ff7a4e');
  grad.addColorStop(1, '#ff2e88');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(256, 256, 196, 0, Math.PI * 2);
  g.fill();
  // horizontal scanline slits, synthwave style
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) {
    const y = 280 + i * 26;
    g.fillRect(0, y, 512, 5 + i * 1.6);
  }
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), mat);
  sun.position.set(0, -18, -420);
  scene.add(sun);
  const halo = makeGlowSprite(glowTexture('rgba(255,120,160,0.55)', 'rgba(255,60,140,0.22)'), 320);
  halo.material.fog = false;
  halo.position.set(0, -18, -421);
  scene.add(halo);
})();

(function buildNebula() {
  const colors = [
    ['rgba(120,60,255,0.30)', 'rgba(60,20,140,0.10)'],
    ['rgba(255,78,205,0.22)', 'rgba(140,20,90,0.08)'],
    ['rgba(60,200,255,0.20)', 'rgba(20,80,140,0.08)'],
  ];
  for (let i = 0; i < 9; i++) {
    const [a, b] = colors[i % colors.length];
    const s = makeGlowSprite(glowTexture(a, b), 90 + Math.random() * 140);
    s.material.fog = false;
    s.position.set((Math.random() - 0.5) * 420, (Math.random() - 0.5) * 200, -380 - Math.random() * 60);
    scene.add(s);
  }
})();

const starLayers = [];
for (const [count, size, speed, color] of [[900, 0.7, 60, 0xffffff], [400, 1.3, 110, 0x9be8ff]]) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 180;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 100;
    pos[i * 3 + 2] = -Math.random() * 400 + 20;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true, opacity: 0.9, fog: false });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  starLayers.push({ pts, speed, count });
}

// ---------- player ship ----------
const ship = new THREE.Group();
{
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x2a2a55, metalness: 0.7, roughness: 0.3, emissive: 0x101040 });
  const neonMat = new THREE.MeshStandardMaterial({ color: 0x113355, emissive: 0x35d5ff, emissiveIntensity: 1.6, metalness: 0.4, roughness: 0.4 });
  const pinkMat = new THREE.MeshStandardMaterial({ color: 0x551133, emissive: 0xff4ecd, emissiveIntensity: 1.3, metalness: 0.4, roughness: 0.4 });

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.4, 6), hullMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -0.9;
  ship.add(nose);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 1.6, 6), hullMat);
  body.rotation.x = -Math.PI / 2;
  body.position.z = 1.1;
  ship.add(body);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), neonMat);
  canopy.scale.set(1, 0.7, 1.6);
  canopy.position.set(0, 0.34, 0.5);
  ship.add(canopy);

  const wingGeo = new THREE.BoxGeometry(2.5, 0.09, 1.15);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, hullMat);
    wing.position.set(side * 1.45, -0.08, 1.15);
    wing.rotation.z = side * 0.24;
    ship.add(wing);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.14), neonMat);
    stripe.position.set(side * 1.45, -0.07, 0.68);
    stripe.rotation.z = side * 0.24;
    ship.add(stripe);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.8), pinkMat);
    fin.position.set(side * 2.55, 0.24, 1.35);
    fin.rotation.z = side * 0.24;
    ship.add(fin);
    const engine = makeGlowSprite(cyanGlowTex, 1.5);
    engine.position.set(side * 0.55, -0.05, 2.1);
    ship.add(engine);
    ship.userData['engine' + (side < 0 ? 'L' : 'R')] = engine;
  }
}
scene.add(ship);

// shield bubble flashes when hit
const shieldBubble = new THREE.Mesh(
  new THREE.SphereGeometry(2.6, 24, 18),
  new THREE.MeshBasicMaterial({ color: 0x55ccff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
);
ship.add(shieldBubble);

// aiming reticle floating ahead of the ship
const reticle = new THREE.Group();
{
  const mat = new THREE.MeshBasicMaterial({ color: 0x7dfcff, transparent: true, opacity: 0.8, fog: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 24), mat);
  reticle.add(ring);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), mat);
  reticle.add(dot);
}
scene.add(reticle);

// ---------- pools ----------
function makePool(n, build) {
  const items = [];
  for (let i = 0; i < n; i++) {
    const obj = build();
    obj.visible = false;
    obj.userData.active = false;
    scene.add(obj);
    items.push(obj);
  }
  items.take = function () {
    for (const o of this) if (!o.userData.active) { o.userData.active = true; o.visible = true; return o; }
    return null;
  };
  items.release = function (o) { o.userData.active = false; o.visible = false; };
  return items;
}

const bulletGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.8, 6);
bulletGeo.rotateX(Math.PI / 2);
const bulletMat = new THREE.MeshBasicMaterial({ color: 0x7dfcff });
const bullets = makePool(50, () => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(bulletGeo, bulletMat));
  g.add(makeGlowSprite(cyanGlowTex, 1.1));
  return g;
});

const boltGeo = new THREE.SphereGeometry(0.26, 10, 8);
const boltMat = new THREE.MeshBasicMaterial({ color: 0xff4ecd });
const bolts = makePool(60, () => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(boltGeo, boltMat));
  g.add(makeGlowSprite(pinkGlowTex, 1.3));
  return g;
});

const particles = makePool(160, () => makeGlowSprite(orangeGlowTex, 1));

// ---------- enemies ----------
const rockGeo = new THREE.IcosahedronGeometry(1, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a5a8a, metalness: 0.15, roughness: 0.85, flatShading: true, emissive: 0x1a1030 });

function buildDrone(color, emissive) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35, emissive, emissiveIntensity: 0.9, flatShading: true });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.0, 4), mat);
  body.rotation.x = Math.PI / 2;   // nose toward the player (+z)
  g.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.14, 8, 20), mat);
  g.add(ring);
  const eye = makeGlowSprite(pinkGlowTex, 1.4);
  eye.position.z = 1.0;
  g.add(eye);
  return g;
}

const enemies = [];
function spawnEnemy(wave) {
  const x = (Math.random() - 0.5) * 2 * BOUNDS_X;
  const y = (Math.random() - 0.5) * 2 * BOUNDS_Y;
  const roll = Math.random();
  let e;
  const speedUp = 1 + (wave - 1) * 0.08;
  if (roll < 0.44) {
    const scale = 0.9 + Math.random() * 1.6;
    const mesh = new THREE.Mesh(rockGeo, rockMat);
    mesh.scale.setScalar(scale);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    e = {
      type: 'rock', obj: mesh, hp: scale > 1.7 ? 3 : scale > 1.2 ? 2 : 1, radius: scale * 1.05,
      vz: (26 + Math.random() * 14) * speedUp,
      vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3,
      spinX: (Math.random() - 0.5) * 2, spinY: (Math.random() - 0.5) * 2,
      score: 10,
    };
  } else if (roll < 0.82 || wave < 3) {
    const obj = buildDrone(0x3a1a55, 0xff4ecd);
    e = {
      type: 'drone', obj, hp: 2, radius: 1.35,
      vz: (20 + Math.random() * 8) * speedUp,
      baseX: x, swayAmp: 3 + Math.random() * 4, swayFreq: 0.8 + Math.random() * 0.9, phase: Math.random() * 6.28,
      fireTimer: 1.2 + Math.random() * 1.6, fireEvery: Math.max(1.0, 2.4 - wave * 0.12),
      score: 25,
    };
  } else {
    const obj = buildDrone(0x113344, 0x35d5ff);
    obj.scale.setScalar(1.25);
    e = {
      type: 'hunter', obj, hp: 4, radius: 1.7,
      vz: (30 + Math.random() * 8) * speedUp,
      homing: 3.2 + wave * 0.25,
      fireTimer: 0.9, fireEvery: Math.max(0.7, 1.6 - wave * 0.08),
      score: 40,
    };
  }
  e.obj.position.set(x, y, SPAWN_Z);
  scene.add(e.obj);
  enemies.push(e);
}

function removeEnemy(i) {
  scene.remove(enemies[i].obj);
  enemies.splice(i, 1);
}

// ---------- powerups ----------
const POWER_DEFS = {
  shield: { color: 0x35d5ff, label: 'SHIELD +40' },
  rapid:  { color: 0xffd76a, label: 'RAPID FIRE' },
  triple: { color: 0xff4ecd, label: 'TRIPLE SHOT' },
};
const powerups = [];
function spawnPowerup(pos) {
  const kinds = Object.keys(POWER_DEFS);
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const def = POWER_DEFS[kind];
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.7, 0),
    new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 1.4, metalness: 0.5, roughness: 0.3 })
  );
  g.add(core);
  g.add(makeGlowSprite(cyanGlowTex, 3, def.color));
  g.position.copy(pos);
  scene.add(g);
  powerups.push({ obj: g, kind, vz: 22 });
}

// ---------- audio ----------
let audioCtx = null, masterGain = null, musicGain = null, muted = false;
let musicTimer = null, musicStep = 0, nextNoteTime = 0;
const BASS_SEQ = [55.0, 55.0, 65.4, 55.0, 82.4, 55.0, 73.4, 65.4]; // A1 A1 C2 A1 E2 A1 D2 C2
const ARP_SEQ  = [220, 261.6, 329.6, 440, 329.6, 261.6, 440, 523.3];

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = muted ? 0 : 0.9;
  masterGain.connect(audioCtx.destination);
  musicGain = audioCtx.createGain();
  musicGain.gain.value = 0.16;
  musicGain.connect(masterGain);
  nextNoteTime = audioCtx.currentTime + 0.1;
  musicTimer = setInterval(scheduleMusic, 80);
}

function scheduleMusic() {
  if (!audioCtx) return;
  const stepDur = 0.21;
  while (nextNoteTime < audioCtx.currentTime + 0.25) {
    const t = nextNoteTime;
    const i = musicStep % 8;
    // bass: detuned saw through lowpass
    const bass = audioCtx.createOscillator();
    bass.type = 'sawtooth';
    bass.frequency.value = BASS_SEQ[i];
    const bf = audioCtx.createBiquadFilter();
    bf.type = 'lowpass'; bf.frequency.value = 380; bf.Q.value = 6;
    const bg = audioCtx.createGain();
    bg.gain.setValueAtTime(0.5, t);
    bg.gain.exponentialRampToValueAtTime(0.03, t + stepDur * 0.95);
    bass.connect(bf).connect(bg).connect(musicGain);
    bass.start(t); bass.stop(t + stepDur);
    // sparkle arp on the off-beats
    if (i % 2 === 1) {
      const arp = audioCtx.createOscillator();
      arp.type = 'square';
      arp.frequency.value = ARP_SEQ[i];
      const ag = audioCtx.createGain();
      ag.gain.setValueAtTime(0.09, t);
      ag.gain.exponentialRampToValueAtTime(0.005, t + stepDur * 0.8);
      arp.connect(ag).connect(musicGain);
      arp.start(t); arp.stop(t + stepDur);
    }
    // hat: filtered noise tick
    if (i % 2 === 0) {
      const len = 0.04;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * len, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * (1 - j / d.length);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const hf = audioCtx.createBiquadFilter();
      hf.type = 'highpass'; hf.frequency.value = 6000;
      const hg = audioCtx.createGain(); hg.gain.value = 0.12;
      src.connect(hf).connect(hg).connect(musicGain);
      src.start(t);
    }
    nextNoteTime += stepDur;
    musicStep++;
  }
}

function sfx(fn) { if (audioCtx && !muted) fn(audioCtx, masterGain); }

function sfxLaser() {
  sfx((ctx, out) => {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(1300, t);
    o.frequency.exponentialRampToValueAtTime(320, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.004, t + 0.12);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + 0.13);
  });
}
function sfxBoom(big = false) {
  sfx((ctx, out) => {
    const t = ctx.currentTime;
    const dur = big ? 0.7 : 0.35;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.6);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(big ? 2200 : 1600, t);
    f.frequency.exponentialRampToValueAtTime(120, t + dur);
    const g = ctx.createGain(); g.gain.value = big ? 0.55 : 0.3;
    src.connect(f).connect(g).connect(out);
    src.start(t);
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(big ? 120 : 160, t);
    thump.frequency.exponentialRampToValueAtTime(38, t + dur * 0.8);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(big ? 0.6 : 0.35, t);
    tg.gain.exponentialRampToValueAtTime(0.01, t + dur);
    thump.connect(tg).connect(out);
    thump.start(t); thump.stop(t + dur);
  });
}
function sfxHit() {
  sfx((ctx, out) => {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.24);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + 0.26);
  });
}
function sfxPickup() {
  sfx((ctx, out) => {
    const t = ctx.currentTime;
    [523.3, 659.3, 784, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.16, t + i * 0.06 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.004, t + i * 0.06 + 0.14);
      o.connect(g).connect(out);
      o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.16);
    });
  });
}
function sfxWave() {
  sfx((ctx, out) => {
    const t = ctx.currentTime;
    [220, 277.2, 329.6].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.setValueAtTime(600, t);
      fl.frequency.exponentialRampToValueAtTime(3200, t + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.005, t + 0.9);
      o.connect(fl).connect(g).connect(out);
      o.start(t); o.stop(t + 0.95);
    });
  });
}

// ---------- HUD ----------
const el = (id) => document.getElementById(id);
const scoreEl = el('score'), waveEl = el('wave'), comboEl = el('combo'),
  shieldBar = el('shield-bar'), powerEl = el('power'), bannerEl = el('wave-banner'),
  vignette = el('damage-vignette'), muteEl = el('mute');

// ---------- game state ----------
const state = {
  running: false,
  score: 0, best: Number(localStorage.getItem(BEST_KEY) || 0),
  wave: 1, waveTimer: 0,
  shield: MAX_SHIELD,
  combo: 0, comboTimer: 0,
  kills: 0,
  spawnTimer: 1,
  fireCooldown: 0, firing: false,
  power: null, powerTimer: 0,
  shake: 0,
  time: 0,
};

const target = new THREE.Vector2(0, 0);     // where the pointer wants the ship
const shipVel = new THREE.Vector2(0, 0);    // smoothed, for banking

// ---------- input ----------
function pointerToTarget(cx, cy) {
  const nx = (cx / window.innerWidth) * 2 - 1;
  const ny = -((cy / window.innerHeight) * 2 - 1);
  target.x = nx * BOUNDS_X;
  target.y = ny * BOUNDS_Y;
}
window.addEventListener('pointermove', (e) => pointerToTarget(e.clientX, e.clientY));
window.addEventListener('pointerdown', (e) => {
  pointerToTarget(e.clientX, e.clientY);
  state.firing = true;
});
window.addEventListener('pointerup', () => { state.firing = false; });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { state.firing = true; e.preventDefault(); }
  if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') state.firing = false;
});
muteEl.addEventListener('click', toggleMute);
function toggleMute() {
  muted = !muted;
  if (masterGain) masterGain.gain.value = muted ? 0 : 0.9;
  muteEl.textContent = muted ? '[M] SOUND OFF' : '[M] SOUND ON';
}

// ---------- overlays / flow ----------
const startOverlay = el('start-overlay'), gameoverOverlay = el('gameover-overlay');

startOverlay.addEventListener('pointerdown', (e) => { e.stopPropagation(); launch(); });
gameoverOverlay.addEventListener('pointerdown', (e) => { e.stopPropagation(); launch(); });

function launch() {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  startOverlay.classList.add('hidden');
  gameoverOverlay.classList.add('hidden');
  resetGame();
  state.running = true;
}

function resetGame() {
  for (let i = enemies.length - 1; i >= 0; i--) removeEnemy(i);
  for (const p of powerups) scene.remove(p.obj);
  powerups.length = 0;
  for (const b of bullets) bullets.release(b);
  for (const b of bolts) bolts.release(b);
  for (const p of particles) particles.release(p);
  Object.assign(state, {
    score: 0, wave: 1, waveTimer: 0, shield: MAX_SHIELD,
    combo: 0, comboTimer: 0, kills: 0, spawnTimer: 0.8,
    fireCooldown: 0, power: null, powerTimer: 0, shake: 0, time: 0,
  });
  ship.position.set(0, 0, 0);
  ship.visible = true;
  target.set(0, 0);
  updateHud();
  waveEl.textContent = 'Wave 1';
}

function gameOver() {
  state.running = false;
  state.firing = false;
  sfxBoom(true);
  explode(ship.position, 26, 0xffaa55);
  explode(ship.position, 14, 0x7dfcff);
  ship.visible = false;
  const isBest = state.score > state.best;
  if (isBest) {
    state.best = state.score;
    localStorage.setItem(BEST_KEY, String(state.best));
  }
  el('final-score').textContent = state.score.toLocaleString();
  const bestLine = el('best-line');
  bestLine.textContent = isBest ? 'NEW BEST!' : 'Best: ' + state.best.toLocaleString();
  bestLine.className = isBest ? 'best new-best' : 'best';
  el('stats-line').textContent = `Wave ${state.wave} · ${state.kills} kills`;
  setTimeout(() => gameoverOverlay.classList.remove('hidden'), 900);
}

// ---------- combat ----------
function fire() {
  const mult = state.power === 'rapid' ? RAPID_INTERVAL : FIRE_INTERVAL;
  state.fireCooldown = mult;
  const angles = state.power === 'triple' ? [-0.09, 0, 0.09] : [0];
  for (const a of angles) {
    const b = bullets.take();
    if (!b) continue;
    b.position.copy(ship.position);
    b.position.z -= 1.6;
    b.userData.vx = Math.sin(a) * BULLET_SPEED;
    b.userData.vz = -Math.cos(a) * BULLET_SPEED;
    b.rotation.y = a;
  }
  sfxLaser();
  state.shake = Math.max(state.shake, 0.05);
}

function enemyFire(e) {
  const b = bolts.take();
  if (!b) return;
  b.position.copy(e.obj.position);
  const dir = new THREE.Vector3().subVectors(ship.position, e.obj.position).normalize();
  b.userData.vx = dir.x * BOLT_SPEED;
  b.userData.vy = dir.y * BOLT_SPEED;
  b.userData.vz = dir.z * BOLT_SPEED;
}

function explode(pos, count, color) {
  for (let i = 0; i < count; i++) {
    const p = particles.take();
    if (!p) return;
    p.material.color.set(color);
    p.position.copy(pos);
    const speed = 6 + Math.random() * 16;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    p.userData.vx = speed * Math.sin(phi) * Math.cos(theta);
    p.userData.vy = speed * Math.sin(phi) * Math.sin(theta);
    p.userData.vz = speed * Math.cos(phi);
    p.userData.life = 0.5 + Math.random() * 0.4;
    p.userData.maxLife = p.userData.life;
    p.scale.setScalar(0.8 + Math.random() * 1.4);
  }
}

function damagePlayer(amount) {
  if (!state.running) return;
  state.shield -= amount;
  state.combo = 0;
  comboEl.style.opacity = 0;
  state.shake = Math.max(state.shake, 0.5);
  sfxHit();
  shieldBubble.material.opacity = 0.5;
  vignette.style.opacity = 1;
  setTimeout(() => { vignette.style.opacity = 0; }, 260);
  updateHud();
  if (state.shield <= 0) gameOver();
}

function killEnemy(i) {
  const e = enemies[i];
  const mult = 1 + Math.min(7, Math.floor(state.combo / 5));
  state.score += e.score * mult;
  state.kills++;
  state.combo++;
  state.comboTimer = 4;
  if (state.combo >= 5) {
    comboEl.textContent = `COMBO ×${mult}`;
    comboEl.style.opacity = 1;
  }
  explode(e.obj.position, e.type === 'rock' ? 14 : 18, e.type === 'hunter' ? 0x7dfcff : e.type === 'drone' ? 0xff7ad5 : 0xffaa55);
  sfxBoom(e.type === 'hunter');
  if (Math.random() < 0.11) spawnPowerup(e.obj.position);
  removeEnemy(i);
  updateHud();
}

function updateHud() {
  scoreEl.textContent = state.score.toLocaleString();
  const pct = Math.max(0, state.shield) / MAX_SHIELD * 100;
  shieldBar.style.width = pct + '%';
  shieldBar.style.background = pct > 40
    ? 'linear-gradient(90deg, #4aa8ff, #7dfcff)'
    : 'linear-gradient(90deg, #ff5e7a, #ffd76a)';
}

function applyPowerup(kind) {
  sfxPickup();
  if (kind === 'shield') {
    state.shield = Math.min(MAX_SHIELD, state.shield + 40);
  } else {
    state.power = kind;
    state.powerTimer = POWER_TIME;
  }
  powerEl.textContent = POWER_DEFS[kind].label;
  powerEl.style.opacity = 1;
  if (kind === 'shield') setTimeout(() => { if (!state.power) powerEl.style.opacity = 0; }, 1500);
  updateHud();
}

// ---------- main loop ----------
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  state.time += dt;

  // starfield scroll — always on, even on menus
  const scrollSpeed = state.running ? 1 : 0.35;
  for (const layer of starLayers) {
    const pos = layer.pts.geometry.attributes.position;
    for (let i = 0; i < layer.count; i++) {
      let z = pos.getZ(i) + layer.speed * scrollSpeed * dt;
      if (z > 22) z -= 420;
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;
  }

  if (state.running) update(dt);

  // camera follow + shake
  const shakeX = (Math.random() - 0.5) * state.shake;
  const shakeY = (Math.random() - 0.5) * state.shake;
  state.shake = Math.max(0, state.shake - dt * 1.8);
  camera.position.x += (ship.position.x * 0.35 + shakeX - camera.position.x) * Math.min(1, dt * 5);
  camera.position.y += (2.4 + ship.position.y * 0.35 + shakeY - camera.position.y) * Math.min(1, dt * 5);
  camera.lookAt(ship.position.x * 0.5, ship.position.y * 0.5, -30);

  // particles decay even when not running (death explosion)
  for (const p of particles) {
    if (!p.userData.active) continue;
    p.userData.life -= dt;
    if (p.userData.life <= 0) { particles.release(p); continue; }
    p.position.x += p.userData.vx * dt;
    p.position.y += p.userData.vy * dt;
    p.position.z += p.userData.vz * dt;
    const k = p.userData.life / p.userData.maxLife;
    p.material.opacity = k;
    p.scale.setScalar(p.scale.x * (1 - dt * 0.8));
  }

  renderer.render(scene, camera);
}

function update(dt) {
  // --- ship movement ---
  const px = ship.position.x, py = ship.position.y;
  ship.position.x += (target.x - px) * Math.min(1, dt * SHIP_LERP);
  ship.position.y += (target.y - py) * Math.min(1, dt * SHIP_LERP);
  ship.position.x = THREE.MathUtils.clamp(ship.position.x, -BOUNDS_X, BOUNDS_X);
  ship.position.y = THREE.MathUtils.clamp(ship.position.y, -BOUNDS_Y, BOUNDS_Y);
  shipVel.set((ship.position.x - px) / dt, (ship.position.y - py) / dt);
  ship.rotation.z += (THREE.MathUtils.clamp(-shipVel.x * 0.045, -0.9, 0.9) - ship.rotation.z) * Math.min(1, dt * 8);
  ship.rotation.x += (THREE.MathUtils.clamp(shipVel.y * 0.02, -0.45, 0.45) - ship.rotation.x) * Math.min(1, dt * 8);

  // engine flicker
  const flick = 1.25 + Math.sin(state.time * 40) * 0.2 + Math.random() * 0.15;
  ship.userData.engineL.scale.setScalar(flick);
  ship.userData.engineR.scale.setScalar(flick);

  // shield bubble fade
  shieldBubble.material.opacity = Math.max(0, shieldBubble.material.opacity - dt * 1.6);

  // reticle ahead of ship
  reticle.position.set(ship.position.x, ship.position.y, -60);
  reticle.rotation.z += dt * 1.2;

  // --- firing ---
  state.fireCooldown -= dt;
  if (state.firing && state.fireCooldown <= 0) fire();

  // --- power timer ---
  if (state.power) {
    state.powerTimer -= dt;
    if (state.powerTimer <= 0) {
      state.power = null;
      powerEl.style.opacity = 0;
    }
  }

  // --- combo decay ---
  if (state.combo > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) {
      state.combo = 0;
      comboEl.style.opacity = 0;
    }
  }

  // --- waves & spawning ---
  state.waveTimer += dt;
  if (state.waveTimer >= WAVE_TIME) {
    state.waveTimer = 0;
    state.wave++;
    waveEl.textContent = 'Wave ' + state.wave;
    bannerEl.textContent = 'Wave ' + state.wave;
    bannerEl.classList.remove('show');
    void bannerEl.offsetWidth;
    bannerEl.classList.add('show');
    sfxWave();
  }
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnEnemy(state.wave);
    const base = Math.max(0.35, 1.5 - state.wave * 0.12);
    state.spawnTimer = base + Math.random() * base;
  }

  // --- player bullets ---
  for (const b of bullets) {
    if (!b.userData.active) continue;
    b.position.x += b.userData.vx * dt;
    b.position.z += b.userData.vz * dt;
    if (b.position.z < SPAWN_Z - 20) { bullets.release(b); continue; }
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const dx = e.obj.position.x - b.position.x;
      const dy = e.obj.position.y - b.position.y;
      const dz = e.obj.position.z - b.position.z;
      if (dx * dx + dy * dy + dz * dz < (e.radius + 0.5) * (e.radius + 0.5)) {
        bullets.release(b);
        e.hp--;
        if (e.hp <= 0) killEnemy(i);
        else {
          explode(b.position, 4, 0x7dfcff);
          e.obj.position.z -= 0.6; // knockback
        }
        break;
      }
    }
  }

  // --- enemy bolts ---
  for (const b of bolts) {
    if (!b.userData.active) continue;
    b.position.x += b.userData.vx * dt;
    b.position.y += b.userData.vy * dt;
    b.position.z += b.userData.vz * dt;
    if (b.position.z > KILL_Z || b.position.z < SPAWN_Z - 20) { bolts.release(b); continue; }
    const d = b.position.distanceTo(ship.position);
    if (d < 1.5) {
      bolts.release(b);
      damagePlayer(16);
      explode(b.position, 6, 0xff4ecd);
    }
  }

  // --- enemies ---
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.obj.position.z += e.vz * dt;
    if (e.type === 'rock') {
      e.obj.position.x += e.vx * dt;
      e.obj.position.y += e.vy * dt;
      e.obj.rotation.x += e.spinX * dt;
      e.obj.rotation.y += e.spinY * dt;
    } else if (e.type === 'drone') {
      e.obj.position.x = e.baseX + Math.sin(state.time * e.swayFreq + e.phase) * e.swayAmp;
      e.obj.rotation.z += dt * 2;
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && e.obj.position.z > -180 && e.obj.position.z < -12) {
        e.fireTimer = e.fireEvery;
        enemyFire(e);
      }
    } else { // hunter — homes toward the player
      const hx = ship.position.x - e.obj.position.x;
      const hy = ship.position.y - e.obj.position.y;
      e.obj.position.x += THREE.MathUtils.clamp(hx, -1, 1) * e.homing * dt;
      e.obj.position.y += THREE.MathUtils.clamp(hy, -1, 1) * e.homing * dt;
      e.obj.rotation.z -= dt * 3;
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && e.obj.position.z > -160 && e.obj.position.z < -10) {
        e.fireTimer = e.fireEvery;
        enemyFire(e);
      }
    }
    // collision with player
    const d = e.obj.position.distanceTo(ship.position);
    if (d < e.radius + 1.2) {
      explode(e.obj.position, 16, 0xffaa55);
      sfxBoom();
      removeEnemy(i);
      damagePlayer(e.type === 'rock' ? 30 : 24);
      continue;
    }
    if (e.obj.position.z > KILL_Z) removeEnemy(i);
  }

  // --- powerups ---
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.obj.position.z += p.vz * dt;
    p.obj.rotation.y += dt * 3;
    p.obj.rotation.x += dt * 1.4;
    if (p.obj.position.distanceTo(ship.position) < 2.4) {
      applyPowerup(p.kind);
      scene.remove(p.obj);
      powerups.splice(i, 1);
    } else if (p.obj.position.z > KILL_Z) {
      scene.remove(p.obj);
      powerups.splice(i, 1);
    }
  }
}

tick();

// debug hook for headless testing (drives update() without rAF)
window.__strike = { state, update, enemies, bullets, bolts, powerups, ship, target };
