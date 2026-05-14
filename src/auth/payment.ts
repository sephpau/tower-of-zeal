// RON payment flow for shop purchases — wallet-agnostic.
// Works with any EIP-1193 injected provider (MetaMask, Coinbase Wallet,
// Rabby, Ronin Wallet, Trust, etc.) that holds RON on the Ronin network.
//
// Detection enumerates every available wallet so the UI can present a picker.
// The actual on-chain inclusion is awaited by the SERVER (3-block confirmation
// check), so we don't block the UI here. Returning a tx hash is sufficient.

import { TREASURY_WALLET } from "../core/shop";

const RONIN_CHAIN_ID_DEC = 2020;
const RONIN_CHAIN_ID_HEX = "0x7e4"; // 2020 in hex

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  providers?: EthereumProvider[];
  isMetaMask?: boolean;
  isRonin?: boolean;
  isCoinbaseWallet?: boolean;
  isRabby?: boolean;
  isTrust?: boolean;
  isBraveWallet?: boolean;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
    ronin?: { provider?: EthereumProvider } | EthereumProvider;
  }
}

export interface PaymentResult {
  ok: boolean;
  txHash?: `0x${string}`;
  reason?: string;
}

/** A wallet the picker can offer to the player. */
export interface WalletOption {
  id: string;
  name: string;
  /** Emoji or short glyph used by the picker UI. */
  icon: string;
  /** True if this is a software-installed extension we already see in the
   *  page; false if it's a fallback / SDK-mediated option. */
  detected: boolean;
  /** Returns the EIP-1193 provider to use for this option. May open a
   *  separate install prompt for non-detected options. */
  getProvider(): Promise<EthereumProvider | null>;
}

function classifyProvider(p: EthereumProvider): { id: string; name: string; icon: string } {
  if (p.isRonin) return { id: "ronin", name: "Ronin Wallet", icon: "🐉" };
  if (p.isMetaMask) return { id: "metamask", name: "MetaMask", icon: "🦊" };
  if (p.isCoinbaseWallet) return { id: "coinbase", name: "Coinbase Wallet", icon: "🔵" };
  if (p.isRabby) return { id: "rabby", name: "Rabby", icon: "🐰" };
  if (p.isTrust) return { id: "trust", name: "Trust Wallet", icon: "🛡" };
  if (p.isBraveWallet) return { id: "brave", name: "Brave Wallet", icon: "🦁" };
  return { id: "unknown", name: "Web3 Wallet", icon: "💼" };
}

/** Wait briefly for late-injected providers — some wallets inject after the
 *  page's `load` event. 800ms is enough for MetaMask / Ronin Wallet on
 *  cold loads without making the user wait noticeably. */
async function waitForAnyProvider(maxMs = 800): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (anyProviderInjected()) return;
    await new Promise(res => setTimeout(res, 80));
  }
}
function anyProviderInjected(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.ronin || !!window.ethereum;
}

