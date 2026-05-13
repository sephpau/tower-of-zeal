// Battle replay recorder + player.
//
// Determinism contract:
// - Combat depends on the RNG seed plus the EXACT party state at battle start
//   (templateId / classId / level / customStats / equippedSkills + hp/mp/gauge/
//   cooldowns when carrying over between floors). All captured per battle.
// - Player actions are recorded in order, tagged by attacker template index
//   and target enemy index. The replay engine injects them back in the same
//   order so the simulation reproduces the same sequence of damage rolls.
// - Replay format carries a `v` field; bump REPLAY_VERSION when combat
//   formulas change in an incompatible way.

import { Stats } from "./stats";

// v17: RON drops moved fully to the server. The client-side rng.chance() calls
//      that were added in v16 are gone, so RNG consumption matches v15 again.
//      v16 replays would diverge because the engine no longer consumes those
//      draws on enemy death.
// v16: RON voucher drops introduced. Every enemy kill now rolls 5 chance()
//      tiers via the battle RNG, so v15 replays diverge as soon as the first
//      enemy falls (extra rng draws shift every subsequent crit / damage roll).
// v15: Lucky Coin removed. v14 replays that used Lucky Coin would diverge —
//      its extra rng.chance() call is gone, so subsequent RNG draws differ.
// v14: Shop run-buffs introduced (Battle Cry / Phoenix Embers / Lucky Coin /
//      Quickdraw / Last Stand). Replays don't carry buff state yet — any v13
//      replay that was recorded with buffs active would diverge on playback
//      because the engine no longer re-applies them. Buff-free replays still
//      work. Will be addressed when payment goes live by adding a `runBuffs`
//      field to ReplayBattle.
// v13: Solo bosses (except World Ender) now take 50% reduced reflected damage.
//      Any v12 replay where reflect fired against a boss attacker (stone_sentinel,
//      wraith_lord, tower_lord, iron_behemoth, storm_lord, demon_general,
//      witch_queen, dragon_lord, tower_god, null_hierophant, the_untouched,
//      apex_arbiter) will diverge — the boss now takes half the reflect.
// v12: World Ender attacks now bypass damage_reflect entirely. Any v11 replay
//      of floor 50 with a reflect-equipped tank (Shego/Oge) tanking the boss
//      would diverge — old replays reflected damage back, new sim does not.
// v11: DEX armor-penetration cap lowered 50% → 40%. Any v10 replay where the
//      attacker had DEX ≥ 41 would diverge (more raw damage retained by armor).
// v10: World End! now starts on cooldown (initialCooldown: 10) — boss can't
//      open with it. v9 replays of floor 50 would diverge as soon as the boss
//      reaches turn 1 (cooldown state on the world_end skill differs).
// v9: World Ender gained "World End!" — AOE instant-kill 50%/target, 10-action
//     cooldown. v8 replays of floor 50 / boss raid finals would diverge as soon
//     as the boss fires it (RNG roll changes the kill state of every player).
// v8: Slime King HP bumped from 75 → 220 (was lower than its minions).
//     v7 replays of stage 1 would diverge once the King took damage.
// v7: heal effects now add `percentMaxHp` on top of flat power so heals stay
//     proportional at endgame. v6 replays where any heal fired (Soda Pop,
//     Tidal Mending, Siren's Sanctuary) would diverge.
// v6: re-tuned tank scaling — gaze/iron prophecy/fates rebound ally buff/iron
//     bulwark now use divisor 300 (vs default 200) so Lv 30 lands ~30% lower.
//     Per-skill power caps: fates rebound self dmg-red 80%, reflect 70%;
//     unyielding heart self dmg-red 90%. v5 replays would diverge.
// v5: tank skills (Shego's set + Oge's set) now scale buff power with VIT/DEF.
//     A v4 replay where Oge used Iron Bulwark would diverge because the
//     stat_buff now applies a larger boost in v5.
// v4: idle now heals 2% maxHp / 3% maxMp. Idle was previously a no-op, so any
//     v3 replay would diverge once a unit idled (extra HP/MP changing later
//     damage rolls).
// v3: combat sim now uses a fixed timestep (SIM_STEP). Replays recorded under
//     the old variable-dt sim could pick a different actor when two combatants
//     hit full gauge in the same frame, diverging RNG consumption.
export const REPLAY_VERSION = 17;

export interface ReplayPartyMember {
  templateId: string;
  classId?: string;
  level: number;
  customStats: Stats;
  equippedSkills: string[];
  /** State at the START of this battle. Omitted for fresh battles (engine
   *  uses full HP/MP). Set for survival/boss-raid mid-run carryover floors. */
  hp?: number;
  mp?: number;
  gauge?: number;
  alive?: boolean;
  skillCooldowns?: Record<string, number>;
}

export interface ReplayAction {
  /** Index into ReplayBattle.party. */
  attackerIdx: number;
  skillId: string;
  /** Index into ReplayBattle.enemies. -1 for self-target / no target. */
  targetIdx: number;
}

