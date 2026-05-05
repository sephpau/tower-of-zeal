// Buff / debuff (status effect) system. Data-driven so skills declare what
// they apply via `Skill.applies` and the engine handles the lifecycle.

import { Stats, StatKey } from "./stats";

export type EffectId =
  // DoTs
  | "burn"
  | "poison"
  | "bleed"
  // ATB / turn control
  | "freeze"     // -25% ATB speed for N actions
  | "stun"       // skip next action
  | "haste"      // +X% ATB speed
  // Skill / accuracy / targeting
  | "silence"    // block skills (idle/attack/guard only)
  | "blind"      // attacker has -X hit chance
  | "confuse"    // attacker hits a random combatant
  // Damage taken modifiers
  | "vulnerability" // +X% damage taken
  | "dmg_reduction" // -X% damage taken
  | "taunt"         // damage to allies on this side is redirected to the tauntER (incl. each AOE hit)
  // Stat / attack buffs
  | "stat_buff"     // +X% to one stat (target = StatKey)
  | "atk_buff"      // +X% phys.atk or mag.atk (target = "phys" | "mag")
  // Healing
  | "regen"
  | "heal";       // instant: heal `power` HP on application, no duration

export type EffectTarget = StatKey | "phys" | "mag";

export interface ActiveEffect {
  id: EffectId;
  /** Remaining actions on the AFFECTED unit. Decremented when that unit acts. */
  duration: number;
  /** Magnitude — meaning depends on effect id (% or flat). */
  power: number;
  /** For stat_buff / atk_buff: which stat / atk kind to scale. */
  target?: EffectTarget;
  /** Optional source for log attribution. */
  sourceId?: string;
}

/** Skill -> effect application descriptor. Lives on Skill.applies. */
export interface EffectApplication {
  id: EffectId;
  duration: number;
  power: number;
  target?: EffectTarget;
  /** 0..1 chance to apply per damage roll. Defaults to 1. */
  chance?: number;
}

const EFFECT_NAMES: Record<EffectId, string> = {
  burn: "Burn",
  poison: "Poison",
  bleed: "Bleed",
  freeze: "Freeze",
  stun: "Stun",
  haste: "Haste",
  silence: "Silence",
  blind: "Blind",
  confuse: "Confuse",
  vulnerability: "Vulnerable",
  dmg_reduction: "Shield",
  taunt: "Drawing Fire",
  stat_buff: "Stat Up",
  atk_buff: "Atk Up",
  regen: "Regen",
  heal: "Heal",
};

const EFFECT_ICONS: Record<EffectId, string> = {
  burn: "🔥",
  poison: "☠",
  bleed: "🩸",
  freeze: "❄",
  stun: "💫",
  haste: "💨",
  silence: "🔇",
  blind: "🌫",
  confuse: "❓",
  vulnerability: "💢",
  dmg_reduction: "🛡",
  taunt: "🎯",
  stat_buff: "⬆",
  atk_buff: "⚔",
  regen: "💚",
  heal: "💚",
};

const DEBUFF_IDS = new Set<EffectId>([
  "burn", "poison", "bleed", "freeze", "stun", "silence", "blind", "confuse", "vulnerability",
]);

export function effectName(id: EffectId): string { return EFFECT_NAMES[id]; }
export function effectIcon(id: EffectId): string { return EFFECT_ICONS[id]; }
export function isDebuff(id: EffectId): boolean { return DEBUFF_IDS.has(id); }

/** Interface accepted by every helper — purposely narrow so tests can fake it. */
export interface EffectCarrier {
  effects: ActiveEffect[];
  hp: number;
  maxHp: number;
  alive: boolean;
}

/** Apply / refresh an effect on the target. Same-id rule: take max duration, max power. */
export function applyEffect(target: EffectCarrier, eff: ActiveEffect): void {
  if (!target.alive) return;
  const existing = target.effects.find(e => e.id === eff.id && e.target === eff.target);
  if (existing) {
    existing.duration = Math.max(existing.duration, eff.duration);
    existing.power = Math.max(existing.power, eff.power);
    existing.sourceId = eff.sourceId ?? existing.sourceId;
    return;
  }
  target.effects.push({ ...eff });
}

