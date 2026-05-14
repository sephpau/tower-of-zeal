import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifySession } from "./_lib/jwt.js";
import { getEnergy, consumeEnergy, msUntilNextRefill } from "./_lib/energy.js";
import { isSeasonHalted, SEASON_HALTED_RESPONSE } from "./_lib/season.js";

// Combined energy endpoint to stay under the Vercel Hobby 12-function cap.
// GET  /api/energy           — current balance + next refill timer
// POST /api/energy { cost }  — atomically deducts; 402 on insufficient
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
    if (req.method === "GET") {
      const e = await getEnergy(address);
      res.status(200).json({ amount: e.amount, max: e.max, msUntilRefill: msUntilNextRefill() });
      return;
    }
    if (req.method === "POST") {
      // Energy spend gates the start of every campaign floor — block during
      // season halt. GET is left alone so players can still see their balance.
      if (await isSeasonHalted()) {
        res.status(SEASON_HALTED_RESPONSE.status).json(SEASON_HALTED_RESPONSE.body);
        return;
      }
      const body = (req.body ?? {}) as { cost?: unknown };
      const cost = typeof body.cost === "number" ? Math.floor(body.cost) : null;
      if (cost === null || cost < 0 || cost > 50) { res.status(400).json({ error: "cost out of range" }); return; }
      const result = await consumeEnergy(address, cost);
      res.status(result.ok ? 200 : 402).json(result);
      return;
    }
    res.status(405).json({ error: "method" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "server error" });
  }
}
