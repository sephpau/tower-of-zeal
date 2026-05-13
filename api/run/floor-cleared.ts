import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifySession } from "../_lib/jwt.js";
import {
  bumpXpCap, XP_CAP_PER_FLOOR, submitWorldEnderClear,
  bumpFloorRetry, readFloorRetries, FLOOR_RETRIES_PER_DAY,
  adminClearAllLeaderboards, adminClearLeaderboard, AdminResetScope,
  recordFloorModeClear,
  saveReplayBlob, loadReplayBlob,
  adminWipeDevData,
  readAttempts, bumpAttempts, attemptsCap,
  readShopInventory, writeShopInventory,
  readBoughtToday, markBoughtToday, consumeBuff,
  SHOP_BUFF_IDS, ShopItemId, BUFF_GRANT_SIZE,
  grantTempMotzKey, readTempMotzKey,
  rollBronForKills,
  MAX_KILLS_PER_ROLL, MAX_BOSS_KILLS_PER_ROLL, MAX_WORLD_ENDER_KILLS_PER_ROLL,
} from "../_lib/runState.js";

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

  // ---- bRON voucher drops ----
  // bron_roll: client reports per-battle kill counts; server rolls drops with
  //            crypto RNG and deposits per-tier vouchers into the wallet's
  //            shop inventory. There is no longer a running bRON "balance" —
  //            each tier voucher is its own inventory item, redeemed at end
  //            of season. Multipliers: mob 1×, boss 2×, world_ender 4×.
  if (op === "bron_roll") {
    const killsRaw = (req.body as { kills?: unknown }).kills;
    const bossRaw = (req.body as { bossKills?: unknown }).bossKills;
    const weRaw = (req.body as { worldEnderKills?: unknown }).worldEnderKills;
    if (typeof killsRaw !== "number" || !Number.isFinite(killsRaw) || killsRaw < 0) {
      res.status(400).json({ error: "kills must be a non-negative number" }); return;
    }
    if (typeof bossRaw !== "number" || !Number.isFinite(bossRaw) || bossRaw < 0) {
      res.status(400).json({ error: "bossKills must be a non-negative number" }); return;
    }
    // worldEnderKills optional for back-compat — defaults to 0 if not sent.
    const weKills = typeof weRaw === "number" && Number.isFinite(weRaw) && weRaw >= 0 ? weRaw : 0;
    try {
      const result = await rollBronForKills(address, killsRaw, bossRaw, weKills);
      res.status(200).json({
        ok: true,
        drops: result.drops,
        killsCounted: result.killsCounted,
        bossKillsCounted: result.bossKillsCounted,
        worldEnderKillsCounted: result.worldEnderKillsCounted,
        caps: {
          kills: MAX_KILLS_PER_ROLL,
          bossKills: MAX_BOSS_KILLS_PER_ROLL,
          worldEnderKills: MAX_WORLD_ENDER_KILLS_PER_ROLL,
        },
      });
      return;
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
      return;
    }
  }

  // ---- Daily attempt cap ops (Survival / Boss Raid) ----
  // No stageId needed — these gate run starts before the squad screen.
  if (op === "attempts_status" || op === "attempts_claim") {
    const modeRaw = (req.body as { mode?: unknown }).mode;
    if (modeRaw !== "survival" && modeRaw !== "boss_raid") {
      res.status(400).json({ error: "mode must be survival|boss_raid" }); return;
    }
    const mode = modeRaw;
    try {
      if (op === "attempts_status") {
        const used = await readAttempts(mode, address);
        const cap = attemptsCap(mode);
        res.status(200).json({ ok: true, used, remaining: Math.max(0, cap - used), max: cap });
        return;
      }
      // attempts_claim — atomic bump-then-check. We use the post-increment
      // value so concurrent claims can't race past the cap.
      const before = await readAttempts(mode, address);
      const cap = attemptsCap(mode);
      if (before >= cap) {
        res.status(429).json({ ok: false, used: before, remaining: 0, max: cap });
        return;
      }
      const newUsed = await bumpAttempts(mode, address);
      if (newUsed > cap) {
        res.status(429).json({ ok: false, used: newUsed, remaining: 0, max: cap });
        return;
      }
      res.status(200).json({ ok: true, used: newUsed, remaining: cap - newUsed, max: cap });
      return;
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
      return;
    }
  }

  // ---- Shop ops ----
  // shop_status — read current inventory + which items have been bought today.
  // shop_buy    — atomic: check daily-bought flag, mark, grant the item.
  // shop_consume — consume one of an owned buff (called by run-start flow).
  if (op === "shop_status") {
    try {
      const inv = await readShopInventory(address);
      const allItems: ShopItemId[] = [
        "energy_5", "energy_10", "energy_20",
        "unit_stat_reset", "unit_class_change", "unit_temp_motz_key",
        ...SHOP_BUFF_IDS,
      ];
      const bought: Partial<Record<ShopItemId, boolean>> = {};
      await Promise.all(allItems.map(async id => {
        bought[id] = await readBoughtToday(id, address);
      }));
      // Surface the temp MoTZ Key state so the inventory UI can render an
      // active-pass card with the remaining time.
      const tempKey = await readTempMotzKey(address);
      const tempMotzKey = tempKey && tempKey.expiresAt > Date.now()
        ? { active: true, expiresAt: tempKey.expiresAt }
        : { active: false };
      res.status(200).json({ ok: true, inventory: inv, boughtToday: bought, tempMotzKey });
      return;
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
      return;
    }
  }

  if (op === "shop_buy") {
    const itemRaw = (req.body as { item?: unknown }).item;
    if (typeof itemRaw !== "string") { res.status(400).json({ error: "item required" }); return; }
    const itemId = itemRaw as ShopItemId;
    // Whitelist guard — only accept known item ids.
    const known: ShopItemId[] = [
      "energy_5", "energy_10", "energy_20",
      "unit_stat_reset", "unit_class_change",
      ...SHOP_BUFF_IDS,
    ];
    known.push("unit_temp_motz_key");
    if (!known.includes(itemId)) { res.status(400).json({ error: "unknown item" }); return; }
    try {
      // Atomic daily-buy gate.
      const already = await readBoughtToday(itemId, address);
      if (already) { res.status(429).json({ ok: false, reason: "already bought today" }); return; }
      const after = await markBoughtToday(itemId, address);
      if (after > 1) {
        // Race: another claim raced past us. We've still bumped the counter
        // but we shouldn't grant.
        res.status(429).json({ ok: false, reason: "already bought today" });
        return;
      }
      // Grant the item.
      // NOTE: Payment verification ($crypto) is intentionally NOT wired yet —
      // beta phase grants items free. When payment is wired, this block will
      // verify a signed Ronin tx before granting.
      // Energy packs no longer grant energy on purchase — they go into the
      // inventory like every other shop item, and the player "uses" them from
      // the Inventory screen via the inventory_use_energy op. This lets players
      // stockpile and time their refills.
      if (itemId === "energy_5" || itemId === "energy_10" || itemId === "energy_20") {
        const inv = await readShopInventory(address);
        inv.buffs[itemId] = (inv.buffs[itemId] ?? 0) + 1;
        await writeShopInventory(address, inv);
        res.status(200).json({ ok: true, grant: { type: "energy_pack", itemId, owned: inv.buffs[itemId] } });
        return;
      }
      // Temporary MoTZ Key — direct grant, no inventory slot needed. The
      // server stores an expiresAt timestamp and auth/me OR's it into
      // perks.motzKey on every session check. Stacks with existing time.
      if (itemId === "unit_temp_motz_key") {
        const r = await grantTempMotzKey(address);
        res.status(200).json({ ok: true, grant: { type: "temp_motz_key", expiresAt: r.expiresAt } });
        return;
      }
      if (itemId === "unit_stat_reset" || itemId === "unit_class_change") {
        // These grants are consumed client-side (UI flow lets the player pick
        // which unit + which class). We just record an entitlement in the
        // inventory blob with a count: client checks count before letting the
        // player perform the action, then calls shop_consume to spend it.
        const inv = await readShopInventory(address);
        inv.buffs[itemId] = (inv.buffs[itemId] ?? 0) + 1;
        await writeShopInventory(address, inv);
        res.status(200).json({ ok: true, grant: { type: "entitlement", itemId, owned: inv.buffs[itemId] } });
        return;
      }
      if (SHOP_BUFF_IDS.includes(itemId)) {
        const inv = await readShopInventory(address);
        const grantQty = BUFF_GRANT_SIZE[itemId] ?? 1;
        inv.buffs[itemId] = (inv.buffs[itemId] ?? 0) + grantQty;
        await writeShopInventory(address, inv);
        res.status(200).json({ ok: true, grant: { type: "buff", itemId, owned: inv.buffs[itemId], qty: grantQty } });
        return;
      }
      res.status(500).json({ error: "no grant handler" });
      return;
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
      return;
    }
  }

  if (op === "shop_consume") {
    const itemRaw = (req.body as { item?: unknown }).item;
    if (typeof itemRaw !== "string") { res.status(400).json({ error: "item required" }); return; }
    const itemId = itemRaw as ShopItemId;
    try {
      const ok = await consumeBuff(address, itemId);
      if (!ok) { res.status(400).json({ ok: false, reason: "none owned" }); return; }
      const inv = await readShopInventory(address);
      res.status(200).json({ ok: true, inventory: inv });
      return;
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
      return;
    }
  }

  // Atomic "use an energy pack from inventory" — decrement count + grant energy.
  // Same anti-cheat surface: localStorage can't fake the grant; server is the
  // sole authority for both inventory and energy.
  if (op === "inventory_use_energy") {
    const itemRaw = (req.body as { item?: unknown }).item;
    if (itemRaw !== "energy_5" && itemRaw !== "energy_10" && itemRaw !== "energy_20") {
      res.status(400).json({ error: "item must be energy_5|energy_10|energy_20" }); return;
    }
    const itemId = itemRaw as ShopItemId;
    try {
      const consumed = await consumeBuff(address, itemId);
      if (!consumed) { res.status(400).json({ ok: false, reason: "none owned" }); return; }
      const grantAmount = itemId === "energy_5" ? 5 : itemId === "energy_10" ? 10 : 20;
      const newAmount = await adminGrantEnergy(address, grantAmount);
      const inv = await readShopInventory(address);
      res.status(200).json({ ok: true, amount: newAmount, max: ENERGY_MAX, granted: grantAmount, inventory: inv });
      return;
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
      return;
    }
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
