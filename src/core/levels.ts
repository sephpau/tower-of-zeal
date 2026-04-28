// XP needed to advance from level N to level N+1.
// XP_TABLE[0] = 1→2, XP_TABLE[N-1] = N → N+1. Cap at level MAX_LEVEL.
export const XP_TABLE = [
  16,    // 1 → 2
  31,    // 2 → 3
  54,    // 3 → 4
  85,    // 4 → 5
  128,   // 5 → 6
  182,   // 6 → 7
  250,   // 7 → 8
  332,   // 8 → 9
  432,   // 9 → 10
  549,   // 10 → 11
  686,   // 11 → 12
  843,   // 12 → 13
  1024,  // 13 → 14
  1228,  // 14 → 15
  1458,  // 15 → 16
  1714,  // 16 → 17
  2000,  // 17 → 18
  2315,  // 18 → 19
  2662,  // 19 → 20
  3041,  // 20 → 21
  3456,  // 21 → 22
  3906,  // 22 → 23
  4394,  // 23 → 24
  4920,  // 24 → 25
  5488,  // 25 → 26
  6097,  // 26 → 27
  6750,  // 27 → 28
  7447,  // 28 → 29
  8192,  // 29 → 30
];
export const MAX_LEVEL = 30;

export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return Infinity;
  return XP_TABLE[level - 1];
}

// Apply XP and resolve level-ups in-place. Returns the number of levels gained.
export function awardXp(unit: { level: number; xp: number }, amount: number): number {
  if (unit.level >= MAX_LEVEL) return 0;
  unit.xp += amount;
  let gained = 0;
  while (unit.level < MAX_LEVEL && unit.xp >= xpToNext(unit.level)) {
    unit.xp -= xpToNext(unit.level);
    unit.level += 1;
    gained += 1;
  }
  if (unit.level >= MAX_LEVEL) unit.xp = 0;
  return gained;
}
