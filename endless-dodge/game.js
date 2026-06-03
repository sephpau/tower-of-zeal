(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const finalEl = document.getElementById('finalScore');

  const VW = 360, VH = 640;

  function resize() {
    const maxW = Math.min(window.innerWidth, 480);
    const maxH = window.innerHeight;
    const ratio = VW / VH;
    let w = maxW, h = w / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const dpr = window.devicePixelRatio || 1;
    canvas.width = VW * dpr;
    canvas.height = VH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- World / camera ----
  // Lateral world X: -1 = left edge of track, +1 = right edge.
  // Forward world Z: 0 = at the player (near), 1 = at the horizon (far).
  const HORIZON_Y = VH * 0.20; // higher horizon → ground fills most of the screen
  const FAR_SCALE = 0.18;
  const TRACK_HALF_PX = 344; // half-width of the track at the near plane (Z=0) — 2x wider road
  const PERSP = 3.4;         // perspective strength (higher = stronger rush-in near the player)
  const CURVE_PX = 175;      // how far the road bends at the horizon when steering
  const CURVE_SIGN = -1;     // direction the world swings relative to steering

  // True-perspective depth curve: 1 at the near plane (z=0), 0 at the horizon (z=1),
  // bunched toward the horizon so objects sit small far away then accelerate as they near.
  function persp(z) {
    return (1 - z) / (1 + PERSP * z);
  }
  // The road bends as you steer (vanishing point shifts), pinned to no shift at the
  // player's depth so the player itself isn't displaced — the world swings around it.
  let roadCurve = 0; // -1..1, eases toward steering
  let camX = 0;      // horizontal camera pan (px), follows the mech when off-center
  const CAM_FOLLOW = 0.6; // how much the camera chases the mech's screen offset
  const CAM_MARGIN = 150; // how far past the screen edges backgrounds are filled
  const PLAYER_PERSP = (1 - 0.06) / (1 + PERSP * 0.06);
  function curveShift(z) {
    return roadCurve * CURVE_SIGN * (PLAYER_PERSP - persp(z)) * CURVE_PX;
  }
  function projectY(z) {
    return HORIZON_Y + (VH - HORIZON_Y) * persp(z);
  }
  function scaleAt(z) {
    return FAR_SCALE + (1 - FAR_SCALE) * persp(z); // 1 at near, FAR_SCALE at far
  }
  function projectX(worldX, z) {
    return VW / 2 + worldX * TRACK_HALF_PX * scaleAt(z) + curveShift(z);
  }

  // Player sits at this depth (near the bottom). Obstacles collide here.
  const PLAYER_Z = 0.06;
  // Obstacles spawn at this depth (1.0 = far horizon). Larger gap to PLAYER_Z = more
  // reaction time. Reaction window ≈ (SPAWN_Z - PLAYER_Z) / forwardSpeed seconds.
  const SPAWN_Z = 1.0;

  // ---- Biomes ----
  // Each biome defines a palette for sky/hills/ground + a weather type.
  // Item pools come from assets/items-manifest.json (biome key + "any" fallback).
  const BIOMES = {
    savannah: {
      name: 'Savannah',
      skyTop: '#f4b56b', skyBot: '#ffe6bf',
      hill: '#d39a55', hill2: '#c4863f',
      groundTop: '#e7be73', groundBot: '#f1d49a',
      edge: 'rgba(120,85,35,0.35)', stripe: 'rgba(255,255,255,0.13)',
      weather: 'none',
    },
    forest: {
      name: 'Forest',
      skyTop: '#7fbef0', skyBot: '#cfeafb',
      hill: '#4f8f4a', hill2: '#3c7038',
      groundTop: '#79c06b', groundBot: '#8ed57c',
      edge: 'rgba(35,65,28,0.35)', stripe: 'rgba(255,255,255,0.18)',
      weather: 'rain', weatherStart: 1000, // rain only kicks in halfway through Forest (500–1500)
    },
    arctic: {
      name: 'Arctic',
      skyTop: '#bfe0f5', skyBot: '#eef8ff',
      hill: '#cfe3ef', hill2: '#b4d2e4',
      groundTop: '#e9f3fb', groundBot: '#ffffff',
      edge: 'rgba(120,150,180,0.35)', stripe: 'rgba(170,205,235,0.45)',
      weather: 'snow',
    },
    mystic: {
      name: 'Mystic',
      skyTop: '#4d2384', skyBot: '#9a6fd4',
      hill: '#6e3aa0', hill2: '#552c84',
      groundTop: '#7b4bb0', groundBot: '#a279d8',
      edge: 'rgba(40,10,70,0.4)', stripe: 'rgba(225,190,255,0.22)',
      weather: 'motes', moteColor: '230,190,255',
    },
    genesis: {
      name: 'Genesis',
      skyTop: '#081636', skyBot: '#1d3a70',
      hill: '#142a54', hill2: '#0e1f40',
      groundTop: '#16356b', groundBot: '#2a5fa0',
      edge: 'rgba(5,15,40,0.5)', stripe: 'rgba(120,170,255,0.22)',
      weather: 'motes', moteColor: '150,190,255',
    },
    luna: {
      name: "Luna's Landing",
      skyTop: '#4f0b0b', skyBot: '#a82626',
      hill: '#7a1515', hill2: '#5c0f0f',
      groundTop: '#8a1c1c', groundBot: '#c64030',
      edge: 'rgba(40,5,5,0.5)', stripe: 'rgba(255,185,165,0.22)',
      weather: 'motes', moteColor: '255,160,140',
    },
  };
  const BIOME_KEYS = Object.keys(BIOMES);

  // Score-gated biome progression (the run advances through biomes as score climbs).
  function biomeKeyForScore(s) {
    if (s < 500)   return 'savannah';   // 1–500
    if (s < 1500)  return 'forest';     // 500–1500
    if (s < 3000)  return 'arctic';     // 1500–3000
    if (s < 5000)  return 'mystic';     // 3000–5000
    if (s < 10000) return 'genesis';    // 5000–10000
    return 'luna';                      // 10000+
  }

  // Score band per biome (used for the day-cycle celestial arc). Luna is open-ended,
  // so its body loops every (end-start) points.
  const BANDS = {
    savannah: [0, 500], forest: [500, 1500], arctic: [1500, 3000],
    mystic: [3000, 5000], genesis: [5000, 10000], luna: [10000, 16000],
  };
  // Celestial body color per biome: { core, glow:'r,g,b' }.
  const SKY = {
    savannah: { core: '#fff6d8', glow: '255,205,130' }, // warm sun
    forest:   { core: '#fffbe6', glow: '255,236,150' }, // bright sun
    arctic:   { core: '#ffffff', glow: '205,230,255' }, // pale cold sun
    mystic:   { core: '#f3e6ff', glow: '205,150,255' }, // lavender moon
    genesis:  { core: '#dbe8ff', glow: '130,165,255' }, // blue moon
    luna:     { core: '#ffdcc8', glow: '255,120,90'  }, // red sun
  };
  let currentBiomeKey = 'savannah';

  // ---- Item assets ----
  // manifest: { <biome>: {design:[], moving:[], obstacle:[], fullobstacle:[]}, any: {...} }
  let manifest = null;
  const CLASSES = ['design', 'moving', 'obstacle', 'fullobstacle'];
  const itemCache = new Map();  // filename -> Image
  function loadItem(fn) {
    let img = itemCache.get(fn);
    if (!img) {
      img = new Image();
      img.src = 'assets/items/' + encodeURIComponent(fn);
      itemCache.set(fn, img);
    }
    return img;
  }
  fetch('assets/items-manifest.json')
    .then(r => r.json())
    .then(m => { manifest = m; })
    .catch(() => { manifest = null; });

  // Per-classification filename pools for the current biome. Prefer the biome's
  // own items; fall back to the shared "any" pool only when that class is empty.
  let pools = { design: [], moving: [], obstacle: [], fullobstacle: [] };
  function poolFor(biomeKey, cls) {
    const a = (manifest && manifest[biomeKey] && manifest[biomeKey][cls]) || [];
    if (a.length) return a.slice();
    const b = (manifest && manifest.any && manifest.any[cls]) || [];
    return b.slice();
  }
  function buildBiomePool(biomeKey) {
    for (const c of CLASSES) pools[c] = poolFor(biomeKey, c);
    // Warm a random subset across all classes so first spawns have art ready.
    const all = [].concat(pools.obstacle, pools.fullobstacle, pools.moving, pools.design);
    const warm = all.slice().sort(() => Math.random() - 0.5).slice(0, 24);
    for (const fn of warm) loadItem(fn);
  }
  function pickFrom(cls) {
    const p = pools[cls];
    if (!p.length) return null;
    return loadItem(p[Math.floor(Math.random() * p.length)]);
  }

  // ---- Storage ----
  const STORAGE_KEY = 'endless-dodge-best';
  let best = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
  bestEl.textContent = 'Best: ' + best;

  // ---- Sprites ----
  // Three sprites: rear (idle/straight), right (banking right), left (banking left).
  const mechRear  = new Image();
  const mechRight = new Image();
  const mechLeft  = new Image();
  let mechReady = 0; // bitmask: 1=rear, 2=right, 4=left
  mechRear.onload  = () => { mechReady |= 1; };
  mechRight.onload = () => { mechReady |= 2; };
  mechLeft.onload  = () => { mechReady |= 4; };
  mechRear.src  = 'assets/mech%20rear.png?v=2';
  mechRight.src = 'assets/mech%20right.png?v=1';
  mechLeft.src  = 'assets/mech%20left.png?v=1';

  // Per-sprite metadata: aspect (w/h) and thruster nozzle anchors as fractions of drawn (w, h).
  // Rear sprite was cropped to its content bounds so it draws at the same size as left/right.
  const SPRITES = {
    rear:  { img: mechRear,  bit: 1, aspect: 0.979, left: { x: 0.150, y: 0.560 }, right: { x: 0.850, y: 0.560 } },
    right: { img: mechRight, bit: 2, aspect: 1.13, left: { x: 0.128, y: 0.635 }, right: { x: 0.872, y: 0.635 } },
    left:  { img: mechLeft,  bit: 4, aspect: 1.13, left: { x: 0.128, y: 0.635 }, right: { x: 0.872, y: 0.635 } },
  };
  const STEER_BANK = 0.9; // |vx| above this → use banking (left/right) sprite

  function currentSprite() {
    if (player.vx >  STEER_BANK) return SPRITES.right;
    if (player.vx < -STEER_BANK) return SPRITES.left;
    return SPRITES.rear;
  }

  // ---- Player ----
  const player = {
    worldX: 0,   // lateral, -1..+1
    vx: 0,       // lateral velocity in worldX units / sec
    spriteH: 96, // on-screen sprite height in px at near plane
  };
  const PLAYER_LATERAL_SPEED = 2.6;   // worldX/sec
  const PLAYER_LATERAL_ACCEL = 18;
  const PLAYER_LATERAL_FRICTION = 16;
  const PLAYER_CLAMP = 0.55; // keep the mech on-screen now the road is 2x wider

  // ---- Obstacles ----
  // Each obstacle has worldX in [-1,1] and z in [0,1] decreasing over time.
  // Visual: an item sprite (from the current biome pool) sitting on the ground.
  // Fallback box if an item image isn't ready yet.
  const FALLBACK = { color: '#b0a48c', dark: '#7a6e58' };

  let obstacles = [];
  let stripes = [];
  let particles = [];
  let smoke = [];
  let weather = [];
  let smokeTimer = 0;

  let currentBiome = BIOMES.forest;
  let bannerTimer = 0;
  let weatherOn = false;

  // Weather is active unless gated by a biome's weatherStart score (e.g. Forest rains
  // only past its midpoint). 'none' biomes never have weather.
  function shouldWeather() {
    const b = currentBiome;
    if (b.weather === 'none') return false;
    if (b.weatherStart != null) return score >= b.weatherStart;
    return true;
  }

  // Ground motion stripes (lateral lines on the ground that scroll forward)
  function seedStripes() {
    stripes = [];
    for (let i = 0; i < 14; i++) stripes.push({ z: i / 14 });
  }
  seedStripes();

  // Scattered ground specks/tufts that scroll toward the camera for a sense of speed.
  let groundDetail = [];
  function seedGroundDetail() {
    groundDetail = [];
    for (let i = 0; i < 200; i++) {
      groundDetail.push({
        u: (Math.random() * 2 - 1) * 2.6,   // lateral (wider than track to fill ground)
        z: Math.random(),                    // 0 near .. 1 far
        r: 3 + Math.random() * 6,            // base radius (px at near plane)
        light: Math.random() < 0.5,          // light highlight vs dark speck
      });
    }
  }
  seedGroundDetail();

  function seedWeather() {
    weather = [];
    const w = currentBiome.weather;
    if (w === 'none') return;
    const count = w === 'rain' ? 90 : w === 'snow' ? 70 : 40;
    for (let i = 0; i < count; i++) {
      weather.push({
        x: Math.random() * VW,
        y: Math.random() * VH,
        spd: w === 'rain' ? 420 + Math.random() * 180
           : w === 'snow' ? 40 + Math.random() * 40
           : 12 + Math.random() * 20,
        drift: w === 'snow' ? (Math.random() - 0.5) * 25
             : w === 'motes' ? (Math.random() - 0.5) * 18 : 0,
        r: w === 'rain' ? 0 : 1 + Math.random() * 2,
        len: w === 'rain' ? 8 + Math.random() * 8 : 0,
        ph: Math.random() * Math.PI * 2,
      });
    }
  }

  let running = false;
  let score = 0;
  let elapsed = 0;
  let spawnTimer = 0;
  let decorTimer = 0;
  let forwardSpeed = 0.55; // world Z units / sec
  let input = { left: false, right: false };

  // Portal transition between biomes (instead of an instant swap).
  const PORTAL_DUR = 1.6; // seconds
  let phase = 'play';     // 'play' | 'portal'
  let portalT = 0;        // 0..1 progress through the portal animation
  let pendingBiomeKey = null;
  let portalSwapped = false;

  function reset() {
    obstacles = [];
    particles = [];
    smoke = [];
    smokeTimer = 0;
    player.worldX = 0;
    player.vx = 0;
    score = 0;
    elapsed = 0;
    spawnTimer = 0;
    decorTimer = 0;
    forwardSpeed = 0.55;
    phase = 'play';
    portalT = 0;
    pendingBiomeKey = null;
    portalSwapped = false;
    roadCurve = 0;
    camX = 0;
    // Runs always begin in Savannah; biome advances with score (see update()).
    setBiome('savannah');
    seedStripes();
    seedGroundDetail();
  }

  // Begin a portal transition to `key` (biome swaps at the midpoint flash).
  function startPortal(key) {
    phase = 'portal';
    portalT = 0;
    pendingBiomeKey = key;
    portalSwapped = false;
    obstacles = []; // teleport away from the old biome's hazards
  }

  function updatePortal(dt) {
    portalT += dt / PORTAL_DUR;
    if (!portalSwapped && portalT >= 0.5) {
      setBiome(pendingBiomeKey);
      portalSwapped = true;
    }
    if (portalT >= 1) { phase = 'play'; portalT = 0; }
  }

  // Switch to a biome: swap palette, rebuild item pool, reseed weather, flash banner.
  function setBiome(key) {
    currentBiomeKey = key;
    currentBiome = BIOMES[key];
    buildBiomePool(key);
    weatherOn = shouldWeather();
    if (weatherOn) seedWeather(); else weather = [];
    bannerTimer = 2.6;
  }

  function start() {
    reset();
    running = true;
    overlay.classList.add('hidden');
    finalEl.style.display = 'none';
  }

  function gameOver() {
    running = false;
    if (score > best) {
      best = score;
      localStorage.setItem(STORAGE_KEY, String(best));
      bestEl.textContent = 'Best: ' + best;
    }
    finalEl.textContent = 'Score: ' + score + '   ·   Best: ' + best;
    finalEl.style.display = 'block';
    startBtn.textContent = 'Play again';
    overlay.classList.remove('hidden');
    const sx = projectX(player.worldX, PLAYER_Z);
    const sy = projectY(PLAYER_Z) - player.spriteH * 0.5;
    for (let i = 0; i < 28; i++) {
      particles.push({
        x: sx, y: sy,
        vx: (Math.random() - 0.5) * 420,
        vy: (Math.random() - 0.5) * 420 - 60,
        life: 0.9, max: 0.9,
        c: '#ff5d6c',
      });
    }
  }

  startBtn.addEventListener('click', start);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') input.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = true;
    if ((e.key === ' ' || e.key === 'Enter') && !running) start();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') input.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = false;
  });

  // Pointer steering: the ship tracks the pointer's horizontal position so the
  // player can react instantly. Drag on mobile; move or drag on desktop.
  // pointerTargetX is a worldX target in [-PLAYER_CLAMP, PLAYER_CLAMP], or null.
  let pointerTargetX = null;
  function setPointerTarget(clientX) {
    const rect = canvas.getBoundingClientRect();
    const fx = (clientX - rect.left) / rect.width; // 0..1 across the play area
    pointerTargetX = Math.max(-PLAYER_CLAMP, Math.min(PLAYER_CLAMP, (fx * 2 - 1) * PLAYER_CLAMP));
  }
  function clearPointer() { pointerTargetX = null; }

  // Touch: follow the finger while it's down.
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); if (running && e.touches[0]) setPointerTarget(e.touches[0].clientX); }, { passive: false });
  canvas.addEventListener('touchmove',  (e) => { e.preventDefault(); if (running && e.touches[0]) setPointerTarget(e.touches[0].clientX); }, { passive: false });
  canvas.addEventListener('touchend',   (e) => { e.preventDefault(); if (e.touches.length) setPointerTarget(e.touches[0].clientX); else clearPointer(); }, { passive: false });
  // Mouse: follow the cursor while it's over the play area (hover or drag).
  canvas.addEventListener('mousemove', (e) => { if (running) setPointerTarget(e.clientX); });
  canvas.addEventListener('mousedown', (e) => { if (running) setPointerTarget(e.clientX); });
  canvas.addEventListener('mouseleave', clearPointer);

  // Difficulty ramps 0 → 1 over the first ~75s of a run.
  function difficulty() {
    return Math.min(1, elapsed / 75);
  }

  // Lane slots for fullobstacle rows. Spacing (~0.44) is wider than an obstacle's
  // collision width, so any empty slot is a fair, passable gap.
  const SLOTS = [-0.66, -0.22, 0.22, 0.66];

  // kind: 'obstacle' (static, lethal), 'moving' (slides L<->R, lethal),
  //       'design' (decor outside the track, never lethal).
  function pushObstacle(worldX, img, opts) {
    obstacles.push(Object.assign({
      worldX, z: SPAWN_Z, img,
      agW: 0.15 + Math.random() * 0.04,
      kind: 'obstacle',
    }, opts || {}));
  }

  // A single literal obstacle in a random lane.
  function spawnSingle() {
    const img = pickFrom('obstacle') || pickFrom('fullobstacle');
    pushObstacle((Math.random() * 2 - 1) * 0.45, img);
  }

  // A row across lane slots, ALWAYS leaving ≥1 slot open. Row size grows 1→3 with d.
  // Uses fullobstacle art if available, else falls back to obstacle art.
  function spawnRow(d) {
    let maxCount = 1 + (d > 0.3 ? 1 : 0) + (d > 0.65 ? 1 : 0); // 1..3
    let count = maxCount;
    if (maxCount > 1 && Math.random() < 0.3) count = maxCount - 1;
    const idx = [0, 1, 2, 3];
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    for (let i = 0; i < count; i++) {
      const jitter = (Math.random() - 0.5) * 0.06;
      const img = pickFrom('fullobstacle') || pickFrom('obstacle');
      pushObstacle(SLOTS[idx[i]] + jitter, img);
    }
  }

  // A lethal obstacle that slides left<->right across lanes while approaching.
  function spawnMoving() {
    const img = pickFrom('moving');
    if (!img) return;
    pushObstacle(0, img, {
      kind: 'moving',
      baseX: 0,
      oscAmp: 0.45 + Math.random() * 0.3,
      oscFreq: 1.2 + Math.random() * 0.8,
      oscPhase: Math.random() * Math.PI * 2,
    });
  }

  // Decorative scenery placed OUTSIDE the track edges; never collides.
  function spawnDecorOne(side) {
    const img = pickFrom('design');
    if (!img) return;
    pushObstacle(side * (1.05 + Math.random() * 0.55), img, {
      kind: 'design', agW: 0.2 + Math.random() * 0.12,
    });
  }
  // Flood both roadsides with scenery each tick.
  function spawnDecor() {
    spawnDecorOne(-1);
    spawnDecorOne(1);
    if (Math.random() < 0.6) spawnDecorOne(Math.random() < 0.5 ? -1 : 1);
  }

  // Simplified gameplay (Long Nose Dog feel): just single obstacles to weave around.
  function spawnHazard(d) {
    if (pools.obstacle.length || pools.fullobstacle.length) spawnSingle();
  }

  function update(dt) {
    if (phase === 'portal') { updatePortal(dt); return; }
    elapsed += dt;
    const d = difficulty();
    // Keep the approach reactable; difficulty scales mostly via density (rows/moving),
    // not raw speed. Reaction window: (SPAWN_Z-PLAYER_Z)/speed ≈ 1.5s early → 0.6s late.
    forwardSpeed = 0.55 + d * 0.85; // 0.55 → 1.4 over ~75s
    if (bannerTimer > 0) bannerTimer -= dt;

    // Steering. Keyboard (A/D, arrows) takes priority; otherwise the pointer
    // snaps the ship instantly to the cursor/finger; otherwise coast to a stop.
    if (input.left || input.right) {
      pointerTargetX = null; // keys override pointer follow
      let ax = 0;
      if (input.left)  ax -= PLAYER_LATERAL_ACCEL;
      if (input.right) ax += PLAYER_LATERAL_ACCEL;
      player.vx += ax * dt;
      player.vx = Math.max(-PLAYER_LATERAL_SPEED, Math.min(PLAYER_LATERAL_SPEED, player.vx));
      player.worldX += player.vx * dt;
    } else if (pointerTargetX !== null) {
      // Instant follow: snap straight to the pointer, no easing/lag.
      const prev = player.worldX;
      player.worldX = pointerTargetX;
      // Implied velocity drives the banking sprite (rear when not moving).
      player.vx = Math.max(-PLAYER_LATERAL_SPEED, Math.min(PLAYER_LATERAL_SPEED, (player.worldX - prev) / dt));
    } else {
      const sign = Math.sign(player.vx);
      player.vx -= sign * PLAYER_LATERAL_FRICTION * dt;
      if (Math.sign(player.vx) !== sign) player.vx = 0;
      player.vx = Math.max(-PLAYER_LATERAL_SPEED, Math.min(PLAYER_LATERAL_SPEED, player.vx));
      player.worldX += player.vx * dt;
    }
    if (player.worldX < -PLAYER_CLAMP) { player.worldX = -PLAYER_CLAMP; player.vx = 0; }
    if (player.worldX >  PLAYER_CLAMP) { player.worldX =  PLAYER_CLAMP; player.vx = 0; }

    // Ease the road curve toward how hard you're steering, so the world swings.
    const curveTarget = Math.max(-1, Math.min(1, player.vx / PLAYER_LATERAL_SPEED));
    roadCurve += (curveTarget - roadCurve) * Math.min(1, dt * 6);

    // Pan the camera toward the mech when it's off-center so it stays fully visible.
    const mechOffset = player.worldX * TRACK_HALF_PX * scaleAt(PLAYER_Z);
    camX += (mechOffset * CAM_FOLLOW - camX) * Math.min(1, dt * 8);

    // Spawn gameplay hazards; they come faster as difficulty rises.
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnHazard(d);
      spawnTimer = 1.1 - d * 0.5; // 1.1s → 0.6s between hazards
    }
    // Spawn decorative scenery outside the track at a steady rate.
    decorTimer -= dt;
    if (decorTimer <= 0) {
      spawnDecor();
      decorTimer = 0.18 + Math.random() * 0.18;
    }

    // Advance obstacles toward camera — keep them alive past the player so they fly off-screen.
    for (const o of obstacles) {
      o.z -= forwardSpeed * dt;
      // Moving obstacles slide left<->right across the lanes as they approach.
      if (o.kind === 'moving') {
        o.worldX = o.baseX + Math.sin(o.oscPhase + elapsed * o.oscFreq) * o.oscAmp;
        if (o.worldX < -0.82) o.worldX = -0.82;
        if (o.worldX >  0.82) o.worldX =  0.82;
      }
    }
    obstacles = obstacles.filter(o => o.z > -0.1);

    // Ground stripes scroll forward (toward camera)
    for (const s of stripes) {
      s.z -= forwardSpeed * dt;
      if (s.z < 0) s.z += 1;
    }

    // Ground specks scroll toward the camera; recycle to the horizon when they pass.
    for (const g of groundDetail) {
      g.z -= forwardSpeed * dt;
      if (g.z < 0) { g.z += 1; g.u = (Math.random() * 2 - 1) * 2.6; }
    }

    // Weather motion
    updateWeather(dt);

    // Collision: when a lethal obstacle reaches the player's depth (design never hits).
    for (const o of obstacles) {
      if (o.kind === 'design') continue;
      if (o.z < PLAYER_Z + 0.06 && o.z > PLAYER_Z - 0.06) {
        const dx = Math.abs(o.worldX - player.worldX);
        if (dx < o.agW + 0.10) {
          gameOver();
          return;
        }
      }
    }

    // Smoke from thrusters — emit from each nozzle anchor on the current sprite.
    smokeTimer -= dt;
    if (smokeTimer <= 0) {
      smokeTimer = 0.022;
      const spr = currentSprite();
      const cx = projectX(player.worldX, PLAYER_Z);
      const cy = projectY(PLAYER_Z);
      const h  = player.spriteH;
      const w  = h * spr.aspect;
      const px = cx - w / 2;
      const py = cy - h * 0.85;
      const nozzles = [
        { x: px + w * spr.left.x,  y: py + h * spr.left.y  },
        { x: px + w * spr.right.x, y: py + h * spr.right.y },
      ];
      for (const n of nozzles) {
        smoke.push({
          x: n.x + (Math.random() - 0.5) * 4,
          y: n.y + (Math.random() - 0.5) * 2,
          vx: (Math.random() - 0.5) * 24 - player.vx * 18,
          vy: 55 + Math.random() * 35,
          r: 4 + Math.random() * 3,
          grow: 24 + Math.random() * 12,
          life: 0.55 + Math.random() * 0.25,
          max: 0.8,
        });
      }
    }

    score = Math.floor(elapsed * 10);
    scoreEl.textContent = score;

    // Advance biome when the score crosses a threshold — via a portal transition.
    const nextKey = biomeKeyForScore(score);
    if (nextKey !== currentBiomeKey) startPortal(nextKey);

    // Start/stop weather mid-biome (e.g. Forest rain begins at its midpoint).
    const want = shouldWeather();
    if (want !== weatherOn) {
      weatherOn = want;
      if (want) seedWeather(); else weather = [];
    }
  }

  function updateWeather(dt) {
    const w = currentBiome.weather;
    if (w === 'none') return;
    for (const p of weather) {
      p.x += (p.drift + (w === 'motes' ? Math.sin(p.ph + elapsed) * 8 : 0)) * dt;
      if (w === 'motes') {
        p.y -= p.spd * dt; // motes drift upward
        if (p.y < -10) { p.y = VH + 10; p.x = Math.random() * VW; }
      } else {
        p.y += p.spd * dt;
        if (p.y > VH + 10) { p.y = -10; p.x = Math.random() * VW; }
      }
      if (p.x < -10) p.x = VW + 10;
      if (p.x > VW + 10) p.x = -10;
    }
  }

  function updateSmoke(dt) {
    for (const p of smoke) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.grow * dt;
      p.vx *= 0.95;
      p.life -= dt;
    }
    smoke = smoke.filter(p => p.life > 0);
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 700 * dt;
      p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);
  }

  // Sun position along its arc for progress t (0=sunrise left, 0.5=noon, 1=sunset right).
  function sunPos(t) {
    const theta = Math.PI * (1 - t);
    return {
      x: VW / 2 + VW * 0.4 * Math.cos(theta),
      y: (HORIZON_Y - 6) - HORIZON_Y * 0.82 * Math.sin(theta),
    };
  }

  // Each biome's sun/moon arcs across its sky, synced to its score band
  // (sunrise→sunset), leaving a glowing trail along the path travelled.
  function drawCelestial() {
    const band = BANDS[currentBiomeKey];
    const sky = SKY[currentBiomeKey];
    if (!band || !sky) return;
    let t = (score - band[0]) / (band[1] - band[0]);
    if (currentBiomeKey === 'luna') t -= Math.floor(t); // open-ended: loop
    t = Math.max(0, Math.min(1, t));
    // Trail: the arc travelled so far, brightening toward the body.
    const N = 24;
    ctx.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const a = sunPos((i / N) * t);
      const c = sunPos(((i + 1) / N) * t);
      const f = (i + 1) / N;
      ctx.strokeStyle = `rgba(${sky.glow},${(0.05 + 0.22 * f).toFixed(3)})`;
      ctx.lineWidth = 1 + 3 * f;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    }
    const p = sunPos(t);
    const R = 16;
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 3.2);
    glow.addColorStop(0, `rgba(${sky.glow},0.85)`);
    glow.addColorStop(0.4, `rgba(${sky.glow},0.4)`);
    glow.addColorStop(1, `rgba(${sky.glow},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(p.x, p.y, R * 3.2, 0, Math.PI * 2); ctx.fill();
    const core = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
    core.addColorStop(0, sky.core);
    core.addColorStop(1, `rgba(${sky.glow},1)`);
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.fill();
  }

  // How overcast the sky is (0..1). Ramps in with rain over ~12 score points*10.
  function cloudiness() {
    if (!weatherOn || currentBiome.weather !== 'rain') return 0;
    const start = currentBiome.weatherStart || 0;
    return Math.max(0, Math.min(1, (score - start) / 120));
  }

  function drawCloud(x, y, s, a) {
    ctx.fillStyle = `rgba(228,230,234,${(0.85 * a).toFixed(3)})`;
    const r = 18 * s;
    const lobes = [[0, 0, 1], [r * 0.9, 3, 0.8], [-r * 0.9, 4, 0.75], [r * 0.4, -6, 0.72], [-r * 0.4, -5, 0.66]];
    for (const [ox, oy, rr] of lobes) {
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy, rr * r, rr * r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Overcast tint + drifting clouds while it's raining (dims the sun behind them).
  const CLOUDS = [
    { x: 60, y: 42, s: 1.0 }, { x: 190, y: 28, s: 1.3 }, { x: 310, y: 52, s: 1.1 },
    { x: 130, y: 72, s: 0.9 }, { x: 260, y: 84, s: 1.0 },
  ];
  function drawClouds() {
    const c = cloudiness();
    if (c <= 0) return;
    ctx.fillStyle = `rgba(110,120,132,${(0.42 * c).toFixed(3)})`;
    ctx.fillRect(0, 0, VW, HORIZON_Y);
    const span = VW + 160;
    for (const cl of CLOUDS) {
      const x = ((cl.x + elapsed * 6) % span + span) % span - 80;
      drawCloud(x, cl.y, cl.s, c);
    }
  }

  function drawSky() {
    const b = currentBiome;
    const grad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
    grad.addColorStop(0, b.skyTop);
    grad.addColorStop(1, b.skyBot);
    ctx.fillStyle = grad;
    ctx.fillRect(-CAM_MARGIN, 0, VW + 2 * CAM_MARGIN, HORIZON_Y);

    drawCelestial();
    drawClouds();

    // Hill ridges span past the screen edges so camera pan never exposes gaps.
    const HX0 = -CAM_MARGIN, HW = VW + 2 * CAM_MARGIN, STEP = HW / 8;
    ctx.fillStyle = b.hill2;
    ctx.beginPath();
    ctx.moveTo(HX0, HORIZON_Y);
    for (let i = 0; i <= 8; i++) {
      const x = HX0 + i * STEP;
      const y = HORIZON_Y - 22 - Math.sin(i * 0.9 + 1) * 12;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(HX0 + HW, HORIZON_Y); ctx.closePath(); ctx.fill();

    ctx.fillStyle = b.hill;
    ctx.beginPath();
    ctx.moveTo(HX0, HORIZON_Y);
    for (let i = 0; i <= 8; i++) {
      const x = HX0 + i * STEP;
      const y = HORIZON_Y - 12 - Math.sin(i * 1.3) * 8 - (i % 2 === 0 ? 6 : 0);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(HX0 + HW, HORIZON_Y); ctx.closePath(); ctx.fill();
  }

  function drawGround() {
    const b = currentBiome;
    const gGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, VH);
    gGrad.addColorStop(0, b.groundTop);
    gGrad.addColorStop(1, b.groundBot);
    ctx.fillStyle = gGrad;
    ctx.fillRect(-CAM_MARGIN, HORIZON_Y, VW + 2 * CAM_MARGIN, VH - HORIZON_Y);

    // Scrolling ground specks (sense of speed)
    for (const g of groundDetail) {
      const sc = scaleAt(g.z);
      const x = projectX(g.u, g.z);
      if (x < -CAM_MARGIN || x > VW + CAM_MARGIN) continue;
      const y = projectY(g.z);
      const rr = g.r * sc;
      const a = (0.16 + 0.20 * (1 - g.z)).toFixed(3);
      ctx.fillStyle = g.light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rr, rr * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    drawFences();
  }

  // Wooden fences along both road edges. Posts/rails sample many z's so they
  // follow the curving road and animate toward the camera.
  const FENCE = { dark: '#6b4423', mid: '#9c6b33', light: '#c79a5e', rail: '#c2a06a' };
  const POST_H = 34; // post height (px) at the near plane
  function drawFences() {
    const zs = stripes.map(s => s.z).sort((a, b2) => b2 - a); // far -> near
    for (const sx of [-1, 1]) {
      const pts = zs.map(z => {
        const sc = scaleAt(z);
        const gy = projectY(z);
        return { x: projectX(sx, z), gy, top: gy - POST_H * sc, sc };
      });
      ctx.lineCap = 'round';
      for (const frac of [0.74, 0.34]) {
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], c = pts[i + 1];
          const ay = a.gy - (a.gy - a.top) * frac;
          const cy = c.gy - (c.gy - c.top) * frac;
          const w = Math.max(1.5, 5 * ((a.sc + c.sc) / 2));
          ctx.strokeStyle = FENCE.dark; ctx.lineWidth = w + 2;
          ctx.beginPath(); ctx.moveTo(a.x, ay); ctx.lineTo(c.x, cy); ctx.stroke();
          ctx.strokeStyle = FENCE.rail; ctx.lineWidth = w;
          ctx.beginPath(); ctx.moveTo(a.x, ay); ctx.lineTo(c.x, cy); ctx.stroke();
        }
      }
      for (const p of pts) {
        const w = Math.max(3, 9 * p.sc);
        const x = p.x - w / 2, y = p.top, h = p.gy - p.top, r = w * 0.42;
        ctx.fillStyle = FENCE.dark;
        roundRect(x - 1.5, y - 1.5, w + 3, h + 3, r); ctx.fill();
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, FENCE.dark);
        g.addColorStop(0.35, FENCE.mid);
        g.addColorStop(0.7, FENCE.light);
        g.addColorStop(1, FENCE.mid);
        ctx.fillStyle = g;
        roundRect(x, y, w, h, r); ctx.fill();
      }
    }
  }

  function drawObstacles(farOnly) {
    // Sort far-to-near so near ones draw on top.
    // farOnly=true: only obstacles still behind the player (behind the mech sprite).
    // farOnly=false: only obstacles past the player (drawn on top of the mech).
    let list = obstacles;
    if (farOnly === true)  list = list.filter(o => o.z >= PLAYER_Z);
    if (farOnly === false) list = list.filter(o => o.z <  PLAYER_Z);
    const sorted = list.slice().sort((a, b) => b.z - a.z);
    for (const o of sorted) {
      if (o.z > 1.02) continue;
      const z = o.z;
      const s = scaleAt(z);
      const cx = projectX(o.worldX, z);
      const cy = projectY(z);
      const baseW = o.agW * TRACK_HALF_PX * s * 2;

      // Shadow on the ground (ellipse) — skipped for decorative scenery.
      if (o.kind !== 'design') {
        ctx.fillStyle = `rgba(0,0,0,${0.26 * (1 - z * 0.4)})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, baseW * 0.55, baseW * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      const img = o.img;
      if (img && img.complete && img.naturalWidth > 0) {
        const aspect = img.naturalWidth / img.naturalHeight;
        const dw = baseW * 1.35; // items render a touch wider than the collision box
        const dh = dw / aspect;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, cx - dw / 2, cy - dh, dw, dh);
      } else {
        const h = baseW * 1.2;
        const grad = ctx.createLinearGradient(0, cy - h, 0, cy);
        grad.addColorStop(0, FALLBACK.color);
        grad.addColorStop(1, FALLBACK.dark);
        ctx.fillStyle = grad;
        roundRect(cx - baseW / 2, cy - h, baseW, h, Math.max(3, 6 * s));
        ctx.fill();
      }
    }
  }

  function drawPlayer() {
    const z = PLAYER_Z;
    const cx = projectX(player.worldX, z);
    const cy = projectY(z);
    const spr = currentSprite();
    const h = player.spriteH;
    const w = h * spr.aspect;
    const px = cx - w / 2;
    const py = cy - h * 0.85;

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 4, w * 0.45, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    if (mechReady & spr.bit) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(spr.img, px, py, w, h);
    } else {
      ctx.fillStyle = '#7aa6ff';
      roundRect(px, py, w, h, 8);
      ctx.fill();
    }
  }

  function drawSmoke() {
    for (const p of smoke) {
      const a = Math.max(0, p.life / p.max) * 0.85;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      grad.addColorStop(0, `rgba(245,248,255,${a})`);
      grad.addColorStop(0.6, `rgba(180,190,210,${a * 0.7})`);
      grad.addColorStop(1, `rgba(120,130,150,0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWeather() {
    const w = currentBiome.weather;
    if (w === 'none') return;
    if (w === 'rain') {
      ctx.strokeStyle = 'rgba(200,220,255,0.5)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const p of weather) {
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 2, p.y + p.len);
      }
      ctx.stroke();
    } else if (w === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const p of weather) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (w === 'motes') {
      for (const p of weather) {
        const tw = 0.5 + 0.5 * Math.sin(p.ph + elapsed * 2);
        ctx.fillStyle = `rgba(${currentBiome.moteColor},${(0.5 * tw + 0.15).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function drawBanner() {
    if (bannerTimer <= 0) return;
    const fadeIn = Math.min(1, (2.6 - bannerTimer) / 0.25);
    const fadeOut = Math.min(1, bannerTimer / 0.6);
    ctx.globalAlpha = Math.max(0, Math.min(1, Math.min(fadeIn, fadeOut)));
    ctx.font = '600 22px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillText(currentBiome.name, VW / 2 + 1, HORIZON_Y + 41);
    ctx.fillStyle = '#fff';
    ctx.fillText(currentBiome.name, VW / 2, HORIZON_Y + 40);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, VW, VH);

    // Camera bob/sway for a livelier feel (overscan so edges never show).
    const bob = Math.sin(elapsed * 6.5) * 3.6 + Math.sin(elapsed * 13) * 1.2;
    const sway = Math.sin(elapsed * 2.3) * 3 + Math.max(-8, Math.min(8, -player.vx * 4));
    ctx.save();
    ctx.translate(VW / 2 + sway - camX, VH / 2 + bob);
    ctx.scale(1.06, 1.06);
    ctx.translate(-VW / 2, -VH / 2);

    drawSky();
    drawGround();
    drawObstacles(true);
    if (running || particles.length === 0) drawPlayer();
    drawObstacles(false);
    drawSmoke();
    drawWeather();
    drawParticles();
    if (phase === 'portal') drawPortal();

    ctx.restore();
    drawBanner();
  }

  // Swirling portal + teleport flash during a biome transition.
  function drawPortal() {
    const open = Math.sin(Math.min(1, portalT) * Math.PI); // 0 → 1 → 0
    const cx = VW / 2, cy = projectY(0.55);
    const R = 130 * open;
    const sky = SKY[pendingBiomeKey] || SKY.savannah;

    // Outer glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.25 + 1);
    glow.addColorStop(0, `rgba(${sky.glow},0.85)`);
    glow.addColorStop(0.6, `rgba(${sky.glow},0.3)`);
    glow.addColorStop(1, `rgba(${sky.glow},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.25 + 1, 0, Math.PI * 2); ctx.fill();

    // Swirling rings
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = `rgba(${sky.glow},${(0.8 - k * 0.2).toFixed(2)})`;
      ctx.lineWidth = 5 - k;
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * (1 - k * 0.16), R * 0.72 * (1 - k * 0.16), portalT * 8 + k, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Bright core
    ctx.fillStyle = `rgba(255,255,255,${(0.55 * open).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.35, R * 0.25, 0, 0, Math.PI * 2); ctx.fill();

    // Teleport flash at the midpoint (where the biome swaps)
    const flash = Math.max(0, 1 - Math.abs(portalT - 0.5) * 5);
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash.toFixed(3)})`;
      ctx.fillRect(0, 0, VW, VH);
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (running) update(dt);
    updateParticles(dt);
    updateSmoke(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