export interface ReplayBattle {
  stageId: number;
  seed: number;
  enemies: string[];
  party: ReplayPartyMember[];
  actions: ReplayAction[];
  /** Boss-raid options that were active when this battle started. Only set
   *  for boss_raid runs; absent for floor / survival. Without these the
   *  replay would run with un-scaled bosses and the recorded action stream
   *  would diverge (idle-spam at end, wrong damage numbers, etc.). */
  bossRaid?: {
    bossStatReduction: number;
    playerStatBoost: number;
    pendingHeal: boolean;
  };
}

export interface ReplayBlob {
  v: number;
  mode: "floor" | "survival" | "boss_raid";
  ign: string | null;
  recordedAt: number;
  battles: ReplayBattle[];
}

// ---- Recorder (in-memory while recording is active) ----

interface RecordingState {
  meta: { mode: "floor" | "survival" | "boss_raid"; ign: string | null };
  battles: ReplayBattle[];
  /** Index of the battle currently accepting actions. -1 if no battle started yet. */
  currentBattleIdx: number;
}

let recording: RecordingState | null = null;

export function isRecording(): boolean { return recording !== null; }

/** Begin a fresh recording. Battles are added one at a time via beginBattle(). */
export function startReplayRecording(mode: "floor" | "survival" | "boss_raid", ign: string | null): void {
  recording = { meta: { mode, ign }, battles: [], currentBattleIdx: -1 };
}

export interface BattleStartMeta {
  stageId: number;
  seed: number;
  enemies: string[];           // ordered list of enemy templateIds (spawn order)
  party: ReplayPartyMember[];  // party state at the start of THIS battle
  bossRaid?: ReplayBattle["bossRaid"];
}

/** Append a new battle to the recording and mark it active. */
export function recordBattleStart(meta: BattleStartMeta): void {
  if (!recording) return;
  const battle: ReplayBattle = {
    stageId: meta.stageId,
    seed: meta.seed,
    enemies: meta.enemies,
    party: meta.party,
    actions: [],
  };
  if (meta.bossRaid) battle.bossRaid = { ...meta.bossRaid };
  recording.battles.push(battle);
  recording.currentBattleIdx = recording.battles.length - 1;
}

/** Append a player action to the current battle. */
export function recordAction(attackerIdx: number, skillId: string, targetIdx: number): void {
  if (!recording || recording.currentBattleIdx < 0) return;
  if (attackerIdx < 0) return;
  recording.battles[recording.currentBattleIdx].actions.push({ attackerIdx, skillId, targetIdx });
}

/** Finalize and return the full replay blob. */
export function finalizeReplay(): ReplayBlob | null {
  if (!recording) return null;
  if (recording.battles.length === 0) { recording = null; return null; }
  const blob: ReplayBlob = {
    v: REPLAY_VERSION,
    mode: recording.meta.mode,
    ign: recording.meta.ign,
    recordedAt: Date.now(),
    battles: recording.battles.slice(),
  };
  recording = null;
  return blob;
}

export function abortRecording(): void {
  recording = null;
}

// ---- Backwards-compat shim ----
// Phase 1 callers used startRecording with a flat blob shape. Map onto the
// new multi-battle recorder so existing code keeps working until it's updated.

export interface LegacyStartMeta {
  stageId: number;
  mode: "floor" | "survival" | "boss_raid";
  ign: string | null;
  seed: number;
  enemies: string[];
  party: ReplayPartyMember[];
}

export function startRecording(meta: LegacyStartMeta): void {
  startReplayRecording(meta.mode, meta.ign);
  recordBattleStart({
    stageId: meta.stageId,
    seed: meta.seed,
    enemies: meta.enemies,
    party: meta.party,
  });
}

export function finalizeRecording(): ReplayBlob | null {
  return finalizeReplay();
}

// ---- Playback (action injection during replay battle) ----

/** Wraps a ReplayBlob with cursors for playing it back battle-by-battle. */
export class ReplayPlayer {
  readonly blob: ReplayBlob;
  private currentBattleIdx = 0;
  /** Per-attackerIdx queue for the CURRENT battle. */
  private queues: ReplayAction[][] = [];

  constructor(blob: ReplayBlob) {
    this.blob = blob;
    this.loadCurrent();
  }

  private loadCurrent(): void {
    const battle = this.blob.battles[this.currentBattleIdx];
    if (!battle) { this.queues = []; return; }
    this.queues = battle.party.map(() => []);
    for (const a of battle.actions) {
      if (a.attackerIdx >= 0 && a.attackerIdx < this.queues.length) {
        this.queues[a.attackerIdx].push(a);
      }
    }
  }

  currentBattle(): ReplayBattle | null {
    return this.blob.battles[this.currentBattleIdx] ?? null;
  }
  hasMoreBattles(): boolean { return this.currentBattleIdx + 1 < this.blob.battles.length; }
  advanceBattle(): boolean {
    if (!this.hasMoreBattles()) return false;
    this.currentBattleIdx += 1;
    this.loadCurrent();
    return true;
  }
  pollAction(attackerIdx: number): ReplayAction | null {
    const q = this.queues[attackerIdx];
    if (!q || q.length === 0) return null;
    return q.shift()!;
  }
}
