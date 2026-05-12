import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAddress } from "viem";
import { verifySession } from "../_lib/jwt.js";
import { holdsAnyGatedNft, holdsMotzKey } from "../_lib/ronin.js";
import { isDevBypassWallet } from "../_lib/devBypass.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "no token" });
    return;
  }
  const token = auth.slice("Bearer ".length);
  try {
    const payload = await verifySession(token);
    const address = getAddress(payload.address);
    const bypass = isDevBypassWallet(address);
    // Re-check that the wallet STILL holds the gated NFT. Issued sessions are
    // valid for 24h, so without this a player who transfers/sells their NFT
    // after signing in could keep playing until expiry. Re-validating on every
    // session check (called by the client periodically) revokes access almost
    // immediately. Dev-bypass wallets skip this on dev environments only.
    if (!bypass) {
      const stillHolds = await holdsAnyGatedNft(address).catch(() => false);
      if (!stillHolds) {
        res.status(403).json({ error: "wallet no longer holds required NFT" });
        return;
      }
    }
    // Re-check key holding too so the locked-unit overlay updates if the key
    // is sold/transferred mid-session.
    const motzKey = bypass
      ? true
      : await holdsMotzKey(address).catch(() => false);
    res.status(200).json({ address: payload.address, perks: { motzKey } });
  } catch {
    res.status(401).json({ error: "invalid session" });
  }
}
