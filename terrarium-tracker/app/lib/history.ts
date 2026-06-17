// Client-side 24h history of per-tier Total Atia's Flame.
//
// The Terrarium API only ever returns the *current* tick (1 tick = 1 hour) and
// exposes no historical endpoint, so we record an hourly snapshot per tick in
// localStorage and keep the most recent ones. The series fills in over time as
// the app is opened across ticks.

const KEY = "FLAME_HISTORY";
const MAX_TICKS = 48; // keep a buffer; we display the last 24

type Store = { ticks: Record<string, Record<string, number>> };

function read(): Store {
  if (typeof window === "undefined") return { ticks: {} };
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && parsed.ticks) return parsed as Store;
  } catch {
    /* ignore */
  }
  return { ticks: {} };
}

function write(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore quota errors */
  }
}

/** Record the current tick's per-tier totals (dedup by tick). */
export function recordSnapshot(
  tick: number | null,
  totals: Record<string, number | null>
) {
  if (tick == null || typeof window === "undefined") return;
  const store = read();
  const entry: Record<string, number> = { ...(store.ticks[tick] ?? {}) };
  for (const [k, v] of Object.entries(totals)) {
    if (typeof v === "number") entry[k] = v;
  }
  store.ticks[tick] = entry;

  // Trim to the most recent MAX_TICKS ticks.
  const keys = Object.keys(store.ticks)
    .map(Number)
    .sort((a, b) => a - b);
  while (keys.length > MAX_TICKS) {
    const drop = keys.shift();
    if (drop != null) delete store.ticks[drop];
  }
  write(store);
}

export type SeriesPoint = { tick: number; value: number };

/** Last `n` recorded points for a tier, oldest → newest. */
export function getSeries(tierKey: string, n = 24): SeriesPoint[] {
  const store = read();
  return Object.keys(store.ticks)
    .map(Number)
    .sort((a, b) => a - b)
    .map((tick) => ({ tick, value: store.ticks[tick]?.[tierKey] }))
    .filter((p): p is SeriesPoint => typeof p.value === "number")
    .slice(-n);
}
