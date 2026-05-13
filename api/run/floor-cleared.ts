import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifySession } from "../_lib/jwt.js";
import {
  bumpXpCap, XP_CAP_PER_FLOOR, submitWorldEnderClear,
  bumpFloorRetry, readFloorRetries, FLOOR_RETRIES_PER_DAY,
  adminClearAllLeaderboards, adminClearLeaderboard, AdminResetScope,
  recordFloorModeClear,
  saveReplayBlob, loadReplayBlob,
  adminWipeDevData,
} from "../_lib/runState.js";
import { adminGrantEnergy } from "../_lib/energy.js";

const MAX_PARTY_SIZE = 3;
/** Reject replays whose battles report >MAX_PARTY_SIZE units or duplicates —
 *  blocks DevTools-manipulated submissions from landing on the leaderboard. */
function isReplayPartyValid(blob: unknown): boolean {
  if (!blob || typeof blob !== "object") return true;
  const battles = (blob as { battles?: unknown }).battles;
  if (!Array.isArray(battles)) return true;
  for (const battle of battles) {
    if (!battle || typeof battle !== "object") continue;
    const party = (battle as { party?: unknown }).party;
    if (!Array.isArray(party)) continue;
    if (party.length > MAX_PARTY_SIZE) return false;
    const ids = party
      .map(p => (p && typeof p === "object" ? (p as { templateId?: unknown }).templateId : null))
      .filter((x): x is string => typeof x === "string");
    if (new Set(ids).size !== ids.length) return false;
  }
  return true;
}
import { getAddress } from "viem";
import { getCurrentMultiplier } from "../_lib/daily.js";
import { isAdmin } from "../_lib/admin.js";
import { adminGrantEnergy, adminFillEnergy, ENERGY_MAX } from "../_lib/energy.js";

