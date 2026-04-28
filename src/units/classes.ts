import { Stats, ZERO_STATS } from "../core/stats";

export interface ClassDef {
  id: string;
  name: string;
  role: string;        // e.g. "Physical Melee"
  baseStats: Stats;    // bonus stats granted at level 1 of the class
  growth: Stats;       // per-level stat growth
}

export const CLASSES: ClassDef[] = [
  {
    id: "fighter",
    name: "Fighter",
    role: "Physical Melee",
    baseStats: { STR: 8, DEF: 4, AGI: 2, DEX: 4, VIT: 2, INT: 0 },
    growth:    { STR: 1.0, DEF: 0.5, AGI: 0.3, DEX: 0.5, VIT: 0.3, INT: 0.0 },
  },
  {
    id: "fire_mage",
    name: "Fire Mage",
    role: "Mage Melee",
    baseStats: { STR: 4, DEF: 2, AGI: 4, DEX: 0, VIT: 2, INT: 8 },
    growth:    { STR: 0.5, DEF: 0.3, AGI: 0.5, DEX: 0.0, VIT: 0.3, INT: 1.0 },
  },
  {
    id: "sharpshooter",
    name: "Sharpshooter",
    role: "Physical Range",
    baseStats: { STR: 2, DEF: 2, AGI: 4, DEX: 10, VIT: 2, INT: 0 },
    growth:    { STR: 0.3, DEF: 0.3, AGI: 0.5, DEX: 1.3, VIT: 0.3, INT: 0.0 },
  },
  {
    id: "water_mage",
    name: "Water Mage",
    role: "Mage Range",
    baseStats: { STR: 0, DEF: 2, AGI: 2, DEX: 4, VIT: 2, INT: 10 },
    growth:    { STR: 0.0, DEF: 0.3, AGI: 0.3, DEX: 0.5, VIT: 0.3, INT: 1.3 },
  },
  {
    id: "scout",
    name: "Scout",
    role: "Dodge Melee",
    baseStats: { STR: 4, DEF: 0, AGI: 8, DEX: 6, VIT: 2, INT: 0 },
    growth:    { STR: 0.5, DEF: 0.0, AGI: 1.0, DEX: 0.8, VIT: 0.3, INT: 0.0 },
  },
  {
    id: "defender",
    name: "Defender",
    role: "Tank Melee",
    baseStats: { STR: 6, DEF: 6, AGI: 0, DEX: 2, VIT: 6, INT: 0 },
    growth:    { STR: 0.8, DEF: 0.8, AGI: 0.0, DEX: 0.3, VIT: 0.8, INT: 0.0 },
  },
  {
    id: "warden",
    name: "Warden",
    role: "Tank Range",
    baseStats: { STR: 2, DEF: 6, AGI: 0, DEX: 6, VIT: 6, INT: 0 },
    growth:    { STR: 0.3, DEF: 0.8, AGI: 0.0, DEX: 0.8, VIT: 0.8, INT: 0.0 },
  },
];

export function getClass(id: string): ClassDef | null {
  return CLASSES.find(c => c.id === id) ?? null;
}

export function classBaseStats(id: string | undefined): Stats {
  if (!id) return { ...ZERO_STATS };
  const cls = getClass(id);
  return cls ? { ...cls.baseStats } : { ...ZERO_STATS };
}
