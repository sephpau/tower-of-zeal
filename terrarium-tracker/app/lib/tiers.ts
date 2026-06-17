// Land-tier reference data for Terrariums.
// Pool / per-tick values come from the official Land Utility Breakdown.
// `totalAtiasFlame` is the reward-formula denominator — unknown until the
// Terrariums API goes live (June 17). We render a placeholder until then.

export type Tier = {
  key: string;
  name: string;
  accent: string; // tile color from the land-utility chart
  img: string; // land-tile artwork (plot_<land_type>.png from homeland)
  bAxsPoolMonth: number; // bAXS reward pool / month
  bAxsPerTick: number; // bAXS distribution / tick (1 tick = 1 hour)
  // Live reward-formula denominator. null until the Terrariums API is wired;
  // populated automatically at launch — never user-editable.
  totalAtiasFlame: number | null;
};

// Order matches the wireframe: paid tiers only (FREE has a 0 pool, excluded).
// img maps each tier to its homeland land_type tile:
//   Savannah=0, Forest=1, Arctic=2, Mystic=3, Genesis=4, Luna's Landing=8
export const TIERS: Tier[] = [
  { key: "lunas-landing", name: "Luna's Landing", accent: "#ff5a4d", img: "/motz/lands/plot_8.png", bAxsPoolMonth: 9400, bAxsPerTick: 13.06, totalAtiasFlame: null },
  { key: "genesis", name: "Genesis", accent: "#3b82f6", img: "/motz/lands/plot_4.png", bAxsPoolMonth: 28200, bAxsPerTick: 39.17, totalAtiasFlame: null },
  { key: "mystic", name: "Mystic", accent: "#a855f7", img: "/motz/lands/plot_3.png", bAxsPoolMonth: 44800, bAxsPerTick: 62.22, totalAtiasFlame: null },
  { key: "arctic", name: "Arctic", accent: "#7dd3fc", img: "/motz/lands/plot_2.png", bAxsPoolMonth: 36300, bAxsPerTick: 50.42, totalAtiasFlame: null },
  { key: "forest", name: "Forest", accent: "#4ade80", img: "/motz/lands/plot_1.png", bAxsPoolMonth: 16200, bAxsPerTick: 22.5, totalAtiasFlame: null },
  { key: "savannah", name: "Savannah", accent: "#fb923c", img: "/motz/lands/plot_0.png", bAxsPoolMonth: 5100, bAxsPerTick: 7.08, totalAtiasFlame: null },
];
