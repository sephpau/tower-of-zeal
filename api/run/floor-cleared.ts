import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifySession } from "../_lib/jwt.js";
import {
  bumpXpCap, XP_CAP_PER_FLOOR, submitWorldEnderClear,
  bumpFloorRetry, readFloorRetries, FLOOR_RETRIES_PER_DAY,
} from "../_lib/runState.js";
import { getCurrentMultiplier } from "../_lib/daily.js";

// Floor-mode battle event endpoint. Handles three operations to stay under
// the Vercel Hobby 12-function cap:
//   op: "clear"     (default) — successful clear; bump XP ceiling (+ optional World Ender time)
//   op: "retry_status"        — read the wallet's remaining free-retry count for today
//   op: "retry_claim"         — atomically consume one free retry; 429 if cap reached
//
// Body: { stageId: number, op?: string, ms?: number }
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) { res.status(401).json({ error: "no token" }); return; }

  const body = (req.body ?? {}) as { stageId?: unknown; ms?: unknown; op?: unknown };
  const stageId = typeof body.stageId === "number" ? body.stageId : null;
  if (stageId === null || stageId < 1 || stageId > 50) {
    res.status(400).json({ error: "stageId out of range" }); return;
  }
  const ms = typeof body.ms === "number" && Number.isFinite(body.ms) ? Math.floor(body.ms) : null;
  const op = typeof body.op === "string" ? body.op : "clear";

  let address: string;
  try {
    const session = await verifySession(auth.slice("Bearer ".length));
    address = session.address;
  } catch {
    res.status(401).json({ error: "invalid session" }); return;
  }

  try {
    if (op === "retry_status") {
      const used = await readFloorRetries(address);
      const remaining = Math.max(0, FLOOR_RETRIES_PER_DAY - used);
      res.status(200).json({ ok: true, used, remaining, max: FLOOR_RETRIES_PER_DAY });
      return;
    }

    if (op === "retry_claim") {
      const beforeUsed = await readFloorRetries(address);
      if (beforeUsed >= FLOOR_RETRIES_PER_DAY) {
        res.status(429).json({ ok: false, used: beforeUsed, remaining: 0, max: FLOOR_RETRIES_PER_DAY });
        return;
      }
      const newUsed = await bumpFloorRetry(address);
      // Race: another concurrent claim could push us over the cap. If so, refund is irrelevant
      // because we just enforce >=cap = no more retries; the extra increment still expires daily.
      if (newUsed > FLOOR_RETRIES_PER_DAY) {
        res.status(429).json({ ok: false, used: newUsed, remaining: 0, max: FLOOR_RETRIES_PER_DAY });
        return;
      }
      res.status(200).json({ ok: true, used: newUsed, remaining: FLOOR_RETRIES_PER_DAY - newUsed, max: FLOOR_RETRIES_PER_DAY });
      return;
    }

    // Default: clear event
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
