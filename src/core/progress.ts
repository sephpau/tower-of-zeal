import { Stats, ZERO_STATS } from "./stats";
import { CLASS_SKILLS, CHARACTER_SKILLS, getSkill } from "../skills/registry";

// Persistent per-unit progress, keyed by template id.
// Resets to defaults when there's no entry for that id.

export interface UnitProgress {
  level: number;
  xp: number;
  customStats: Stats;
  classId?: string;
  availablePoints: number;   // from leveling: +4 per level
  /** Skill ids the player has equipped for combat (max 4). idle is always implicitly available. */
  equippedSkills?: string[];
}

export const MAX_EQUIPPED_SKILLS = 4;

import { scopedKey } from "../auth/scope";
const KEY = () => scopedKey("stat-battler.progress.v1");

function defaults(): UnitProgress {
  return { level: 1, xp: 0, customStats: { ...ZERO_STATS }, availablePoints: 0 };
}

function loadAll(): Record<string, UnitProgress> {
  try {
    const raw = localStorage.getItem(KEY());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveAll(map: Record<string, UnitProgress>): void {
  try {
    localStorage.setItem(KEY(), JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getProgress(templateId: string): UnitProgress {
  const map = loadAll();
  const entry = map[templateId];
  if (!entry) return defaults();
  const result: UnitProgress = {
    level: entry.level ?? 1,
    xp: entry.xp ?? 0,
    customStats: { ...ZERO_STATS, ...(entry.customStats ?? {}) },
    classId: entry.classId,
    availablePoints: entry.availablePoints ?? 0,
    equippedSkills: Array.isArray(entry.equippedSkills) ? entry.equippedSkills.slice(0, MAX_EQUIPPED_SKILLS) : [],
  };
  // Lazy heal: strip skills now locked behind a higher unlockLevel (e.g. after
  // an admin Reset Level dropped the unit back to Lv1), and only auto-fill
  // when the loadout is fully empty — partial top-ups happen at battle start
  // so the user can intentionally run with fewer than MAX skills.
  const before = result.equippedSkills ?? [];
  const trimmed = before.filter(id => {
    const s = getSkill(id);
    return (s.unlockLevel ?? 1) <= result.level;
  });
  const next = trimmed.length === 0
    ? autoEquipNewlyUnlocked(templateId, result.classId, result.level, trimmed)
    : trimmed;
  const changed = next.length !== before.length || next.some((id, i) => before[i] !== id);
  if (changed) {
    result.equippedSkills = next;
    map[templateId] = result;
    saveAll(map);
  }
  return result;
}

export function setProgress(templateId: string, p: UnitProgress): void {
  const map = loadAll();
  map[templateId] = p;
  saveAll(map);
}

/** Append any newly-unlocked class/character skills to the loadout, capped at
 *  MAX_EQUIPPED_SKILLS. Idempotent: never removes, never duplicates. Useful
 *  on class change, level change (admin or normal), or first-time setup. */
export function autoEquipNewlyUnlocked(
  templateId: string,
  classId: string | undefined,
  level: number,
  current: string[],
): string[] {
  const equipped = [...current];
  const candidates = new Set<string>();
  for (const id of (CHARACTER_SKILLS[templateId] ?? [])) candidates.add(id);
  if (classId) for (const id of (CLASS_SKILLS[classId] ?? [])) candidates.add(id);
  for (const id of candidates) {
    if (equipped.length >= MAX_EQUIPPED_SKILLS) break;
    if (equipped.includes(id)) continue;
    const skill = getSkill(id);
    const unlockAt = skill.unlockLevel ?? 1;
    if (level >= unlockAt) equipped.push(id);
  }
  return equipped;
}

export function resetAllProgress(): void {
  try { localStorage.removeItem(KEY()); } catch { /* ignore */ }
}

/** Snapshot the entire progress blob for this wallet (or null if empty). */
export function snapshotAllProgress(): string | null {
  try { return localStorage.getItem(KEY()); } catch { return null; }
}

/** Restore a previously snapshotted blob. Pass null to clear. */
export function restoreAllProgress(snapshot: string | null): void {
  try {
    if (snapshot === null) localStorage.removeItem(KEY());
    else localStorage.setItem(KEY(), snapshot);
  } catch { /* ignore */ }
}
