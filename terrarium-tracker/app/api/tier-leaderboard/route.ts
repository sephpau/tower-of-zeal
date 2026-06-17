import { TIERS } from "@/app/lib/tiers";

// Per-tier wallet breakdown: who holds plots in a land category, with each
// wallet's actually-DEPLOYED Atia's Flame (computed from their axies — the
// leaderboard's per-wallet atia_flame is an earned field that's mostly 0 early
// on and doesn't reconcile with the category total).
//
// GET /api/tier-leaderboard?key=<tierKey>
// Returns { name, total, participants, shown, entries: [{rank, address, plots,
// axies, flame}] }

const API_BASE =
  process.env.TERRARIUM_API_BASE ?? "https://axie-terrarium-api.axieinfinity.com";

// Cap how many wallets we compute deployed-flame for (each needs 2 upstream
// calls). Picked by plot count so the biggest holders surface first.
const COMPUTE_CAP = 40;

export const revalidate = 0;

type RawEntry = { user_address: string; terrarium_count?: number };
type RawTerr = { id: string; land_type: string };
type RawAxie = {
  base_atia_flame?: number;
  assignment?: { terrarium_id?: string } | null;
};

async function walletTierFlame(address: string, landType: string) {
  const [tRes, aRes] = await Promise.all([
    fetch(`${API_BASE}/api/v1/terrariums?user_address=${address}`, {
      cache: "no-store",
    }),
    fetch(`${API_BASE}/api/v1/activated-axies?user_address=${address}`, {
      cache: "no-store",
    }),
  ]);
  const terrariums: RawTerr[] = tRes.ok ? (await tRes.json())?.terrariums ?? [] : [];
  const axies: RawAxie[] = aRes.ok ? (await aRes.json())?.axies ?? [] : [];
  const tids = new Set(
    terrariums.filter((t) => t.land_type === landType).map((t) => t.id)
  );
  const mine = axies.filter((a) => tids.has(a.assignment?.terrarium_id ?? ""));
  const flame = mine.reduce((s, a) => s + (a.base_atia_flame ?? 0), 0);
  return { plots: tids.size, axies: mine.length, flame };
}

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  const tier = TIERS.find((t) => t.key === key);
  if (!tier) return Response.json({ error: "Unknown tier." }, { status: 400 });

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
    const raw = (j?.entries ?? []) as RawEntry[];
    const participants: number = j?.total ?? raw.length;

    // Pick the wallets with the most plots, then compute their deployed flame.
    const candidates = [...raw]
      .sort((a, b) => (b.terrarium_count ?? 0) - (a.terrarium_count ?? 0))
      .slice(0, COMPUTE_CAP);

    const computed = await Promise.all(
      candidates.map(async (e) => ({
        address: e.user_address,
        ...(await walletTierFlame(e.user_address, tier.landType)),
      }))
    );

    const entries = computed
      .sort((a, b) => b.flame - a.flame)
      .map((e, i) => ({ rank: i + 1, ...e }));

    // Sum of deployed flame across the computed wallets — matches the rows.
    const deployedTotal = entries.reduce((s, e) => s + e.flame, 0);

    return Response.json(
      {
        name: tier.name,
        total, // game's leaderboard total_atia_flame (a different, accruing metric)
        deployedTotal,
        participants,
        shown: entries.length,
        entries,
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
