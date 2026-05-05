import type { VercelRequest, VercelResponse } from "@vercel/node";
import { nanoid } from "nanoid";
import { verifySession, signRun } from "../_lib/jwt.js";
import { saveRun, bumpStartCounter, MAX_STARTS_PER_HOUR, isLbMode } from "../_lib/runState.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
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
    const starts = await bumpStartCounter(address);
    if (starts > MAX_STARTS_PER_HOUR) { res.status(429).json({ error: "too many runs" }); return; }

    const body = (req.body ?? {}) as { mode?: unknown };
    const mode = isLbMode(body.mode) ? body.mode : "survival";

    const runId = nanoid(16);
    const now = Date.now();
    await saveRun(runId, {
      address,
      mode,
      startedAt: now,
      currentFloor: 0,
      lastFloorAt: now,
      status: "live",
    });
    const token = await signRun(runId, address);
    res.status(200).json({ runId, token });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
  }
}
