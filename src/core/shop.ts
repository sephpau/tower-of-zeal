// Shop client wrapper. All endpoints go through /api/run/floor-cleared with
// dedicated `op` values, matching the existing pattern. Every purchase is
// server-authoritative — devtools localStorage edits cannot bypass the
// daily-buy or daily-attempt caps.

import { loadSession } from "../auth/session";
import { setEnergy } from "./energy";

function token(): string | null { return loadSession()?.token ?? null; }

export type ShopItemId =
  | "energy_5" | "energy_10" | "energy_20"
  | "unit_stat_reset" | "unit_class_change"
  | "buff_battle_cry" | "buff_phoenix_embers" | "buff_scholars_insight"
  | "buff_quickdraw" | "buff_last_stand";

export interface ShopItemDef {
  id: ShopItemId;
  name: string;
  description: string;
  category: "energy" | "unit" | "buff";
  /** Display string. Real crypto payment wiring is pending — items currently
   *  cost nothing (beta access) but the UI labels them as paid. */
  priceLabel: string;
  /** True if the item is genuinely live; false → display only ("Coming soon"). */
  comingSoon?: boolean;
}

export const SHOP_CATALOG: ShopItemDef[] = [
  // ---- Energy refills (consumed from Inventory, not instant) ----
  { id: "energy_5",  name: "+5 Energy Pack",  description: "A refill pack. Added to your Inventory — open the Backpack icon to use it and restore 5 energy.",  category: "energy", priceLabel: "Price soon · $crypto" },
  { id: "energy_10", name: "+10 Energy Pack", description: "A refill pack. Added to your Inventory — open the Backpack icon to use it and restore 10 energy.", category: "energy", priceLabel: "Price soon · $crypto" },
  { id: "energy_20", name: "+20 Energy Pack", description: "A refill pack. Added to your Inventory — open the Backpack icon to use it and restore 20 energy.", category: "energy", priceLabel: "Price soon · $crypto" },

  // ---- Unit-utility entitlements (server grants a token; client UI lets player spend it) ----
  { id: "unit_stat_reset",   name: "Unit Stat Reset",   description: "Refund all custom stat points on a single unit. Pick the unit from the Units screen after buying.", category: "unit", priceLabel: "Price soon · $crypto" },
  { id: "unit_class_change", name: "Unit Class Change", description: "Change one unit's class. Custom stats are reset to keep build economy fair.", category: "unit", priceLabel: "Price soon · $crypto" },

  // ---- Campaign-run buffs (one consumed per run start when slotted) ----
  { id: "buff_battle_cry",       name: "Battle Cry",        description: "Grants 3 charges per purchase. Slot one before any battle to start that floor with all player ATB gauges full.", category: "buff", priceLabel: "Price soon · $crypto" },
  { id: "buff_phoenix_embers",   name: "Phoenix Embers",    description: "Grants 2 charges per purchase. Slot one for a run — auto-revives the first ally to fall at 50% HP. One revive per battle.", category: "buff", priceLabel: "Price soon · $crypto" },
  { id: "buff_scholars_insight", name: "Scholar's Insight", description: "Grants 10 charges per purchase. Slot one before a battle to gain +25% XP on the CURRENT floor only (does not carry to other floors).", category: "buff", priceLabel: "Price soon · $crypto" },
  { id: "buff_quickdraw",        name: "Quickdraw",         description: "Grants 1 charge per purchase. Slot one for a run — player ATB gauges fill 25% faster for the entire run.", category: "buff", priceLabel: "Price soon · $crypto" },
  { id: "buff_last_stand",       name: "Last Stand",        description: "Grants 2 charges per purchase. Slot one for a run — when only one of your units remains alive on the battlefield, that unit's damage is doubled.", category: "buff", priceLabel: "Price soon · $crypto" },
];

