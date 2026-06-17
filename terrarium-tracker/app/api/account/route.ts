import { TIERS } from "@/app/lib/tiers";

// Public per-account summary, by Ronin address (no login required).
// GET /api/account?address=0x...
// Combines /api/v1/terrariums and /api/v1/activated-axies into a per-plot
// breakdown with Atia's Flame totals.

const API_BASE =
  process.env.TERRARIUM_API_BASE ?? "https://axie-terrarium-api.axieinfinity.com";

export const revalidate = 0;

type RawTerrarium = { id: string; land_type: string; land_token_id: string | null };
type RawAxie = {
  axie_id: string;
  base_atia_flame?: number;
  assignment?: { terrarium_id?: string; role?: string } | null;
};

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
    const [tRes, aRes] = await Promise.all([
      fetch(`${API_BASE}/api/v1/terrariums?user_address=${address}`, {
        cache: "no-store",
      }),
      fetch(`${API_BASE}/api/v1/activated-axies?user_address=${address}`, {
        cache: "no-store",
      }),
    ]);
    const terrariums: RawTerrarium[] = tRes.ok
      ? (await tRes.json())?.terrariums ?? []
      : [];
    const axies: RawAxie[] = aRes.ok ? (await aRes.json())?.axies ?? [] : [];

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
      return {
        id: t.id,
        landType: t.land_type,
        tierKey: tierKeyForLandType(t.land_type),
        isFree: /free/i.test(t.land_type),
        axieCount: list.length,
        flame,
        breakdown,
      };
    });

    const totalFlame = plots.reduce((s, p) => s + p.flame, 0);
    const totalAxies = axies.length;
    // Only paid plots count toward "active plots".
    const paidPlots = plots.filter((p) => !p.isFree);

    return Response.json(
      {
        address,
        plotCount: plots.length,
        paidPlotCount: paidPlots.length,
        totalAxies,
        totalFlame,
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
