import { TIERS } from "@/app/lib/tiers";

// Live per-tier Total Atia's Flame for the current tick (1 tick = 1 hour),
// from the public Terrarium leaderboard API.
// GET /api/tier-flame
//
// Returns { tick, updatedAt, totals: { <tierKey>: number | null } }

const API_BASE =
  process.env.TERRARIUM_API_BASE ?? "https://axie-terrarium-api.axieinfinity.com";

export const revalidate = 0; // always fresh

export async function GET() {
  let tick: number | null = null;

  const results = await Promise.all(
    TIERS.map(async (t) => {
      try {
        const r = await fetch(
          `${API_BASE}/api/v1/leaderboards/baxs?land_type=${encodeURIComponent(
            t.landType
          )}&period=hourly`,
          { cache: "no-store" }
        );
        if (!r.ok) return [t.key, null] as const;
        const j = await r.json();
        if (typeof j?.window_end_tick === "number") tick = j.window_end_tick;
        const v = j?.total_atia_flame;
        return [t.key, typeof v === "number" ? v : null] as const;
      } catch {
        return [t.key, null] as const;
      }
    })
  );

  const totals = Object.fromEntries(results);
  return Response.json(
    { tick, updatedAt: new Date().toISOString(), totals },
    { headers: { "cache-control": "no-store" } }
  );
}
