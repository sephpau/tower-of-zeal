import { TIERS } from "@/app/lib/tiers";
import { landOwners } from "@/app/lib/landOwners";
import { fetchTerrariums } from "@/app/lib/terrariumApi";

// Per-tier wallet breakdown: who holds plots in a land category, ranked by their
// ACTIVE (Lunium-powered) Atia's Flame — the flame that actually competes for
// bAXS (resting/out-of-Lunium plots contribute their reduced active_atia_flame).
//
// GET /api/tier-leaderboard?key=<tierKey>
// Returns { name, deployedTotal, participants, shown, entries: [{rank, address,
// plots, axies, flame}] }

export const maxDuration = 60;

const API_BASE =
  process.env.TERRARIUM_API_BASE ?? "https://axie-terrarium-api.axieinfinity.com";

const CONCURRENCY = 24;

type RawEntry = { user_address: string; terrarium_count?: number };

// Plots, axies, and ACTIVE flame for a wallet in one tier — all from the
// terrarium objects (total_assigned_axies + shrine active_atia_flame), so the
// flame reflects Lunium and no axie pagination is needed.
async function walletTierFlame(address: string, landType: string) {
  const terrariums = await fetchTerrariums(address);
  const mine = terrariums.filter((t) => t.land_type === landType);
  return {
    plots: mine.length,
    axies: mine.reduce((s, t) => s + (t.total_assigned_axies ?? 0), 0),
    flame: mine.reduce((s, t) => s + (t.atia_shrine?.active_atia_flame ?? 0), 0),
  };
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

type Computed = { address: string; plots: number; axies: number; flame: number };

// Compute with a concurrency cap to avoid hammering the upstream.
async function poolCompute(
  candidates: RawEntry[],
  landType: string
): Promise<Computed[]> {
  const out: Computed[] = [];
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const res = await Promise.all(
      batch.map(async (e) => ({
        address: e.user_address,
        ...(await walletTierFlame(e.user_address, landType)),
      }))
    );
    out.push(...res);
  }
  return out;
}

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  const tier = TIERS.find((t) => t.key === key);
  if (!tier) return Response.json({ error: "Unknown tier." }, { status: 400 });

  try {
    let raw = await allEntries(tier.landType);
    // No leaderboard participants → resolve current land owners on-chain
    // (auto-updates on transfer) merged with seed owners.
    if (raw.length === 0 && (tier.landTokenIds?.length || tier.knownWallets?.length)) {
      const live = tier.landTokenIds?.length
        ? await landOwners(tier.landTokenIds)
        : [];
      raw = [...new Set([...live, ...(tier.knownWallets ?? [])])].map(
        (user_address) => ({ user_address })
      );
    }
    const participants = raw.length;

    // Compute every wallet (matches /api/tier-flame exactly).
    const computed = await poolCompute(raw, tier.terrariumType);

    // Only list wallets that actually have axies (0-flame ones add nothing to
    // the total, so the header still equals the sum of shown rows).
    const entries = computed
      .filter((e) => e.flame > 0)
      .sort((a, b) => b.flame - a.flame)
      .map((e, i) => ({ rank: i + 1, ...e }));

    const deployedTotal = computed.reduce((s, e) => s + e.flame, 0);

    return Response.json(
      {
        name: tier.name,
        deployedTotal,
        participants,
        shown: computed.length,
        entries,
      },
      {
        headers: {
          "cache-control": "public, s-maxage=600, stale-while-revalidate=1800",
        },
      }
    );
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
