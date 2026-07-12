import { TIERS } from "@/app/lib/tiers";
import { landOwners } from "@/app/lib/landOwners";
import {
  fetchTerrariums,
  fetchActivatedAxies,
  activeFlameFor,
} from "@/app/lib/terrariumApi";

// Atia's Flame for ONE tier, computed across EVERY wallet (edge-cached ~10 min).
//
// GET /api/tier-flame?key=<tierKey>
// Returns { key, total, active, reportedTotal, bAxsPerTick, tick, hourlyTotal,...}
// `total`  = all deployed base flame (every assigned axie, active or resting).
// `active` = Lunium-powered flame (sum of running shrines' active_atia_flame) —
//            the real bAXS denominator.
// `reportedTotal` = the leaderboard's own total_atia_flame (monthly = season).
// `bAxsPerTick` = live bAXS distributed per tick (from the hourly leaderboard).
// `tick` = current tick number; `hourlyTotal` = hourly competing flame. Together
// these let the client log a bAXS-per-flame (= bAxsPerTick / hourlyTotal) series.

export const maxDuration = 60;

const API_BASE =
  process.env.TERRARIUM_API_BASE ?? "https://axie-terrarium-api.axieinfinity.com";

const CONCURRENCY = 24;

type RawEntry = { user_address: string; terrarium_count?: number };

// Per wallet, in one tier: total deployed base flame (all assigned axies) AND
// active (Lunium-powered) flame (running shrines' active_atia_flame).
async function walletTierFlames(
  address: string,
  landType: string
): Promise<{ total: number; active: number }> {
  const [terrariums, axies] = await Promise.all([
    fetchTerrariums(address),
    fetchActivatedAxies(address),
  ]);
  const tids = new Set(
    terrariums.filter((t) => t.land_type === landType).map((t) => t.id)
  );
  const total = axies
    .filter((a) => tids.has(a.assignment?.terrarium_id ?? ""))
    .reduce((s, a) => s + (a.base_atia_flame ?? 0), 0);
  return { total, active: activeFlameFor(terrariums, landType) };
}

// Sum total + active across all wallets, with a concurrency limit.
async function poolFlames(
  items: RawEntry[],
  landType: string
): Promise<{ total: number; active: number }> {
  let total = 0;
  let active = 0;
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const res = await Promise.all(
      batch.map((e) => walletTierFlames(e.user_address, landType))
    );
    for (const r of res) {
      total += r.total;
      active += r.active;
    }
  }
  return { total, active };
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

// Live bAXS distributed per tick for a tier, from the hourly leaderboard. For
// any wallet: baxs = (atia_flame / total_atia_flame) × pool, so the pool is
// exact from a single entry: pool = baxs × total_atia_flame / atia_flame.
// Also returns the tick number and the hourly total flame (the "competing
// flame"), so the client can log a bAXS-per-flame time series.
type LiveTick = { pool: number; tick: number; total: number };
async function livePoolPerTick(landType: string): Promise<LiveTick | null> {
  const r = await fetch(
    `${API_BASE}/api/v1/leaderboards/baxs?land_type=${encodeURIComponent(
      landType
    )}&period=hourly&limit=1`,
    { cache: "no-store" }
  );
  if (!r.ok) return null;
  const j = await r.json();
  const e = j?.entries?.[0];
  const total = j?.total_atia_flame;
  const af = e?.atia_flame;
  const tick = j?.window_end_tick;
  if (e?.baxs && af > 0 && total > 0) {
    return {
      pool: (Number(e.baxs) / 1e18) * (total / af),
      tick: typeof tick === "number" ? tick : 0,
      total,
    };
  }
  return null;
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
      const [reported, liveTick] = await Promise.all([
        reportedTotal(tier.landType),
        livePoolPerTick(tier.landType),
      ]);
      return Response.json(
        {
          key: tier.key,
          total: reported,
          active: reported,
          reportedTotal: reported,
          bAxsPerTick: liveTick?.pool ?? null,
          tick: liveTick?.tick ?? null,
          hourlyTotal: liveTick?.total ?? null,
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
    const [flames, apiReported, liveTick] = await Promise.all([
      poolFlames(raw, tier.terrariumType),
      reportedTotal(tier.landType),
      livePoolPerTick(tier.landType),
    ]);

    return Response.json(
      {
        key: tier.key,
        total: flames.total,
        active: flames.active,
        reportedTotal: apiReported,
        bAxsPerTick: liveTick?.pool ?? null,
        tick: liveTick?.tick ?? null,
        hourlyTotal: liveTick?.total ?? null,
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
