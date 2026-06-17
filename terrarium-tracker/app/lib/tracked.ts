// Lightweight wallet tracking by Ronin address — Terrarium plot/axie data is
// public per address, so this needs no login.

export const TRACKED_KEY = "TRACKED_ADDRESSES";

export type TrackedAddress = { address: string; name?: string };

export type PlotSummary = {
  id: string;
  landType: string;
  tierKey: string | null;
  isFree: boolean;
  axieCount: number;
  flame: number;
};

export type AccountSummary = {
  address: string;
  plotCount: number;
  paidPlotCount: number;
  totalAxies: number;
  totalFlame: number;
  plots: PlotSummary[];
};

// Ronin addresses are sometimes written ronin:abc… — normalise to 0x.
export function normalizeAddress(input: string): string | null {
  const a = input.trim().replace(/^ronin:/i, "0x");
  return /^0x[0-9a-fA-F]{40}$/.test(a) ? a.toLowerCase() : null;
}

export function readTracked(): TrackedAddress[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TRACKED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeTracked(list: TrackedAddress[]) {
  localStorage.setItem(TRACKED_KEY, JSON.stringify(list));
}

export function addTracked(
  list: TrackedAddress[],
  address: string,
  name?: string
): TrackedAddress[] {
  const next = list.filter((t) => t.address !== address);
  next.push({ address, name });
  return next;
}

export function removeTracked(
  list: TrackedAddress[],
  address: string
): TrackedAddress[] {
  return list.filter((t) => t.address !== address);
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// ---- Wallet connect (injected EIP-1193 providers) ----

export type WalletKind =
  | "ronin"
  | "rabby"
  | "coinbase"
  | "metamask"
  | "walletconnect";

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isRonin?: boolean;
};

function pickInjected(test: (p: Eip1193) => boolean): Eip1193 | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: Eip1193 & { providers?: Eip1193[] } }).ethereum;
  if (!eth) return null;
  if (Array.isArray(eth.providers)) return eth.providers.find(test) ?? null;
  return test(eth) ? eth : null;
}

export async function connectWallet(
  kind: WalletKind
): Promise<{ address?: string; error?: string }> {
  if (typeof window === "undefined") return { error: "No browser." };
  const w = window as unknown as Record<string, unknown> & { ethereum?: Eip1193 };

  let provider: Eip1193 | null = null;
  switch (kind) {
    case "ronin":
      provider =
        ((w.ronin as { provider?: Eip1193 })?.provider as Eip1193) ??
        pickInjected((p) => !!p.isRonin);
      break;
    case "metamask":
      provider = pickInjected((p) => !!p.isMetaMask && !p.isRabby && !p.isCoinbaseWallet);
      break;
    case "rabby":
      provider = (w.rabby as Eip1193) ?? pickInjected((p) => !!p.isRabby);
      break;
    case "coinbase":
      provider =
        (w.coinbaseWalletExtension as Eip1193) ??
        pickInjected((p) => !!p.isCoinbaseWallet);
      break;
    case "walletconnect":
      return {
        error:
          "WalletConnect isn't wired up yet — connect an installed browser wallet for now.",
      };
  }

  if (!provider) {
    return { error: `Couldn't find that wallet. Is the extension installed?` };
  }
  try {
    const accs = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    const addr = accs?.[0];
    if (!addr) return { error: "No account returned." };
    return { address: String(addr).toLowerCase() };
  } catch (e) {
    const err = e as { code?: number; message?: string };
    if (err?.code === 4001) return { error: "Connection rejected." };
    return { error: err?.message ? String(err.message) : "Connection failed." };
  }
}

// Notify AccountsPanel (and any listeners) that the tracked list changed.
export function notifyTrackedUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("tracked-updated"));
  }
}

export async function fetchAccount(address: string): Promise<AccountSummary | null> {
  try {
    const res = await fetch(`/api/account?address=${address}`);
    if (!res.ok) return null;
    return (await res.json()) as AccountSummary;
  } catch {
    return null;
  }
}
