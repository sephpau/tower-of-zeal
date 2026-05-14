// RON payment flow for shop purchases — wallet-agnostic.
// Works with any EIP-1193 injected provider (MetaMask, Coinbase Wallet,
// Rabby, Ronin Wallet, Trust, etc.) that holds RON on the Ronin network.
//
// Detection enumerates every available wallet so the UI can present a picker.
// The actual on-chain inclusion is awaited by the SERVER (3-block confirmation
// check), so we don't block the UI here. Returning a tx hash is sufficient.

import { TREASURY_WALLET } from "../core/shop";
import { getVerifiedAddress } from "./session";

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
  /** Optional rich icon (data URL or remote URL) from EIP-6963 announcement. */
  iconUrl?: string;
  /** True if this is a software-installed extension we already see in the
   *  page; false if it's a fallback / SDK-mediated option. */
  detected: boolean;
  /** Returns the EIP-1193 provider to use for this option. May open a
   *  separate install prompt for non-detected options. */
  getProvider(): Promise<EthereumProvider | null>;
}

// ---- EIP-6963 multi-wallet discovery ----
// Modern wallets (Rabby, MetaMask, Coinbase, Phantom, Brave, etc.) announce
// themselves via the `eip6963:announceProvider` event when the page dispatches
// `eip6963:requestProvider`. Wallets that ONLY support this protocol (no
// window.ethereum at all) — like Rabby with MetaMask compat off — were
// invisible to the legacy detection.
interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;  // data URL or remote URL
  rdns: string;  // reverse-DNS, e.g. "io.rabby"
}
interface Eip6963ProviderDetail {
  info: Eip6963ProviderInfo;
  provider: EthereumProvider;
}

/** Map well-known rdns → short emoji icon (for the picker when iconUrl is
 *  weird or fails to load). */
function fallbackIconForRdns(rdns: string): string {
  const lc = rdns.toLowerCase();
  if (lc.includes("rabby")) return "🐰";
  if (lc.includes("ronin")) return "🐉";
  if (lc.includes("metamask")) return "🦊";
  if (lc.includes("coinbase")) return "🔵";
  if (lc.includes("trust")) return "🛡";
  if (lc.includes("brave")) return "🦁";
  if (lc.includes("phantom")) return "👻";
  if (lc.includes("okx")) return "🟢";
  return "💼";
}

/** Listen for EIP-6963 announcements for `timeoutMs`, then return all unique
 *  providers seen (deduped by rdns). */
function discoverEip6963(timeoutMs = 600): Promise<Eip6963ProviderDetail[]> {
  return new Promise(resolve => {
    if (typeof window === "undefined") { resolve([]); return; }
    const seen = new Map<string, Eip6963ProviderDetail>();
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
      if (!detail || !detail.info || !detail.provider) return;
      if (!seen.has(detail.info.rdns)) seen.set(detail.info.rdns, detail);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
    // Wallets respond to this dispatched event.
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);
      resolve(Array.from(seen.values()));
    }, timeoutMs);
  });
}

function classifyProvider(p: EthereumProvider): { id: string; name: string; icon: string; iconUrl?: string } {
  if (p.isRonin) return { id: "ronin", name: "Ronin Wallet", icon: "🐉", iconUrl: "/wallet-logos/ronin.svg" };
  if (p.isMetaMask) return { id: "metamask", name: "MetaMask", icon: "🦊", iconUrl: "/wallet-logos/metamask.svg" };
  if (p.isCoinbaseWallet) return { id: "coinbase", name: "Coinbase Wallet", icon: "🔵", iconUrl: "/wallet-logos/coinbase.svg" };
  if (p.isRabby) return { id: "rabby", name: "Rabby", icon: "🐰", iconUrl: "/wallet-logos/rabby.svg" };
  if (p.isTrust) return { id: "trust", name: "Trust Wallet", icon: "🛡", iconUrl: "/wallet-logos/trust.svg" };
  if (p.isBraveWallet) return { id: "brave", name: "Brave Wallet", icon: "🦁", iconUrl: "/wallet-logos/brave.svg" };
  return { id: "unknown", name: "Web3 Wallet", icon: "💼" };
}

/** Map well-known rdns → bundled brand-color monogram badge served from
 *  /public/wallet-logos/. Used when an EIP-6963 announcement didn't include
 *  an icon (rare, but happens with custom builds). */
