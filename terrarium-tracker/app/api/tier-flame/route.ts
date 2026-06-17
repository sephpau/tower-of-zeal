import { TIERS } from "@/app/lib/tiers";

// Deployed Total Atia's Flame for ONE tier = sum of every axie's base flame
// across all plots in the category (matches the per-wallet breakdown and the
// reward formula). Computes EVERY wallet, so it's edge-cached (~10 min).
//
// GET /api/tier-flame?key=<tierKey>
// Returns { key, total, wallets, computed, approx }

export const maxDuration = 60;

const API_BASE =
  process.env.TERRARIUM_API_BASE ?? "https://axie-terrarium-api.axieinfinity.com";

const CONCURRENCY = 24;

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

// The leaderboard caps at 200 rows/page — paginate via offset to get all.
async function allEntries(landType: string): Promise<RawEntry[]> {
  const PAGE = 200;
  const out: RawEntry[] = [];
  for (let offset = 0; offset < 4000; offset += PAGE) {
    const r = await fetch(
      `${API_BASE}/api/v1/leaderboards/baxs?land_type=${encodeURIComponent(
        landType
      )}&period=monthly&limit=${PAGE}&offset=${offset}`,
      { cache: "no-store" }
    );
    if (!r.ok) break;
    const j = await r.json();
    const e = (j?.entries ?? []) as RawEntry[];
    out.push(...e);
    const total = j?.total ?? out.length;
    if (e.length < PAGE || out.length >= total) break;
  }
  return out;
}

// Some tiers (Luna's Landing) don't expose a participant list — fall back to
// the leaderboard's reported total_atia_flame.
async function reportedTotal(landType: string): Promise<number> {
  const r = await fetch(
    `${API_BASE}/api/v1/leaderboards/baxs?land_type=${encodeURIComponent(
      landType
    )}&period=monthly&limit=1`,
    { cache: "no-store" }
  );
  if (!r.ok) return 0;
  const j = await r.json();
  return typeof j?.total_atia_flame === "number" ? j.total_atia_flame : 0;
}

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  const tier = TIERS.find((t) => t.key === key);
  if (!tier) return Response.json({ error: "Unknown tier." }, { status: 400 });

  try {
    const raw = await allEntries(tier.landType);
    const wallets = raw.length;

    // No wallet list → use the game's reported total instead of 0.
    if (wallets === 0) {
      const reported = await reportedTotal(tier.landType);
      return Response.json(
        { key: tier.key, total: reported, wallets: 0, computed: 0, reported: true },
        {
          headers: {
            "cache-control": "public, s-maxage=600, stale-while-revalidate=1800",
          },
        }
      );
    }

    // Compute every wallet in the tier (match on the terrariums land_type).
    const total = await pool(raw, (e) =>
      walletTierFlame(e.user_address, tier.terrariumType)
    );

    return Response.json(
      {
        key: tier.key,
        total,
        wallets,
        computed: raw.length,
        approx: false,
        reported: false,
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
