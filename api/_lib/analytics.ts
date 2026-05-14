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
import { readShopInventory, VOUCHER_VALUES_RON, IGN_HASH_KEY } from "./runState.js";

export const ANALYTICS_MINUTES_KEY    = "analytics:minutes";
export const ANALYTICS_RON_SPENT_KEY  = "analytics:ron_spent";
export const ANALYTICS_VOUCHERS_KEY   = "analytics:vouchers_acquired";
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

/** Add to the lifetime RON-spent counter when a shop purchase succeeds.
 *  Both the RON-tx path and the voucher path call this — vouchers are RON-
 *  denominated currency, so spending them counts as RON spent. */
export async function bumpRonSpent(address: string, ronAmount: number): Promise<void> {
  if (ronAmount <= 0) return;
  await hincrBy(ANALYTICS_RON_SPENT_KEY, address.toLowerCase(), Math.floor(ronAmount)).catch(() => 0);
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
  ronSpentOnShop: number;
  ronVouchersAcquired: number;
  remainingRonVouchers: number;
}

/** Build the full export — one row per wallet that has played at least once.
 *  Wallets are sourced from the union of the three analytics hashes' fields,
 *  so even a wallet that's never spent RON but has played minutes shows up.
 *  IGN is looked up from the existing IGN hash (legacy storage). */
export async function buildAnalyticsExport(): Promise<WalletAnalyticsRow[]> {
  const [minutesMap, spentMap, acquiredMap] = await Promise.all([
    hgetAll(ANALYTICS_MINUTES_KEY),
    hgetAll(ANALYTICS_RON_SPENT_KEY),
    hgetAll(ANALYTICS_VOUCHERS_KEY),
  ]);
  const wallets = new Set<string>([
    ...Object.keys(minutesMap),
    ...Object.keys(spentMap),
    ...Object.keys(acquiredMap),
  ]);
  if (wallets.size === 0) return [];

  const walletList = Array.from(wallets);
  const igns = await hmget(IGN_HASH_KEY, walletList);

  const rows = await Promise.all(walletList.map(async (wallet, i) => {
    const minutes = Number(minutesMap[wallet] ?? 0);
    const spent   = Number(spentMap[wallet] ?? 0);
    const acquired = Number(acquiredMap[wallet] ?? 0);
    // Live computation of remaining voucher value.
    const inv = await readShopInventory(wallet).catch(() => null);
    let remaining = 0;
    if (inv && inv.vouchers) {
      remaining =
        (inv.vouchers.t1 ?? 0) * VOUCHER_VALUES_RON.t1 +
        (inv.vouchers.t2 ?? 0) * VOUCHER_VALUES_RON.t2 +
        (inv.vouchers.t3 ?? 0) * VOUCHER_VALUES_RON.t3 +
        (inv.vouchers.t4 ?? 0) * VOUCHER_VALUES_RON.t4 +
        (inv.vouchers.t5 ?? 0) * VOUCHER_VALUES_RON.t5;
    }
    return {
      wallet,
      ign: igns[i] ?? "",
      hoursOfPlaying: Math.round((minutes / 60) * 100) / 100, // 2 decimals
      ronSpentOnShop: spent,
      ronVouchersAcquired: acquired,
      remainingRonVouchers: remaining,
    } satisfies WalletAnalyticsRow;
  }));

  // Sort by hours played desc — most-active wallets at the top.
  rows.sort((a, b) => b.hoursOfPlaying - a.hoursOfPlaying);
  return rows;
}

/** Render rows as a CSV string. RFC 4180-ish: comma-separated, double-quote
 *  escape fields containing commas/quotes/newlines, CRLF line endings. */
export function rowsToCsv(rows: WalletAnalyticsRow[]): string {
  const header = ["#", "Wallet", "IGN", "Hours of Playing", "RON Spent on Shop", "RON Vouchers Acquired", "Remaining RON Vouchers"];
  const esc = (v: string | number): string => {
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.map(esc).join(",")];
  rows.forEach((r, i) => {
    lines.push([
      i + 1,
      r.wallet,
      r.ign,
      r.hoursOfPlaying,
      r.ronSpentOnShop,
      r.ronVouchersAcquired,
      r.remainingRonVouchers,
    ].map(esc).join(","));
  });
  return lines.join("\r\n");
}
