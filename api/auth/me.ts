import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAddress } from "viem";
import { verifySession } from "../_lib/jwt.js";
import { holdsMotzKey } from "../_lib/ronin.js";
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
    // Re-check key holding on every session validate so users who buy/sell the
    // key see the gate update without needing to reauthenticate. Dev tester
    // wallets are granted the perk unconditionally on dev so the client UI
    // doesn't lock units that require the MoTZ Vault Key.
    const motzKey = isDevBypassWallet(address)
      ? true
      : await holdsMotzKey(address).catch(() => false);
    res.status(200).json({ address: payload.address, perks: { motzKey } });
  } catch {
    res.status(401).json({ error: "invalid session" });
  }
}
