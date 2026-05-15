// Per-wallet lifetime analytics — fuels the daily Google Sheet export.
//
// Three counters, one Redis hash each, atomic HINCRBY on every relevant event:
//   analytics:minutes            field=<wallet> value=cumulative minutes played
//   analytics:ron_spent          field=<wallet> value=lifetime RON spent on shop
//   analytics:vouchers_acquired  field=<wallet> value=lifetime RON value of vouchers earned
//
// "Remaining vouchers" is computed live from the wallet's shop inventory at
// export time (no separate counter — the inventory is already canonical).
//
// "Hours of playing" is derived from minutes / 60 in the export.

import { hincrBy, hgetAll, hmget, incrBy, getNumber } from "./redis.js";
import { readShopInventory, VOUCHER_VALUES_RON, IGN_HASH_KEY, getMaxFloorCleared } from "./runState.js";
import { computeWalletTotalXp } from "./progressVault.js";

export const ANALYTICS_MINUTES_KEY       = "analytics:minutes";
export const ANALYTICS_RON_SPENT_KEY     = "analytics:ron_spent";          // on-chain RON only
export const ANALYTICS_VOUCHERS_KEY      = "analytics:vouchers_acquired";  // lifetime drops + admin grants
export const ANALYTICS_VOUCHERS_SPENT_KEY = "analytics:vouchers_spent";    // RON value of voucher-path purchases
export const ANALYTICS_ENERGY_USED_KEY    = "analytics:energy_used";       // lifetime sum of consumed energy
/** Global shop revenue — sum of all on-chain RON payments that actually moved
 *  RON to the treasury wallet. Voucher-paid purchases are NOT counted here
 *  because they consume in-game vouchers, not real RON. Displayed on the
 *  Shop screen as "Total RON Earned by Shop". */
export const ANALYTICS_TOTAL_REVENUE_KEY = "analytics:total_ron_revenue";

/** Minutes-per-floor estimate. A campaign floor takes roughly 2 minutes:
 *  squad-select transitions + battle anim + summary card. Survival/raid floors
 *  run a bit faster but call into the same energy path, so 2 is a fair average. */
const MINUTES_PER_ENERGY = 2;

/** Add play time for a wallet based on energy consumed (1 energy ≈ 1 floor). */
export async function bumpMinutesPlayed(address: string, energySpent: number): Promise<void> {
  if (energySpent <= 0) return;
  await hincrBy(ANALYTICS_MINUTES_KEY, address.toLowerCase(), energySpent * MINUTES_PER_ENERGY).catch(() => 0);
}

/** Add to the lifetime energy-consumed counter. Called from consumeEnergy
 *  alongside bumpMinutesPlayed so both columns stay in sync. */
export async function bumpEnergyUsed(address: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  await hincrBy(ANALYTICS_ENERGY_USED_KEY, address.toLowerCase(), Math.floor(amount)).catch(() => 0);
}

/** Add to the lifetime RON-spent counter for ON-CHAIN purchases only. The
 *  voucher path uses bumpVouchersSpent instead so the sheet can break out
 *  real cash inflow vs in-game voucher redemption. */
export async function bumpRonSpent(address: string, ronAmount: number): Promise<void> {
  if (ronAmount <= 0) return;
  await hincrBy(ANALYTICS_RON_SPENT_KEY, address.toLowerCase(), Math.floor(ronAmount)).catch(() => 0);
}

/** Add to the lifetime vouchers-spent counter when a voucher-path purchase
 *  succeeds. Recorded as RON face value (the item's price, NOT the over-pay
 *  total — change is refunded and doesn't count). */
export async function bumpVouchersSpent(address: string, ronAmount: number): Promise<void> {
  if (ronAmount <= 0) return;
  await hincrBy(ANALYTICS_VOUCHERS_SPENT_KEY, address.toLowerCase(), Math.floor(ronAmount)).catch(() => 0);
}

/** Add to the GLOBAL shop revenue counter. Called only from the on-chain
 *  RON-payment path — voucher purchases don't count as revenue because
 *  vouchers were already paid for (or won) via earlier real RON purchases /
 *  in-game drops, not new RON flowing to the treasury. */
export async function bumpShopRevenue(ronAmount: number): Promise<void> {
  if (ronAmount <= 0) return;
  await incrBy(ANALYTICS_TOTAL_REVENUE_KEY, Math.floor(ronAmount)).catch(() => 0);
}

/** Read the global shop revenue total (real RON earned). */
export async function readShopRevenue(): Promise<number> {
  return await getNumber(ANALYTICS_TOTAL_REVENUE_KEY);
}

/** Add to lifetime vouchers-acquired (in RON value) when drops are credited.
 *  Server-side roll → server-side increment; the client cannot influence it. */
export async function bumpVouchersAcquired(address: string, ronValue: number): Promise<void> {
  if (ronValue <= 0) return;
  await hincrBy(ANALYTICS_VOUCHERS_KEY, address.toLowerCase(), Math.floor(ronValue)).catch(() => 0);
}

export interface WalletAnalyticsRow {
  wallet: string;
  ign: string;
  hoursOfPlaying: number;
  /** Lifetime XP earned across every unit on this wallet — computed live
   *  from the canonical progress vault. */
  totalXpEarned: number;
  /** Lifetime RON spent via on-chain Ronin txs only. */
  ronSpentOnShop: number;
  /** Lifetime RON value of vouchers acquired from drops + admin grants. */
  ronVouchersAcquired: number;
  /** Lifetime RON value of voucher-path shop purchases. */
  ronVouchersSpent: number;
  /** Current voucher RON value still sitting in inventory. */
  remainingRonVouchers: number;
  /** Highest floor cleared in campaign mode (1-50). */
  highestFloorCleared: number;
  /** Lifetime energy units consumed (campaign / survival / boss raid combined). */
  energyUsed: number;
}

