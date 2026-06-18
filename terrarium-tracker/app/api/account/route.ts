import { TIERS } from "@/app/lib/tiers";
import { fetchActivatedAxies, ActivatedAxie } from "@/app/lib/terrariumApi";

// Public per-account summary, by Ronin address (no login required).
// GET /api/account?address=0x...
// Combines /api/v1/terrariums and /api/v1/activated-axies into a per-plot
// breakdown with Atia's Flame totals, open slots, and idle (unplaced) Axies.

const API_BASE =
  process.env.TERRARIUM_API_BASE ?? "https://axie-terrarium-api.axieinfinity.com";

export const revalidate = 0;

type RawTerrarium = {
  id: string;
  land_type: string;
  land_token_id: string | null;
  total_assigned_axies?: number;
  total_axie_slots?: number;
};
type RawAxie = ActivatedAxie;

function tierKeyForLandType(landType: string): string | null {
  const t = TIERS.find(
    (x) =>
      x.terrariumType === landType ||
      x.name === landType ||
      x.landType === landType
  );
  return t ? t.key : null;
}

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address")?.trim();
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return Response.json(
      { error: "Provide a valid Ronin/0x address." },
      { status: 400 }
    );
  }

  try {
    const [tRes, axies] = await Promise.all([
      fetch(`${API_BASE}/api/v1/terrariums?user_address=${address}`, {
        cache: "no-store",
      }),
      fetchActivatedAxies(address),
    ]);
    const terrariums: RawTerrarium[] = tRes.ok
      ? (await tRes.json())?.terrariums ?? []
      : [];

    // Group axies by terrarium id.
    const byTerr = new Map<string, RawAxie[]>();
    for (const ax of axies) {
      const tid = ax.assignment?.terrarium_id;
      if (!tid) continue;
      if (!byTerr.has(tid)) byTerr.set(tid, []);
      byTerr.get(tid)!.push(ax);
    }

    const plots = terrariums.map((t) => {
      const list = byTerr.get(t.id) ?? [];
      const flame = list.reduce((s, a) => s + (a.base_atia_flame ?? 0), 0);
      // Breakdown by base Atia's Flame (≈ collection), sorted by flame desc.
      const counts = new Map<number, number>();
      for (const a of list) {
        const f = a.base_atia_flame ?? 0;
        counts.set(f, (counts.get(f) ?? 0) + 1);
      }
      const breakdown = [...counts.entries()]
        .map(([flame, count]) => ({ flame, count }))
        .sort((a, b) => b.flame - a.flame);
      // Capacity from the terrarium itself (authoritative); fall back to the
      // axie list count if the slot fields are missing.
      const filled = t.total_assigned_axies ?? list.length;
      const slots = t.total_axie_slots ?? filled;
      return {
        id: t.id,
        landType: t.land_type,
        tierKey: tierKeyForLandType(t.land_type),
        isFree: /free/i.test(t.land_type),
        axieCount: list.length,
        flame,
        breakdown,
        slots,
        filled,
        openSlots: Math.max(0, slots - filled),
      };
    });

    const totalFlame = plots.reduce((s, p) => s + p.flame, 0);
    const totalAxies = axies.length;
    // Only paid plots count toward "active plots".
    const paidPlots = plots.filter((p) => !p.isFree);
    // Open slots across every plot (free + paid) and idle Axies (activated but
    // not placed on any plot) — i.e. spare deploy capacity.
    const openSlots = plots.reduce((s, p) => s + p.openSlots, 0);
    const idleAxies = axies.filter(
      (a) => !a.assignment?.terrarium_id
    ).length;

    return Response.json(
      {
        address,
        plotCount: plots.length,
        paidPlotCount: paidPlots.length,
        totalAxies,
        totalFlame,
        openSlots,
        idleAxies,
        plots,
        updatedAt: new Date().toISOString(),
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return Response.json(
      { error: `Upstream error: ${String(err)}` },
      { status: 502 }
    );
  }
}
