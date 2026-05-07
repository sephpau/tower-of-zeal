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

export const REPLAY_VERSION = 2;

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
}

/** Append a new battle to the recording and mark it active. */
export function recordBattleStart(meta: BattleStartMeta): void {
  if (!recording) return;
  recording.battles.push({
    stageId: meta.stageId,
    seed: meta.seed,
    enemies: meta.enemies,
    party: meta.party,
    actions: [],
  });
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
