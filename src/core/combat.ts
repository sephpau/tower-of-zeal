import { Stats, ZERO_STATS, deriveStats, sumStats, MP_PER_LEVEL } from "./stats";
import { classBaseAtLevel } from "../units/classes";
import { unitBaseAtLevel } from "../units/roster";
import { Rng } from "./rng";
import { physicalDamage, magicalDamage, DamageResult } from "./formulas";
import { tickGauges, ATB_FULL } from "./timeline";
import { UnitTemplate } from "../units/types";
import { Skill } from "../skills/types";
import { getSkill, CLASS_SKILLS, CHARACTER_SKILLS, SKILLS } from "../skills/registry";
import { SLIME, SLIME_KING } from "../units/roster";
import { awardXp, xpToNext, MAX_LEVEL } from "./levels";
import { getProgress, setProgress, UnitProgress, autoEquipNewlyUnlocked } from "./progress";
import { pushDamage, pushMiss } from "./animations";
import { sfx } from "./audio";
import {
  ActiveEffect,
  EffectApplication,
  applyEffect,
  applyTickEffects,
  atkBuffMultiplier,
  buffedStats,
  hasEffect,
  incomingDamageMultiplier,
  isSkillBlockedBySilence,
  tickEffectDurations,
  blindHitPenalty,
} from "./effects";

export type Side = "player" | "enemy";

export interface Position {
  row: number;
  col: number;
}

export interface QueuedAction {
  skillId: string;
  targetId: string;
}

export interface StatBreakdown {
  unit: Stats;
  classBase: Stats;
  custom: Stats;
}

export interface Combatant {
  id: string;
  templateId: string;
  name: string;
  side: Side;
  portrait: string;
  position: Position;
  stats: Stats;
  statBreakdown: StatBreakdown;
  classId?: string;
  basicAttackKind?: "physical" | "magical";
  hp: number;
  mp: number;
  maxHp: number;
  maxMp: number;
  atbSpeed: number;
  gauge: number;
  alive: boolean;
  guarding: boolean;
  skills: string[];
  skillCooldowns: Record<string, number>;
  queuedAction: QueuedAction | null;
  level: number;
  xp: number;
  availablePoints: number;
  xpReward: number;
  /** Active buffs/debuffs (applied on hit, ticks per action). */
  effects: ActiveEffect[];
  resist?: import("../units/types").DamageResistance;
  atkMultiplier?: number;
  // ---- Run-summary trackers (accumulate across floors via carryover) ----
  damageDealt: number;
  damageTaken: number;
  kills: number;
  xpGainedTotal: number;
}

export type BattleState =
  | { kind: "ticking" }
  | { kind: "victory" }
  | { kind: "defeat" };

export interface Battle {
  state: BattleState;
  combatants: Combatant[];
  originalPartyTemplateIds: string[];
  log: string[];
  rng: Rng;
  /** Seconds remaining until next action may execute. Acts as a serial-animation queue gate. */
  actionLock: number;
  /** XP multiplier applied at distribution time (survival = 0.5). */
  xpMultiplier: number;
}

export interface PlayerSlot {
  template: UnitTemplate;
  position: Position;
}

let nextInstanceId = 0;

const TEMPLATE_LOOKUP: Record<string, UnitTemplate> = {
  slime: SLIME,
  slime_king: SLIME_KING,
};

// 75% slower than original: 0.55s → 2.2s.
const ANIM_DURATION_S = 2.2;

