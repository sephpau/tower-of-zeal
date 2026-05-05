// Admin gating: only specific wallets can use dev controls.
// Compared case-insensitively since Ethereum addresses are mixed-case for checksums.

import { loadSettings } from "../ui/settings";

const ADMIN_WALLETS = new Set<string>([
  "0x7c5b15e5e361e7b91d2648256ac50bc561979f3c",
]);

export function isAdmin(): boolean {
  try {
    const s = loadSettings();
    return ADMIN_WALLETS.has(s.walletAddress.trim().toLowerCase());
  } catch {
    return false;
  }
}
