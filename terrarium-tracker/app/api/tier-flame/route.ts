import { TIERS } from "@/app/lib/tiers";
import { landOwners } from "@/app/lib/landOwners";
import { fetchActivatedAxies } from "@/app/lib/terrariumApi";

// Deployed Total Atia's Flame for ONE tier = sum of every axie's base flame
// across all plots in the category (matches the per-wallet breakdown and the
// reward formula). Computes EVERY wallet, so it's edge-cached (~10 min).
//
// GET /api/tier-flame?key=<tierKey>
// Returns { key, total, reportedTotal, reportedHourly, wallets, computed, approx }
// `total` = our summed-wallets value (matches the per-wallet breakdown).
// `reportedTotal` = the leaderboard's own total_atia_flame (monthly = season).
// `reportedHourly` = the leaderboard total_atia_flame for the last tick (hourly).

export const maxDuration = 60;

const API_BASE =
  process.env.TERRARIUM_API_BASE ?? "https://axie-terrarium-api.axieinfinity.com";

const CONCURRENCY = 24;

type RawEntry = { user_address: string; terrarium_count?: number };
type RawTerr = { id: string; land_type: string };

async function walletTierFlame(address: string, landType: string): Promise<number> {
  const [tRes, axies] = await Promise.all([
    fetch(`${API_BASE}/api/v1/terrariums?user_address=${address}`, { cache: "no-store" }),
    fetchActivatedAxies(address),
  ]);
  const terrariums: RawTerr[] = tRes.ok ? (await tRes.json())?.terrariums ?? [] : [];
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

// The leaderboard's reported total_atia_flame for a tier+window. Used as a
// fallback (non-enumerable tiers) and for the all-plots roll-up (monthly =
// season total, hourly = last tick).
async function reportedTotal(landType: string, period = "monthly"): Promise<number> {
  const r = await fetch(
    `${API_BASE}/api/v1/leaderboards/baxs?land_type=${encodeURIComponent(
      landType
    )}&period=${period}&limit=1`,
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
    let raw = await allEntries(tier.landType);

    // Tier not enumerable via the leaderboard (Luna's Landing) — resolve current
    // land owners on-chain (so sales/transfers are picked up automatically) and
    // merge with the seed owners; else fall back to the reported total.
    if (raw.length === 0 && (tier.landTokenIds?.length || tier.knownWallets?.length)) {
      const live = tier.landTokenIds?.length
        ? await landOwners(tier.landTokenIds)
        : [];
      const merged = [...new Set([...live, ...(tier.knownWallets ?? [])])];
      raw = merged.map((user_address) => ({ user_address }));
    } else if (raw.length === 0) {
      const [reported, reportedHr] = await Promise.all([
        reportedTotal(tier.landType),
        reportedTotal(tier.landType, "hourly"),
      ]);
      return Response.json(
        {
          key: tier.key,
          total: reported,
          reportedTotal: reported,
          reportedHourly: reportedHr,
          wallets: 0,
          computed: 0,
          reported: true,
          updatedAt: new Date().toISOString(),
        },
        {
          headers: {
            "cache-control": "public, s-maxage=600, stale-while-revalidate=1800",
          },
        }
      );
    }
    const wallets = raw.length;

    // Compute every wallet in the tier (match on the terrariums land_type), and
    // grab the leaderboard's own reported total in parallel for comparison.
    const [total, apiReported, apiHourly] = await Promise.all([
      pool(raw, (e) => walletTierFlame(e.user_address, tier.terrariumType)),
      reportedTotal(tier.landType),
      reportedTotal(tier.landType, "hourly"),
    ]);

    return Response.json(
      {
        key: tier.key,
        total,
        reportedTotal: apiReported,
        reportedHourly: apiHourly,
        wallets,
        computed: raw.length,
        approx: false,
        reported: false,
        updatedAt: new Date().toISOString(),
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
