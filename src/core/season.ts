// Season-halt client. Surfaces the server kill-switch so the UI can show
// an off-season banner and disable Start buttons. Admin functions are gated
// server-side via isAdmin — this file only sends the requests.

import { loadSession } from "../auth/session";

function token(): string | null { return loadSession()?.token ?? null; }

export interface SeasonStatus {
  halted: boolean;
  setAt: number | null;
}

export async function fetchSeasonStatus(): Promise<SeasonStatus | null> {
  const tok = token();
  if (!tok) return null;
  try {
    const r = await fetch("/api/run/floor-cleared", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ op: "season_status" }),
    });
    if (!r.ok) return null;
    const data = await r.json() as { halted?: boolean; setAt?: number | null };
    return { halted: !!data.halted, setAt: data.setAt ?? null };
  } catch { return null; }
}

/** Admin-only: flip the server kill-switch. Server re-checks isAdmin from the
 *  JWT, so a non-admin wallet calling this gets 403. Returns the new state. */
export async function adminSetSeasonHalt(halted: boolean): Promise<SeasonStatus | null> {
  const tok = token();
  if (!tok) return null;
  try {
    const r = await fetch("/api/run/floor-cleared", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ op: halted ? "admin_season_halt" : "admin_season_resume" }),
    });
    if (!r.ok) return null;
    const data = await r.json() as { halted?: boolean; setAt?: number | null };
    return { halted: !!data.halted, setAt: data.setAt ?? null };
  } catch { return null; }
}

// In-memory cache so screens that need this state can check synchronously
// after a single async fetch on app boot / on entering a relevant screen.
let cached: SeasonStatus = { halted: false, setAt: null };
export function getCachedSeasonStatus(): SeasonStatus { return cached; }
export function setCachedSeasonStatus(s: SeasonStatus): void { cached = s; }

/** Refresh the cache from the server. Call on home-screen entry and after
 *  admin toggles. The cached state is what the UI reads. */
export async function refreshSeasonStatus(): Promise<SeasonStatus> {
  const s = await fetchSeasonStatus();
  if (s) cached = s;
  return cached;
}
