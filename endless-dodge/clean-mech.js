// Removes light/white background fringe from mech-right.png and writes mech-left.png mirror.
const sharp = require('sharp');
const path = require('path');

const SRC = path.join(__dirname, 'assets', 'mech right.png');
const RIGHT = path.join(__dirname, 'assets', 'mech right.png');
const LEFT = path.join(__dirname, 'assets', 'mech left.png');

(async () => {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.from(data);

  // Flood-fill from edges. Erase anything lighter than threshold (covers white + light grey fringe).
  // Tunable: brightness cutoff and saturation tolerance
  const BRIGHT_HARD = 215;   // pixels brighter than this on the boundary chain → fully transparent
  const BRIGHT_SOFT = 175;   // soft falloff to here
  const SAT_MAX = 35;        // max color saturation to be considered "background" (grey/white)

  const visited = new Uint8Array(width * height);
  const queue = [];
  for (let x = 0; x < width; x++) { queue.push(x, 0); queue.push(x, height - 1); }
  for (let y = 0; y < height; y++) { queue.push(0, y); queue.push(width - 1, y); }

  while (queue.length) {
    const y = queue.pop(), x = queue.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const idx = y * width + x;
    if (visited[idx]) continue;
    const o = idx * channels;
    const r = data[o], g = data[o + 1], b = data[o + 2], a = data[o + 3];
    if (a === 0) { visited[idx] = 1; queue.push(x+1,y,x-1,y,x,y+1,x,y-1); continue; }
    const brightness = Math.max(r, g, b);
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (brightness < BRIGHT_SOFT || sat > SAT_MAX) continue; // hit the robot — stop
    visited[idx] = 1;
    if (brightness >= BRIGHT_HARD) out[o + 3] = 0;
    else {
      // soft alpha: bright = transparent, darker = keep more
      const t = (brightness - BRIGHT_SOFT) / (BRIGHT_HARD - BRIGHT_SOFT);
      out[o + 3] = Math.round(a * (1 - t));
    }
    queue.push(x+1, y, x-1, y, x, y+1, x, y-1);
  }

  // Auto-trim
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (out[(y * width + x) * channels + 3] > 8) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const pad = 4;
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
