import { TIERS } from "@/app/lib/tiers";
import { landOwners } from "@/app/lib/landOwners";

// Per-tier wallet breakdown: who holds plots in a land category, with each
// wallet's actually-DEPLOYED Atia's Flame (computed from their axies — the
// leaderboard's per-wallet atia_flame is an earned field that's mostly 0 early
// on and doesn't reconcile with the category total).
//
// GET /api/tier-leaderboard?key=<tierKey>
// Returns { name, total, participants, shown, entries: [{rank, address, plots,
// axies, flame}] }

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
