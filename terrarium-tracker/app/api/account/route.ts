import { TIERS } from "@/app/lib/tiers";
import { fetchActivatedAxies, fetchTerrariums, ActivatedAxie } from "@/app/lib/terrariumApi";

// Public per-account summary, by Ronin address (no login required).
// GET /api/account?address=0x...
// Combines /api/v1/terrariums and /api/v1/activated-axies into a per-plot
// breakdown: ACTIVE (Lunium-powered) Atia's Flame, shrine state + Lunium runway,
// open slots, and idle (unplaced) Axies.

export const revalidate = 0;

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
    const [terrariums, axies] = await Promise.all([
      fetchTerrariums(address),
      fetchActivatedAxies(address),
    ]);

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
      // Lunium / shrine: `flame` is the ACTIVE flame (what counts for bAXS).
      const sh = t.atia_shrine;
      const active = sh?.atia_shrine_state === "running";
      const flame = sh
        ? sh.active_atia_flame ?? 0
        : list.reduce((s, a) => s + (a.base_atia_flame ?? 0), 0);
      const lunium = sh?.individual_lunium_pool ?? 0;
      const drain =
        (sh?.lunium_consumed_per_tick ?? 0) - (sh?.lunium_recovered_per_tick ?? 0);
      const luniumTicks = sh && drain > 0 ? Math.floor(lunium / drain) : null;
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
        shrineState: sh?.atia_shrine_state ?? null,
        active,
        lunium,
        luniumTicks,
      };
    });

    // Active (Lunium-powered) flame only — the real bAXS-competing total.
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