export function makeCombatant(t: UnitTemplate, side: Side, position: Position): Combatant {
  const progress: UnitProgress | null = side === "player" ? getProgress(t.id) : null;
  const classId = progress?.classId ?? t.classId;
  const customStats = progress?.customStats ?? t.customStats ?? { ...ZERO_STATS };
  const level = progress?.level ?? t.level ?? 1;
  const xp = progress?.xp ?? 0;
  const availablePoints = progress?.availablePoints ?? 0;

  const unit = unitBaseAtLevel(t, level);
  const classBase = classBaseAtLevel(classId, level);
  const custom = { ...ZERO_STATS, ...customStats };
  const effective = sumStats(unit, classBase, custom);
  const d = deriveStats(effective);
  // Round HP/MP to integers — fractional stat growth (e.g. INT 0.7/lvl) flows
  // into derived values and would otherwise render as 229.8/229.8 in the UI.
  const maxHp = Math.max(1, Math.round(t.overrideMaxHp ?? d.maxHp));
  // MP scales by level on top of stat-derived MP so casters always have the
  // mana to actually use their kit. Override still wins if set.
  const maxMp = Math.max(0, Math.round(t.overrideMaxMp ?? (d.maxMp + level * MP_PER_LEVEL)));

  // Skills available in this battle:
  //   - idle is always present
  //   - basic_attack always present (fallback baseline)
  //   - players: only equipped skills (max 4) on top of idle
  //   - enemies: their full template skill list
  const skills = new Set<string>();
  // Baseline actions every unit always has: Idle, Attack, Guard.
  skills.add("idle");
  skills.add("basic_attack");
  skills.add("guard");
  if (side === "player") {
    const equipped = [...(progress?.equippedSkills ?? [])];
    // Top up any empty loadout slots with currently-unlocked skills the unit has
    // access to (starting + character-specific + class), preserving the player's
    // chosen order. Idempotent — already-equipped skills are skipped.
    if (equipped.length < 4) {
      const seen = new Set<string>(equipped);
      const candidates: string[] = [];
      const push = (id: string) => { if (!seen.has(id)) { seen.add(id); candidates.push(id); } };
      for (const id of t.startingSkills) push(id);
      for (const id of (CHARACTER_SKILLS[t.id] ?? [])) push(id);
      if (classId) for (const id of (CLASS_SKILLS[classId] ?? [])) push(id);
      for (const id of candidates) {
        if (equipped.length >= 4) break;
        const sk = SKILLS[id];
        if (sk && (sk.unlockLevel ?? 1) > level) continue; // skip locked
        equipped.push(id);
      }
    }
    for (const id of equipped) skills.add(id);
  } else {
    for (const id of t.startingSkills) skills.add(id);
    for (const id of (CHARACTER_SKILLS[t.id] ?? [])) skills.add(id);
    if (classId) for (const id of (CLASS_SKILLS[classId] ?? [])) skills.add(id);
  }

  return {
    id: `${t.id}#${nextInstanceId++}`,
    templateId: t.id,
    name: t.name,
    side,
    portrait: t.portrait,
    position,
    stats: effective,
    statBreakdown: { unit, classBase, custom },
    classId,
    basicAttackKind: t.basicAttackKind,
    hp: maxHp,
    mp: maxMp,
    maxHp,
    maxMp,
    atbSpeed: d.atbSpeed,
    gauge: 0,
    alive: true,
    guarding: false,
    skills: [...skills],
    skillCooldowns: {},
    queuedAction: null,
    level,
    xp,
    availablePoints,
    xpReward: t.xpReward ?? 0,
    effects: [],
    resist: t.resist,
    atkMultiplier: t.atkMultiplier,
    damageDealt: 0,
    damageTaken: 0,
    kills: 0,
    xpGainedTotal: 0,
  };
}

function placeEnemies(templates: UnitTemplate[], rng: Rng): Combatant[] {
  // Up to 9 enemies. For solo bosses, just place at center.
  if (templates.length === 1) {
    return [makeCombatant(templates[0], "enemy", { row: 1, col: 1 })];
  }
  const slots: Position[] = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) slots.push({ row, col });
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return templates.slice(0, 9).map((t, i) => makeCombatant(t, "enemy", slots[i]));
}

export interface BattleOptions {
  /** Carry over state from prior battle (survival mode). Keyed by template id. */
  carryover?: Record<string, {
    hp: number; mp: number; xp: number; level: number;
    availablePoints: number; customStats: Stats; classId?: string;
    skillCooldowns?: Record<string, number>;
    gauge?: number;
    alive?: boolean;
    /** Run-summary trackers — accumulate across floors. */
    damageDealt?: number;
    damageTaken?: number;
    kills?: number;
    xpGainedTotal?: number;
  }>;
  /** XP multiplier applied at end-of-battle distribution. Default 1. Survival uses 1/50. */
  xpMultiplier?: number;
  /** Boss Raid: scale boss stats 3x and atb-speed 1.5x. Set per battle. */
  bossRaid?: boolean;
  /** Boss Raid: stacking 5%-per-pick reduction applied on top of bossRaid scaling. */
  bossStatReduction?: number;
  /** Boss Raid: stacking 10%-per-pick boost applied to player stats and atb-speed. */
  playerStatBoost?: number;
  /** Boss Raid: heal player HP/MP by 20% of max at battle start (consumed once per pick). */
  pendingHeal?: boolean;
}

