// Admin gating: only specific wallets can use dev controls.
// We read from the in-memory verified address (set by main.ts after the
// /api/auth/me round-trip), NOT from settings.walletAddress in localStorage.
// The settings field is user-editable, so trusting it would let anyone grant
// themselves admin by writing the admin address into their own settings.

import { getVerifiedAddress } from "../auth/session";

const ADMIN_WALLETS = new Set<string>([
  "0x7c5b15e5e361e7b91d2648256ac50bc561979f3c",
]);

export function isAdmin(): boolean {
  const addr = getVerifiedAddress();
  if (!addr) return false;
  return ADMIN_WALLETS.has(addr);
}
