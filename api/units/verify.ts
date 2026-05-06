import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifySession } from "../_lib/jwt.js";
import { getXpCap, XP_CAP_SLACK } from "../_lib/runState.js";

// Cheat detector. Client claims a total XP value derived from local unit
// progress; server compares it to the lifetime XP ceiling accrued via
// /api/run/floor and /api/run/floor-cleared.
//
// Body: { totalXp: number }
// Response: { ok: boolean, cap: number, claimed: number, slack: number }
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) { res.status(401).json({ error: "no token" }); return; }

  const body = (req.body ?? {}) as { totalXp?: unknown };
  const totalXp = typeof body.totalXp === "number" ? Math.floor(body.totalXp) : null;
  if (totalXp === null || totalXp < 0) { res.status(400).json({ error: "bad totalXp" }); return; }

  let address: string;
  try {
    const session = await verifySession(auth.slice("Bearer ".length));
    address = session.address;
  } catch {
    res.status(401).json({ error: "invalid session" }); return;
  }

  try {
    const cap = await getXpCap(address);
    const ok = totalXp <= cap + XP_CAP_SLACK;
    res.status(200).json({ ok, cap, claimed: totalXp, slack: XP_CAP_SLACK });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
  }
}
