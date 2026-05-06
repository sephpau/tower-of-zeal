import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifySession } from "../_lib/jwt.js";
import { getEnergy, msUntilNextRefill } from "../_lib/energy.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) { res.status(401).json({ error: "no token" }); return; }

  let address: string;
  try {
    const session = await verifySession(auth.slice("Bearer ".length));
    address = session.address;
  } catch {
    res.status(401).json({ error: "invalid session" }); return;
  }

  try {
    const e = await getEnergy(address);
    res.status(200).json({ amount: e.amount, max: e.max, msUntilRefill: msUntilNextRefill() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "server error" });
  }
}
