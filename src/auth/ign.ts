import { loadSession } from "./session";

export async function fetchServerIgn(): Promise<string | null> {
  const sess = loadSession();
  if (!sess) return null;
  try {
    const r = await fetch("/api/ign", { headers: { Authorization: `Bearer ${sess.token}` } });
    if (!r.ok) return null;
    const data = await r.json() as { ign?: string | null };
    return typeof data.ign === "string" ? data.ign : null;
  } catch { return null; }
}

export type SaveIgnResult =
  | { ok: true; ign: string }
  | { ok: false; reason: "cooldown"; serverIgn: string; nextAllowedAt: number }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "network" };

export async function saveServerIgn(ign: string): Promise<SaveIgnResult> {
  const sess = loadSession();
  if (!sess) return { ok: false, reason: "network" };
  try {
    const r = await fetch("/api/ign", {
      method: "POST",
      headers: { Authorization: `Bearer ${sess.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ign }),
    });
    if (r.status === 429) {
      const data = await r.json().catch(() => ({})) as { ign?: string; nextAllowedAt?: number };
      return {
        ok: false,
        reason: "cooldown",
        serverIgn: data.ign ?? ign,
        nextAllowedAt: typeof data.nextAllowedAt === "number" ? data.nextAllowedAt : 0,
      };
    }
    if (r.status === 400) return { ok: false, reason: "invalid" };
    if (!r.ok) return { ok: false, reason: "network" };
    const data = await r.json() as { ign: string };
    return { ok: true, ign: data.ign };
  } catch { return { ok: false, reason: "network" }; }
}

export function formatCooldown(nextAllowedAt: number): string {
  const ms = Math.max(0, nextAllowedAt - Date.now());
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
