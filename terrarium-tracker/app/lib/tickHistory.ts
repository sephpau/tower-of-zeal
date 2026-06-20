// Client-side history of the per-tier hourly tick, so we can chart bAXS/flame
// over time. The public API only exposes the CURRENT tick, so we accumulate one
// point per tick (deduped by tick number) into localStorage as the site is used.

export const TICK_HISTORY_KEY = "TICK_HISTORY_V1";
const MAX_POINTS = 336; // ~2 weeks of hourly ticks per tier

export type TickPoint = {
  tick: number; // tick number (x-axis)
  pool: number; // bAXS distributed that tick
  total: number; // competing flame that tick (the denominator)
  at: number; // wall-clock ms when recorded
};

export type TickSample = {
  tierKey: string;
  tick: number;
  pool: number;
  total: number;
};

type Store = Record<string, TickPoint[]>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(TICK_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function readTickHistory(): Store {
  return read();
}

// Merge new samples in, deduping by tick number per tier (last write wins),
// keeping the series sorted and capped. `now` is passed in so callers control
// the timestamp (kept side-effect-light). Returns the updated store.
export function recordTickSamples(
  samples: TickSample[],
  now: number
): Store {
  if (typeof window === "undefined") return {};
  const store = read();
  for (const s of samples) {
    if (!s.tierKey || !Number.isFinite(s.tick) || s.tick <= 0) continue;
    if (!(s.pool > 0) || !(s.total > 0)) continue;
    const series = store[s.tierKey] ?? [];
    const i = series.findIndex((p) => p.tick === s.tick);
    const point: TickPoint = {
      tick: s.tick,
      pool: s.pool,
      total: s.total,
      at: now,
    };
    if (i >= 0) series[i] = point;
    else series.push(point);
    series.sort((a, b) => a.tick - b.tick);
    store[s.tierKey] = series.slice(-MAX_POINTS);
  }
  try {
    localStorage.setItem(TICK_HISTORY_KEY, JSON.stringify(store));
  } catch {
    /* quota — ignore */
  }
  return store;
}
