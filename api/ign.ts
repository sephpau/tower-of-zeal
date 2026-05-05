import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifySession } from "./_lib/jwt.js";
import { hmget } from "./_lib/redis.js";
import { IGN_HASH_KEY, sanitizeIgn, setIgnIfAllowed } from "./_lib/runState.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) { res.status(401).json({ error: "no token" }); return; }

  let address: string;
  try {
    const session = await verifySession(auth.slice("Bearer ".length));
    address = session.address.toLowerCase();
  } catch {
    res.status(401).json({ error: "invalid session" }); return;
  }

  try {
    if (req.method === "GET") {
      const [ign] = await hmget(IGN_HASH_KEY, [address]);
      res.status(200).json({ ign: ign ?? null });
      return;
    }
    if (req.method === "POST") {
      const body = (req.body ?? {}) as { ign?: unknown };
      const ign = sanitizeIgn(body.ign);
      if (!ign) { res.status(400).json({ error: "invalid ign" }); return; }
      const result = await setIgnIfAllowed(address, ign);
      if (result.kind === "cooldown") {
        res.status(429).json({
          error: "cooldown",
          ign: result.ign,
          nextAllowedAt: result.nextAllowedAt,
        });
        return;
      }
      res.status(200).json({ ign: result.ign, kind: result.kind });
      return;
    }
    res.status(405).json({ error: "method" });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
  }
}