export function startBattle(
  players: PlayerSlot[],
  enemies: UnitTemplate[],
  seed = (Date.now() & 0xffffffff) >>> 0,
  opts: BattleOptions = {},
): Battle {
  const rng = new Rng(seed);
  const playerCombatants = players.map(p => {
    const c = makeCombatant(p.template, "player", p.position);
    const co = opts.carryover?.[p.template.id];
    if (co) {
      c.hp = Math.min(c.maxHp, Math.max(0, co.hp));
      c.mp = Math.min(c.maxMp, Math.max(0, co.mp));
      c.xp = co.xp;
      c.level = co.level;
      c.availablePoints = co.availablePoints;
      c.statBreakdown.custom = co.customStats;
      if (co.classId) c.classId = co.classId;
      if (co.skillCooldowns) c.skillCooldowns = { ...co.skillCooldowns };
      if (typeof co.gauge === "number") c.gauge = Math.max(0, Math.min(ATB_FULL, co.gauge));
      if (co.alive === false || c.hp <= 0) {
        c.alive = false;
        c.hp = 0;
        c.queuedAction = null;
      }
      if (typeof co.damageDealt === "number") c.damageDealt = co.damageDealt;
      if (typeof co.damageTaken === "number") c.damageTaken = co.damageTaken;
      if (typeof co.kills === "number") c.kills = co.kills;
      if (typeof co.xpGainedTotal === "number") c.xpGainedTotal = co.xpGainedTotal;
    }
    return c;
  });
  const enemyCombatants = placeEnemies(enemies, rng);

  // Boss Raid: scale enemy stats and atb-speed, then apply any stacking
  // bossStatReduction (5% per Weaken pick) on top.
  if (opts.bossRaid) {
    const reduction = Math.max(0, Math.min(0.95, opts.bossStatReduction ?? 0));
    const statMul = BOSS_RAID_STAT_MUL * (1 - reduction);
    const speedMul = BOSS_RAID_SPEED_MUL * (1 - reduction);
    for (const c of enemyCombatants) {
      applyBossScaling(c, statMul, speedMul);
    }
  }

  // Boss Raid: stacking player stat boost (10% per pick) — affects all players.
  const boost = Math.max(0, opts.playerStatBoost ?? 0);
  if (boost > 0) {
    const mul = 1 + boost;
    for (const c of playerCombatants) {
      applyPlayerBoost(c, mul);
    }
  }

  // Boss Raid: heal 20% HP/MP at battle start (consumed once per pick by caller).
  if (opts.pendingHeal) {
    for (const c of playerCombatants) {
      if (!c.alive) continue;
      c.hp = Math.min(c.maxHp, c.hp + Math.floor(c.maxHp * 0.2));
      c.mp = Math.min(c.maxMp, c.mp + Math.floor(c.maxMp * 0.2));
    }
  }

  return {
    state: { kind: "ticking" },
    combatants: [...playerCombatants, ...enemyCombatants],
    originalPartyTemplateIds: players.map(p => p.template.id),
    log: ["Battle start."],
    rng,
    actionLock: 0,
    xpMultiplier: opts.xpMultiplier ?? 1,
  };
}

// Boss Raid base multipliers. Tune here; bossStatReduction (Weaken pick) stacks on top.
export const BOSS_RAID_STAT_MUL = 2.0;   // was 3.0 — too punishing
export const BOSS_RAID_SPEED_MUL = 1.25; // was 1.5  — still faster than the player party

function applyBossScaling(c: Combatant, statMul: number, speedMul: number): void {
  // Scale input stats so derived combat values (physAtk, magAtk, defs, etc.)
  // come out roughly statMul times stronger. We override atbSpeed afterward
  // since AGI feeds into both speed and damage; we want speed at speedMul, not statMul.
  const origAtb = c.atbSpeed;
  c.stats = scaleStats(c.stats, statMul);
  const d = deriveStats(c.stats);
  c.maxHp = Math.max(1, Math.round(d.maxHp));
  c.maxMp = Math.max(0, Math.round(d.maxMp + c.level * MP_PER_LEVEL));
  c.hp = c.maxHp;
  c.mp = c.maxMp;
  c.atbSpeed = origAtb * speedMul;
  // Bosses keep their template atkMultiplier (2×) for normal floor runs;
  // Boss Raid bumps it ×1.5 → 3× to match the harder mode's intent.
  if (c.atkMultiplier && c.atkMultiplier > 1) {
    c.atkMultiplier = c.atkMultiplier * 1.5;
  }
}

