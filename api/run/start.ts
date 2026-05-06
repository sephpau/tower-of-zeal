import type { VercelRequest, VercelResponse } from "@vercel/node";
import { nanoid } from "nanoid";
import { getAddress } from "viem";
import { verifySession, signRun } from "../_lib/jwt.js";
import { saveRun, bumpStartCounter, MAX_STARTS_PER_HOUR, isLbMode } from "../_lib/runState.js";
import { holdsMotzKey } from "../_lib/ronin.js";

const MOTZ_KEY_LOCKED_UNITS = new Set(["hera", "nova", "oge"]);

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

    const body = (req.body ?? {}) as { mode?: unknown; party?: unknown };
    const mode = isLbMode(body.mode) ? body.mode : "survival";

    // Reject runs that include MoTZ-locked units when the wallet doesn't hold the key.
    const party: string[] = Array.isArray(body.party) ? body.party.filter((x): x is string => typeof x === "string") : [];
    if (party.some(id => MOTZ_KEY_LOCKED_UNITS.has(id))) {
      const holds = await holdsMotzKey(getAddress(address)).catch(() => false);
      if (!holds) { res.status(403).json({ error: "wallet does not hold MoTZ Vault Key required for selected unit" }); return; }
    }

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
