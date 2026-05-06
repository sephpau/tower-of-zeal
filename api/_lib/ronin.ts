import { createPublicClient, http, defineChain, getAddress, type Address } from "viem";

export const ronin = defineChain({
  id: 2020,
  name: "Ronin",
  nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
  rpcUrls: { default: { http: ["https://api.roninchain.com/rpc"] } },
});

export const client = createPublicClient({
  chain: ronin,
  transport: http(process.env.RONIN_RPC_URL ?? "https://api.roninchain.com/rpc"),
});

const erc721Abi = [{
  name: "balanceOf",
  type: "function",
  stateMutability: "view",
  inputs: [{ name: "owner", type: "address" }],
  outputs: [{ type: "uint256" }],
}] as const;

/** MoTZ Vault Key contract — required to use Hera, Nova, and Oge. */
export const MOTZ_KEY_CONTRACT: Address = getAddress("0x45ed5ee2f9e175f59fbb28f61678afe78c3d70f8");

export const GATED_NFT_CONTRACTS: Address[] = [
  getAddress("0x712b0029a1763ef2aac240a39091bada6bdae4f8"),
  MOTZ_KEY_CONTRACT,
];

export async function holdsAnyGatedNft(owner: Address): Promise<boolean> {
  const balances = await Promise.all(
    GATED_NFT_CONTRACTS.map(addr =>
      client.readContract({ address: addr, abi: erc721Abi, functionName: "balanceOf", args: [owner] })
        .catch(() => 0n)
    )
  );
  return balances.some(b => b > 0n);
}

export async function holdsMotzKey(owner: Address): Promise<boolean> {
  try {
    const bal = await client.readContract({
      address: MOTZ_KEY_CONTRACT,
      abi: erc721Abi,
      functionName: "balanceOf",
      args: [owner],
    });
    return bal > 0n;
  } catch {
    return false;
  }
}
