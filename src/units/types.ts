import { Stats } from "../core/stats";

export interface UnitTemplate {
  id: string;
  name: string;
  portrait: string;
  /**
   * Unit-specific base stats (the red layer in the hex chart). Always present.
   * Effective stats at runtime = unitBaseStats + classBaseStats(classId) + customStats.
   */
  unitBaseStats: Stats;
  /** Per-level growth applied to the unit base layer on level-up. */
  unitGrowth?: Stats;
  /** Optional class assignment (unlocks at Lv2). Adds the class's baseStats layer. */
  classId?: string;
  /** Player-allocated stat points (the yellow layer). Default zero. */
  customStats?: Stats;
  startingSkills: string[];
  /** When set, the generic "basic_attack" skill resolves with this kind for this unit (e.g. "magical" for Hera/Nova). */
  basicAttackKind?: "physical" | "magical";
  overrideMaxHp?: number;
  overrideMaxMp?: number;
  level?: number;
  xpReward?: number;
}
