// Combat-side event queue. The combat module pushes events here; the battle
// UI drains them each frame and renders floating popups + plays sfx.

import { sfx } from "./audio";

export type DamageIcon =
  | "sword"        // melee phys
  | "bow"          // range phys
  | "staff"        // melee mag
  | "wizard"       // range mag
  | "cross"        // hp heal
  | "raindrop"     // mp heal
  | "miss";

export interface FloatEvent {
  targetId: string;
  text: string;
  icon: DamageIcon;
  color: string;
  crit?: boolean;
}

const queue: FloatEvent[] = [];

/** Skill-id sets used for elemental/specialized hit-sound overrides. */
const FIRE_SKILL_IDS = new Set([
  "ignite_touch", "blazing_burst", "inferno_crash", "solar_flare",
]);
const WATER_SKILL_IDS = new Set([
  "water_bolt", "hydro_bolt", "frost_bite", "vortex_stream", "tidal_wave", "navigators_wrath",
]);
const WIND_SKILL_IDS = new Set([
  "horizon_strike", "needle_shot", "swift_jab", "shadow_step", "phantom_flurry",
]);

export interface HitSfxContext {
  attackerTemplateId: string;
  attackerClassId?: string;
  skillId: string;
  /** Target was guarding when hit landed → halved damage + clink sound. */
  targetGuarding?: boolean;
}

function playHitSfx(kind: "physical" | "magical", range: "melee" | "range", ctx?: HitSfxContext): void {
  // Guarded hit replaces every other hit sound.
  if (ctx?.targetGuarding) { sfx.guardedHit(); return; }
  if (ctx) {
    if (FIRE_SKILL_IDS.has(ctx.skillId)) { sfx.hitFire(); return; }
    if (WATER_SKILL_IDS.has(ctx.skillId)) { sfx.hitWater(); return; }
    if (WIND_SKILL_IDS.has(ctx.skillId)) { sfx.hitWind(); return; }
    if (ctx.attackerClassId === "sharpshooter") { sfx.hitSharpshooter(); return; }
    const tid = ctx.attackerTemplateId;
    if (tid === "slime" || tid === "slime_king") { sfx.slimeAttack(); return; }
    if (tid.includes("wraith") || tid.includes("spectre")) { sfx.hitWraith(); return; }
  }
  // Generic fallback by damage kind.
  if (kind === "physical" && range === "melee") sfx.physMelee();
  else if (kind === "physical") sfx.physRange();
  else if (kind === "magical" && range === "melee") sfx.magMelee();
  else sfx.magRange();
}

export function pushDamage(
  targetId: string,
  amount: number,
  kind: "physical" | "magical",
  range: "melee" | "range",
  crit = false,
  ctx?: HitSfxContext,
): void {
  const icon: DamageIcon =
    kind === "physical" ? (range === "melee" ? "sword" : "bow") :
    /*    magical    */ (range === "melee" ? "staff" : "wizard");
  queue.push({
    targetId,
    text: `${amount}`,
    icon,
    color: "#ef4444",
    crit,
  });
  if (crit) sfx.crit();
  playHitSfx(kind, range, ctx);
}

export function pushMiss(targetId: string): void {
  queue.push({ targetId, text: "MISS", icon: "miss", color: "#9ca3af" });
  sfx.miss();
}

export function pushHpHeal(targetId: string, amount: number): void {
  queue.push({ targetId, text: `+${amount}`, icon: "cross", color: "#34d399" });
  sfx.heal();
}

export function pushMpHeal(targetId: string, amount: number): void {
  queue.push({ targetId, text: `+${amount}`, icon: "raindrop", color: "#60a5fa" });
  sfx.manaHeal();
}

export function drainEvents(): FloatEvent[] {
  if (queue.length === 0) return [];
  const out = queue.slice();
  queue.length = 0;
  return out;
}

export function iconGlyph(icon: DamageIcon): string {
  switch (icon) {
    case "sword": return "🗡";
    case "bow": return "🏹";
    case "staff": return "🪄";
    case "wizard": return "🧙";
    case "cross": return "✚";
    case "raindrop": return "💧";
    case "miss": return "✕";
  }
}
