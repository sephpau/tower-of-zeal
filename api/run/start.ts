import type { VercelRequest, VercelResponse } from "@vercel/node";
import { nanoid } from "nanoid";
import { getAddress } from "viem";
import { verifySession, signRun } from "../_lib/jwt.js";
import { saveRun, bumpStartCounter, MAX_STARTS_PER_HOUR, isLbMode } from "../_lib/runState.js";
import { holdsMotzKey } from "../_lib/ronin.js";
import { isDevBypassWallet } from "../_lib/devBypass.js";
import { isSeasonHalted, SEASON_HALTED_RESPONSE } from "../_lib/season.js";

const MOTZ_KEY_LOCKED_UNITS = new Set(["hera", "nova", "oge", "shego"]);
/** Hard cap — must match src/units/roster.ts MAX_PARTY_SIZE. */
const MAX_PARTY_SIZE = 3;
const VALID_UNIT_IDS = new Set([
  "soda", "ego", "gruyere", "calypso", "calico", "nova", "hera", "aspen", "oge", "shego",
]);

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) { res.status(401).json({ error: "no token" }); return; }

  let address: string;
  try {
    const session = await verifySession(auth.slice("Bearer ".length));
    address = session.address;
  } catch {
    res.status(401).json({ error: "invalid session" }); return;
  }

  try {
    // Season-end kill switch — blocks ALL run starts (survival, boss raid,
    // campaign-via-energy-spend). Admin-flipped via floor-cleared op.
    if (await isSeasonHalted()) {
      res.status(SEASON_HALTED_RESPONSE.status).json(SEASON_HALTED_RESPONSE.body);
      return;
    }
    const starts = await bumpStartCounter(address);
    if (starts > MAX_STARTS_PER_HOUR) { res.status(429).json({ error: "too many runs" }); return; }

    const body = (req.body ?? {}) as { mode?: unknown; party?: unknown };
    const mode = isLbMode(body.mode) ? body.mode : "survival";

    // Sanitize the submitted party — reject anything that violates the party
    // size cap, duplicates a unit, or names a unit that isn't in the roster.
    // This is the server's last line of defense against DevTools-manipulated
    // clients pushing >MAX_PARTY_SIZE units.
    const rawParty: string[] = Array.isArray(body.party) ? body.party.filter((x): x is string => typeof x === "string") : [];
    if (rawParty.length > MAX_PARTY_SIZE) {
      res.status(400).json({ error: `party exceeds the ${MAX_PARTY_SIZE}-unit cap` });
      return;
    }
    if (new Set(rawParty).size !== rawParty.length) {
      res.status(400).json({ error: "duplicate units in party" });
      return;
    }
    if (rawParty.some(id => !VALID_UNIT_IDS.has(id))) {
      res.status(400).json({ error: "unknown unit id in party" });
      return;
    }
    const party = rawParty;

    // Reject runs that include MoTZ-locked units when the wallet doesn't hold the key.
    // Dev tester wallets bypass this check on dev environments only.
    if (party.some(id => MOTZ_KEY_LOCKED_UNITS.has(id)) && !isDevBypassWallet(address)) {
      const holds = await holdsMotzKey(getAddress(address)).catch(() => false);
      if (!holds) { res.status(403).json({ error: "wallet does not hold MoTZ Vault Key required for selected unit" }); return; }
    }

    const runId = nanoid(16);
    const now = Date.now();
    await saveRun(runId, {
      address,
      mode,
      startedAt: now,
      currentFloor: 0,
      lastFloorAt: now,
      status: "live",
    });
    const token = await signRun(runId, address);
    res.status(200).json({ runId, token });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
  }
}