function applyPlayerBoost(c: Combatant, mul: number): void {
  const origAtb = c.atbSpeed;
  c.stats = scaleStats(c.stats, mul);
  const d = deriveStats(c.stats);
  const newMaxHp = Math.max(1, Math.round(d.maxHp));
  const newMaxMp = Math.max(0, Math.round(d.maxMp + c.level * MP_PER_LEVEL));
  // Preserve current HP/MP ratio when scaling caps.
  const hpRatio = c.maxHp > 0 ? c.hp / c.maxHp : 1;
  const mpRatio = c.maxMp > 0 ? c.mp / c.maxMp : 1;
  c.maxHp = newMaxHp;
  c.maxMp = newMaxMp;
  c.hp = Math.round(newMaxHp * hpRatio);
  c.mp = Math.round(newMaxMp * mpRatio);
  c.atbSpeed = origAtb * mul;
}

function scaleStats(s: Stats, mul: number): Stats {
  return {
    STR: s.STR * mul,
    INT: s.INT * mul,
    DEX: s.DEX * mul,
    AGI: s.AGI * mul,
    DEF: s.DEF * mul,
    VIT: s.VIT * mul,
  };
}

export function distanceBetween(attacker: Combatant, target: Combatant): number {
  return attacker.position.col + target.position.col + 1;
}

export function nearestEnemy(b: Battle, attacker: Combatant): Combatant | null {
  let best: Combatant | null = null;
  let bestDist = Infinity;
  let bestRow = Infinity;
  for (const c of b.combatants) {
    if (!c.alive || c.side === attacker.side) continue;
    const d = distanceBetween(attacker, c);
    if (d < bestDist || (d === bestDist && c.position.row < bestRow)) {
      best = c;
      bestDist = d;
      bestRow = c.position.row;
    }
  }
  return best;
}

export function tick(b: Battle, dt: number): void {
  if (b.state.kind !== "ticking") return;

  // Always tick gauges so combat keeps flowing visually even mid-animation.
  // Snapshot which players were ready before this tick so we can fire the
  // atb-ready SFX only on the rising edge.
  const playerReadyBefore: Record<string, boolean> = {};
  for (const c of b.combatants) {
    if (c.side === "player" && c.alive) playerReadyBefore[c.id] = c.gauge >= ATB_FULL;
  }
  tickGauges(b.combatants, dt);
  for (const c of b.combatants) {
    if (c.side !== "player" || !c.alive) continue;
    if (!playerReadyBefore[c.id] && c.gauge >= ATB_FULL) sfx.atbReady();
  }

  // Animation lock — actions queue serially behind any in-flight animation.
  if (b.actionLock > 0) {
    b.actionLock = Math.max(0, b.actionLock - dt);
    return;
  }

  // Pick the combatant who's been "ready" longest with an action they can take.
  // Gauge overflow past ATB_FULL serves as the wait-time tiebreaker, so a unit
  // that hits full first and idles waiting for an action goes ahead of one that
  // just filled this frame.
  let actor: Combatant | null = null;
  let bestGauge = ATB_FULL - 0.01;
  for (const c of b.combatants) {
    if (!c.alive) continue;
    if (c.gauge < ATB_FULL) continue;
    // Players without a queued action aren't candidates — they keep waiting.
    if (c.side === "player" && !c.queuedAction) continue;
    if (c.gauge > bestGauge) { bestGauge = c.gauge; actor = c; }
  }
  if (!actor) return;

  const c = actor;

  // Tick DoT/HoT before action.
  applyTickEffects(c, b.log);
  if (!c.alive) {
    c.gauge = 0;
    tickEffectDurations(c);
    checkEndConditions(b);
    return;
  }

  // Stun: skip the queued/AI action this turn.
  if (hasEffect(c, "stun")) {
    b.log.push(`${c.name} is stunned and skips the action.`);
    c.gauge = 0;
    c.queuedAction = null;
    tickEffectDurations(c);
    b.actionLock = 0.4;
    return;
  }

  if (c.side === "enemy") {
    const action = chooseEnemyAction(c, b);
    if (action) {
      executeAction(b, c, action);
      return;
    }
    // No valid action — reset so they don't camp the front of the queue forever.
    c.gauge = 0;
    return;
  }

  // Player with a queued action.
  if (c.queuedAction) {
    const skill = getSkill(c.queuedAction.skillId);
    if (isSkillBlockedBySilence(c, skill.id)) {
      b.log.push(`${c.name} is silenced — ${skill.name} fails.`);
      c.queuedAction = null;
      c.gauge = 0;
      tickEffectDurations(c);
      b.actionLock = 0.4;
      return;
    }
    if (!isSkillAffordable(c, skill, b)) {
      // Drop the bad queue but don't burn the turn — they'll re-queue.
      c.queuedAction = null;
      return;
    }
    executeAction(b, c, c.queuedAction);
  }
}

