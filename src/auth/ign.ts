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

export async function saveServerIgn(ign: string): Promise<boolean> {
  const sess = loadSession();
  if (!sess) return false;
  try {
    const r = await fetch("/api/ign", {
      method: "POST",
      headers: { Authorization: `Bearer ${sess.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ign }),
    });
    return r.ok;
  } catch { return false; }
}
