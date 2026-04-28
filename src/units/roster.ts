import { UnitTemplate } from "./types";

// ---- Player units ----
// startingSkills is just "idle" — class & character signature skills come from registry.

export const SODA: UnitTemplate = {
  id: "soda", name: "Soda", portrait: "💧",
  unitBaseStats: { STR: 5, DEF: 2, AGI: 15, DEX: 12, VIT: 3, INT: 3 },
  unitGrowth:    { STR: 1.0, DEF: 0.4, AGI: 3.0, DEX: 2.4, VIT: 0.6, INT: 0.6 },
  startingSkills: ["idle"],
};
export const EGO: UnitTemplate = {
  id: "ego", name: "Ego", portrait: "🪞",
  unitBaseStats: { STR: 18, DEF: 0, AGI: 2, DEX: 16, VIT: 2, INT: 2 },
  unitGrowth:    { STR: 3.6, DEF: 0.0, AGI: 0.4, DEX: 3.2, VIT: 0.4, INT: 0.4 },
  startingSkills: ["idle"],
};
export const GRUYERE: UnitTemplate = {
  id: "gruyere", name: "Gruyere", portrait: "🧀",
  unitBaseStats: { STR: 4, DEF: 6, AGI: 6, DEX: 10, VIT: 4, INT: 10 },
  unitGrowth:    { STR: 0.8, DEF: 1.2, AGI: 1.2, DEX: 2.0, VIT: 0.8, INT: 2.0 },
  startingSkills: ["idle"],
};
export const CALYPSO: UnitTemplate = {
  id: "calypso", name: "Calypso", portrait: "🌊",
  unitBaseStats: { STR: 2, DEF: 5, AGI: 3, DEX: 5, VIT: 10, INT: 15 },
  unitGrowth:    { STR: 0.4, DEF: 1.0, AGI: 0.6, DEX: 1.0, VIT: 2.0, INT: 3.0 },
  startingSkills: ["idle"],
};
export const CALICO: UnitTemplate = {
  id: "calico", name: "Calico", portrait: "🐈",
  unitBaseStats: { STR: 2, DEF: 2, AGI: 8, DEX: 20, VIT: 3, INT: 5 },
  unitGrowth:    { STR: 0.4, DEF: 0.4, AGI: 1.6, DEX: 4.0, VIT: 0.6, INT: 1.0 },
  startingSkills: ["idle"],
};
export const NOVA: UnitTemplate = {
  id: "nova", name: "Nova", portrait: "✨",
  unitBaseStats: { STR: 2, DEF: 4, AGI: 4, DEX: 4, VIT: 6, INT: 20 },
  unitGrowth:    { STR: 0.4, DEF: 0.8, AGI: 0.8, DEX: 0.8, VIT: 1.2, INT: 4.0 },
  startingSkills: ["idle"],
  basicAttackKind: "magical",
};
export const HERA: UnitTemplate = {
  id: "hera", name: "Hera", portrait: "👑",
  unitBaseStats: { STR: 1, DEF: 7, AGI: 1, DEX: 1, VIT: 10, INT: 20 },
  unitGrowth:    { STR: 0.2, DEF: 1.4, AGI: 0.2, DEX: 0.2, VIT: 2.0, INT: 4.0 },
  startingSkills: ["idle"],
  basicAttackKind: "magical",
};
export const ASPEN: UnitTemplate = {
  id: "aspen", name: "Aspen", portrait: "🏹",
  unitBaseStats: { STR: 15, DEF: 8, AGI: 5, DEX: 7, VIT: 5, INT: 0 },
  unitGrowth:    { STR: 3.0, DEF: 1.6, AGI: 1.0, DEX: 1.4, VIT: 1.0, INT: 0.0 },
  startingSkills: ["idle"],
};
export const OGE: UnitTemplate = {
  id: "oge", name: "Oge", portrait: "🪨",
  unitBaseStats: { STR: 5, DEF: 15, AGI: 2, DEX: 3, VIT: 15, INT: 0 },
  unitGrowth:    { STR: 1.0, DEF: 3.0, AGI: 0.4, DEX: 0.6, VIT: 3.0, INT: 0.0 },
  startingSkills: ["idle"],
};

export const PLAYER_ROSTER: UnitTemplate[] = [
  SODA, EGO, GRUYERE, CALYPSO, CALICO, NOVA, HERA, ASPEN, OGE,
];

export const MAX_PARTY_SIZE = 3;

// ---- Enemies ----
// Difficulty curve: stage 1 baseline → stage 10 final boss.

export const SLIME: UnitTemplate = {
  id: "slime", name: "Slime", portrait: "🟢",
  unitBaseStats: { STR: 4, DEF: 3, AGI: 4, DEX: 3, VIT: 4, INT: 0 },
  startingSkills: ["slime_goo"],
  level: 1,
  xpReward: 5,
};

export const SLIME_KING: UnitTemplate = {
  id: "slime_king", name: "Slime King", portrait: "👑🟢",
  unitBaseStats: { STR: 7, DEF: 6, AGI: 3, DEX: 5, VIT: 13, INT: 11 },
  startingSkills: ["slime_king_goo", "slime_barrage", "spawn_slimes"],
  overrideMaxHp: 75,
  overrideMaxMp: 25,
  level: 5,
  xpReward: 50,
};

export const WOLF: UnitTemplate = {
  id: "wolf", name: "Wolf", portrait: "🐺",
  unitBaseStats: { STR: 7, DEF: 3, AGI: 8, DEX: 6, VIT: 5, INT: 0 },
  startingSkills: ["basic_attack"],
  level: 2, xpReward: 9,
};

