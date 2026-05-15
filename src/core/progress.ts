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
  const priorLevel = map[templateId]?.level ?? 1;
  // ---- First-time-Lv2 onboarding hook ----
  // Mark a pending forced stat-allocation prompt if THIS write is the first
  // time any unit transitions from <2 to >=2 AND the player has never been
  // through the forced allocator before. The "first time per player" promise
  // is enforced by FORCED_ALLOC_SEEN_KEY — once true, we never set the
  // pending key again.
  if (!isForcedStatAllocSeen() && priorLevel < 2 && p.level >= 2 && p.availablePoints > 0) {
    try { localStorage.setItem(PENDING_ALLOC_UNIT_KEY(), templateId); } catch { /* ignore */ }
  }
  map[templateId] = p;
  saveAll(map);
  schedulePushProgress();
}

// ---- Forced-onboarding flags (post-tutorial gates) ----
// 1. Force a class pick on the first unit when player exits tutorial with all
//    units at Lv 1 and no class anywhere.
// 2. Force stat allocation the FIRST time any unit reaches Lv 2 (once per
//    player, not once per unit — subsequent level-ups are silent).
const FORCED_CLASS_PICK_SEEN_KEY  = (): string => scopedKey("toz.forced.classPickSeen.v1");
const FORCED_ALLOC_SEEN_KEY       = (): string => scopedKey("toz.forced.statAllocSeen.v1");
const PENDING_ALLOC_UNIT_KEY      = (): string => scopedKey("toz.forced.pendingAllocUnit.v1");

/** True if we should run the forced class-pick gate now. Conditions:
 *  - Player hasn't been through it before (one-shot)
 *  - No unit on the wallet has classId set
 *  - No unit has reached Lv 2+ (so we never block veterans loading a fresh
 *    device — they've earned past the gate already). */
export function isForcedClassPickPending(): boolean {
  try { if (localStorage.getItem(FORCED_CLASS_PICK_SEEN_KEY())) return false; } catch { /* fallthrough */ }
  const map = loadAll();
  for (const id of Object.keys(map)) {
    if (map[id].classId) return false;
    if ((map[id].level ?? 1) >= 2) return false;
  }
  return true;
}
export function markForcedClassPickComplete(): void {
  try { localStorage.setItem(FORCED_CLASS_PICK_SEEN_KEY(), "1"); } catch { /* ignore */ }
}

/** Returns the templateId of the unit that triggered the forced stat-alloc
 *  prompt, or null if no prompt is pending. */
export function getPendingForcedStatAllocUnit(): string | null {
  try { return localStorage.getItem(PENDING_ALLOC_UNIT_KEY()); } catch { return null; }
}
export function clearPendingForcedStatAllocUnit(): void {
  try { localStorage.removeItem(PENDING_ALLOC_UNIT_KEY()); } catch { /* ignore */ }
}
export function markForcedStatAllocSeen(): void {
  try { localStorage.setItem(FORCED_ALLOC_SEEN_KEY(), "1"); } catch { /* ignore */ }
}
function isForcedStatAllocSeen(): boolean {
  try { return !!localStorage.getItem(FORCED_ALLOC_SEEN_KEY()); } catch { return false; }
}

/** Debounce coalescing multiple setProgress calls in the same tick into a
 *  single /api/progress_sync POST. The server's response can roll back our
 *  localStorage if the merged claim doesn't validate. */
let pushTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePushProgress(): void {
  if (pushTimer !== null) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushProgress();
  }, 500);
}

/** Auto-equip the strongest MAX_EQUIPPED_SKILLS skills the unit is allowed to
 *  equip at its current level. Called on every level-up (normal + admin) and
 *  class change — newly unlocked high-tier skills replace lower-tier ones
 *  automatically so the loadout always reflects the best gear available.
 *
 *  Ranking is by `unlockLevel` descending (higher unlock = stronger). Stable
 *  sort ties: character signatures win over class basics at the same tier.
 *
 *  Trade-off: a player who manually picked a low-tier skill in "Edit Loadout"
 *  WILL see it replaced on the next level-up if a higher-tier one is now
 *  unlocked. Manual picks are session-scoped; level transitions reset to
 *  strongest-N. This matches the requested behavior ("do auto equip"). */
