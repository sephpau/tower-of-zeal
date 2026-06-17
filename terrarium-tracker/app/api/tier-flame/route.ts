import { TIERS } from "@/app/lib/tiers";

// Live per-tier Total Atia's Flame — the cumulative category total (the reward
// denominator), from the public Terrarium leaderboard API (period=monthly).
// GET /api/tier-flame
//
// Returns { updatedAt, totals: { <tierKey>: number | null } }

const API_BASE =
  process.env.TERRARIUM_API_BASE ?? "https://axie-terrarium-api.axieinfinity.com";

export const revalidate = 0; // always fresh

export async function GET() {
  const results = await Promise.all(
    TIERS.map(async (t) => {
      try {
        const r = await fetch(
          `${API_BASE}/api/v1/leaderboards/baxs?land_type=${encodeURIComponent(
            t.landType
          )}&period=monthly`,
          { cache: "no-store" }
        );
        if (!r.ok) return [t.key, null] as const;
        const j = await r.json();
        const v = j?.total_atia_flame;
        return [t.key, typeof v === "number" ? v : null] as const;
      } catch {
        return [t.key, null] as const;
      }
    })
  );

  const totals = Object.fromEntries(results);
  return Response.json(
    { updatedAt: new Date().toISOString(), totals },
    { headers: { "cache-control": "no-store" } }
  );
}
