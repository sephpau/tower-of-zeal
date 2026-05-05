// Client wrapper around the survival leaderboard backend.
// Calls fail soft: if the server is unreachable, the run continues locally —
// we just won't have a leaderboard entry for it.

import { loadSession } from "../auth/session";
import { loadSettings } from "../ui/settings";

export interface LbEntry {
  rank: number;
  address: string;
  ign: string | null;
  floor: number;
  ms: number;
}

export type LbMode = "survival" | "boss_raid";

export interface LiveRun {
  runId: string;
  token: string;
  startedAt: number; // local clock, for UI timer only
  highestFloor: number;
  mode: LbMode;
}

let live: LiveRun | null = null;

export function getLiveRun(): LiveRun | null { return live; }

function sessionToken(): string | null {
  return loadSession()?.token ?? null;
}

export async function startRun(mode: LbMode = "survival"): Promise<LiveRun | null> {
  const sess = sessionToken();
  if (!sess) return null;
  try {
    const r = await fetch("/api/run/start", {
      method: "POST",
      headers: { Authorization: `Bearer ${sess}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    if (!r.ok) return null;
    const data = await r.json() as { runId: string; token: string };
    live = { runId: data.runId, token: data.token, startedAt: Date.now(), highestFloor: 0, mode };
    return live;
  } catch {
    return null;
  }
}

export async function reportFloor(floor: number): Promise<boolean> {
  if (!live) return false;
  try {
    const r = await fetch("/api/run/floor", {
      method: "POST",
      headers: { Authorization: `Bearer ${live.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ runId: live.runId, floor }),
    });
    if (!r.ok) return false;
    live.highestFloor = floor;
    return true;
  } catch { return false; }
}

export async function endRun(): Promise<{ floor: number; totalMs: number } | null> {
  if (!live) return null;
  const cur = live;
  live = null;
  try {
    const ign = loadSettings().playerName;
    const r = await fetch("/api/run/end", {
      method: "POST",
      headers: { Authorization: `Bearer ${cur.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ runId: cur.runId, ign }),
    });
    if (!r.ok) return null;
    return await r.json() as { floor: number; totalMs: number };
  } catch { return null; }
}

export function abortLiveRun(): void { live = null; }

export async function fetchTop(mode: LbMode = "survival", limit = 50): Promise<LbEntry[]> {
  try {
    const r = await fetch(`/api/leaderboard/top?mode=${mode}&limit=${limit}`);
    if (!r.ok) return [];
    const data = await r.json() as { entries: LbEntry[] };
    return data.entries ?? [];
  } catch { return []; }
}

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
