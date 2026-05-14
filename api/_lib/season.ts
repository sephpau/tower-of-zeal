// Season-halt kill switch. When the admin flips this on, ALL run starts are
// blocked server-side — campaign (energy spend), survival, and boss raid.
// Shop is intentionally left open so players can still spend RON / vouchers
// during the off-season; only the run-start ops gate on this flag.
//
// Devtool-proof: the flag lives in Redis and is read by every server-side
// gate before any run state mutation. A tampered client cannot bypass it.

import { getJson, setJson } from "./redis.js";

const KEY = "season:halted";

interface HaltRecord {
  halted: boolean;
  setAt: number;
  setBy: string;
}

/** Returns true iff the season is currently halted (admin pressed pause). */
export async function isSeasonHalted(): Promise<boolean> {
  const rec = await getJson<HaltRecord>(KEY);
  return !!(rec && rec.halted);
}

/** Returns the full record so admin UI can display when / by whom. */
export async function readSeasonHalt(): Promise<HaltRecord | null> {
  return await getJson<HaltRecord>(KEY);
}

/** Set or clear the halt flag. Caller must have already gated on `isAdmin`. */
export async function setSeasonHalt(halted: boolean, setBy: string): Promise<HaltRecord> {
  // No TTL — the flag persists until admin explicitly resumes.
  const rec: HaltRecord = { halted, setAt: Date.now(), setBy: setBy.toLowerCase() };
  await setJson(KEY, rec, 60 * 60 * 24 * 365 * 5); // 5-year TTL as a sanity cap
  return rec;
}

/** Standard rejection payload — 423 Locked is the right HTTP status for
 *  "the resource is temporarily unavailable due to admin lock." */
export const SEASON_HALTED_RESPONSE = {
  status: 423,
  body: {
    ok: false,
    seasonHalted: true,
    reason: "The current season has ended — runs are paused until the next season starts. The shop is still open if you want to redeem vouchers or stock up.",
  },
} as const;
