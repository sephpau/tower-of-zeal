// Battle replay recorder + player. Phase 1 scope: single-battle replays
// for the Fastest World Ender leaderboard.
//
// Determinism contract:
// - Combat resolution depends on the RNG seed plus the EXACT party state at
//   battle start (templateId / classId / level / customStats / equippedSkills /
//   hp / mp). All of those are captured in the replay blob.
// - Player actions are recorded in order, tagged by attacker template index
//   and target enemy index. The replay engine injects them back in the same
//   order so the simulation reproduces the same sequence of damage rolls.
// - Replay format carries a `v` field; if combat formulas change in a way
//   that breaks compatibility, bump REPLAY_VERSION and old blobs become
//   "incompatible" and won't play.

import { Stats } from "./stats";

export const REPLAY_VERSION = 1;

export interface ReplayPartyMember {
  templateId: string;
  classId?: string;
  level: number;
  customStats: Stats;
  equippedSkills: string[];
  hp: number;
  mp: number;
}

export interface ReplayAction {
  /** Index into Replay.party. */
  attackerIdx: number;
  skillId: string;
  /** Index into Replay.enemies. -1 for self-target / no target. */
  targetIdx: number;
}

export interface ReplayBlob {
  v: number;
  stageId: number;
  mode: "floor" | "survival" | "boss_raid";
  ign: string | null;
  /** Server clock when the run was recorded. */
  recordedAt: number;
  /** RNG seed passed to startBattle. */
  seed: number;
  enemies: string[];          // ordered list of templateIds
  party: ReplayPartyMember[]; // ordered list (matches the runtime party order)
  actions: ReplayAction[];
}

// ---- Recorder (in-memory while recording is active) ----

let recording: {
  meta: Pick<ReplayBlob, "stageId" | "mode" | "ign" | "seed" | "enemies" | "party">;
  actions: ReplayAction[];
} | null = null;

export function isRecording(): boolean { return recording !== null; }

export function startRecording(meta: Pick<ReplayBlob, "stageId" | "mode" | "ign" | "seed" | "enemies" | "party">): void {
  recording = { meta, actions: [] };
}

/** Append a player action by its template-position indices. */
export function recordAction(attackerIdx: number, skillId: string, targetIdx: number): void {
  if (!recording) return;
  if (attackerIdx < 0) return;
  recording.actions.push({ attackerIdx, skillId, targetIdx });
}

export function finalizeRecording(): ReplayBlob | null {
  if (!recording) return null;
  const blob: ReplayBlob = {
    v: REPLAY_VERSION,
    stageId: recording.meta.stageId,
    mode: recording.meta.mode,
    ign: recording.meta.ign,
    recordedAt: Date.now(),
    seed: recording.meta.seed,
    enemies: recording.meta.enemies,
    party: recording.meta.party,
    actions: recording.actions.slice(),
  };
  recording = null;
  return blob;
}

export function abortRecording(): void {
  recording = null;
}

// ---- Playback (action injection during replay battle) ----

/** Wraps a ReplayBlob with a cursor for pulling the next action per attacker. */
export class ReplayPlayer {
  readonly blob: ReplayBlob;
  /** Per-attackerIdx queue of remaining actions. */
  private queues: ReplayAction[][];
  constructor(blob: ReplayBlob) {
    this.blob = blob;
    this.queues = blob.party.map(() => []);
    for (const a of blob.actions) {
      if (a.attackerIdx >= 0 && a.attackerIdx < this.queues.length) {
        this.queues[a.attackerIdx].push(a);
      }
    }
  }
  /** Next recorded action for this party slot, or null when exhausted. */
  pollAction(attackerIdx: number): ReplayAction | null {
    const q = this.queues[attackerIdx];
    if (!q || q.length === 0) return null;
    return q.shift()!;
  }
  remaining(): number {
    return this.queues.reduce((s, q) => s + q.length, 0);
  }
}