function chooseEnemyAction(c: Combatant, b: Battle): QueuedAction | null {
  if (c.templateId === "slime_king") {
    return chooseSlimeKingAction(c, b);
  }
  const available = c.skills.filter(id =>
    isSkillAffordable(c, getSkill(id), b)
    && id !== "idle"
    && !isSkillBlockedBySilence(c, id)
  );
  if (available.length === 0) return targetForSkill(c, b, "basic_attack");
  const skillId = available[Math.floor(b.rng.next() * available.length)];
  return targetForSkill(c, b, skillId);
}

function chooseSlimeKingAction(c: Combatant, b: Battle): QueuedAction | null {
  const slimesAlive = b.combatants.some(x => x.alive && x.side === "enemy" && x.templateId === "slime");
  if (!slimesAlive && isSkillAffordable(c, getSkill("spawn_slimes"), b)) {
    return targetForSkill(c, b, "spawn_slimes");
  }
  const pick = b.rng.next() < 0.5 ? "slime_king_goo" : "slime_barrage";
  if (!isSkillAffordable(c, getSkill(pick), b)) {
    return targetForSkill(c, b, "slime_king_goo");
  }
  return targetForSkill(c, b, pick);
}

function isSkillAffordable(c: Combatant, s: Skill, b: Battle): boolean {
  if (s.mpCost > c.mp) return false;
  if (s.hpCost !== undefined && s.hpCost >= c.hp) return false;
  if ((c.skillCooldowns[s.id] ?? 0) > 0) return false;
  if ((s.unlockLevel ?? 1) > c.level) return false;
  if (s.kind === "summon") {
    const occupied = new Set(
      b.combatants.filter(x => x.side === c.side && x.alive).map(x => `${x.position.row},${x.position.col}`)
    );
    if (occupied.size >= 9) return false;
  }
  return true;
}

function targetForSkill(c: Combatant, b: Battle, skillId: string): QueuedAction | null {
  const s = getSkill(skillId);
  if (s.targeting === "self" || s.targeting === "all_enemies") {
    return { skillId, targetId: c.id };
  }
  const target = nearestEnemy(b, c);
  if (!target) return null;
  return { skillId, targetId: target.id };
}

export function queueAction(b: Battle, unitId: string, skillId: string, targetId: string): void {
  if (b.state.kind !== "ticking") return;
  const unit = b.combatants.find(c => c.id === unitId);
  if (!unit || !unit.alive) return;
  if (unit.side !== "player") return;
  if (!unit.skills.includes(skillId)) return;
  const skill = getSkill(skillId);
  if (!isSkillAffordable(unit, skill, b)) return;
  const target = b.combatants.find(c => c.id === targetId);
  if (!target || !target.alive) return;
  if (skill.targeting === "self" && target.id !== unit.id) return;
  if (skill.targeting === "enemy" && target.side === unit.side) return;
  unit.queuedAction = { skillId, targetId };
}

export function clearQueued(b: Battle, unitId: string): void {
  const unit = b.combatants.find(c => c.id === unitId);
  if (unit) unit.queuedAction = null;
}

export function surrenderBattle(b: Battle): void {
  if (b.state.kind !== "ticking") return;
  b.state = { kind: "defeat" };
  b.log.push("Surrendered.");
  persistPartyProgress(b);
}

export function distributeEndOfBattleXp(b: Battle): void {
  const totalRaw = b.combatants
    .filter(c => c.side === "enemy")
    .reduce((sum, c) => sum + (c.alive ? 0 : c.xpReward), 0);
  const total = Math.floor(totalRaw * (b.xpMultiplier ?? 1));
  if (total <= 0) return;
  const partyIds = b.originalPartyTemplateIds;
  if (partyIds.length === 0) return;
  const share = Math.max(1, Math.floor(total / partyIds.length));
  for (const tid of partyIds) {
    const c = b.combatants.find(x => x.side === "player" && x.templateId === tid);
    if (!c) continue;
    if (c.level >= MAX_LEVEL) continue;
    const gained = awardXp(c, share);
    c.xpGainedTotal += share;
    if (gained > 0) {
      c.availablePoints += gained * 4;
      b.log.push(`${c.name} reached Lv ${c.level}! (+${gained * 4} stat points${c.level >= MAX_LEVEL ? ", MAX" : `, next: ${xpToNext(c.level)}`})`);
    } else {
      b.log.push(`${c.name} +${share} XP.`);
    }
  }
}

