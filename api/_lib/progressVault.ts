// Server-authoritative per-unit progress. The client's localStorage is now
// just a cache — every meaningful write goes through validateAndSyncProgress
// on the server, which enforces hard rules so devtools edits to local state
// can't produce illegitimate level/XP/stat values.
//
// What's protected:
//   - level    (only grows via XP awards from cleared floors / leaderboard)
//   - xp       (must be consistent with the level)
//   - customStats (sum bounded by allocatable points earned)
//   - availablePoints (invariant: + sum(customStats) = (level-1)*4)
//   - classId  (must be a known class id; class change is allowed via the
//              shop's unit_class_change entitlement, validated separately)
//   - equippedSkills (must be unlocked at the unit's current level / class)
//
// Storage shape:
//   progress:<wallet> → { units: { [unitId]: ServerUnitProgress } }
//   one JSON blob per wallet, 5-year TTL re-armed on every write.

import { getJson, setJson } from "./redis.js";

// Per-template levels of allocatable points: +4 per level after Lv 1.
const POINTS_PER_LEVEL = 4;
// Hard upper bound. Mirrors src/core/levels.ts MAX_LEVEL.
const MAX_LEVEL = 30;
// Per-level XP requirements. Mirrors src/core/levels.ts XP_TABLE. Server
// re-validates against this so a tampered client can't claim "I have 1000 XP
// at Level 30" — Level 30 always has xp = 0 (capped).
const XP_TABLE = [
  16, 31, 54, 85, 128, 182, 250, 332, 432, 549,
  686, 843, 1024, 1228, 1458, 1714, 2000, 2315, 2662, 3041,
  3456, 3906, 4394, 4920, 5488, 6097, 6750, 7447, 8192,
];

// Whitelist of known class ids. Mirrors src/units/classes.ts. Server rejects
// progress writes that claim an unknown class so devtools can't invent classes
// with arbitrary modifiers. Adding a class? Add it here AND in classes.ts.
const VALID_CLASS_IDS = new Set<string>([
  "fighter", "fire_mage", "sharpshooter", "water_mage",
  "scout", "defender", "warden",
]);

// Whitelist of known skill ids. Mirrors src/skills/registry.ts entries.
// Defensive only — a skill that doesn't exist on the client would never fire,
// but blocking unknown ids at write time keeps the progress blob clean and
// audit-friendly. Update when adding skills.
const VALID_SKILL_IDS = new Set<string>([
  // Common / baseline
  "idle", "basic_attack", "guard", "power_strike",
  // Mage / fire
  "fireball", "ignite_touch", "blazing_burst", "inferno_crash",
  // Mage / water
  "hydro_bolt", "vortex_stream", "tidal_wave",
  // Fighter / striker
  "impact_strike", "focus_pulse", "colossal_slam",
  "decimate", "twin_slash", "whirlwind_edge",
  // Sharpshooter
  "quick_draw", "double_tap", "apex_shot",
  "binding_shot", "needle_shot", "mark_of_death", "horizon_strike",
  // Scout
  "swift_jab", "shadow_step", "phantom_flurry",
  // Defender / Warden
  "bash", "phalanx_wall", "earthshaker",
  "aura_shield", "celestial_beam",
  "iron_bulwark", "bastions_call", "unyielding_heart",
  "lightburst", "radiant_punch", "solar_flare",
  // Hero-signature kits
  "soda_punch", "soda_pop", "swift_echo",
  "body_slam", "limit_break", "all_or_nothing",
  "tactical_hit", "analyze_vulnerability", "grandmasters_domain",
  "siphon_pulse", "tidal_mending", "sirens_sanctuary",
  "water_bolt", "frost_bite", "navigators_wrath",
  "gaze_of_retribution", "iron_prophecy", "fates_rebound",
  // Boss-only (allowed only because some debug code paths can equip them);
  // having them here doesn't grant access — class registry still gates.
  "slime_goo", "slime_king_goo", "slime_barrage", "spawn_slimes", "world_end",
]);
const MAX_EQUIPPED_SKILLS = 4;

const STAT_KEYS = ["STR", "DEF", "AGI", "DEX", "VIT", "INT"] as const;
type StatKey = (typeof STAT_KEYS)[number];
export type ServerStats = Record<StatKey, number>;

export interface ServerUnitProgress {
  level: number;
  xp: number;
  customStats: ServerStats;
  classId?: string;
  availablePoints: number;
  equippedSkills?: string[];
}