export function autoEquipNewlyUnlocked(
  templateId: string,
  classId: string | undefined,
  level: number,
  _current: string[],
): string[] {
  void _current; // intentionally unused — auto-equip is fully recomputed
  const candidates = new Set<string>();
  for (const id of (CHARACTER_SKILLS[templateId] ?? [])) candidates.add(id);
  if (classId) for (const id of (CLASS_SKILLS[classId] ?? [])) candidates.add(id);
  const unlocked: { id: string; tier: number }[] = [];
  for (const id of candidates) {
    const skill = getSkill(id);
    const unlockAt = skill.unlockLevel ?? 1;
    if (level >= unlockAt) unlocked.push({ id, tier: unlockAt });
  }
  // Strongest-first sort. Iteration order through Set above preserves the
  // character-then-class precedence, so .sort() (stable) keeps character
  // signatures ahead of class basics when unlock tiers match.
  unlocked.sort((a, b) => b.tier - a.tier);
  return unlocked.slice(0, MAX_EQUIPPED_SKILLS).map(u => u.id);
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

// ---- Server-canonical progress sync ----
// The localStorage map is a cache. The server holds the canonical record
// and validates every claim — if the client's localStorage was tampered with
// (level/XP/customStats edited directly), the server rejects the claim and
// returns the canonical state, which we then write back into localStorage
// to undo the tampering. This is the devtool-proofing layer for XP and stats.

import { loadSession } from "../auth/session";

interface ProgressSyncResponse {
  ok: boolean;
  canonical: { units: Record<string, UnitProgress> };
  reason?: string;
}

/** Fetch the server's canonical progress and write it into localStorage,
 *  replacing whatever was there. Call at app init / home-screen entry so
 *  any device-side tampering is undone on every visit. */
export async function pullCanonicalProgress(): Promise<{ ok: boolean; reason?: string } | null> {
  const sess = loadSession();
  if (!sess) return null;
  try {
    const r = await fetch("/api/run/floor-cleared", {
      method: "POST",
      headers: { Authorization: `Bearer ${sess.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ op: "progress_get" }),
    });
    if (!r.ok) return null;
    const data = await r.json() as ProgressSyncResponse;
    if (data.canonical && data.canonical.units) {
      // Always overwrite from the server canonical, even when it's empty.
      // The previous "skip overwrite when empty" guard was meant to protect
      // first-time wallets but it made post-wipe recovery impossible —
      // players' stale localStorage would survive a server wipe forever.
      // The server is authoritative; if it says empty, we go empty.
      saveAll(data.canonical.units);
    }
    return { ok: true };
  } catch { return null; }
}

/** Push the local progress map up to the server. The server validates, then:
 *    - if valid: persists the claim as the new canonical → returns ok=true
 *    - if invalid: returns the existing canonical → we overwrite localStorage,
 *      effectively rolling back any tampering since the last sync.
 *  Call after every legitimate progress write (battle XP, stat allocation,
 *  class change, skill equip). */
export async function pushProgress(): Promise<{ ok: boolean; reason?: string } | null> {
  const sess = loadSession();
  if (!sess) return null;
  const claimed = loadAll();
  try {
    const r = await fetch("/api/run/floor-cleared", {
      method: "POST",
      headers: { Authorization: `Bearer ${sess.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ op: "progress_sync", claimed }),
    });
    if (!r.ok) return null;
    const data = await r.json() as ProgressSyncResponse;
    if (!data.ok && data.canonical && data.canonical.units) {
      // Tampering detected — overwrite localStorage with the server canonical
      // so further reads pick up the rolled-back state.
      saveAll(data.canonical.units);
      return { ok: false, reason: data.reason };
    }
    return { ok: true };
  } catch { return null; }
}
