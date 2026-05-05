import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyRun } from "../_lib/jwt.js";
import { getRun, saveRun, deleteRun, submitToLeaderboard, MIN_AVG_FLOOR_MS, sanitizeIgn, setIgnIfAllowed } from "../_lib/runState.js";

// Body: { runId: string }
// The server uses its own clock for totalMs — client-supplied times are ignored.
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) { res.status(401).json({ error: "no token" }); return; }

  const body = (req.body ?? {}) as { runId?: unknown; ign?: unknown };
  const runId = typeof body.runId === "string" ? body.runId : null;
  if (!runId) { res.status(400).json({ error: "bad body" }); return; }
  const ign = sanitizeIgn(body.ign);

  let payload;
  try { payload = await verifyRun(auth.slice("Bearer ".length)); }
  catch { res.status(401).json({ error: "invalid run token" }); return; }
  if (payload.runId !== runId) { res.status(401).json({ error: "token mismatch" }); return; }

  try {
    const state = await getRun(runId);
    if (!state) { res.status(404).json({ error: "no run" }); return; }
    if (state.address.toLowerCase() !== payload.address.toLowerCase()) { res.status(401).json({ error: "address mismatch" }); return; }

    const totalMs = state.lastFloorAt - state.startedAt;
    const floor = state.currentFloor;

    let submitted = false;
    let rejectedReason: string | null = null;
    if (floor > 0) {
      const avg = totalMs / floor;
      if (avg < MIN_AVG_FLOOR_MS) {
        rejectedReason = "average floor time below threshold";
      } else {
        await submitToLeaderboard(state.address, floor, totalMs);
        // Cooldown is intentionally silent here — keep the old name on conflict.
        if (ign) await setIgnIfAllowed(state.address, ign);
        submitted = true;
      }
    }

    if (state.status === "live") {
      state.status = "ended";
      await saveRun(runId, state);
    }
    // Free the slot quickly; the leaderboard entry is what persists.
    await deleteRun(runId);

    res.status(200).json({ ok: true, floor, totalMs, submitted, rejectedReason });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
  }
}
