import { EffectApplication } from "../core/effects";

export type SkillKind = "physical" | "magical" | "buff" | "summon";

// "self" — only the attacker. "enemy" — single enemy target. "all_enemies" — every living combatant on the opposite side.
export type SkillTargeting = "self" | "enemy" | "all_enemies";

export interface FlatDamageRange {
  min: number;
  max: number;
}

export interface Skill {
  id: string;
  name: string;
  kind: SkillKind;
  targeting: SkillTargeting;
  power: number;
  mpCost: number;
  hpCost?: number;
  /** Action cooldown — after firing this skill, the unit can't reuse it until N of its own actions pass. 0 = no cooldown. */
  cooldown: number;
  /** Player level required to use this skill. Default 1. */
  unlockLevel?: number;
  /** If set, skill resolves as N consecutive damage rolls against the target. */
  multiHit?: number;
  description: string;
  /** Used to pick the damage-popup icon: melee → sword/staff, range → bow/wizard. Default "melee". */
  range?: "melee" | "range";
  flatDamage?: FlatDamageRange;
  summon?: { templateId: string; count: number };
  // legacy-ish flags kept for the existing Slime skills + future hooks.
  noDistancePenalty?: boolean;
  customGaugeMul?: number;
  /** Status effects applied on hit. For "self"/"all_self" target the effect is
   *  applied to the caster. For "enemy"/"all_enemies" the effect is applied to
   *  each damaged target. */
  applies?: EffectApplication[];
  /** Effects applied to the caster regardless of damage (e.g., self buffs from buff skills). */
  selfApplies?: EffectApplication[];
}