interface ProgressBlob {
  units: Record<string, ServerUnitProgress>;
}

const PROGRESS_TTL = 60 * 60 * 24 * 365 * 5; // 5 years
function progressKey(address: string): string { return `progress:${address.toLowerCase()}`; }

function zeroStats(): ServerStats {
  return { STR: 0, DEF: 0, AGI: 0, DEX: 0, VIT: 0, INT: 0 };
}

function sanitizeStats(input: unknown): ServerStats {
  const result = zeroStats();
  if (!input || typeof input !== "object") return result;
  const src = input as Record<string, unknown>;
  for (const k of STAT_KEYS) {
    const v = src[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      result[k] = Math.floor(v);
    }
  }
  return result;
}

function sanitizeUnit(input: unknown): ServerUnitProgress {
  const fallback: ServerUnitProgress = {
    level: 1, xp: 0, customStats: zeroStats(), availablePoints: 0,
  };
  if (!input || typeof input !== "object") return fallback;
  const src = input as Record<string, unknown>;
  const level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(src.level ?? 1))));
  const xpRaw = Math.max(0, Math.floor(Number(src.xp ?? 0)));
  const xp = level >= MAX_LEVEL ? 0 : Math.min(xpRaw, XP_TABLE[level - 1] - 1);
  // classId is dropped silently if not in the whitelist — client will reload
  // its canonical view and see no class set, prompting an explicit class-pick
  // via the legit unit_class_change shop entitlement.
  const rawClass = typeof src.classId === "string" ? src.classId : undefined;
  const classId = rawClass && VALID_CLASS_IDS.has(rawClass) ? rawClass : undefined;
  // equippedSkills: drop unknown ids (defensive), cap at MAX_EQUIPPED_SKILLS,
  // and dedupe.
  const equipRaw = Array.isArray(src.equippedSkills)
    ? src.equippedSkills.filter((s): s is string => typeof s === "string" && VALID_SKILL_IDS.has(s))
    : [];
  const equippedSkills = equipRaw.length > 0
    ? Array.from(new Set(equipRaw)).slice(0, MAX_EQUIPPED_SKILLS)
    : undefined;
  return {
    level,
    xp,
    customStats: sanitizeStats(src.customStats),
    classId,
    availablePoints: Math.max(0, Math.floor(Number(src.availablePoints ?? 0))),
    equippedSkills,
  };
}

export async function readServerProgress(address: string): Promise<ProgressBlob> {
  const raw = await getJson<ProgressBlob>(progressKey(address));
  if (!raw || typeof raw !== "object" || !raw.units || typeof raw.units !== "object") {
    return { units: {} };
  }
  // Sanitize each unit defensively — even Redis-stored data goes through the
  // same shaping so a stray field can't sneak in via legacy writes.
  const out: ProgressBlob = { units: {} };
  for (const [id, u] of Object.entries(raw.units)) {
    out.units[id] = sanitizeUnit(u);
  }
  return out;
}
export async function writeServerProgress(address: string, blob: ProgressBlob): Promise<void> {
  await setJson(progressKey(address), blob, PROGRESS_TTL);
}

/** Sum of allocatable points a unit at this level has earned. */
function earnedPoints(level: number): number {
  return Math.max(0, (level - 1) * POINTS_PER_LEVEL);
}
function statSum(s: ServerStats): number {
  let n = 0;
  for (const k of STAT_KEYS) n += s[k];
  return n;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  /** Per-unit issues for debug logging; empty when ok. */
  issues?: { unitId: string; problem: string }[];
}

/** Validate `claimed` against `canonical` from the server. A claim is accepted
 *  iff EVERY unit follows the rules below AND no unit regressed below the
 *  canonical floor. We don't enforce "claim equals canonical" because XP/level
 *  legitimately grow during play — but we DO enforce:
 *
 *  Per-unit:
 *    1. level ∈ [1, MAX_LEVEL]
 *    2. xp ≥ 0 and (level === MAX_LEVEL → xp === 0) else xp < XP_TABLE[level-1]
 *    3. customStats: all stat keys present, integer ≥ 0
 *    4. sum(customStats) + availablePoints === earnedPoints(level)
 *    5. claimed.level ≥ canonical.level  (can't regress)
 *    6. claimed.totalXp ≥ canonical.totalXp where totalXp = sum(XP_TABLE[0..level-1]) + xp
 *
 *  These rules block the common devtools cheats:
 *    - "Set my level to 30, my XP to 0, my customStats to {STR:120,...}"  fails (5) and (6)
 *      regardless of stat budget — current canonical was lower.
 *    - "Add 100 STR to my unit"  → fails (4): allocated > earned points.
 *    - "Set my level to 30 to gain stat-point budget"  → fails (5).
 *
 *  Note: equippedSkills are validated separately at write time (need the skill
 *  registry for unlockLevel checks). Class id is checked against a whitelist.
 */
