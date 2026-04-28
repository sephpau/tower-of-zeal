import { Stats, ZERO_STATS } from "./stats";

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
  return {
    level: entry.level ?? 1,
    xp: entry.xp ?? 0,
    customStats: { ...ZERO_STATS, ...(entry.customStats ?? {}) },
    classId: entry.classId,
    availablePoints: entry.availablePoints ?? 0,
    equippedSkills: Array.isArray(entry.equippedSkills) ? entry.equippedSkills.slice(0, MAX_EQUIPPED_SKILLS) : [],
  };
}

export function setProgress(templateId: string, p: UnitProgress): void {
  const map = loadAll();
  map[templateId] = p;
  saveAll(map);
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
