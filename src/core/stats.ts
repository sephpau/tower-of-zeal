// Six core stats. The sheet defines a per-stat contribution to each derived value:
//
//             phys atk  mag atk  speed  evade  accuracy  crit  phys def  mag def  HP   MP
//   STR        3                                                  1         1     3
//   DEF                                                           3         2     5
//   AGI        1                  1      1
//   DEX        1        1                       3         2
//   VIT                                                           1         1     10
//   INT                 3                       1                           2          10
//
// Derived stats below sum those contributions. Combat uses these effective values directly.

export type StatKey = "STR" | "DEF" | "AGI" | "DEX" | "VIT" | "INT";

export type Stats = Record<StatKey, number>;

export const ZERO_STATS: Stats = { STR: 0, DEF: 0, AGI: 0, DEX: 0, VIT: 0, INT: 0 };
export const STAT_KEYS: StatKey[] = ["STR", "DEF", "AGI", "DEX", "VIT", "INT"];

export function addStats(a: Stats, b: Stats): Stats {
  return {
    STR: a.STR + b.STR,
    DEF: a.DEF + b.DEF,
    AGI: a.AGI + b.AGI,
    DEX: a.DEX + b.DEX,
    VIT: a.VIT + b.VIT,
    INT: a.INT + b.INT,
  };
}

export function sumStats(...all: Stats[]): Stats {
  return all.reduce((acc, s) => addStats(acc, s), { ...ZERO_STATS });
}

export interface DerivedStats {
  maxHp: number;
  maxMp: number;
  physAtk: number;
  magAtk: number;
  physDef: number;
  magDef: number;
  speed: number;          // raw speed value from the sheet (AGI*1)
  accuracy: number;       // DEX*3 + INT*1
  critPoints: number;     // DEX*2 (interpreted as percentage points)
  evadePoints: number;    // AGI*1 (interpreted as percentage points)
  hitChance: number;      // 0..1, derived from accuracy
  critChance: number;     // 0..1
  evadeChance: number;    // 0..1
  atbSpeed: number;       // gauge units / sec (combat tick uses this)
}

export const BASE_HP = 30;
export const BASE_MP = 20;

export function deriveStats(s: Stats): DerivedStats {
  const maxHp = BASE_HP + s.STR * 3 + s.DEF * 5 + s.VIT * 10;
  const maxMp = BASE_MP + s.INT * 10;
  const physAtk = s.STR * 3 + s.AGI + s.DEX;
  const magAtk = s.DEX + s.INT * 3;
  const physDef = s.STR + s.DEF * 3 + s.VIT;
  const magDef = s.STR + s.DEF * 2 + s.VIT + s.INT * 2;
  const speed = s.AGI;
  const accuracy = s.DEX * 3 + s.INT;
  const critPoints = s.DEX * 2;
  const evadePoints = s.AGI;
  return {
    maxHp,
    maxMp,
    physAtk,
    magAtk,
    physDef,
    magDef,
    speed,
    accuracy,
    critPoints,
    evadePoints,
    // 1 percentage point per accuracy/crit/evade unit, capped sensibly.
    hitChance: clamp(0.7 + accuracy * 0.005, 0.1, 1.0),
    critChance: clamp(critPoints * 0.01, 0, 0.95),
    evadeChance: clamp(evadePoints * 0.01, 0, 0.95),
    // ATB pacing: keep the same ballpark (~0.2..1.0/sec) the prior formula gave.
    atbSpeed: 0.2 + speed * 0.05,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