// Floor-mode battle event endpoint. Handles three operations to stay under
// the Vercel Hobby 12-function cap:
//   op: "clear"     (default) — successful clear; bump XP ceiling (+ optional World Ender time)
//   op: "retry_status"        — read the wallet's remaining defeat-refund count for today
//   op: "defeat_refund"       — atomically consume one refund slot AND grant +1 energy; 429 if cap reached
//
// Body: { stageId: number, op?: string, ms?: number }
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) { res.status(401).json({ error: "no token" }); return; }

  const body = (req.body ?? {}) as { stageId?: unknown; ms?: unknown; op?: unknown };
  const op = typeof body.op === "string" ? body.op : "clear";

  let address: string;
  try {
    const session = await verifySession(auth.slice("Bearer ".length));
    address = session.address;
  } catch {
    res.status(401).json({ error: "invalid session" }); return;
  }

  // Admin ops don't need a stageId — handled before the stage validation.
  if (op === "admin_reset_leaderboards") {
    if (!isAdmin(address)) { res.status(403).json({ error: "admin only" }); return; }
    try {
      const keys = await adminClearAllLeaderboards();
      res.status(200).json({ ok: true, cleared: keys });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
    }
    return;
  }
  if (op === "admin_reset_lb") {
    if (!isAdmin(address)) { res.status(403).json({ error: "admin only" }); return; }
    const scope = (req.body as { scope?: unknown }).scope;
    if (scope !== "survival" && scope !== "bossraid" && scope !== "we" && scope !== "conquer") {
      res.status(400).json({ error: "bad scope" }); return;
    }
    try {
      const keys = await adminClearLeaderboard(scope as AdminResetScope);
      res.status(200).json({ ok: true, cleared: keys });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
    }
    return;
  }
  if (op === "admin_wipe_dev") {
    if (!isAdmin(address)) { res.status(403).json({ error: "admin only" }); return; }
    try {
      const r = await adminWipeDevData();
      if (!r.ok) { res.status(400).json({ error: r.reason ?? "wipe refused" }); return; }
      res.status(200).json({ ok: true, scanned: r.scanned, deleted: r.deleted });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
    }
    return;
  }
  if (op === "admin_grant_energy" || op === "admin_fill_energy") {
    if (!isAdmin(address)) { res.status(403).json({ error: "admin only" }); return; }
    try {
      let amount: number;
      if (op === "admin_fill_energy") {
        amount = await adminFillEnergy(address);
      } else {
        const delta = typeof (req.body as { delta?: unknown }).delta === "number"
          ? Math.floor((req.body as { delta: number }).delta)
          : 5;
        if (Math.abs(delta) > 999) { res.status(400).json({ error: "delta too large" }); return; }
        amount = await adminGrantEnergy(address, delta);
      }
      res.status(200).json({ ok: true, amount, max: ENERGY_MAX });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
    }
    return;
  }

  // Replay fetch — public-ish, allows anyone to view another wallet's replay.
  if (op === "get_replay") {
    const scope = typeof (req.body as { scope?: unknown }).scope === "string" ? (req.body as { scope: string }).scope : "";
    const targetRaw = typeof (req.body as { address?: unknown }).address === "string" ? (req.body as { address: string }).address : "";
    if (!scope || !targetRaw) { res.status(400).json({ error: "scope and address required" }); return; }
    if (!/^[a-zA-Z0-9_:-]{1,32}$/.test(scope)) { res.status(400).json({ error: "bad scope" }); return; }
    let target: string;
    try { target = getAddress(targetRaw); }
    catch { res.status(400).json({ error: "bad address" }); return; }
    try {
      const blob = await loadReplayBlob(scope, target);
      res.status(200).json({ ok: true, blob });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
    }
    return;
  }

  const stageId = typeof body.stageId === "number" ? body.stageId : null;
  if (stageId === null || stageId < 1 || stageId > 50) {
    res.status(400).json({ error: "stageId out of range" }); return;
  }
  const ms = typeof body.ms === "number" && Number.isFinite(body.ms) ? Math.floor(body.ms) : null;
  const replay = (req.body as { replay?: unknown }).replay && typeof (req.body as { replay?: unknown }).replay === "object"
    ? (req.body as { replay: object }).replay
    : null;

  try {
    if (op === "retry_status") {
      const used = await readFloorRetries(address);
      const remaining = Math.max(0, FLOOR_RETRIES_PER_DAY - used);
      res.status(200).json({ ok: true, used, remaining, max: FLOOR_RETRIES_PER_DAY });
      return;
    }

    if (op === "defeat_refund") {
      // Atomic: check the per-wallet daily counter, bump it, then grant +1 energy.
      // Counter shares the same Redis key the old "retry" feature used (PH-day TTL)
      // so the cap can't be hacked from devtools — every claim hits the server.
      const beforeUsed = await readFloorRetries(address);
      if (beforeUsed >= FLOOR_RETRIES_PER_DAY) {
        res.status(429).json({ ok: false, used: beforeUsed, remaining: 0, max: FLOOR_RETRIES_PER_DAY });
        return;
      }
      const newUsed = await bumpFloorRetry(address);
      // Race: another concurrent claim could push us over the cap. The extra
      // increment still expires at the next PH boundary, so we just hard-deny.
      if (newUsed > FLOOR_RETRIES_PER_DAY) {
        res.status(429).json({ ok: false, used: newUsed, remaining: 0, max: FLOOR_RETRIES_PER_DAY });
        return;
      }
      // Now grant the energy. If this fails, we've already burnt a slot — accept
      // that small loss vs. the alternative of granting energy without bumping.
      const energy = await adminGrantEnergy(address, 1);
      res.status(200).json({
        ok: true,
        used: newUsed,
        remaining: FLOOR_RETRIES_PER_DAY - newUsed,
        max: FLOOR_RETRIES_PER_DAY,
        energy,
      });
      return;
    }

    // Default: clear event
    const dailyMul = await getCurrentMultiplier(address).catch(() => 1.0);
    const cap = await bumpXpCap(address, XP_CAP_PER_FLOOR.floor * dailyMul);

    let worldEnderSubmitted = false;
    let worldEnderImproved = false;
    if (stageId === 50 && ms !== null) {
      const we = await submitWorldEnderClear(address, ms).catch(() => ({ ok: false, improved: false }));
      worldEnderSubmitted = we.ok;
      worldEnderImproved = we.improved;
    }
    // Save replay blob alongside the LB entry only when this clear actually
    // improved the wallet's PB — otherwise we'd churn Upstash for nothing.
    // Also rejects replays whose recorded party violates the size cap.
    if (stageId === 50 && replay && worldEnderImproved && isReplayPartyValid(replay)) {
      await saveReplayBlob("we", address, replay).catch(() => undefined);
    }

    // Track sequential floor-mode progress + first-to-conquer trophy.
    // The replay (if present) carries the party at floor-50 finish — we lift
    // it into the conqueror record so the leaderboard can show stats / class /
    // loadout for the first wallet to top out.
    type PartyMemberMin = { templateId: string; classId?: string; level: number; customStats: Record<string, number>; equippedSkills: string[] };
    let conquerParty: PartyMemberMin[] | undefined;
    if (stageId === 50 && replay && isReplayPartyValid(replay) && Array.isArray((replay as { battles?: unknown }).battles)) {
      const battles = (replay as { battles: { party?: PartyMemberMin[] }[] }).battles;
      const last = battles[battles.length - 1];
      if (last && Array.isArray(last.party)) {
        // Truncate to MAX_PARTY_SIZE as a defense in depth — isReplayPartyValid
        // already rejects oversize parties, but this guarantees the conqueror
        // record can never store > MAX_PARTY_SIZE entries.
        conquerParty = last.party.slice(0, MAX_PARTY_SIZE).map(p => ({
          templateId: String(p.templateId),
          classId: p.classId,
          level: Number(p.level) || 1,
          customStats: p.customStats ?? {},
          equippedSkills: Array.isArray(p.equippedSkills) ? p.equippedSkills : [],
        }));
      }
    }
    const conquer = await recordFloorModeClear(address, stageId, conquerParty).catch(() => ({ newMax: 0, awardedConqueror: false }));

    res.status(200).json({
      ok: true,
      cap,
      worldEnderSubmitted,
      maxFloorCleared: conquer.newMax,
      awardedConqueror: conquer.awardedConqueror,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
  }
}
