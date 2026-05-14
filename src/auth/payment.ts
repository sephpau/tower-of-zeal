// RON payment flow for shop purchases — wallet-agnostic.
// Works with any EIP-1193 injected provider (MetaMask, Coinbase Wallet,
// Rabby, Ronin Wallet, Trust, etc.) that holds RON on the Ronin network.
//
// Flow:
//   1. Detect injected wallet (window.ethereum)
//   2. Request accounts (wallet popup if not yet connected)
//   3. Ensure wallet is on Ronin chain (id 2020) — auto-switch or auto-add if needed
//   4. eth_sendTransaction with value = priceWei, to = TREASURY_WALLET
//   5. Return the tx hash → server verifies receipt on-chain before granting
//
// The actual on-chain inclusion is awaited by the SERVER (3-block confirmation
// check), so we don't block the UI here. Returning a tx hash is sufficient.

import { TREASURY_WALLET } from "../core/shop";

const RONIN_CHAIN_ID_DEC = 2020;
const RONIN_CHAIN_ID_HEX = "0x7e4"; // 2020 in hex

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  // Wallet-specific feature flags (informational, not required).
  isMetaMask?: boolean;
  isRonin?: boolean;
  isCoinbaseWallet?: boolean;
  isRabby?: boolean;
}

// Declare the injected provider hook globally without colliding with the rest
// of the TS lib types.
declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export interface PaymentResult {
  ok: boolean;
  txHash?: `0x${string}`;
  reason?: string;
}

function detectWallet(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

/** Make sure the connected wallet is on Ronin mainnet. If it isn't, ask the
 *  wallet to switch; if Ronin hasn't been added yet, add it. */
async function ensureRoninChain(provider: EthereumProvider): Promise<{ ok: true } | { ok: false; reason: string }> {
  let chainId: string;
  try {
    const result = await provider.request({ method: "eth_chainId" });
    chainId = typeof result === "string" ? result.toLowerCase() : "";
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "couldn't read wallet network" };
  }

  // Already on Ronin? Accept both 0x7e4 and a numerically-equivalent form
  // (some wallets return "0x07e4" or even the decimal as a string).
  if (chainId === RONIN_CHAIN_ID_HEX) return { ok: true };
  try {
    const asNum = parseInt(chainId, chainId.startsWith("0x") ? 16 : 10);
    if (asNum === RONIN_CHAIN_ID_DEC) return { ok: true };
  } catch { /* fall through */ }

  // Try to switch to Ronin.
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: RONIN_CHAIN_ID_HEX }],
    });
    return { ok: true };
  } catch (switchErr) {
    // 4902 = chain not in the wallet's known list — add it then it auto-switches.
    const errAny = switchErr as { code?: number; message?: string };
    if (errAny?.code === 4902) {
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: RONIN_CHAIN_ID_HEX,
            chainName: "Ronin",
            rpcUrls: ["https://api.roninchain.com/rpc"],
            nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
            blockExplorerUrls: ["https://app.roninchain.com"],
          }],
        });
        return { ok: true };
      } catch (addErr) {
        return {
          ok: false,
          reason: addErr instanceof Error
            ? `couldn't add Ronin network: ${addErr.message}`
            : "couldn't add Ronin network",
        };
      }
    }
    // Other failures: user rejected the network switch, etc.
    const msg = errAny?.message ?? "failed to switch to Ronin network";
    if (/reject|denied|cancel/i.test(msg)) {
      return { ok: false, reason: "please switch to Ronin network in your wallet and try again" };
    }
    return { ok: false, reason: msg };
  }
}

/** Open the user's wallet, make sure it's on Ronin, then ask them to send
 *  `priceWei` RON to the treasury. Returns the tx hash on success. */
export async function payForItem(priceWei: bigint): Promise<PaymentResult> {
  const provider = detectWallet();
  if (!provider) {
    return { ok: false, reason: "no Web3 wallet detected — install MetaMask, Ronin Wallet, or any Ronin-compatible wallet" };
  }

  // 1. Request accounts (this opens the wallet popup the first time).
  let address: string;
  try {
    const result = await provider.request({ method: "eth_requestAccounts" });
    const accounts = Array.isArray(result) ? result as string[] : [];
    if (accounts.length === 0 || !accounts[0]) {
      return { ok: false, reason: "no account returned by wallet" };
    }
    address = accounts[0];
  } catch (e) {
    const msg = e instanceof Error ? e.message : "wallet connect rejected";
    if (/reject|denied|cancel/i.test(msg)) {
      return { ok: false, reason: "wallet connection cancelled" };
    }
    return { ok: false, reason: msg };
  }

  // 2. Ensure we're on Ronin mainnet.
  const chainCheck = await ensureRoninChain(provider);
  if (!chainCheck.ok) return { ok: false, reason: chainCheck.reason };

  // 3. Build + send the tx. value is bigint → hex string for JSON-RPC.
  const valueHex = "0x" + priceWei.toString(16);
  try {
    const result = await provider.request({
      method: "eth_sendTransaction",
      params: [{
        from: address,
        to: TREASURY_WALLET,
        value: valueHex,
        // No `data`; this is a plain RON transfer.
      }],
    });
    if (typeof result !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(result)) {
      return { ok: false, reason: "wallet returned no tx hash" };
    }
    return { ok: true, txHash: result as `0x${string}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "wallet send failed";
    if (/reject|denied|cancel/i.test(msg)) {
      return { ok: false, reason: "purchase cancelled" };
    }
    return { ok: false, reason: msg };
  }
}
