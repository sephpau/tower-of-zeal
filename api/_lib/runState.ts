import { getJson, setJson, del, zaddGt, incrWithExpire, hset } from "./redis.js";

// A live survival run. Stored at Redis key `run:{runId}` with a TTL.
export interface RunState {
  address: string;
  startedAt: number;       // ms epoch (server clock)
  currentFloor: number;    // last floor cleared; 0 = none cleared yet
  lastFloorAt: number;     // ms epoch when currentFloor was cleared (or startedAt)
  status: "live" | "ended";
}

const RUN_TTL_SECONDS = 60 * 60 * 2; // 2 hours — must beat the JWT exp.
export const LB_KEY = "lb:survival:v1";
export const IGN_HASH_KEY = "igns";
const MAX_IGN_LEN = 24;

export function sanitizeIgn(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Strip control chars, collapse whitespace, trim, cap length.
  const cleaned = raw.replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_IGN_LEN);
}

export async function recordIgn(address: string, ign: string): Promise<void> {
  await hset(IGN_HASH_KEY, address.toLowerCase(), ign);
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

export async function submitToLeaderboard(address: string, floor: number, ms: number): Promise<void> {
  await zaddGt(LB_KEY, encodeScore(floor, ms), address.toLowerCase());
}