export function persistPartyProgress(b: Battle): void {
  for (const tid of b.originalPartyTemplateIds) {
    const c = b.combatants.find(x => x.side === "player" && x.templateId === tid);
    if (!c) continue;
    const cur = getProgress(tid);
    const equippedSkills = autoEquipNewlyUnlocked(c.templateId, c.classId, c.level, cur.equippedSkills ?? []);
    setProgress(tid, {
      ...cur,
      level: c.level,
      xp: c.xp,
      availablePoints: c.availablePoints,
      classId: c.classId,
      customStats: c.statBreakdown.custom,
      equippedSkills,
    });
  }
}

function executeAction(b: Battle, attacker: Combatant, action: QueuedAction): void {
  const skill = getSkill(action.skillId);
  if (!isSkillAffordable(attacker, skill, b)) {
    b.log.push(`${attacker.name} can't use ${skill.name}.`);
    attacker.queuedAction = null;
    return;
  }

  attacker.guarding = false;
  attacker.mp -= skill.mpCost;
  if (skill.hpCost !== undefined) {
    attacker.hp = Math.max(1, attacker.hp - skill.hpCost);
  }

  let didDamage = false;

  if (skill.id === "idle") {
    b.log.push(`${attacker.name} waits.`);
    sfx.idle();
  } else if (skill.targeting === "self") {
    if (skill.kind === "summon" && skill.summon) {
      doSummon(b, attacker, skill);
    } else if (skill.kind === "buff" && skill.id === "guard") {
      attacker.guarding = true;
      b.log.push(`${attacker.name} guards.`);
    } else if (skill.kind === "buff") {
      b.log.push(`${attacker.name} uses ${skill.name}.`);
      // Self-buffs and party buffs without an offensive target apply effects via
      // selfApplies (caster) and applies (each ally — see below).
      if (skill.applies && skill.applies.length > 0) {
        const allies = b.combatants.filter(c => c.alive && c.side === attacker.side);
        for (const a of allies) {
          for (const eff of skill.applies) {
            const scaled = eff.id === "heal" && skill.scalesWith && skill.scalesWith.length > 0
              ? { ...eff, power: eff.power + healScaleBonus(attacker, skill.scalesWith) }
              : eff;
            maybeApplyEffect(b, attacker, a, scaled);
          }
        }
      }
    }
  } else if (skill.targeting === "all_enemies") {
    const targets = b.combatants.filter(c => c.alive && c.side !== attacker.side);
    b.log.push(`${attacker.name} unleashes ${skill.name}!`);
    for (const t of targets) { applyDamageRolls(b, attacker, t, skill, { aoe: true }); didDamage = true; }
  } else {
    let target = b.combatants.find(c => c.id === action.targetId);
    if (!target || !target.alive) {
      const fallback = nearestEnemy(b, attacker);
      target = fallback ?? undefined;
      if (target && attacker.queuedAction) attacker.queuedAction.targetId = target.id;
    }
    // Confuse: pick a random alive combatant (any side) instead.
    if (target && hasEffect(attacker, "confuse")) {
      const candidates = b.combatants.filter(c => c.alive && c.id !== attacker.id);
      if (candidates.length > 0) {
        target = candidates[Math.floor(b.rng.next() * candidates.length)];
        b.log.push(`${attacker.name} is confused and targets ${target.name}!`);
      }
    }
    if (target) {
      applyDamageRolls(b, attacker, target, skill);
      didDamage = true;
    }
  }

  if (skill.cooldown > 0) attacker.skillCooldowns[skill.id] = skill.cooldown;
  for (const id of Object.keys(attacker.skillCooldowns)) {
    if (id === skill.id) continue;
    attacker.skillCooldowns[id] = Math.max(0, attacker.skillCooldowns[id] - 1);
  }

  // Self-buff applications (e.g., Guardian Wall on caster).
  if (skill.selfApplies && skill.selfApplies.length > 0) {
    for (const eff of skill.selfApplies) maybeApplyEffect(b, attacker, attacker, eff);
  }

  // Decrement effects on the actor at end of their action.
  tickEffectDurations(attacker);

  // Clear the player's queued action so they don't auto-repeat.
  if (attacker.side === "player") attacker.queuedAction = null;

  attacker.gauge = 0;
  retargetSurvivors(b);
  // Set animation lock so subsequent ready combatants wait their turn.
  b.actionLock = didDamage ? ANIM_DURATION_S : 0.2;
  checkEndConditions(b);
}

