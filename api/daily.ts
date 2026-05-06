import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifySession } from "./_lib/jwt.js";
import { getDailyStatus, claimDaily } from "./_lib/daily.js";

// Combined daily endpoint to stay under the Vercel Hobby 12-function cap.
// GET  /api/daily — status (streak, claimedToday, today's reward, multiplier)
// POST /api/daily — atomically claim today's bonus
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
      const status = await getDailyStatus(address);
      res.status(200).json(status);
      return;
    }
    if (req.method === "POST") {
      const result = await claimDaily(address);
      res.status(result.ok ? 200 : 409).json(result);
      return;
    }
    res.status(405).json({ error: "method" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "server error" });
  }
}