function fallbackIconUrlForRdns(rdns: string): string | undefined {
  const lc = rdns.toLowerCase();
  if (lc.includes("rabby")) return "/wallet-logos/rabby.svg";
  if (lc.includes("ronin")) return "/wallet-logos/ronin.svg";
  if (lc.includes("metamask")) return "/wallet-logos/metamask.svg";
  if (lc.includes("coinbase")) return "/wallet-logos/coinbase.svg";
  if (lc.includes("trust")) return "/wallet-logos/trust.svg";
  if (lc.includes("brave")) return "/wallet-logos/brave.svg";
  return undefined;
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

/** Enumerate ALL EIP-1193 providers currently available via:
 *    a) EIP-6963 announcements (modern multi-wallet standard, Rabby+others)
 *    b) window.ronin (Ronin Wallet primary)
 *    c) window.ethereum.providers[] (multi-wallet hub)
 *    d) window.ethereum (legacy single-injection)
 *    e) tanto-connect Ronin Wallet fallback
 *  Deduped by stable id so the same wallet doesn't appear twice. */
export async function discoverWallets(): Promise<WalletOption[]> {
  await waitForAnyProvider();
  const out: WalletOption[] = [];
  const seen = new Set<string>();

  // a) EIP-6963 — wait briefly for announcements. Modern wallets (Rabby,
  //    MetaMask 11+, Coinbase, Phantom, Brave) ONLY announce this way.
  const announced = await discoverEip6963();
  for (const d of announced) {
    const id = d.info.rdns;
    if (seen.has(id)) continue;
    seen.add(id);
    // Also block the legacy/window-based detection paths from re-adding the
    // same wallet under a different id. Ronin Wallet specifically announces
    // as some flavor of "com.skymavis.wallet" / "wallet.ronin" via EIP-6963
    // AND also injects window.ronin — we need to recognize all aliases.
    const lcRdns = d.info.rdns.toLowerCase();
    if (lcRdns.includes("ronin") || lcRdns.includes("skymavis")) {
      seen.add("ronin");
      seen.add("ronin-tanto");
    }
    if (lcRdns.includes("metamask")) seen.add("io.metamask");
    if (lcRdns.includes("rabby")) seen.add("io.rabby");
    if (lcRdns.includes("coinbase")) seen.add("com.coinbase.wallet");
    if (lcRdns.includes("trust")) seen.add("com.trustwallet.app");
    if (lcRdns.includes("brave")) seen.add("brave-wallet");
    out.push({
      id,
      name: d.info.name,
      icon: fallbackIconForRdns(d.info.rdns),
      // Wallet's own announced icon takes priority; only fall back to our
      // bundled monogram badge if the wallet didn't include one.
      iconUrl: d.info.icon || fallbackIconUrlForRdns(d.info.rdns),
      detected: true,
      getProvider: async () => d.provider,
    });
  }

  // b) window.ronin — Ronin Wallet's primary injection.
  if (typeof window !== "undefined" && window.ronin && !seen.has("ronin")) {
    const r = window.ronin;
    const provider: EthereumProvider | null =
      typeof (r as { request?: unknown }).request === "function"
        ? (r as EthereumProvider)
        : (r as { provider?: EthereumProvider }).provider ?? null;
    if (provider) {
      seen.add("ronin");
      out.push({
        id: "ronin",
        name: "Ronin Wallet",
        icon: "🐉",
        iconUrl: "/wallet-logos/ronin.svg",
        detected: true,
        getProvider: async () => provider,
      });
    }
  }

  // c)+d) window.ethereum legacy paths — only add if not already covered
  //       by an EIP-6963 announcement (avoids duplicates of MetaMask, etc.).
  const eth = typeof window !== "undefined" ? window.ethereum : undefined;
  if (eth) {
    const list = Array.isArray(eth.providers) && eth.providers.length > 0 ? eth.providers : [eth];
    for (const p of list) {
      const info = classifyProvider(p);
      if (info.id === "unknown") continue;
      // Map legacy flags to the EIP-6963 rdns space when known so we dedupe
      // properly.
      const legacyId =
        info.id === "ronin" ? "ronin" :
        info.id === "metamask" ? "io.metamask" :
        info.id === "coinbase" ? "com.coinbase.wallet" :
        info.id === "rabby" ? "io.rabby" :
        info.id === "trust" ? "com.trustwallet.app" :
        info.id === "brave" ? "brave-wallet" :
        info.id;
      if (seen.has(legacyId)) continue;
      seen.add(legacyId);
      out.push({
        id: legacyId,
        name: info.name,
        icon: info.icon,
        iconUrl: info.iconUrl,
        detected: true,
        getProvider: async () => p,
      });
    }
    // If absolutely nothing was found via flags, still expose the raw injected
    // provider so the player has SOMETHING to click.
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

  // e) tanto-connect Ronin Wallet fallback — always offered if not already detected.
  if (!seen.has("ronin")) {
    out.push({
      id: "ronin-tanto",
      name: "Ronin Wallet",
      icon: "🐉",
      iconUrl: "/wallet-logos/ronin.svg",
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

function shortAddr(a: string): string {
  if (!a || a.length < 10) return a ?? "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Read the active account from a provider without prompting (uses eth_accounts,
 *  not eth_requestAccounts). Returns null if no provider is connected or no
 *  account is currently selected. */
export async function readActiveAccount(provider: EthereumProvider): Promise<string | null> {
  try {
    const result = await provider.request({ method: "eth_accounts" });
    const accounts = Array.isArray(result) ? result as string[] : [];
    return accounts[0] ?? null;
  } catch {
    return null;
  }
}

/** Subscribe to active-account changes on a provider. Returns an unsubscribe fn.
 *  Used by the wallet-status badge to refresh when the user switches accounts. */
export function onAccountsChanged(
  provider: EthereumProvider,
  cb: (accounts: string[]) => void,
): () => void {
  const handler = (accounts: unknown) => {
    cb(Array.isArray(accounts) ? accounts as string[] : []);
  };
  const p = provider as unknown as { on?: (event: string, fn: (a: unknown) => void) => void; removeListener?: (event: string, fn: (a: unknown) => void) => void };
  p.on?.("accountsChanged", handler);
  return () => p.removeListener?.("accountsChanged", handler);
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

  // Match-account guard: the wallet's active account MUST equal the
  // session-verified login wallet. The server enforces this too (tx.from
  // check), but failing early here gives a clear UX message instead of an
  // opaque server 402 after the player has signed and paid.
  const session = getVerifiedAddress();
  if (session && address.toLowerCase() !== session.toLowerCase()) {
    return {
      ok: false,
      reason: `the active account in this wallet (${shortAddr(address)}) doesn't match your logged-in wallet (${shortAddr(session)}). Switch the active account in your wallet, or sign out and sign in again with this wallet.`,
    };
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
