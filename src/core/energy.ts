// Energy gauge. Refills to ENERGY_MAX every day at 08:00 Asia/Manila (UTC+8).

import { scopedKey } from "../auth/scope";
export const ENERGY_MAX = 20;
const KEY = () => scopedKey("stat-battler.energy.v1");
const RESET_KEY = () => scopedKey("tower-of-zeal.energy.lastReset.v1");

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;       // UTC+8
const RESET_HOUR = 8;                          // 08:00 PH

/** Returns the most recent past 08:00 PH boundary (Date.now()), as UTC ms. */
function lastResetBoundary(now = Date.now()): number {
  const phNow = new Date(now + PH_OFFSET_MS);
  const phY = phNow.getUTCFullYear();
  const phM = phNow.getUTCMonth();
  const phD = phNow.getUTCDate();
  const phH = phNow.getUTCHours();
  // The PH boundary is at PH 08:00. If current PH hour < 8, the last boundary was yesterday 08:00 PH.
  const dayOffset = phH < RESET_HOUR ? -1 : 0;
  const boundaryUtcMs = Date.UTC(phY, phM, phD + dayOffset, RESET_HOUR) - PH_OFFSET_MS;
  return boundaryUtcMs;
}

function maybeRefill(): void {
  try {
    const lastResetRaw = localStorage.getItem(RESET_KEY());
    const lastReset = lastResetRaw ? Number(lastResetRaw) : 0;
    const boundary = lastResetBoundary();
    if (lastReset < boundary) {
      localStorage.setItem(KEY(), String(ENERGY_MAX));
      localStorage.setItem(RESET_KEY(), String(boundary));
    }
  } catch { /* ignore */ }
}

export function getEnergy(): number {
  maybeRefill();
  try {
    const raw = localStorage.getItem(KEY());
    if (raw === null) return ENERGY_MAX;
    const n = Math.max(0, Math.min(ENERGY_MAX, Math.floor(Number(raw))));
    return Number.isFinite(n) ? n : ENERGY_MAX;
  } catch {
    return ENERGY_MAX;
  }
}

export function setEnergy(n: number): void {
  const clamped = Math.max(0, Math.min(ENERGY_MAX, Math.floor(n)));
  try { localStorage.setItem(KEY(), String(clamped)); } catch { /* ignore */ }
}

export function consumeEnergy(amount = 1): boolean {
  const cur = getEnergy();
  if (cur < amount) return false;
  setEnergy(cur - amount);
  return true;
}

export function refillEnergy(): void {
  setEnergy(ENERGY_MAX);
}

export function addEnergy(amount: number): void {
  setEnergy(getEnergy() + amount);
}

/** Time (ms) until next 08:00 PH refill. */
export function msUntilNextRefill(): number {
  const now = Date.now();
  const boundary = lastResetBoundary(now);
  // Next boundary = boundary + 24h.
  return boundary + 24 * 60 * 60 * 1000 - now;
}