function findActiveTaunter(b: Battle, side: Side): Combatant | null {
  for (const c of b.combatants) {
    if (c.side !== side) continue;
    if (!c.alive) continue;
    if (hasEffect(c, "taunt")) return c;
  }
  return null;
}

function applyDamageRolls(b: Battle, attacker: Combatant, target: Combatant, skill: Skill, ctx: { aoe?: boolean } = {}): void {
  const hits = Math.max(1, skill.multiHit ?? 1);
  for (let i = 0; i < hits; i++) {
    if (!target.alive) break;
    applyDamage(b, attacker, target, skill, ctx);
  }
}

function applyDamage(b: Battle, attacker: Combatant, target: Combatant, skill: Skill, ctx: { aoe?: boolean } = {}): void {
  // Taunt redirect: if any ally of the original target has the "taunt" effect
  // active and is alive (and isn't the target themselves), the hit is rerouted
  // to that taunter. AOE iterates per-target, so each instance gets redirected
  // — meaning the taunter eats the full AOE.
  const taunter = findActiveTaunter(b, target.side);
  if (taunter && taunter !== target) {
    target = taunter;
  }

  let dmg: number;
  let crit = false;

  // Resolve damage kind & range for popup icon.
  const effKind: "physical" | "magical" =
    skill.id === "basic_attack" && attacker.basicAttackKind
      ? attacker.basicAttackKind
      : (skill.kind === "magical" ? "magical" : "physical");
  const range: "melee" | "range" =
    skill.range ?? (effKind === "magical" && skill.id === "basic_attack" && attacker.basicAttackKind === "magical"
      ? "range"
      : effKind === "magical" ? "range" : "melee");

  if (skill.flatDamage) {
    const { min, max } = skill.flatDamage;
    const span = max - min + 1;
    dmg = min + Math.floor(b.rng.next() * span);
  } else {
    // Stat-buff scaling on both sides (VIT/DEF/STR/INT/etc.).
    const attackerStats0 = buffedStats(attacker, attacker.stats);
    const targetStats0 = buffedStats(target, target.stats);
    // Apply +atk buffs to attacker stats for this damage roll.
    const atkMul = atkBuffMultiplier(attacker, effKind === "magical" ? "mag" : "phys");
    const buffedAttackerStats = atkMul === 1 ? attackerStats0 : (() => {
      const s = { ...attackerStats0 };
      if (effKind === "magical") s.INT = Math.floor(s.INT * atkMul);
      else s.STR = Math.floor(s.STR * atkMul);
      return s;
    })();
    // Per-skill scaling: each entry adds (stat * weight) onto the attack stat.
    let bonusAtk = 0;
    if (skill.scalesWith) {
      for (const e of skill.scalesWith) {
        bonusAtk += (buffedAttackerStats[e.stat] ?? 0) * (e.weight ?? 1);
      }
    }
    let result: DamageResult;
    if (effKind === "magical") {
      result = magicalDamage(buffedAttackerStats, targetStats0, skill.power, b.rng, blindHitPenalty(attacker), bonusAtk);
    } else {
      result = physicalDamage(buffedAttackerStats, targetStats0, skill.power, b.rng, blindHitPenalty(attacker), bonusAtk);
    }
    if (result.miss) {
      b.log.push(`${attacker.name} → ${target.name}: miss!`);
      pushMiss(target.id);
      return;
    }
    dmg = result.dmg;
    crit = result.crit;
  }

  if (ctx.aoe) dmg = Math.max(1, Math.floor(dmg * 0.75));
  if (target.guarding) dmg = Math.max(1, Math.floor(dmg / 2));
  // Outgoing scaling on the attacker (e.g. boss = 3x).
  if (attacker.atkMultiplier && attacker.atkMultiplier !== 1) {
    dmg = Math.max(1, Math.floor(dmg * attacker.atkMultiplier));
  }
  // Type resistances (melee/range/physical/magical) on the target template.
  if (target.resist) {
    const r = target.resist;
    let mul = 1;
    if (effKind === "physical" && r.physical !== undefined) mul *= r.physical;
    if (effKind === "magical" && r.magical !== undefined) mul *= r.magical;
    if (range === "melee" && r.melee !== undefined) mul *= r.melee;
    if (range === "range" && r.range !== undefined) mul *= r.range;
    if (mul !== 1) dmg = Math.max(1, Math.floor(dmg * mul));
  }
  // Vulnerability / damage reduction on the defender.
  const incomingMul = incomingDamageMultiplier(target);
  if (incomingMul !== 1) dmg = Math.max(1, Math.floor(dmg * incomingMul));
  target.hp = Math.max(0, target.hp - dmg);

  // Run-summary trackers: only credit cross-side damage.
  if (attacker.side !== target.side) {
    attacker.damageDealt += dmg;
    target.damageTaken += dmg;
  }

  pushDamage(target.id, dmg, effKind, range, crit);

  const tag = crit ? " CRIT" : "";
  const verb = skill.id === "basic_attack" ? "attacks" : `uses ${skill.name} on`;
  b.log.push(`${attacker.name} ${verb} ${target.name}: ${dmg}${tag}`);

  if (target.hp <= 0) {
    target.alive = false;
    target.queuedAction = null;
    if (attacker.side !== target.side) attacker.kills += 1;
    b.log.push(`${target.name} falls.`);
    sfx.fall();
    return;
  }

  // Apply attached on-hit effects.
  if (skill.applies && skill.applies.length > 0) {
    for (const eff of skill.applies) maybeApplyEffect(b, attacker, target, eff);
  }
}

