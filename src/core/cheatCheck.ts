// Client-side cheat detection. Sums total XP across all player units and
// asks the server whether that's <= the wallet's lifetime audited ceiling.
// Admin wallets are exempt.

import { PLAYER_ROSTER } from "../units/roster";
import { getProgress } from "./progress";
import { XP_TABLE } from "./levels";
import { loadSession } from "../auth/session";
import { isAdmin } from "./admin";

/** XP consumed to reach `level` (sum of XP_TABLE up to but not including the current level). */
function xpForLevel(level: number): number {
  let sum = 0;
  for (let i = 1; i < level && i - 1 < XP_TABLE.length; i++) sum += XP_TABLE[i - 1];
  return sum;
}

export function computeLocalTotalXp(): number {
  let total = 0;
  for (const t of PLAYER_ROSTER) {
    const p = getProgress(t.id);
    total += xpForLevel(p.level) + Math.max(0, p.xp);
  }
  return total;
}

export interface CheatCheckResult {
  ok: boolean;
  cap: number;
  claimed: number;
  slack: number;
  error?: string;
}

/** Returns null if check could not be performed (network/auth issue) — treat as ok. */
export async function runCheatCheck(): Promise<CheatCheckResult | null> {
  if (isAdmin()) return { ok: true, cap: Infinity, claimed: 0, slack: 0 };
  const sess = loadSession();
  if (!sess) return null;
  const claimed = computeLocalTotalXp();
  try {
    const r = await fetch("/api/units/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${sess.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ totalXp: claimed }),
    });
    if (!r.ok) return null;
    return await r.json() as CheatCheckResult;
  } catch {
    return null;
  }
}
