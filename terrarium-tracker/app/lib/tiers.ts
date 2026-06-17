// Land-tier reference data for Terrariums.
// Pool / per-tick values come from the official Land Utility Breakdown.
// `totalAtiasFlame` is the reward-formula denominator — unknown until the
// Terrariums API goes live (June 17). We render a placeholder until then.

export type Tier = {
  key: string;
  name: string;
  landType: string; // value the leaderboard API expects in its land_type query
  terrariumType: string; // land_type the /terrariums endpoint returns (differs!)
  accent: string; // tile color from the land-utility chart
  img: string; // land-tile artwork (plot_<land_type>.png from homeland)
  bAxsPoolMonth: number; // bAXS reward pool / month
  bAxsPerTick: number; // bAXS distribution / tick (1 tick = 1 hour)
  // Static fallback for the live reward-formula denominator. Live values come
  // from /api/tier-flame (Terrarium leaderboard) and override this at runtime.
  totalAtiasFlame: number | null;
  // Some tiers (Luna's Landing) aren't enumerable via the leaderboard, so we
  // seed the known owner wallets to still compute deployed flame.
  knownWallets?: string[];
};

// Luna's Landing land owners (the leaderboard exposes no participant list).
const LUNAS_LANDING_OWNERS = [
  "0xd7eeac340b9c807fe246e68dcb3ff6da5bf653a2",
  "0xe9da95b4745456334e14d2e9cafc7fe3950fcea2",
  "0x9078f0767e3c297d98764fb89454ae45a9787857",
  "0x7c407edb4448f3b81e3ec5cc5c7b5c40fe374c1e",
  "0x2caa0a493605fa1d81ca3087c9f57bf2e441f1ea",
  "0xb0b07a0e021788b70d04035648f13964d3e9f970",
  "0x3d9dcc26562843aa186efbabf8003373ca84a3c0",
  "0x2f5cc8bf1b9d5e2928beee5e350d79f107439820",
  "0xfd2fd5409c742a22d746cfaec7b4012a8ae49299",
];

// Order matches the wireframe: paid tiers only (FREE has a 0 pool, excluded).
// NOTE: Luna's Landing uses 3 different strings across the API — leaderboard
// query "LunasLanding", terrariums endpoint "LunaLanding", display "Luna's Landing".
export const TIERS: Tier[] = [
  { key: "lunas-landing", name: "Luna's Landing", landType: "LunasLanding", terrariumType: "LunaLanding", accent: "#ff5a4d", img: "/motz/lands/plot_8.png", bAxsPoolMonth: 9400, bAxsPerTick: 13.06, totalAtiasFlame: null, knownWallets: LUNAS_LANDING_OWNERS },
  { key: "genesis", name: "Genesis", landType: "Genesis", terrariumType: "Genesis", accent: "#3b82f6", img: "/motz/lands/plot_4.png", bAxsPoolMonth: 28200, bAxsPerTick: 39.17, totalAtiasFlame: null },
  { key: "mystic", name: "Mystic", landType: "Mystic", terrariumType: "Mystic", accent: "#a855f7", img: "/motz/lands/plot_3.png", bAxsPoolMonth: 44800, bAxsPerTick: 62.22, totalAtiasFlame: null },
  { key: "arctic", name: "Arctic", landType: "Arctic", terrariumType: "Arctic", accent: "#7dd3fc", img: "/motz/lands/plot_2.png", bAxsPoolMonth: 36300, bAxsPerTick: 50.42, totalAtiasFlame: null },
  { key: "forest", name: "Forest", landType: "Forest", terrariumType: "Forest", accent: "#4ade80", img: "/motz/lands/plot_1.png", bAxsPoolMonth: 16200, bAxsPerTick: 22.5, totalAtiasFlame: null },
  { key: "savannah", name: "Savannah", landType: "Savannah", terrariumType: "Savannah", accent: "#fb923c", img: "/motz/lands/plot_0.png", bAxsPoolMonth: 5100, bAxsPerTick: 7.08, totalAtiasFlame: null },
];
