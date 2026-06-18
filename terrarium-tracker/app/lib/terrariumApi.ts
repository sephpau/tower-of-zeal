// Shared Terrarium API helpers.

const API_BASE =
  process.env.TERRARIUM_API_BASE ?? "https://axie-terrarium-api.axieinfinity.com";

export type ActivatedAxie = {
  axie_id?: string;
  base_atia_flame?: number;
  assignment?: { terrarium_id?: string; role?: string } | null;
};

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
