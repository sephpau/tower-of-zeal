import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyRun } from "../_lib/jwt.js";
import { getRun, saveRun, MAX_FLOOR, bumpXpCap, XP_CAP_PER_FLOOR } from "../_lib/runState.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) { res.status(401).json({ error: "no token" }); return; }

  const body = (req.body ?? {}) as { runId?: unknown; floor?: unknown };
  const runId = typeof body.runId === "string" ? body.runId : null;
  const floor = typeof body.floor === "number" ? body.floor : null;
  if (!runId || floor === null) { res.status(400).json({ error: "bad body" }); return; }
  if (floor < 1 || floor > MAX_FLOOR) { res.status(400).json({ error: "floor range" }); return; }

  let payload;
  try { payload = await verifyRun(auth.slice("Bearer ".length)); }
  catch { res.status(401).json({ error: "invalid run token" }); return; }
  if (payload.runId !== runId) { res.status(401).json({ error: "token mismatch" }); return; }

  try {
    const state = await getRun(runId);
    if (!state) { res.status(404).json({ error: "no run" }); return; }
    if (state.status !== "live") { res.status(409).json({ error: "run ended" }); return; }
    if (state.address.toLowerCase() !== payload.address.toLowerCase()) { res.status(401).json({ error: "address mismatch" }); return; }

    if (floor !== state.currentFloor + 1) { res.status(409).json({ error: "non-sequential floor" }); return; }

    const now = Date.now();
    state.currentFloor = floor;
    state.lastFloorAt = now;
    await saveRun(runId, state);

    // Anti-cheat: bump per-wallet lifetime XP ceiling so the cheat-check on
    // battle mount knows this wallet is allowed to claim more total XP.
    await bumpXpCap(state.address, XP_CAP_PER_FLOOR[state.mode]).catch(() => 0);

    res.status(200).json({ ok: true, currentFloor: state.currentFloor });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
  }
}
