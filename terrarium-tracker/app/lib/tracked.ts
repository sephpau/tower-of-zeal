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

export async function fetchAccount(address: string): Promise<AccountSummary | null> {
  try {
    const res = await fetch(`/api/account?address=${address}`);
    if (!res.ok) return null;
    return (await res.json()) as AccountSummary;
  } catch {
    return null;
  }
}
