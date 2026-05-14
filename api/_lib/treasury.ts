// Treasury wallet — destination address for RON payments from the shop.
//
// The address itself is public knowledge (it appears in the player's wallet
// transaction confirmation when they buy). What MUST stay private is the
// signing key for this wallet — that lives in a separate vault / hardware
// signer and never touches the server.
//
// Source of truth: env var TREASURY_WALLET. The fallback below is the
// configured shop treasury so dev environments work without env setup, but
// production should always set TREASURY_WALLET explicitly so an accidental
// code rebase can't silently change the destination.

import { getAddress } from "viem";

const TREASURY_FALLBACK = "0xfD0F26Ac22Cc5bcd302C3c1140f15d37699097b6";

/** Canonical EIP-55 checksummed treasury address for RON shop payments. */
export const TREASURY_WALLET: `0x${string}` = getAddress(
  process.env.TREASURY_WALLET ?? TREASURY_FALLBACK,
) as `0x${string}`;

/** Returns true if `addr` (any casing) matches the treasury wallet. */
export function isTreasuryAddress(addr: string): boolean {
  try {
    return getAddress(addr) === TREASURY_WALLET;
  } catch {
    return false;
  }
}
