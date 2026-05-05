import type { VercelRequest, VercelResponse } from "@vercel/node";
import { zrevrangeWithScores, hmget } from "../_lib/redis.js";
import { LB_KEY, IGN_HASH_KEY, decodeScore } from "../_lib/runState.js";

// Public endpoint — no auth needed to read top scores.
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") { res.status(405).json({ error: "method" }); return; }

  const limitRaw = req.query.limit;
  let limit = 50;
  if (typeof limitRaw === "string") {
    const n = parseInt(limitRaw, 10);
    if (Number.isFinite(n) && n > 0 && n <= 200) limit = n;
  }

  try {
    const rows = await zrevrangeWithScores(LB_KEY, 0, limit - 1);
    const igns = rows.length > 0 ? await hmget(IGN_HASH_KEY, rows.map(r => r.member)) : [];
    const entries = rows.map((r, i) => {
      const { floor, ms } = decodeScore(r.score);
      return { rank: i + 1, address: r.member, ign: igns[i] ?? null, floor, ms };
    });
    res.setHeader("Cache-Control", "public, max-age=10");
    res.status(200).json({ entries });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
  }
}
