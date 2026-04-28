import { Stats, STAT_KEYS, sumStats, ZERO_STATS } from "../core/stats";

// Six-axis radar chart, three stacked layers.
// Axis layout (per design — 4th reference image):
//   STR top, DEF upper-right, VIT lower-right, INT bottom, DEX lower-left, AGI upper-left.
// STAT_KEYS order is [STR, DEF, AGI, DEX, VIT, INT] — we map each key to a fixed angle slot.

export interface HexInputs {
  unit: Stats;
  classBase?: Stats;
  custom?: Stats;
  size?: number;
  axisMax?: number;
}

// Distinguishable, high-contrast colors for the three layers.
const UNIT_COLOR = "#22d3ee";   // cyan — unit base
const CLASS_COLOR = "#e879f9";  // magenta — class base
const CUSTOM_COLOR = "#facc15"; // gold — custom (allocated)

// Angle slots, clockwise from top (top = -π/2).
const SLOT_ANGLES = [0, 1, 2, 3, 4, 5].map(i => -Math.PI / 2 + (i * Math.PI) / 3);

// Map STAT_KEYS index → slot index. Slots: 0 top, 1 UR, 2 LR, 3 bottom, 4 LL, 5 UL.
const SLOT_FOR_KEY: Record<string, number> = {
  STR: 0, // top
  DEF: 1, // upper-right
  VIT: 2, // lower-right
  INT: 3, // bottom
  DEX: 4, // lower-left
  AGI: 5, // upper-left
};

export function hexStatSvg(inp: HexInputs): string {
  const size = inp.size ?? 200;
  const cls = inp.classBase ?? ZERO_STATS;
  const cust = inp.custom ?? ZERO_STATS;
  const summed = sumStats(inp.unit, cls, cust);
  const summedMax = STAT_KEYS.reduce((m, k) => Math.max(m, summed[k]), 0);
  const axisMax = inp.axisMax ?? Math.max(20, Math.ceil((summedMax * 1.15) / 5) * 5);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.36;

  const ringPolys: string[] = [];
  for (const frac of [0.25, 0.5, 0.75, 1.0]) {
    const pts = SLOT_ANGLES.map(a => {
      const x = cx + Math.cos(a) * radius * frac;
      const y = cy + Math.sin(a) * radius * frac;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    ringPolys.push(`<polygon points="${pts}" fill="none" stroke="#2a3170" stroke-width="1" />`);
  }

  const axisLines = SLOT_ANGLES.map(a => {
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#2a3170" stroke-width="1" />`;
  }).join("");

  const polyFor = (s: Stats, color: string, fillOpacity: number) => {
    const pts = STAT_KEYS.map(k => {
      const slot = SLOT_FOR_KEY[k];
      const a = SLOT_ANGLES[slot];
      const v = Math.max(0, s[k]);
      const r = (Math.min(v, axisMax) / axisMax) * radius;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      return { slot, pt: `${x.toFixed(1)},${y.toFixed(1)}` };
    }).sort((a, b) => a.slot - b.slot).map(o => o.pt).join(" ");
    return `<polygon points="${pts}" fill="${color}" fill-opacity="${fillOpacity}" stroke="${color}" stroke-width="1.5" stroke-opacity="0.95" />`;
  };

  const customPoly = polyFor(summed, CUSTOM_COLOR, 0.30);
  const classPoly = polyFor(sumStats(inp.unit, cls), CLASS_COLOR, 0.40);
  const unitPoly = polyFor(inp.unit, UNIT_COLOR, 0.55);

  const labels = STAT_KEYS.map(k => {
    const slot = SLOT_FOR_KEY[k];
    const a = SLOT_ANGLES[slot];
    const lx = cx + Math.cos(a) * (radius + 14);
    const ly = cy + Math.sin(a) * (radius + 14) + 4;
    return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="11" fill="#d6d2ff" font-weight="700">${k}</text>`;
  }).join("");

  const ticks = STAT_KEYS.map(k => {
    const slot = SLOT_FOR_KEY[k];
    const a = SLOT_ANGLES[slot];
    const v = summed[k];
    const tx = cx + Math.cos(a) * (radius + 30);
    const ty = cy + Math.sin(a) * (radius + 30) + 4;
    return `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" font-size="9" fill="#8b89b3">${v.toFixed(0)}</text>`;
  }).join("");

  return `
    <svg class="hex-stat" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      ${ringPolys.join("")}
      ${axisLines}
      ${customPoly}
      ${classPoly}
      ${unitPoly}
      ${labels}
      ${ticks}
    </svg>
  `;
}

export function hexLegendHtml(): string {
  return `
    <div class="hex-legend">
      <span class="hex-legend-item"><span class="hex-swatch" style="background:${UNIT_COLOR}"></span>Unit base</span>
      <span class="hex-legend-item"><span class="hex-swatch" style="background:${CLASS_COLOR}"></span>Class base</span>
      <span class="hex-legend-item"><span class="hex-swatch" style="background:${CUSTOM_COLOR}"></span>Custom</span>
    </div>
  `;
}
