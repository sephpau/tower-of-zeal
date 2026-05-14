// Shop client wrapper. All endpoints go through /api/run/floor-cleared with
// dedicated `op` values, matching the existing pattern. Every purchase is
// server-authoritative — devtools localStorage edits cannot bypass the
// daily-buy or daily-attempt caps.

import { loadSession } from "../auth/session";
import { setEnergy } from "./energy";

function token(): string | null { return loadSession()?.token ?? null; }

// ---- Treasury wallet ----
// Destination address for RON shop payments. When payment integration is
// wired, the client will build a tx whose `to` field equals this address
// and post the signed tx hash to the server for verification.
// Source of truth lives on the server (api/_lib/treasury.ts); the value
// is duplicated here only so the client can pre-fill the wallet popup —
// the SERVER is the one that validates the actual tx's `to` field matches
// before granting the item, so a tampered client value just makes purchases
// fail rather than succeeding against the wrong address.
export const TREASURY_WALLET: `0x${string}` = "0xfD0F26Ac22Cc5bcd302C3c1140f15d37699097b6";

export type ShopItemId =
  | "energy_5" | "energy_10" | "energy_20"
  | "unit_stat_reset" | "unit_class_change" | "unit_temp_motz_key"
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
  { id: "energy_5",  name: "+5 Energy Pack",  description: "A refill pack. Added to your Inventory — open the Backpack icon to use it and restore 5 energy.",  category: "energy", priceLabel: "5 RON" },
  { id: "energy_10", name: "+10 Energy Pack", description: "A refill pack. Added to your Inventory — open the Backpack icon to use it and restore 10 energy.", category: "energy", priceLabel: "10 RON" },
  { id: "energy_20", name: "+20 Energy Pack", description: "A refill pack. Added to your Inventory — open the Backpack icon to use it and restore 20 energy.", category: "energy", priceLabel: "20 RON" },

  // ---- Unit-utility entitlements (server grants a token; client UI lets player spend it) ----
  { id: "unit_stat_reset",   name: "Unit Stat Reset",   description: "Refund all custom stat points on a single unit. Pick the unit from the Units screen after buying.", category: "unit", priceLabel: "10 RON" },
  { id: "unit_class_change", name: "Unit Class Change", description: "Change one unit's class. Custom stats are reset to keep build economy fair.", category: "unit", priceLabel: "10 RON" },
  { id: "unit_temp_motz_key", name: "Temporary MoTZ Key (10-Day Seasonal Pass)", description: "Unlocks all MoTZ-key locked units (Hera, Nova, Oge, Shego) for 10 days. Stacks if you buy again before it expires. Activates immediately on purchase — does not require the on-chain key.", category: "unit", priceLabel: "40 RON" },

  // ---- Campaign-run buffs (one consumed per run start when slotted) ----
  { id: "buff_battle_cry",       name: "Battle Cry",        description: "Grants 3 charges per purchase. Choose one before any battle to start that floor with all player ATB gauges full.", category: "buff", priceLabel: "10 RON" },
  { id: "buff_phoenix_embers",   name: "Phoenix Embers",    description: "Grants 2 charges per purchase. Choose one for a run — auto-revives the first ally to fall at 50% HP. One revive per battle.", category: "buff", priceLabel: "10 RON" },
  { id: "buff_scholars_insight", name: "Scholar's Insight", description: "Grants 10 charges per purchase. Choose one before a battle to gain +25% XP on the CURRENT floor only (does not carry to other floors).", category: "buff", priceLabel: "10 RON" },
  { id: "buff_quickdraw",        name: "Quickdraw",         description: "Grants 1 charge per purchase. Choose one for a run — player ATB gauges fill 25% faster for the entire run.", category: "buff", priceLabel: "10 RON" },
  { id: "buff_last_stand",       name: "Last Stand",        description: "Grants 2 charges per purchase. Choose one for a run — when only one of your units remains alive on the battlefield, that unit's damage is doubled.", category: "buff", priceLabel: "10 RON" },
];