export interface ShopStatus {
  inventory: { buffs: Partial<Record<ShopItemId, number>> };
  boughtToday: Partial<Record<ShopItemId, boolean>>;
}

export async function fetchShopStatus(): Promise<ShopStatus | null> {
  const tok = token();
  if (!tok) return null;
  try {
    const r = await fetch("/api/run/floor-cleared", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ op: "shop_status" }),
    });
    if (!r.ok) return null;
    const data = await r.json() as { inventory: { buffs: Partial<Record<ShopItemId, number>> }; boughtToday: Partial<Record<ShopItemId, boolean>> };
    return { inventory: data.inventory, boughtToday: data.boughtToday };
  } catch { return null; }
}

export interface BuyResult {
  ok: boolean;
  reason?: string;
}

export async function buyShopItem(item: ShopItemId): Promise<BuyResult> {
  const tok = token();
  if (!tok) return { ok: false, reason: "not signed in" };
  try {
    const r = await fetch("/api/run/floor-cleared", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ op: "shop_buy", item }),
    });
    const data = await r.json().catch(() => ({} as { ok?: boolean; reason?: string }));
    if (r.status === 429) return { ok: false, reason: data.reason ?? "already bought today" };
    if (!r.ok) return { ok: false, reason: typeof data.reason === "string" ? data.reason : `http ${r.status}` };
    // Every purchase now goes to inventory — energy packs are NOT auto-applied.
    // The player must visit Inventory and click Use to spend an energy pack.
    return { ok: !!data.ok };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/** Consume one energy pack from inventory. Server decrements + grants energy. */
export async function useEnergyItem(item: "energy_5" | "energy_10" | "energy_20"): Promise<{ ok: boolean; amount?: number; reason?: string }> {
  const tok = token();
  if (!tok) return { ok: false, reason: "not signed in" };
  try {
    const r = await fetch("/api/run/floor-cleared", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ op: "inventory_use_energy", item }),
    });
    const data = await r.json().catch(() => ({} as { ok?: boolean; amount?: number; reason?: string }));
    if (!r.ok) return { ok: false, reason: typeof data.reason === "string" ? data.reason : `http ${r.status}` };
    if (typeof data.amount === "number") setEnergy(data.amount);
    return { ok: !!data.ok, amount: data.amount };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export async function consumeShopItem(item: ShopItemId): Promise<boolean> {
  const tok = token();
  if (!tok) return false;
  try {
    const r = await fetch("/api/run/floor-cleared", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ op: "shop_consume", item }),
    });
    if (!r.ok) return false;
    const data = await r.json() as { ok: boolean };
    return !!data.ok;
  } catch { return false; }
}

// ---- Daily attempts (Survival / Boss Raid 3/day cap) ----

export type AttemptsMode = "survival" | "boss_raid";
export interface AttemptsStatus { used: number; remaining: number; max: number; }

export async function fetchAttemptsStatus(mode: AttemptsMode): Promise<AttemptsStatus | null> {
  const tok = token();
  if (!tok) return null;
  try {
    const r = await fetch("/api/run/floor-cleared", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ op: "attempts_status", mode }),
    });
    if (!r.ok) return null;
    const data = await r.json() as AttemptsStatus;
    return data;
  } catch { return null; }
}

/** Atomically consume one attempt slot. Returns null on network failure,
 *  { ok: false, ... } when the cap is already reached. */
export async function claimAttempt(mode: AttemptsMode): Promise<{ ok: boolean; remaining: number } | null> {
  const tok = token();
  if (!tok) return null;
  try {
    const r = await fetch("/api/run/floor-cleared", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ op: "attempts_claim", mode }),
    });
    const data = await r.json().catch(() => ({})) as { ok?: boolean; remaining?: number };
    if (r.status === 429) return { ok: false, remaining: 0 };
    if (!r.ok) return null;
    return { ok: !!data.ok, remaining: typeof data.remaining === "number" ? data.remaining : 0 };
  } catch { return null; }
}