export function hasEffect(target: EffectCarrier, id: EffectId): boolean {
  return target.effects.some(e => e.id === id);
}

export function findEffect(target: EffectCarrier, id: EffectId): ActiveEffect | undefined {
  return target.effects.find(e => e.id === id);
}

/** Decrement durations on all effects (call once when the unit completes an action,
 *  or when a turn is consumed by stun). Removes expired entries. */
export function tickEffectDurations(target: EffectCarrier): void {
  for (const e of target.effects) e.duration -= 1;
  target.effects = target.effects.filter(e => e.duration > 0);
}

/** Apply DoTs / HoTs at the moment the unit's gauge fills (before action choice).
 *  Returns the net damage dealt (positive). Does not decrement durations — that
 *  happens after the action resolves. */
export function applyTickEffects(target: EffectCarrier & { name: string }, log: string[]): number {
  let net = 0;
  for (const e of target.effects) {
    if (e.id === "burn" || e.id === "poison" || e.id === "bleed") {
      let dmg = Math.max(1, Math.floor(e.power));
      if (e.id === "bleed") {
        // Bleed scales with target max HP (5% of max by default if power===0).
        dmg = Math.max(1, Math.floor(target.maxHp * (e.power > 0 ? e.power : 0.05)));
      }
      target.hp = Math.max(0, target.hp - dmg);
      net += dmg;
      log.push(`${target.name} suffers ${dmg} from ${EFFECT_NAMES[e.id]}.`);
    } else if (e.id === "regen") {
      const heal = Math.max(1, Math.floor(e.power));
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + heal);
      log.push(`${target.name} regenerates ${target.hp - before}.`);
    }
  }
  if (target.hp <= 0) target.alive = false;
  return net;
}

/** ATB speed multiplier from active effects (freeze slows, haste speeds up). */
export function atbSpeedMultiplier(target: EffectCarrier): number {
  let mult = 1;
  for (const e of target.effects) {
    if (e.id === "freeze") mult *= (1 - e.power);  // power as fraction (0.25 = -25%)
    if (e.id === "haste") mult *= (1 + e.power);
  }
  return Math.max(0.1, mult);
}

/** Multiplier on incoming damage (from dmg_reduction/vulnerability on the defender). */
export function incomingDamageMultiplier(target: EffectCarrier): number {
  let mult = 1;
  for (const e of target.effects) {
    if (e.id === "dmg_reduction") mult *= (1 - e.power);
    if (e.id === "vulnerability") mult *= (1 + e.power);
  }
  return Math.max(0, mult);
}

/** Hit-chance modifier on the attacker (blind reduces accuracy). Returns delta to subtract. */
export function blindHitPenalty(attacker: EffectCarrier): number {
  let pen = 0;
  for (const e of attacker.effects) {
    if (e.id === "blind") pen += e.power;
  }
  return pen;
}

/** Stat multipliers from buffs (returns scaled stats). */
export function buffedStats(carrier: EffectCarrier, base: Stats): Stats {
  const out: Stats = { ...base };
  for (const e of carrier.effects) {
    if (e.id !== "stat_buff" || !e.target) continue;
    const k = e.target as StatKey;
    if (k in out) out[k] = Math.floor(out[k] * (1 + e.power));
  }
  return out;
}

/** Multiplier on a unit's outgoing attack of a given kind. */
export function atkBuffMultiplier(carrier: EffectCarrier, kind: "phys" | "mag"): number {
  let mult = 1;
  for (const e of carrier.effects) {
    if (e.id !== "atk_buff" || !e.target) continue;
    if (e.target === kind) mult *= (1 + e.power);
  }
  return mult;
}

/** Skills allowed under silence. Always-allowed baseline actions. */
const ALWAYS_ALLOWED_UNDER_SILENCE = new Set(["idle", "basic_attack", "guard"]);

export function isSilenced(carrier: EffectCarrier): boolean {
  return hasEffect(carrier, "silence");
}

export function isSkillBlockedBySilence(carrier: EffectCarrier, skillId: string): boolean {
  if (!isSilenced(carrier)) return false;
  return !ALWAYS_ALLOWED_UNDER_SILENCE.has(skillId);
}
