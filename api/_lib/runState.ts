import { getJson, setJson, del, zaddGt, zaddLt, zrangeWithScores, zrevrank, zrevrange, incrWithExpire, hset, hmget, incrBy, getNumber } from "./redis.js";

// ---- Admin: leaderboard resets ----
export type AdminResetScope = "survival" | "bossraid" | "we" | "conquer";

export async function adminClearLeaderboard(scope: AdminResetScope): Promise<string[]> {
  const keys: string[] = [];
  if (scope === "survival") keys.push(LB_KEYS.survival);
  else if (scope === "bossraid") keys.push(LB_KEYS.boss_raid);
  else if (scope === "we") keys.push(WORLD_ENDER_LB_KEY);
  else if (scope === "conquer") keys.push(FIRST_CONQUER_KEY);
  for (const k of keys) await del(k).catch(() => undefined);
  return keys;
}

/** Bulk wipe — kept for emergencies but the UI now exposes per-board buttons. */
export async function adminClearAllLeaderboards(): Promise<string[]> {
  const all: AdminResetScope[] = ["survival", "bossraid", "we", "conquer"];
  const keys: string[] = [];
  for (const s of all) keys.push(...await adminClearLeaderboard(s));
  return keys;
}

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

export async function submitToLeaderboard(address: string, floor: number, ms: number, mode: LbMode = "survival"): Promise<{ improved: boolean }> {
  const changed = await zaddGt(lbKeyFor(mode), encodeScore(floor, ms), address.toLowerCase());
  return { improved: changed > 0 };
}

// ---- "First to Conquer the Tower" — first wallet to clear floors 1..50 sequentially in floor mode ----
// Tracking: maxFloorCleared:{addr} stores the highest contiguous floor cleared.
// We only bump it when the new clear is exactly maxCleared + 1, so claiming
// floor 50 without clearing the prior ones doesn't count. The achievement
// itself is a single record persisted via SETNX so only the first wallet to
// reach 50 wins.
export const FIRST_CONQUER_KEY = "achievement:first_conquer:v1";
export const TOWER_FINAL_FLOOR = 50;
export const SURVIVAL_FINAL_FLOOR = 50;  // legacy export, unused

export interface FirstConquerPartyMember {
  templateId: string;
  classId?: string;
  level: number;
  customStats: Record<string, number>;
  equippedSkills: string[];
}

export interface FirstConquerRecord {
  address: string;
  /** Wallclock when the achievement was awarded (no run-time tracked). */
  when: number;
  /** Party that was on the floor-50 clear that earned the trophy. Optional for back-compat with v1 records. */
  party?: FirstConquerPartyMember[];
}

function maxFloorKey(address: string): string { return `maxfloor:${address.toLowerCase()}`; }

export async function getMaxFloorCleared(address: string): Promise<number> {
  return await getNumber(maxFloorKey(address));
}

/** Returns true if THIS clear advanced the max-cleared counter and minted the
 *  conqueror record. Only call from the floor-mode "clear" event after the
 *  client has reported a successful stageId clear. */
export async function recordFloorModeClear(address: string, stageId: number, party?: FirstConquerPartyMember[]): Promise<{ newMax: number; awardedConqueror: boolean }> {
  const cur = await getMaxFloorCleared(address);
  let newMax = cur;
  // Sequential rule: only bump if this is the next floor in line. Prevents
  // someone clearing floor 5 from being credited as having cleared 1-4.
  if (stageId === cur + 1) {
    newMax = stageId;
    await setJson(maxFloorKey(address), newMax, 60 * 60 * 24 * 365 * 5);
  }
  let awardedConqueror = false;
  if (newMax >= TOWER_FINAL_FLOOR) {
    awardedConqueror = await setNxJson(FIRST_CONQUER_KEY, {
      address: address.toLowerCase(),
      when: Date.now(),
      ...(party ? { party } : {}),
    } as FirstConquerRecord);
  }
  return { newMax, awardedConqueror };
}

export async function getFirstConquer(): Promise<FirstConquerRecord | null> {
  return await getJson<FirstConquerRecord>(FIRST_CONQUER_KEY);
}

// SETNX with JSON value. Returns true if newly set.
async function setNxJson<T>(key: string, value: T): Promise<boolean> {
  const { setNxWithExpire } = await import("./redis.js");
  // No expiry for permanent achievements: pass a very long TTL.
  return await setNxWithExpire(key, JSON.stringify(value), 60 * 60 * 24 * 365 * 10);
}

// ---- Floor-mode free retries — capped per wallet per PH day ----
export const FLOOR_RETRIES_PER_DAY = 3;
const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
const RESET_HOUR = 8;

function phDayBoundary(now = Date.now()): number {
  const phNow = new Date(now + PH_OFFSET_MS);
  const phY = phNow.getUTCFullYear();
  const phM = phNow.getUTCMonth();
  const phD = phNow.getUTCDate();
  const phH = phNow.getUTCHours();
  const dayOffset = phH < RESET_HOUR ? -1 : 0;
  return Date.UTC(phY, phM, phD + dayOffset, RESET_HOUR) - PH_OFFSET_MS;
}

function retriesKey(address: string): string {
  return `retries:floor:${address.toLowerCase()}:${phDayBoundary()}`;
}

