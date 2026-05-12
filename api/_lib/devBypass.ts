// Dev-only NFT-gate bypass. Wallets listed here can sign in and play on
// the dev build WITHOUT holding the gated NFT (MoTZ Coin) or the MoTZ
// Vault Key — used for testers who need full access on dev without
// minting / transferring real NFTs. Bypass is hard-gated to dev environments
// (KEY_PREFIX must be set) so this can NEVER bypass on production.

const DEV_BYPASS_WALLETS = new Set<string>([
  "0xdfc340da8a174f20c80f42767ebe1a59a960c1c3", // tester #1 — full access on dev
]);

/** True if the current runtime is the dev environment (server has KEY_PREFIX
 *  set, meaning this is the preview deployment, not production). */
function isDevEnvironment(): boolean {
  return (process.env.KEY_PREFIX ?? "").length > 0;
}

/** True if `address` should bypass NFT / MoTZ Key checks on this build.
 *  Always false on production. */
export function isDevBypassWallet(address: string): boolean {
  if (!isDevEnvironment()) return false;
  return DEV_BYPASS_WALLETS.has(address.toLowerCase());
}
