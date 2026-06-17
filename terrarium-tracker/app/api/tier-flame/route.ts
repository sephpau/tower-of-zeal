import { TIERS } from "@/app/lib/tiers";

// Deployed Total Atia's Flame for ONE tier = sum of every axie's base flame
// across all plots in the category (matches the per-wallet breakdown and the
// reward formula). Computed from wallet data, so it's capped + edge-cached.
//
// GET /api/tier-flame?key=<tierKey>
// Returns { key, total, wallets, computed, approx }

const API_BASE =
  process.env.TERRARIUM_API_BASE ?? "https://axie-terrarium-api.axieinfinity.com";

// Compute deployed flame for at most this many wallets (by plot count). Larger
// tiers get the long single-plot tail truncated → flagged `approx`.
const COMPUTE_CAP = 100;
const CONCURRENCY = 20;

type RawEntry = { user_address: string; terrarium_count?: number };
type RawTerr = { id: string; land_type: string };
type RawAxie = {
  base_atia_flame?: number;
  assignment?: { terrarium_id?: string } | null;
};

async function walletTierFlame(address: string, landType: string): Promise<number> {
  const [tRes, aRes] = await Promise.all([
    fetch(`${API_BASE}/api/v1/terrariums?user_address=${address}`, { cache: "no-store" }),
    fetch(`${API_BASE}/api/v1/activated-axies?user_address=${address}`, { cache: "no-store" }),
  ]);
  const terrariums: RawTerr[] = tRes.ok ? (await tRes.json())?.terrariums ?? [] : [];
  const axies: RawAxie[] = aRes.ok ? (await aRes.json())?.axies ?? [] : [];
  const tids = new Set(
    terrariums.filter((t) => t.land_type === landType).map((t) => t.id)
  );
  return axies
    .filter((a) => tids.has(a.assignment?.terrarium_id ?? ""))
    .reduce((s, a) => s + (a.base_atia_flame ?? 0), 0);
}

// Run async tasks with a concurrency limit.
async function pool<T>(items: T[], fn: (t: T) => Promise<number>): Promise<number> {
  let sum = 0;
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const res = await Promise.all(batch.map(fn));
    sum += res.reduce((s, v) => s + v, 0);
  }
  return sum;
}

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  const tier = TIERS.find((t) => t.key === key);
  if (!tier) return Response.json({ error: "Unknown tier." }, { status: 400 });

  try {
    const r = await fetch(
      `${API_BASE}/api/v1/leaderboards/baxs?land_type=${encodeURIComponent(
        tier.landType
      )}&period=monthly&limit=500`,
      { cache: "no-store" }
    );
    if (!r.ok) return Response.json({ error: "Upstream error." }, { status: 502 });
    const j = await r.json();
    const raw = (j?.entries ?? []) as RawEntry[];
    const wallets: number = j?.total ?? raw.length;

    const candidates = [...raw]
      .sort((a, b) => (b.terrarium_count ?? 0) - (a.terrarium_count ?? 0))
      .slice(0, COMPUTE_CAP);

    const total = await pool(candidates, (e) =>
      walletTierFlame(e.user_address, tier.landType)
    );

    return Response.json(
      {
        key: tier.key,
        total,
        wallets,
        computed: candidates.length,
        approx: candidates.length < raw.length,
      },
      {
        headers: {
          // Cache at the edge: serve instantly, recompute ~every 10 min.
          "cache-control": "public, s-maxage=600, stale-while-revalidate=1800",
        },
      }
    );
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