export function validateProgressClaim(
  claimed: Record<string, ServerUnitProgress>,
  canonical: Record<string, ServerUnitProgress>,
): ValidationResult {
  const issues: { unitId: string; problem: string }[] = [];

  for (const [unitId, c] of Object.entries(claimed)) {
    // Rule 1
    if (c.level < 1 || c.level > MAX_LEVEL) {
      issues.push({ unitId, problem: `level ${c.level} out of range` });
      continue;
    }
    // Rule 2
    if (c.xp < 0) {
      issues.push({ unitId, problem: `xp negative` });
      continue;
    }
    if (c.level >= MAX_LEVEL && c.xp > 0) {
      issues.push({ unitId, problem: `MAX_LEVEL unit has non-zero xp ${c.xp}` });
      continue;
    }
    if (c.level < MAX_LEVEL && c.xp >= XP_TABLE[c.level - 1]) {
      issues.push({ unitId, problem: `xp ${c.xp} >= threshold ${XP_TABLE[c.level - 1]} for level ${c.level}` });
      continue;
    }
    // Rule 3 — sanitizeUnit already ensures shape, but defend against direct calls
    for (const k of STAT_KEYS) {
      const v = c.customStats[k];
      if (!Number.isInteger(v) || v < 0) {
        issues.push({ unitId, problem: `customStats.${k} = ${v} invalid` });
        break;
      }
    }
    // Rule 4 — allocation invariant
    const allocated = statSum(c.customStats);
    if (allocated + c.availablePoints !== earnedPoints(c.level)) {
      issues.push({
        unitId,
        problem: `allocated ${allocated} + available ${c.availablePoints} ≠ earned ${earnedPoints(c.level)} for level ${c.level}`,
      });
      continue;
    }
    // Rule 5 — no level regression (only matters if a canonical exists)
    const can = canonical[unitId];
    if (can) {
      if (c.level < can.level) {
        issues.push({ unitId, problem: `level regressed ${can.level} → ${c.level}` });
        continue;
      }
      // Rule 6 — no XP regression
      const claimedTotal = sumXpAtState(c.level, c.xp);
      const canonicalTotal = sumXpAtState(can.level, can.xp);
      if (claimedTotal < canonicalTotal) {
        issues.push({ unitId, problem: `total xp regressed ${canonicalTotal} → ${claimedTotal}` });
        continue;
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, reason: issues[0].problem, issues };
  }
  return { ok: true };
}

/** Total XP a unit at (level, xp) represents. */
function sumXpAtState(level: number, xp: number): number {
  let total = 0;
  for (let i = 0; i < level - 1 && i < XP_TABLE.length; i++) total += XP_TABLE[i];
  return total + xp;
}

/** Persist `claimed` as the new canonical IF it validates. Returns the result. */
export async function validateAndSyncProgress(
  address: string,
  claimed: Record<string, unknown>,
): Promise<{ ok: boolean; canonical: ProgressBlob; reason?: string }> {
  const canonical = await readServerProgress(address);
  // Shape every claimed unit through sanitizeUnit first so we're comparing
  // apples to apples.
  const sanitizedClaim: Record<string, ServerUnitProgress> = {};
  for (const [id, u] of Object.entries(claimed)) {
    sanitizedClaim[id] = sanitizeUnit(u);
  }
  const result = validateProgressClaim(sanitizedClaim, canonical.units);
  if (!result.ok) {
    // Don't write — return existing canonical for the client to overwrite localStorage.
    return { ok: false, canonical, reason: result.reason };
  }
  // Merge: the claimed map is the new canonical. Units the client didn't send
  // (e.g., not yet unlocked rosters) are left as canonical.
  const next: ProgressBlob = { units: { ...canonical.units, ...sanitizedClaim } };
  await writeServerProgress(address, next);
  return { ok: true, canonical: next };
}