/** Build the full export — one row per wallet that has played at least once.
 *  Wallets are sourced from the union of the three analytics hashes' fields,
 *  so even a wallet that's never spent RON but has played minutes shows up.
 *  IGN is looked up from the existing IGN hash (legacy storage). */
export async function buildAnalyticsExport(): Promise<WalletAnalyticsRow[]> {
  const [minutesMap, spentMap, acquiredMap, vouchersSpentMap, energyUsedMap] = await Promise.all([
    hgetAll(ANALYTICS_MINUTES_KEY),
    hgetAll(ANALYTICS_RON_SPENT_KEY),
    hgetAll(ANALYTICS_VOUCHERS_KEY),
    hgetAll(ANALYTICS_VOUCHERS_SPENT_KEY),
    hgetAll(ANALYTICS_ENERGY_USED_KEY),
  ]);
  const wallets = new Set<string>([
    ...Object.keys(minutesMap),
    ...Object.keys(spentMap),
    ...Object.keys(acquiredMap),
    ...Object.keys(vouchersSpentMap),
    ...Object.keys(energyUsedMap),
  ]);
  if (wallets.size === 0) return [];

  const walletList = Array.from(wallets);
  const igns = await hmget(IGN_HASH_KEY, walletList);

  const rows = await Promise.all(walletList.map(async (wallet, i) => {
    const minutes = Number(minutesMap[wallet] ?? 0);
    const spent   = Number(spentMap[wallet] ?? 0);
    const acquired = Number(acquiredMap[wallet] ?? 0);
    const vouchersSpent = Number(vouchersSpentMap[wallet] ?? 0);
    const energyUsedHash = Number(energyUsedMap[wallet] ?? 0);
    // Live computation of remaining voucher value, total XP earned, and
    // the highest floor cleared. All three read per-wallet keys, so they
    // run in parallel.
    const [inv, totalXp, highestFloor] = await Promise.all([
      readShopInventory(wallet).catch(() => null),
      computeWalletTotalXp(wallet).catch(() => 0),
      getMaxFloorCleared(wallet).catch(() => 0),
    ]);
    let remaining = 0;
    if (inv && inv.vouchers) {
      remaining =
        (inv.vouchers.t1 ?? 0) * VOUCHER_VALUES_RON.t1 +
        (inv.vouchers.t2 ?? 0) * VOUCHER_VALUES_RON.t2 +
        (inv.vouchers.t3 ?? 0) * VOUCHER_VALUES_RON.t3 +
        (inv.vouchers.t4 ?? 0) * VOUCHER_VALUES_RON.t4 +
        (inv.vouchers.t5 ?? 0) * VOUCHER_VALUES_RON.t5;
    }
    // Energy reconciliation: minutes is incremented by cost × MINUTES_PER_ENERGY
    // on every consumeEnergy call, so `minutes / MINUTES_PER_ENERGY` is the
    // canonical lifetime energy spend. The dedicated energy_used counter was
    // added later, so it may lag for wallets that played before that deploy.
    // Take the LARGER of the two so historical play counts correctly.
    const energyFromMinutes = Math.floor(minutes / MINUTES_PER_ENERGY);
    const energyUsed = Math.max(energyUsedHash, energyFromMinutes);
    return {
      wallet,
      ign: igns[i] ?? "",
      hoursOfPlaying: Math.round((minutes / 60) * 100) / 100, // 2 decimals
      totalXpEarned: totalXp,
      ronSpentOnShop: spent,
      ronVouchersAcquired: acquired,
      ronVouchersSpent: vouchersSpent,
      remainingRonVouchers: remaining,
      highestFloorCleared: highestFloor,
      energyUsed,
    } satisfies WalletAnalyticsRow;
  }));

  // Sort by total XP earned desc — most-progressed wallets at the top.
  rows.sort((a, b) => b.totalXpEarned - a.totalXpEarned);
  return rows;
}

/** Full export bundle — per-wallet rows PLUS the global shop-revenue total
 *  so the daily sheet sync can write both in one round-trip. */
export interface AnalyticsExportBundle {
  rows: WalletAnalyticsRow[];
  totalShopRevenue: number;
  generatedAt: number;
}
export async function buildAnalyticsExportBundle(): Promise<AnalyticsExportBundle> {
  const [rows, totalShopRevenue] = await Promise.all([
    buildAnalyticsExport(),
    readShopRevenue(),
  ]);
  return { rows, totalShopRevenue, generatedAt: Date.now() };
}

/** Render rows as a CSV string. Columns mirror the user's Google Sheet exactly:
 *  Wallet | IGN | Hours of Playing | Total XP Earned | RON Spent on Shop |
 *  RON Vouchers Acquired | RON Vouchers Spent | Remaining RON Vouchers
 *  RFC 4180-ish: comma-separated, double-quote escape, CRLF line endings. */
export function rowsToCsv(rows: WalletAnalyticsRow[]): string {
  const header = [
    "Wallet", "IGN", "Hours of Playing", "Total XP Earned",
    "RON Spent on Shop", "bRON Vouchers Acquired", "bRON Vouchers Spent",
    "Remaining bRON Vouchers", "Highest Floor Cleared", "Energy Used",
  ];
  const esc = (v: string | number): string => {
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.map(esc).join(",")];
  for (const r of rows) {
    lines.push([
      r.wallet, r.ign,
      r.hoursOfPlaying, r.totalXpEarned,
      r.ronSpentOnShop, r.ronVouchersAcquired, r.ronVouchersSpent,
      r.remainingRonVouchers,
      r.highestFloorCleared, r.energyUsed,
    ].map(esc).join(","));
  }
  return lines.join("\r\n");
}
