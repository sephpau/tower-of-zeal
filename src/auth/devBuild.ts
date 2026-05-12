// Dev-build gate. When `VITE_DEV_BUILD=1` is set at build time (via Vercel
// Preview environment variables), only wallet addresses in DEV_TESTERS are
// allowed to sign in. Production builds (main branch on Vercel) leave the
// env var unset so anyone can play.
//
// The allowlist itself isn't sensitive — wallet addresses are public. We
// hardcode it here so testers can be added/removed via a normal PR rather
// than a Vercel dashboard edit.

/** Lowercase wallet addresses allowed on dev builds. Edit this list to grant
 *  access. Production builds ignore it entirely. */
export const DEV_TESTERS: ReadonlySet<string> = new Set<string>([
  // Admin wallet (also has admin powers on prod).
  "0x7c5b15e5e361e7b91d2648256ac50bc561979f3c",
  // Add additional dev tester addresses here, lowercased.
]);

/** True if this build was compiled with VITE_DEV_BUILD=1. */
export function isDevBuild(): boolean {
  return import.meta.env.VITE_DEV_BUILD === "1";
}

/** True if `address` is allowed to sign in on this build. Always true on
 *  production builds; only DEV_TESTERS entries pass on dev builds. */
export function isAllowedOnDev(address: string): boolean {
  if (!isDevBuild()) return true;
  return DEV_TESTERS.has(address.toLowerCase());
}