function healScaleBonus(caster: Combatant, scaling: NonNullable<Skill["scalesWith"]>): number {
  let bonus = 0;
  for (const s of scaling) {
    const weight = s.weight ?? 1;
    const stat = caster.stats[s.stat] ?? 0;
    bonus += (stat * weight) / 10;
  }
  return Math.floor(bonus);
}

function maybeApplyEffect(b: Battle, source: Combatant, target: Combatant, eff: EffectApplication): void {
  const chance = eff.chance ?? 1;
  if (chance < 1 && b.rng.next() > chance) return;
  if (eff.id === "heal") {
    if (!target.alive) return;
    const amount = Math.max(1, Math.floor(eff.power));
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    b.log.push(`${target.name} heals ${target.hp - before} HP.`);
    return;
  }
  applyEffect(target, {
    id: eff.id,
    duration: eff.duration,
    power: eff.power,
    target: eff.target,
    sourceId: source.id,
  });
  if (eff.id !== "regen") b.log.push(`${target.name} is afflicted with ${eff.id}.`);
}

function doSummon(b: Battle, attacker: Combatant, skill: Skill): void {
  if (!skill.summon) return;
  const tpl = TEMPLATE_LOOKUP[skill.summon.templateId];
  if (!tpl) {
    b.log.push(`${attacker.name} tried to summon (unknown template).`);
    return;
  }
  const occupied = new Set(
    b.combatants.filter(c => c.side === attacker.side && c.alive).map(c => `${c.position.row},${c.position.col}`)
  );
  const empties: Position[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    if (!occupied.has(`${r},${c}`)) empties.push({ row: r, col: c });
  }
  for (let i = empties.length - 1; i > 0; i--) {
    const j = Math.floor(b.rng.next() * (i + 1));
    [empties[i], empties[j]] = [empties[j], empties[i]];
  }
  const slots = empties.slice(0, skill.summon.count);
  if (slots.length === 0) {
    b.log.push(`${attacker.name} tried to summon — no room.`);
    return;
  }
  for (const pos of slots) {
    const c = makeCombatant(tpl, attacker.side, pos);
    b.combatants.push(c);
  }
  b.log.push(`${attacker.name} summons ${slots.length} ${tpl.name}${slots.length === 1 ? "" : "s"}!`);
}

function retargetSurvivors(b: Battle): void {
  for (const c of b.combatants) {
    if (!c.alive || !c.queuedAction) continue;
    const t = b.combatants.find(x => x.id === c.queuedAction!.targetId);
    if (t && t.alive) continue;
    const skill = getSkill(c.queuedAction.skillId);
    if (skill.targeting === "self") continue;
    const nearest = nearestEnemy(b, c);
    if (nearest) {
      c.queuedAction.targetId = nearest.id;
    } else {
      c.queuedAction = null;
    }
  }
}

function checkEndConditions(b: Battle): void {
  const playersAlive = b.combatants.some(c => c.side === "player" && c.alive);
  const enemiesAlive = b.combatants.some(c => c.side === "enemy" && c.alive);
  if (!playersAlive) {
    b.state = { kind: "defeat" };
    b.log.push("Defeat...");
    sfx.defeat();
    distributeEndOfBattleXp(b);
    persistPartyProgress(b);
  } else if (!enemiesAlive) {
    b.state = { kind: "victory" };
    b.log.push("Victory!");
    sfx.victory();
    distributeEndOfBattleXp(b);
    persistPartyProgress(b);
  }
}
