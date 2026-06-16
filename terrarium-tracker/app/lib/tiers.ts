// Land-tier reference data for Terrariums.
// Pool / per-tick values come from the official Land Utility Breakdown.
// `totalAtiasFlame` is the reward-formula denominator — unknown until the
// Terrariums API goes live (June 17). We render a placeholder until then.

export type Tier = {
  key: string;
  name: string;
  accent: string; // tile color from the land-utility chart
  bAxsPoolMonth: number; // bAXS reward pool / month
  bAxsPerTick: number; // bAXS distribution / tick
};

// Order matches the wireframe: paid tiers only (FREE has a 0 pool, excluded).
export const TIERS: Tier[] = [
  { key: "lunas-landing", name: "Luna's Landing", accent: "#ff5a4d", bAxsPoolMonth: 9400, bAxsPerTick: 13.06 },
  { key: "genesis", name: "Genesis", accent: "#3b82f6", bAxsPoolMonth: 28200, bAxsPerTick: 39.17 },
  { key: "mystic", name: "Mystic", accent: "#a855f7", bAxsPoolMonth: 44800, bAxsPerTick: 62.22 },
  { key: "arctic", name: "Arctic", accent: "#7dd3fc", bAxsPoolMonth: 36300, bAxsPerTick: 50.42 },
  { key: "forest", name: "Forest", accent: "#4ade80", bAxsPoolMonth: 16200, bAxsPerTick: 22.5 },
  { key: "savannah", name: "Savannah", accent: "#fb923c", bAxsPoolMonth: 5100, bAxsPerTick: 7.08 },
];
