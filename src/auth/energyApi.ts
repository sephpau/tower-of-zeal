// Client wrappers for the server-authoritative energy endpoints.
// The local localStorage value (core/energy.ts) is now just a display cache;
// every actual deduction must succeed server-side first.

import { loadSession } from "./session";
import { setEnergy } from "../core/energy";

export interface EnergyState { amount: number; max: number; msUntilRefill?: number; }

function token(): string | null { return loadSession()?.token ?? null; }

/** GET /api/energy. Updates the local cache on success. Fails soft to null. */
export async function fetchServerEnergy(): Promise<EnergyState | null> {
  const tok = token();
  if (!tok) return null;
  try {
    const r = await fetch("/api/energy", { headers: { Authorization: `Bearer ${tok}` } });
    if (!r.ok) return null;
    const data = await r.json() as EnergyState;
    if (typeof data?.amount === "number") setEnergy(data.amount);
    return data;
  } catch { return null; }
}

export type ConsumeResult =
  | { ok: true; amount: number; max: number }
  | { ok: false; amount: number; max: number }
  | { ok: false; error: "network" };

/** Admin only: grant N energy server-side. Returns the new balance, or null on failure. */
export async function adminGrantServerEnergy(delta: number): Promise<number | null> {
  const tok = token();
  if (!tok) return null;
  try {
    const r = await fetch("/api/run/floor-cleared", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ op: "admin_grant_energy", delta }),
    });
    if (!r.ok) return null;
    const data = await r.json() as { amount: number };
    if (typeof data.amount === "number") setEnergy(data.amount);
    return data.amount;
  } catch { return null; }
}

/** Admin only: fill server energy to MAX. Returns the new balance. */
export async function adminFillServerEnergy(): Promise<number | null> {
  const tok = token();
  if (!tok) return null;
  try {
    const r = await fetch("/api/run/floor-cleared", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ op: "admin_fill_energy" }),
    });
    if (!r.ok) return null;
    const data = await r.json() as { amount: number };
    if (typeof data.amount === "number") setEnergy(data.amount);
    return data.amount;
  } catch { return null; }
}

/** Admin + dev-only: wipe every server key under the current KEY_PREFIX.
 *  Server hard-refuses if KEY_PREFIX is empty (production safety). */
export async function adminWipeDevServerData(): Promise<{ ok: boolean; scanned?: number; deleted?: number; error?: string }> {
  const tok = token();
  if (!tok) return { ok: false, error: "not signed in" };
  try {
    const r = await fetch("/api/run/floor-cleared", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ op: "admin_wipe_dev" }),
    });
    const data = await r.json().catch(() => ({} as { error?: string; scanned?: number; deleted?: number }));
    if (!r.ok) return { ok: false, error: data.error ?? `http ${r.status}` };
    return { ok: true, scanned: data.scanned, deleted: data.deleted };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

/** POST /api/energy/consume. Returns ok:false with the server's current amount on insufficient. */
export async function consumeServerEnergy(cost: number): Promise<ConsumeResult> {
  const tok = token();
  if (!tok) return { ok: false, error: "network" };
  try {
    const r = await fetch("/api/energy", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cost }),
    });
    if (r.status === 402) {
      const data = await r.json().catch(() => ({})) as { amount?: number; max?: number };
      const amount = typeof data.amount === "number" ? data.amount : 0;
      const max = typeof data.max === "number" ? data.max : 20;
      setEnergy(amount);
      return { ok: false, amount, max };
    }
    if (!r.ok) return { ok: false, error: "network" };
    const data = await r.json() as { ok: boolean; amount: number; max: number };
    setEnergy(data.amount);
    return data.ok
      ? { ok: true, amount: data.amount, max: data.max }
      : { ok: false, amount: data.amount, max: data.max };
  } catch {
    return { ok: false, error: "network" };
  }
}
