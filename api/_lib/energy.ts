// Server-authoritative energy. Replaces the localStorage-only client model so
// devtools edits to the local energy key can no longer grant free runs.
// Refill rule mirrors the client: full reset to ENERGY_MAX at 08:00 Asia/Manila.

import { getJson, setJson } from "./redis.js";

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
    return { amount: Math.max(0, Math.min(ENERGY_MAX, Math.floor(raw.amount))), lastReset: raw.lastReset };
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
    return { amount: ENERGY_MAX, lastReset: boundary };
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

/** Atomic consume. Returns ok=false with current amount if insufficient. */
export async function consumeEnergy(address: string, cost: number): Promise<{ ok: boolean; amount: number; max: number }> {
  if (cost <= 0) {
    const s = await getEnergy(address);
    return { ok: true, amount: s.amount, max: s.max };
  }
  const cur = applyRefill(await read(address));
  if (cur.amount < cost) {
    if (cur.lastReset !== (await read(address)).lastReset) await write(address, cur);
    return { ok: false, amount: cur.amount, max: ENERGY_MAX };
  }
  const next: EnergyState = { amount: cur.amount - cost, lastReset: cur.lastReset };
  await write(address, next);
  return { ok: true, amount: next.amount, max: ENERGY_MAX };
}

/** Time (ms) until next refill boundary. */
export function msUntilNextRefill(now = Date.now()): number {
  return lastResetBoundary(now) + 24 * 60 * 60 * 1000 - now;
}
