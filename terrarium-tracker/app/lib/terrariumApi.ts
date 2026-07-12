// Shared Terrarium API helpers.

const API_BASE =
  process.env.TERRARIUM_API_BASE ?? "https://axie-terrarium-api.axieinfinity.com";

export type ActivatedAxie = {
  axie_id?: string;
  base_atia_flame?: number;
  assignment?: { terrarium_id?: string; role?: string } | null;
};

// A plot's Atia Shrine — the Lunium/energy engine. Only `active_atia_flame`
// (when the shrine is "running") counts toward the bAXS tick; a "resting" shrine
// (out of Lunium) drops to a tiny/zero active flame even with axies assigned.
export type AtiaShrine = {
  atia_shrine_state?: string; // "running" | "resting" | ...
  active_atia_flame?: number;
  individual_lunium_pool?: number;
  lunium_consumed_per_tick?: number;
  lunium_recovered_per_tick?: number;
};

export type Terrarium = {
  id: string;
  land_type: string;
  is_free?: boolean;
  land_token_id?: string | null;
  total_assigned_axies?: number;
  total_axie_slots?: number;
  atia_shrine?: AtiaShrine | null;
};

export async function fetchTerrariums(address: string): Promise<Terrarium[]> {
  const r = await fetch(
    `${API_BASE}/api/v1/terrariums?user_address=${address}`,
    { cache: "no-store" }
  );
  if (!r.ok) return [];
  return (await r.json())?.terrariums ?? [];
}

// Active (Lunium-powered) flame a wallet has in one land category — the flame
// that actually competes for bAXS. Sums each plot's shrine active_atia_flame.
export function activeFlameFor(terrariums: Terrarium[], landType: string): number {
  return terrariums
    .filter((t) => t.land_type === landType)
    .reduce((s, t) => s + (t.atia_shrine?.active_atia_flame ?? 0), 0);
}

// /api/v1/activated-axies defaults to limit=50, but a wallet can have more (up
// to 30 per plot). Paginate so we never undercount a wallet's deployed Axies.
export async function fetchActivatedAxies(
  address: string
): Promise<ActivatedAxie[]> {
  const PAGE = 200;
  const out: ActivatedAxie[] = [];
  for (let offset = 0; offset < 4000; offset += PAGE) {
    const r = await fetch(
      `${API_BASE}/api/v1/activated-axies?user_address=${address}&limit=${PAGE}&offset=${offset}`,
      { cache: "no-store" }
    );
    if (!r.ok) break;
    const j = await r.json();
    const a = (j?.axies ?? []) as ActivatedAxie[];
    out.push(...a);
    const total = j?.total ?? out.length;
    if (a.length < PAGE || out.length >= total) break;
  }
  return out;
}