export const BANDIT: UnitTemplate = {
  id: "bandit", name: "Bandit", portrait: "🗡",
  unitBaseStats: { STR: 9, DEF: 5, AGI: 6, DEX: 7, VIT: 6, INT: 1 },
  startingSkills: ["basic_attack"],
  level: 3, xpReward: 14,
};

export const ACOLYTE: UnitTemplate = {
  id: "acolyte", name: "Acolyte", portrait: "🧙‍♂️",
  unitBaseStats: { STR: 2, DEF: 4, AGI: 4, DEX: 4, VIT: 5, INT: 11 },
  startingSkills: ["basic_attack"],
  basicAttackKind: "magical",
  level: 4, xpReward: 18,
};

export const SKELETON: UnitTemplate = {
  id: "skeleton", name: "Skeleton", portrait: "💀",
  unitBaseStats: { STR: 11, DEF: 6, AGI: 5, DEX: 6, VIT: 8, INT: 0 },
  startingSkills: ["basic_attack"],
  level: 5, xpReward: 22,
};

export const WRAITH: UnitTemplate = {
  id: "wraith", name: "Wraith", portrait: "👻",
  unitBaseStats: { STR: 4, DEF: 5, AGI: 9, DEX: 8, VIT: 7, INT: 14 },
  startingSkills: ["basic_attack"],
  basicAttackKind: "magical",
  level: 6, xpReward: 28,
};

export const SKELETON_KNIGHT: UnitTemplate = {
  id: "skeleton_knight", name: "Skeleton Knight", portrait: "🛡",
  unitBaseStats: { STR: 14, DEF: 12, AGI: 5, DEX: 7, VIT: 12, INT: 0 },
  startingSkills: ["basic_attack"],
  level: 7, xpReward: 36,
};

export const ELITE_WRAITH: UnitTemplate = {
  id: "elite_wraith", name: "Elite Wraith", portrait: "🌀",
  unitBaseStats: { STR: 6, DEF: 8, AGI: 11, DEX: 10, VIT: 11, INT: 18 },
  startingSkills: ["basic_attack"],
  basicAttackKind: "magical",
  level: 8, xpReward: 45,
};

// ---- Solo bosses (3 / 6 / 10) — significantly harder ----

export const STONE_SENTINEL: UnitTemplate = {
  id: "stone_sentinel", name: "Stone Sentinel", portrait: "🗿",
  unitBaseStats: { STR: 14, DEF: 18, AGI: 4, DEX: 6, VIT: 24, INT: 4 },
  startingSkills: ["basic_attack", "earthshaker"],
  overrideMaxHp: 220,
  overrideMaxMp: 50,
  level: 8,
  xpReward: 120,
};

export const WRAITH_LORD: UnitTemplate = {
  id: "wraith_lord", name: "Wraith Lord", portrait: "☠",
  unitBaseStats: { STR: 9, DEF: 14, AGI: 14, DEX: 14, VIT: 22, INT: 26 },
  startingSkills: ["basic_attack", "tidal_wave", "celestial_beam"],
  basicAttackKind: "magical",
  overrideMaxHp: 360,
  overrideMaxMp: 120,
  level: 12,
  xpReward: 260,
};

export const TOWER_LORD: UnitTemplate = {
  id: "tower_lord", name: "Tower Lord", portrait: "🐉",
  unitBaseStats: { STR: 24, DEF: 22, AGI: 16, DEX: 18, VIT: 32, INT: 26 },
  startingSkills: ["basic_attack", "colossal_slam", "inferno_crash", "celestial_beam"],
  overrideMaxHp: 620,
  overrideMaxMp: 200,
  level: 16,
  xpReward: 600,
};

// ---- Stages ----

export const STAGE_1_ENEMIES: UnitTemplate[] = [SLIME, SLIME, SLIME, SLIME_KING];

export interface StageEnemyDef {
  id: number;
  name: string;
  enemies: UnitTemplate[];
  /** When true, stage is boss-only (a single enemy). */
  soloBoss?: boolean;
}

export const STAGE_DEFS: StageEnemyDef[] = [
  { id: 1, name: "Slime Den", enemies: STAGE_1_ENEMIES },
  { id: 2, name: "Wolf Pack", enemies: [WOLF, WOLF, WOLF, WOLF, WOLF] },
  { id: 3, name: "Stone Sentinel", enemies: [STONE_SENTINEL], soloBoss: true },
  { id: 4, name: "Bandit Camp", enemies: [BANDIT, BANDIT, BANDIT, BANDIT, ACOLYTE] },
  { id: 5, name: "Cursed Crypt", enemies: [SKELETON, SKELETON, SKELETON, WRAITH, WRAITH] },
  { id: 6, name: "Wraith Lord", enemies: [WRAITH_LORD], soloBoss: true },
  { id: 7, name: "Howling Hollow", enemies: [WOLF, WOLF, WOLF, WOLF, ACOLYTE, ACOLYTE] },
  { id: 8, name: "Bone Cathedral", enemies: [SKELETON_KNIGHT, SKELETON_KNIGHT, WRAITH, WRAITH, WRAITH] },
  { id: 9, name: "Throne Approach", enemies: [SKELETON_KNIGHT, ELITE_WRAITH, ELITE_WRAITH, ACOLYTE, BANDIT, WRAITH] },
  { id: 10, name: "Tower Lord", enemies: [TOWER_LORD], soloBoss: true },
];

export function getStage(id: number): StageEnemyDef | null {
  return STAGE_DEFS.find(s => s.id === id) ?? null;
}