export interface ShopStatus {
  inventory: {
    buffs: Partial<Record<ShopItemId, number>>;
    vouchers?: { t1?: number; t2?: number; t3?: number; t4?: number; t5?: number };
  };
  boughtToday: Partial<Record<ShopItemId, boolean>>;
  /** State of the seasonal pass — if active, expiresAt is a UTC timestamp. */
  tempMotzKey: { active: boolean; expiresAt?: number };
  /** Per-item RON prices in wei (stringified). Used to build the wallet tx
   *  when the player clicks Buy. Server is the source of truth — client never
   *  hardcodes prices in critical paths. */
  pricesWei: Partial<Record<ShopItemId, string>>;
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
    const data = await r.json() as {
      inventory: {
        buffs: Partial<Record<ShopItemId, number>>;
        vouchers?: { t1?: number; t2?: number; t3?: number; t4?: number; t5?: number };
      };
      boughtToday: Partial<Record<ShopItemId, boolean>>;
      tempMotzKey?: { active: boolean; expiresAt?: number };
      pricesWei?: Partial<Record<ShopItemId, string>>;
    };
    return {
      inventory: data.inventory,
      boughtToday: data.boughtToday,
      tempMotzKey: data.tempMotzKey ?? { active: false },
      pricesWei: data.pricesWei ?? {},
    };
  } catch { return null; }
}

export interface BuyResult {
  ok: boolean;
  reason?: string;
  /** True iff the server returned 202 — tx broadcast but RPC node hasn't
   *  indexed the receipt yet. Caller should wait and retry with the same hash. */
  pending?: boolean;
}

/** Submit a purchase. `txHash` is the Ronin payment tx hash from the wallet —
 *  required server-side, where the receipt is verified against the treasury
 *  wallet and the item's price before any grant happens. */
export async function buyShopItem(item: ShopItemId, txHash: `0x${string}`): Promise<BuyResult> {
  const tok = token();
  if (!tok) return { ok: false, reason: "not signed in" };
  try {
    const r = await fetch("/api/run/floor-cleared", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ op: "shop_buy", item, txHash }),
    });
    const data = await r.json().catch(() => ({} as { ok?: boolean; reason?: string; pending?: boolean }));
    if (r.status === 429) return { ok: false, reason: data.reason ?? "already bought today" };
    // 202 Accepted → tx is on-chain but receipt not yet visible. Caller
    // should poll. Daily-cap key was NOT bumped on the server, so retries
    // are safe.
    if (r.status === 202) return { ok: false, pending: true, reason: data.reason ?? "transaction still pending" };
    // 402 Payment Required → tx verification failed (bad to/from/value, used hash, reverted, etc.)
    if (r.status === 402) return { ok: false, reason: data.reason ?? "payment verification failed" };
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

// ---- RON voucher drops ----

export interface BronRollResult {
  drops: { t1: number; t2: number; t3: number; t4: number; t5: number; total: number };
  killsCounted: number;
  bossKillsCounted: number;
}

/** Server-authoritative RON roll: client reports kill totals by tier,
 *  server rolls drops + credits balance. Drop randomness lives entirely
 *  server-side (Node crypto RNG), so devtools cannot mint vouchers.
 *  Multipliers per tier (server-applied):
 *    mob = 1×, boss = 2×, world_ender = 4×. */
export async function rollBron(kills: number, bossKills: number, worldEnderKills: number): Promise<BronRollResult | null> {
  const tok = token();
  if (!tok) return null;
  if (!Number.isFinite(kills) || kills < 0) return null;
  if (!Number.isFinite(bossKills) || bossKills < 0) return null;
  if (!Number.isFinite(worldEnderKills) || worldEnderKills < 0) return null;
  try {
    const r = await fetch("/api/run/floor-cleared", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ op: "bron_roll", kills, bossKills, worldEnderKills }),
    });
    if (!r.ok) return null;
    const data = await r.json() as BronRollResult;
    return data;
  } catch { return null; }
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
