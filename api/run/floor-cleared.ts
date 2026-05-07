import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifySession } from "../_lib/jwt.js";
import { bumpXpCap, XP_CAP_PER_FLOOR, submitWorldEnderClear } from "../_lib/runState.js";
import { getCurrentMultiplier } from "../_lib/daily.js";

// Single-floor (non-leaderboard) battle completed. Credit the wallet's
// lifetime XP ceiling so the cheat-check has a matching audit value.
//
// Body: { stageId: number }  — used only as a sanity-bound (1..50).
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) { res.status(401).json({ error: "no token" }); return; }

  const body = (req.body ?? {}) as { stageId?: unknown; ms?: unknown };
  const stageId = typeof body.stageId === "number" ? body.stageId : null;
  if (stageId === null || stageId < 1 || stageId > 50) {
    res.status(400).json({ error: "stageId out of range" }); return;
  }
  const ms = typeof body.ms === "number" && Number.isFinite(body.ms) ? Math.floor(body.ms) : null;

  let address: string;
  try {
    const session = await verifySession(auth.slice("Bearer ".length));
    address = session.address;
  } catch {
    res.status(401).json({ error: "invalid session" }); return;
  }

  try {
    const dailyMul = await getCurrentMultiplier(address).catch(() => 1.0);
    const cap = await bumpXpCap(address, XP_CAP_PER_FLOOR.floor * dailyMul);

    let worldEnderSubmitted = false;
    if (stageId === 50 && ms !== null) {
      worldEnderSubmitted = await submitWorldEnderClear(address, ms).catch(() => false);
    }

    res.status(200).json({ ok: true, cap, worldEnderSubmitted });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
  }
}
