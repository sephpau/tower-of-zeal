import { getJson, setJson, del, zaddGt, incrWithExpire } from "./redis.js";

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

// Anti-cheat: minimum ms a single floor must take. Tune as you observe real runs.
export const MIN_FLOOR_MS = Number(process.env.LB_MIN_FLOOR_MS ?? 8000);
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
// score = floor * 1e10 - clamp(ms, 0, 1e10 - 1)
const MS_BUCKET = 1e10;
export function encodeScore(floor: number, ms: number): number {
  const clampedMs = Math.max(0, Math.min(MS_BUCKET - 1, Math.floor(ms)));
  return floor * MS_BUCKET - clampedMs;
}
export function decodeScore(score: number): { floor: number; ms: number } {
  const floor = Math.floor(score / MS_BUCKET);
  const ms = floor * MS_BUCKET - score;
  return { floor, ms };
}

export async function submitToLeaderboard(address: string, floor: number, ms: number): Promise<void> {
  await zaddGt(LB_KEY, encodeScore(floor, ms), address.toLowerCase());
}
