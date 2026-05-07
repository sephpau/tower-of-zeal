// Server-side admin gate. Mirrors the wallet list in src/core/admin.ts
// Used by privileged server ops like leaderboard resets.

const ADMIN_WALLETS = new Set<string>([
  "0x7c5b15e5e361e7b91d2648256ac50bc561979f3c",
]);

export function isAdmin(address: string): boolean {
  return ADMIN_WALLETS.has(address.trim().toLowerCase());
}
