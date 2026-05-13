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
  | "buff_battle_cry" | "buff_vital_surge" | "buff_mana_wellspring"
  | "buff_phoenix_embers" | "buff_scholars_insight" | "buff_lucky_coin";

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
  // ---- Energy refills ----
  { id: "energy_5",  name: "+5 Energy Refill",  description: "Instantly restore 5 energy.",  category: "energy", priceLabel: "Price soon · $crypto" },
  { id: "energy_10", name: "+10 Energy Refill", description: "Instantly restore 10 energy.", category: "energy", priceLabel: "Price soon · $crypto" },
  { id: "energy_20", name: "+20 Energy Refill", description: "Instantly restore 20 energy.", category: "energy", priceLabel: "Price soon · $crypto" },

  // ---- Unit-utility entitlements (server grants a token; client UI lets player spend it) ----
  { id: "unit_stat_reset",   name: "Unit Stat Reset",   description: "Refund all custom stat points on a single unit. Pick the unit from the Units screen after buying.", category: "unit", priceLabel: "Price soon · $crypto" },
  { id: "unit_class_change", name: "Unit Class Change", description: "Change one unit's class. Custom stats are reset to keep build economy fair.", category: "unit", priceLabel: "Price soon · $crypto" },

  // ---- Campaign-run buffs (one consumed per run start when slotted) ----
  { id: "buff_battle_cry",        name: "Battle Cry",        description: "All units start the floor with a full ATB gauge. Front-load damage on hard floors.", category: "buff", priceLabel: "Price soon · $crypto" },
  { id: "buff_vital_surge",       name: "Vital Surge",       description: "Party starts at +20% maxHP overheal. Decays as damage is taken.", category: "buff", priceLabel: "Price soon · $crypto", comingSoon: true },
  { id: "buff_mana_wellspring",   name: "Mana Wellspring",   description: "Party starts with full MP — open with big skills.", category: "buff", priceLabel: "Price soon · $crypto", comingSoon: true },
  { id: "buff_phoenix_embers",    name: "Phoenix Embers",    description: "Auto-revive the first ally to fall at 50% HP. One use per run.", category: "buff", priceLabel: "Price soon · $crypto", comingSoon: true },
  { id: "buff_scholars_insight",  name: "Scholar's Insight", description: "+25% XP from the next floor cleared.", category: "buff", priceLabel: "Price soon · $crypto", comingSoon: true },
  { id: "buff_lucky_coin",        name: "Lucky Coin",        description: "+5% crit chance for the entire run.", category: "buff", priceLabel: "Price soon · $crypto", comingSoon: true },
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
  /** For energy refill items, the new server-side balance. */
  newEnergyAmount?: number;
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
    const data = await r.json().catch(() => ({} as { ok?: boolean; reason?: string; grant?: { type: string; amount?: number } }));
    if (r.status === 429) return { ok: false, reason: data.reason ?? "already bought today" };
    if (!r.ok) return { ok: false, reason: typeof data.reason === "string" ? data.reason : `http ${r.status}` };
    if (data.grant?.type === "energy" && typeof data.grant.amount === "number") {
      setEnergy(data.grant.amount);
      return { ok: true, newEnergyAmount: data.grant.amount };
    }
    return { ok: !!data.ok };
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
