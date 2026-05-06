import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifySession } from "../_lib/jwt.js";
import { consumeEnergy } from "../_lib/energy.js";

// Body: { cost: number }
// 200 ok=true on success, 402 insufficient, 401 unauth.
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) { res.status(401).json({ error: "no token" }); return; }

  const body = (req.body ?? {}) as { cost?: unknown };
  const cost = typeof body.cost === "number" ? Math.floor(body.cost) : null;
  if (cost === null || cost < 0 || cost > 50) { res.status(400).json({ error: "cost out of range" }); return; }

  let address: string;
  try {
    const session = await verifySession(auth.slice("Bearer ".length));
    address = session.address;
  } catch {
    res.status(401).json({ error: "invalid session" }); return;
  }

  try {
    const result = await consumeEnergy(address, cost);
    res.status(result.ok ? 200 : 402).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "server error" });
  }
}
