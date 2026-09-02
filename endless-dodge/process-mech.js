// Crops the left robot from the ChatGPT sheet, removes grey background, mirrors for left-facing.
// Run: npm i sharp && node process-mech.js
const sharp = require('sharp');
const path = require('path');

const SRC = path.join(__dirname, 'assets', 'ChatGPT Image Jun 3, 2026, 03_24_38 PM.png');
const RIGHT = path.join(__dirname, 'assets', 'mech-right.png');
const LEFT = path.join(__dirname, 'assets', 'mech-left.png');

(async () => {
  const img = sharp(SRC);
  const meta = await img.metadata();
  console.log(`source ${meta.width}x${meta.height}`);

  // Crop left half (one robot)
  const cropW = Math.floor(meta.width / 2);
  const cropped = await sharp(SRC)
    .extract({ left: 0, top: 0, width: cropW, height: meta.height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = cropped;
  const { width, height, channels } = info;

  // Sample background colors from corners (4 corners)
  const samples = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
    [10, 10], [width - 11, 10], [10, height - 11], [width - 11, height - 11],
  ];
  const bg = samples.map(([x, y]) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  });

  // Color distance threshold — anything close to background grey gets transparency
  const TOL = 38;        // hard transparent within this distance
  const SOFT = 60;       // soft falloff to this distance
  const out = Buffer.alloc(data.length);
  data.copy(out);

  function nearestBgDist(r, g, b) {
    let best = Infinity;
    for (const [br, bg2, bb] of bg) {
      const d = Math.sqrt((r - br) ** 2 + (g - bg2) ** 2 + (b - bb) ** 2);
      if (d < best) best = d;
    }
    return best;
  }

  // Flood fill alpha from edges so we only erase the contiguous background, not grey pixels INSIDE the robot
  const visited = new Uint8Array(width * height);
  const queue = [];
  for (let x = 0; x < width; x++) { queue.push(x, 0); queue.push(x, height - 1); }
  for (let y = 0; y < height; y++) { queue.push(0, y); queue.push(width - 1, y); }

  while (queue.length) {
    const y = queue.pop(), x = queue.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const idx = y * width + x;
    if (visited[idx]) continue;
    const off = idx * channels;
    const d = nearestBgDist(data[off], data[off + 1], data[off + 2]);
    if (d > SOFT) continue;
    visited[idx] = 1;
    // alpha falloff
    if (d < TOL) out[off + 3] = 0;
    else out[off + 3] = Math.round(255 * (d - TOL) / (SOFT - TOL));
    queue.push(x + 1, y); queue.push(x - 1, y); queue.push(x, y + 1); queue.push(x, y - 1);
  }

  // Auto-trim transparent border
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (out[(y * width + x) * channels + 3] > 8) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const pad = 8;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
  const tw = maxX - minX + 1, th = maxY - minY + 1;

  await sharp(out, { raw: { width, height, channels } })
    .extract({ left: minX, top: minY, width: tw, height: th })
    .png()
    .toFile(RIGHT);
  console.log(`wrote ${RIGHT} (${tw}x${th})`);

  await sharp(RIGHT).flop().toFile(LEFT);
  console.log(`wrote ${LEFT}`);
})();
