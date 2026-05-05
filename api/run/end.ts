import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyRun } from "../_lib/jwt.js";
import { getRun, saveRun, deleteRun, submitToLeaderboard } from "../_lib/runState.js";

// Body: { runId: string }
// The server uses its own clock for totalMs — client-supplied times are ignored.
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) { res.status(401).json({ error: "no token" }); return; }

  const body = (req.body ?? {}) as { runId?: unknown };
  const runId = typeof body.runId === "string" ? body.runId : null;
  if (!runId) { res.status(400).json({ error: "bad body" }); return; }

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

    if (floor > 0) {
      await submitToLeaderboard(state.address, floor, totalMs);
    }

    if (state.status === "live") {
      state.status = "ended";
      await saveRun(runId, state);
    }
    // Free the slot quickly; the leaderboard entry is what persists.
    await deleteRun(runId);

    res.status(200).json({ ok: true, floor, totalMs });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
  }
}
