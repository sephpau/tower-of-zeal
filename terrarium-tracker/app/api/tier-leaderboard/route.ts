import { TIERS } from "@/app/lib/tiers";

// Per-tier leaderboard: wallets in a land category ranked by Atia's Flame.
// GET /api/tier-leaderboard?key=<tierKey>
//
// Returns { key, name, total, participants, entries: [{rank, address, plots,
// flame, share, baxs}] }

const API_BASE =
  process.env.TERRARIUM_API_BASE ?? "https://axie-terrarium-api.axieinfinity.com";

export const revalidate = 0;

type RawEntry = {
  user_address: string;
  terrarium_count?: number;
  atia_flame?: number;
  baxs?: string;
};

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  const tier = TIERS.find((t) => t.key === key);
  if (!tier) {
    return Response.json({ error: "Unknown tier." }, { status: 400 });
  }

  try {
    const r = await fetch(
      `${API_BASE}/api/v1/leaderboards/baxs?land_type=${encodeURIComponent(
        tier.landType
      )}&period=monthly&limit=100`,
      { cache: "no-store" }
    );
    if (!r.ok) return Response.json({ error: "Upstream error." }, { status: 502 });
    const j = await r.json();
    const total: number = j?.total_atia_flame ?? 0;
    const participants: number = j?.total ?? (j?.entries?.length ?? 0);

    const entries = ((j?.entries ?? []) as RawEntry[])
      .map((e) => {
        const flame = e.atia_flame ?? 0;
        return {
          address: e.user_address,
          plots: e.terrarium_count ?? 0,
          flame,
          baxs: Number(e.baxs ?? "0") / 1e18,
          share: total > 0 ? flame / total : 0,
        };
      })
      .sort((a, b) => b.flame - a.flame)
      .map((e, i) => ({ rank: i + 1, ...e }));

    return Response.json(
      { key: tier.key, name: tier.name, total, participants, entries },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
