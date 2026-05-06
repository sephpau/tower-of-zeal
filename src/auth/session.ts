const STORAGE_KEY = "toz.session";

export interface Session {
  token: string;
  address: string;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.token !== "string" || typeof parsed?.address !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export interface Perks { motzKey: boolean }

export async function validateSession(token: string): Promise<{ address: string; perks: Perks } | null> {
  try {
    const r = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const data = await r.json();
    if (typeof data?.address !== "string") return null;
    const motzKey = !!data?.perks?.motzKey;
    return { address: data.address, perks: { motzKey } };
  } catch {
    return null;
  }
}

// Module-level cache of the wallet address the server actually verified for
// this session. localStorage settings/session contents are user-editable, so
// anything that needs to TRUST an address (admin gating, leaderboard binding)
// must read from here rather than from settings.walletAddress.
let verifiedAddress: string | null = null;
let verifiedPerks: Perks = { motzKey: false };

export function setVerifiedAddress(addr: string): void {
  verifiedAddress = addr.trim().toLowerCase();
}

export function getVerifiedAddress(): string | null {
  return verifiedAddress;
}

export function clearVerifiedAddress(): void {
  verifiedAddress = null;
  verifiedPerks = { motzKey: false };
}

export function setVerifiedPerks(p: Perks): void {
  verifiedPerks = { motzKey: !!p.motzKey };
}

export function getVerifiedPerks(): Perks {
  return verifiedPerks;
}
