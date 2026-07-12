// Resolve current owners of Axie Land NFTs on Ronin via ownerOf(tokenId).
// Used for tiers (Luna's Landing) the leaderboard doesn't enumerate — keeps the
// owner list current as lands change hands.

const LAND_CONTRACT = "0x8c811e3c958e190f5ec15fb376533a3398620500";
const RONIN_RPC = process.env.RONIN_RPC ?? "https://api.roninchain.com/rpc";
const OWNER_OF = "0x6352211e"; // ownerOf(uint256) selector

async function ownerOf(tokenId: string): Promise<string | null> {
  try {
    const hex = BigInt(tokenId).toString(16).padStart(64, "0");
    const r = await fetch(RONIN_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: LAND_CONTRACT, data: OWNER_OF + hex }, "latest"],
      }),
      cache: "no-store",
    });
    const j = await r.json();
    const res: string | undefined = j?.result;
    if (res && res.length >= 42) return "0x" + res.slice(-40).toLowerCase();
    return null;
  } catch {
    return null;
  }
}

/** Current owners (deduped, lowercase) for a set of land token ids. */
export async function landOwners(tokenIds: string[]): Promise<string[]> {
  const owners = await Promise.all(tokenIds.map(ownerOf));
  return [...new Set(owners.filter((o): o is string => !!o))];
}