/** Enumerate ALL EIP-1193 providers currently injected, deduped by classify id. */
export async function discoverWallets(): Promise<WalletOption[]> {
  await waitForAnyProvider();
  const out: WalletOption[] = [];
  const seen = new Set<string>();

  // 1. window.ronin — Ronin Wallet's primary injection.
  if (typeof window !== "undefined" && window.ronin) {
    const r = window.ronin;
    const provider: EthereumProvider | null =
      typeof (r as { request?: unknown }).request === "function"
        ? (r as EthereumProvider)
        : (r as { provider?: EthereumProvider }).provider ?? null;
    if (provider) {
      if (!seen.has("ronin")) {
        seen.add("ronin");
        out.push({
          id: "ronin",
          name: "Ronin Wallet",
          icon: "🐉",
          detected: true,
          getProvider: async () => provider,
        });
      }
    }
  }

  // 2. window.ethereum.providers[] — multi-wallet hub.
  const eth = typeof window !== "undefined" ? window.ethereum : undefined;
  if (eth) {
    const list = Array.isArray(eth.providers) && eth.providers.length > 0 ? eth.providers : [eth];
    for (const p of list) {
      const info = classifyProvider(p);
      if (seen.has(info.id) || info.id === "unknown") continue;
      seen.add(info.id);
      out.push({
        id: info.id,
        name: info.name,
        icon: info.icon,
        detected: true,
        getProvider: async () => p,
      });
    }
    // If all flags-on detection failed, still surface a generic option so the
    // user has SOMETHING to click.
    if (out.length === 0) {
      out.push({
        id: "unknown",
        name: "Detected wallet",
        icon: "💼",
        detected: true,
        getProvider: async () => eth,
      });
    }
  }

  // 3. tanto-connect Ronin Wallet fallback — always offered if not already detected.
  if (!seen.has("ronin")) {
    out.push({
      id: "ronin-tanto",
      name: "Ronin Wallet",
      icon: "🐉",
      detected: false,
      getProvider: async () => {
        try {
          const { requestRoninWalletConnector } = await import("@sky-mavis/tanto-connect");
          const connector = await requestRoninWalletConnector();
          await connector.connect(RONIN_CHAIN_ID_DEC);
          const provider = await connector.getProvider();
          return (provider as unknown as EthereumProvider) ?? null;
        } catch { return null; }
      },
    });
  }

  return out;
}

/** Make sure the connected wallet is on Ronin mainnet. */
async function ensureRoninChain(provider: EthereumProvider): Promise<{ ok: true } | { ok: false; reason: string }> {
  let chainId: string;
  try {
    const result = await provider.request({ method: "eth_chainId" });
    chainId = typeof result === "string" ? result.toLowerCase() : "";
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "couldn't read wallet network" };
  }
  if (chainId === RONIN_CHAIN_ID_HEX) return { ok: true };
  try {
    const asNum = parseInt(chainId, chainId.startsWith("0x") ? 16 : 10);
    if (asNum === RONIN_CHAIN_ID_DEC) return { ok: true };
  } catch { /* fall through */ }
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: RONIN_CHAIN_ID_HEX }],
    });
    return { ok: true };
  } catch (switchErr) {
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
    const msg = errAny?.message ?? "failed to switch to Ronin network";
    if (/reject|denied|cancel/i.test(msg)) {
      return { ok: false, reason: "please switch to Ronin network in your wallet and try again" };
    }
    return { ok: false, reason: msg };
  }
}

/** Send a `priceWei` RON tx to the treasury from the chosen wallet option.
 *  Caller is responsible for opening the picker first and passing the result. */
export async function payWithWallet(opt: WalletOption, priceWei: bigint): Promise<PaymentResult> {
  const provider = await opt.getProvider();
  if (!provider) return { ok: false, reason: `${opt.name} could not be opened` };

  let address: string;
  try {
    const result = await provider.request({ method: "eth_requestAccounts" });
    const accounts = Array.isArray(result) ? result as string[] : [];
    if (accounts.length === 0 || !accounts[0]) return { ok: false, reason: "no account returned by wallet" };
    address = accounts[0];
  } catch (e) {
    const msg = e instanceof Error ? e.message : "wallet connect rejected";
    if (/reject|denied|cancel/i.test(msg)) return { ok: false, reason: "wallet connection cancelled" };
    return { ok: false, reason: msg };
  }

  const chainCheck = await ensureRoninChain(provider);
  if (!chainCheck.ok) return { ok: false, reason: chainCheck.reason };

  const valueHex = "0x" + priceWei.toString(16);
  try {
    const result = await provider.request({
      method: "eth_sendTransaction",
      params: [{ from: address, to: TREASURY_WALLET, value: valueHex }],
    });
    if (typeof result !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(result)) {
      return { ok: false, reason: "wallet returned no tx hash" };
    }
    return { ok: true, txHash: result as `0x${string}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "wallet send failed";
    if (/reject|denied|cancel/i.test(msg)) return { ok: false, reason: "purchase cancelled" };
    return { ok: false, reason: msg };
  }
}