/** Atomic increment with TTL set to the next PH boundary. Returns the new count. */
export async function bumpFloorRetry(address: string): Promise<number> {
  const remainingMs = phDayBoundary() + 24 * 60 * 60 * 1000 - Date.now();
  const ttl = Math.max(60, Math.floor(remainingMs / 1000));
  return await incrWithExpire(retriesKey(address), ttl);
}

/** Read current count without incrementing. */
export async function readFloorRetries(address: string): Promise<number> {
  return await getNumber(retriesKey(address));
}

// ---- "Fastest to Kill World Ender" — floor-50 single-battle clears ----
// Tracked separately from the survival/boss-raid leaderboards because this
// is specifically about the standalone Floor 50 fight in normal floor mode.
export const WORLD_ENDER_LB_KEY = "lb:world_ender_fastest:v1";
// Minimum acceptable clear time (server side anti-cheat). World Ender on Lv30
// with 1400 HP and ~6× damage taken multiplier won't fall in less than this.
export const MIN_WORLD_ENDER_MS = 10_000;
export const MAX_WORLD_ENDER_MS = 30 * 60 * 1000; // 30 min, sanity cap.

export async function submitWorldEnderClear(address: string, ms: number): Promise<{ ok: boolean; improved: boolean }> {
  if (ms < MIN_WORLD_ENDER_MS || ms > MAX_WORLD_ENDER_MS) return { ok: false, improved: false };
  // LT: only persist if this is a faster time than the wallet's current best.
  const changed = await zaddLt(WORLD_ENDER_LB_KEY, ms, address.toLowerCase());
  return { ok: true, improved: changed > 0 };
}

export interface WorldEnderEntry { rank: number; address: string; ign: string | null; ms: number; }

export async function getWorldEnderTop(limit = 3): Promise<WorldEnderEntry[]> {
  const rows = await zrangeWithScores(WORLD_ENDER_LB_KEY, 0, limit - 1);
  if (rows.length === 0) return [];
  const igns = await hmget(IGN_HASH_KEY, rows.map(r => r.member));
  return rows.map((r, i) => ({ rank: i + 1, address: r.member, ign: igns[i] ?? null, ms: r.score }));
}

// ---- Replay storage ----
const REPLAY_TTL_SECONDS = 60 * 60 * 24 * 365;  // 1 year — replays for a permanent leaderboard
export function replayKey(scope: string, address: string): string {
  return `replay:${scope}:${address.toLowerCase()}`;
}
export async function saveReplayBlob(scope: string, address: string, blob: unknown): Promise<void> {
  await setJson(replayKey(scope, address), blob, REPLAY_TTL_SECONDS);
}
export async function loadReplayBlob<T = unknown>(scope: string, address: string): Promise<T | null> {
  return await getJson<T>(replayKey(scope, address));
}
export async function deleteReplayBlob(scope: string, address: string): Promise<void> {
  await del(replayKey(scope, address));
}

/** Number of replays we keep per leaderboard. Anything outside the top N gets pruned. */
export const REPLAY_TOP_N = 3;

/** Replay-storage scope name for an LbMode (matches the client's scope strings). */
export function replayScopeFor(mode: LbMode): string {
  return mode === "survival" ? "lb_survival" : "lb_bossraid";
}

/**
 * Save the replay for `address` if their CURRENT leaderboard rank is inside the
 * top N, then delete every replay for ranks outside the top N. Call this after
 * `submitToLeaderboard` so the rank reflects the just-submitted score.
 *
 * Idempotent: safe to call even when nothing changed (it'll just re-prune any
 * stale replays beyond the cutoff).
 */
export async function syncTopReplays(
  mode: LbMode,
  address: string,
  replay: unknown | null,
): Promise<void> {
  const lbKey = lbKeyFor(mode);
  const scope = replayScopeFor(mode);
  const addr = address.toLowerCase();

  // 1. Save the new replay only if this address is currently in the top N.
  if (replay) {
    const rank = await zrevrank(lbKey, addr);  // 0-indexed; 0 = best
    if (rank !== null && rank < REPLAY_TOP_N) {
      await saveReplayBlob(scope, addr, replay).catch(() => undefined);
    }
  }

  // 2. Drop replays for everyone outside the top N (e.g., the entry we just
  //    pushed off the bottom of the keep window).
  const outside = await zrevrange(lbKey, REPLAY_TOP_N, -1).catch(() => [] as string[]);
  for (const m of outside) {
    await deleteReplayBlob(scope, m).catch(() => undefined);
  }
}

// ---- Cheat-check audit: lifetime XP ceiling ----
// Server tracks the maximum total XP this wallet could have earned across
// every run it has ever completed. The client's claimed total XP (computed
// from local unit progress) must not exceed this value.
//
// Per-floor ceiling values are intentionally generous (~2× realistic max)
// so legit play never trips the gate.
export const XP_CAP_PER_FLOOR: Record<LbMode | "floor", number> = {
  floor: 8000,
  survival: 200,
  boss_raid: 1500,
};
export const XP_CAP_SLACK = 1000; // tolerance for in-flight runs / first-run-not-yet-ended

export function xpCapKey(address: string): string { return `xpcap:${address.toLowerCase()}`; }

export async function bumpXpCap(address: string, amount: number): Promise<number> {
  if (amount <= 0) return 0;
  return await incrBy(xpCapKey(address), Math.floor(amount));
}

export async function getXpCap(address: string): Promise<number> {
  return await getNumber(xpCapKey(address));
}
