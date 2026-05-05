import { getJson, setJson, del, zaddGt, incrWithExpire, hset, hmget } from "./redis.js";

// A live survival run. Stored at Redis key `run:{runId}` with a TTL.
export interface RunState {
  address: string;
  mode: LbMode;
  startedAt: number;       // ms epoch (server clock)
  currentFloor: number;    // count of bosses/floors cleared; 0 = none cleared yet
  lastFloorAt: number;     // ms epoch when currentFloor was cleared (or startedAt)
  status: "live" | "ended";
}

const RUN_TTL_SECONDS = 60 * 60 * 2; // 2 hours — must beat the JWT exp.
export type LbMode = "survival" | "boss_raid";
export const LB_KEYS: Record<LbMode, string> = {
  survival: "lb:survival:v1",
  boss_raid: "lb:bossraid:v1",
};
// Back-compat default key (existing references).
export const LB_KEY = LB_KEYS.survival;
export function lbKeyFor(mode: LbMode): string { return LB_KEYS[mode]; }
export function isLbMode(s: unknown): s is LbMode {
  return s === "survival" || s === "boss_raid";
}
export const IGN_HASH_KEY = "igns";
export const IGN_SET_AT_KEY = "ign_set_at";
const MAX_IGN_LEN = 24;
export const IGN_CHANGE_COOLDOWN_MS = Number(process.env.LB_IGN_COOLDOWN_MS ?? 7 * 24 * 60 * 60 * 1000);

export function sanitizeIgn(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Strip control chars, collapse whitespace, trim, cap length.
  const cleaned = raw.replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_IGN_LEN);
}

export type IgnUpdateResult =
  | { kind: "saved"; ign: string }
  | { kind: "unchanged"; ign: string }
  | { kind: "cooldown"; ign: string; nextAllowedAt: number };

// Idempotent IGN write with 7-day cooldown for changes (not for first-time set).
export async function setIgnIfAllowed(address: string, ign: string): Promise<IgnUpdateResult> {
  const addr = address.toLowerCase();
  const [existing, setAtRaw] = await hmget(IGN_HASH_KEY, [addr]).then(async ([cur]) => {
    const [t] = await hmget(IGN_SET_AT_KEY, [addr]);
    return [cur, t] as const;
  });

  if (existing && existing === ign) return { kind: "unchanged", ign };

  if (existing && existing !== ign) {
    const setAt = setAtRaw ? Number(setAtRaw) : 0;
    const elapsed = Date.now() - (Number.isFinite(setAt) ? setAt : 0);
    if (elapsed < IGN_CHANGE_COOLDOWN_MS) {
      return { kind: "cooldown", ign: existing, nextAllowedAt: setAt + IGN_CHANGE_COOLDOWN_MS };
    }
  }

  await hset(IGN_HASH_KEY, addr, ign);
  await hset(IGN_SET_AT_KEY, addr, String(Date.now()));
  return { kind: "saved", ign };
}

// Anti-cheat: minimum average ms per cleared floor enforced at /end.
// Real fast clears are allowed; pure spam (e.g. 50 floor pings in 1s) is rejected.
export const MIN_AVG_FLOOR_MS = Number(process.env.LB_MIN_AVG_FLOOR_MS ?? 2000);
// Cap submitted floor so a forged client can't claim absurd numbers.
export const MAX_FLOOR = Number(process.env.LB_MAX_FLOOR ?? 50);
// Per-wallet rate-limit on /run/start.
export const MAX_STARTS_PER_HOUR = Number(process.env.LB_MAX_STARTS_PER_HOUR ?? 30);

export function runKey(runId: string): string { return `run:${runId}`; }
export function startsKey(address: string): string { return `starts:${address.toLowerCase()}`; }

export async function getRun(runId: string): Promise<RunState | null> {
  return getJson<RunState>(runKey(runId));
}

export async function saveRun(runId: string, state: RunState): Promise<void> {
  await setJson(runKey(runId), state, RUN_TTL_SECONDS);
}

export async function deleteRun(runId: string): Promise<void> {
  await del(runKey(runId));
}

export async function bumpStartCounter(address: string): Promise<number> {
  return incrWithExpire(startsKey(address), 60 * 60);
}

// Leaderboard score encoding: higher floor first, then lower ms first.
// score = floor * MS_BUCKET + (MS_BUCKET - 1 - clamp(ms))
// This keeps each floor's scores inside its own bucket [floor*B, (floor+1)*B)
// so decoding is unambiguous regardless of ms.
const MS_BUCKET = 1e10; // 1e10 ms = ~115 days, safely larger than any real run.
export function encodeScore(floor: number, ms: number): number {
  const clampedMs = Math.max(0, Math.min(MS_BUCKET - 1, Math.floor(ms)));
  return floor * MS_BUCKET + (MS_BUCKET - 1 - clampedMs);
}
export function decodeScore(score: number): { floor: number; ms: number } {
  const floor = Math.floor(score / MS_BUCKET);
  const rest = score - floor * MS_BUCKET;
  const ms = MS_BUCKET - 1 - rest;
  return { floor, ms };
}

export async function submitToLeaderboard(address: string, floor: number, ms: number, mode: LbMode = "survival"): Promise<void> {
  await zaddGt(lbKeyFor(mode), encodeScore(floor, ms), address.toLowerCase());
}
