// Server-authoritative energy. Replaces the localStorage-only client model so
// devtools edits to the local energy key can no longer grant free runs.
// Refill rule mirrors the client: full reset to ENERGY_MAX at 08:00 Asia/Manila.

import { getJson, setJson, withWalletLock, incrBy, getNumber } from "./redis.js";
import { bumpMinutesPlayed, bumpEnergyUsed } from "./analytics.js";

export const ENERGY_MAX = 20;
const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
const RESET_HOUR = 8;
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30d — long enough that lastReset survives idle wallets

interface EnergyState { amount: number; lastReset: number; }

function key(address: string): string { return `energy:${address.toLowerCase()}`; }

/** Most recent past 08:00 PH boundary, in UTC ms. */
function lastResetBoundary(now = Date.now()): number {
  const phNow = new Date(now + PH_OFFSET_MS);
  const phY = phNow.getUTCFullYear();
  const phM = phNow.getUTCMonth();
  const phD = phNow.getUTCDate();
  const phH = phNow.getUTCHours();
  const dayOffset = phH < RESET_HOUR ? -1 : 0;
  return Date.UTC(phY, phM, phD + dayOffset, RESET_HOUR) - PH_OFFSET_MS;
}

async function read(address: string): Promise<EnergyState> {
  const raw = await getJson<EnergyState>(key(address));
  if (raw && Number.isFinite(raw.amount) && Number.isFinite(raw.lastReset)) {
    // Floor at 0 but do NOT cap at ENERGY_MAX: daily-streak claims grant
    // bonus energy on top of a full pool (ENERGY_MAX + reward.energy) and
    // capping here would silently delete that bonus on the next read.
    return { amount: Math.max(0, Math.floor(raw.amount)), lastReset: raw.lastReset };
  }
  // First-time wallets: full pool, anchored to the current boundary so refill arithmetic is correct.
  return { amount: ENERGY_MAX, lastReset: lastResetBoundary() };
}

async function write(address: string, s: EnergyState): Promise<void> {
  await setJson(key(address), s, TTL_SECONDS);
}

/** Apply daily refill if a boundary has passed since last reset. Returns the (possibly refilled) state. */
function applyRefill(s: EnergyState): EnergyState {
  const boundary = lastResetBoundary();
  if (s.lastReset < boundary) {
    // Top up to ENERGY_MAX but preserve any bonus overflow from daily claims.
    return { amount: Math.max(s.amount, ENERGY_MAX), lastReset: boundary };
  }
  return s;
}

/** Read current balance, applying refill, persisting if changed. */
export async function getEnergy(address: string): Promise<{ amount: number; lastReset: number; max: number }> {
  const cur = await read(address);
  const after = applyRefill(cur);
  if (after.amount !== cur.amount || after.lastReset !== cur.lastReset) {
    await write(address, after);
  }
  return { amount: after.amount, lastReset: after.lastReset, max: ENERGY_MAX };
}

/** Atomic consume. Wraps the read-modify-write in a per-wallet Redis lock so
 *  concurrent /api/energy POSTs can't race past the balance check. Also
 *  increments the "pending campaign clears" counter — each unit of energy
 *  consumed earns the wallet one credit toward a campaign clear submission,
 *  which the clear op decrements. This is the witness that prevents devtools
 *  from minting XP cap bumps / floor progress without actually playing. */
export async function consumeEnergy(address: string, cost: number): Promise<{ ok: boolean; amount: number; max: number }> {
  if (cost <= 0) {
    const s = await getEnergy(address);
    return { ok: true, amount: s.amount, max: s.max };
  }
  const result = await withWalletLock(`energy:lock:${address.toLowerCase()}`, async () => {
    const cur = applyRefill(await read(address));
    if (cur.amount < cost) {
      if (cur.lastReset !== (await read(address)).lastReset) await write(address, cur);
      return { ok: false, amount: cur.amount, max: ENERGY_MAX };
    }
    const next: EnergyState = { amount: cur.amount - cost, lastReset: cur.lastReset };
    await write(address, next);
    // Issue clear credits matching the energy spent. Campaign floors are
    // 1-energy each, so cost=1 ⇒ +1 credit; admin-overrides aren't a concern
    // (they don't call consumeEnergy).
    await incrBy(pendingClearKey(address), cost).catch(() => 0);
    // Lifetime play-time + energy-consumed counters (analytics export →
    // daily spreadsheet sync). Minutes is estimated at ~2 min per energy
    // unit; energy_used is the raw count.
    void bumpMinutesPlayed(address, cost);
    void bumpEnergyUsed(address, cost);
    return { ok: true, amount: next.amount, max: ENERGY_MAX };
  }, { ttlSeconds: 5, retries: 12, retryMs: 60 });
  if (!result) {
    // Lock contention exceeded retries — surface as 503-style "try again".
    return { ok: false, amount: 0, max: ENERGY_MAX };
  }
  return result;
}

/** Pending-clear credits — the bridge between energy spending and clear claims.
 *  Each spent energy grants one credit; each campaign clear consumes one. */
function pendingClearKey(address: string): string {
  return `pendingClears:${address.toLowerCase()}`;
}
export async function readPendingClears(address: string): Promise<number> {
  return await getNumber(pendingClearKey(address));
}
/** Atomically consume one pending-clear credit. Returns true if successful. */
export async function consumePendingClear(address: string): Promise<boolean> {
  const result = await withWalletLock(`energy:lock:${address.toLowerCase()}`, async () => {
    const cur = await getNumber(pendingClearKey(address));
    if (cur <= 0) return false;
    await incrBy(pendingClearKey(address), -1);
    return true;
  }, { ttlSeconds: 5, retries: 12, retryMs: 60 });
  return result === true;
}

/** Time (ms) until next refill boundary. */
export function msUntilNextRefill(now = Date.now()): number {
  return lastResetBoundary(now) + 24 * 60 * 60 * 1000 - now;
}

/** Admin: add `delta` energy on top of current balance (delta < 0 also valid).
 *  Caller must verify admin status before invoking. Returns new balance. */
export async function adminGrantEnergy(address: string, delta: number): Promise<number> {
  const r = await withWalletLock(`energy:lock:${address.toLowerCase()}`, async () => {
    const cur = applyRefill(await read(address));
    const next: EnergyState = {
      // No upper cap — admin grants are intentional, same as daily bonus.
      amount: Math.max(0, cur.amount + delta),
      lastReset: cur.lastReset,
    };
    await write(address, next);
    return next.amount;
  }, { ttlSeconds: 5, retries: 12, retryMs: 60 });
  return r ?? 0;
}

/** Admin: set the balance to ENERGY_MAX directly. */
export async function adminFillEnergy(address: string): Promise<number> {
  const r = await withWalletLock(`energy:lock:${address.toLowerCase()}`, async () => {
    const cur = applyRefill(await read(address));
    const next: EnergyState = { amount: ENERGY_MAX, lastReset: cur.lastReset };
    await write(address, next);
    return next.amount;
  }, { ttlSeconds: 5, retries: 12, retryMs: 60 });
  return r ?? 0;
}
