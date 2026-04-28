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

export function pushDamage(
  targetId: string,
  amount: number,
  kind: "physical" | "magical",
  range: "melee" | "range",
  crit = false,
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
  if (kind === "physical" && range === "melee") sfx.physMelee();
  else if (kind === "physical") sfx.physRange();
  else if (kind === "magical" && range === "melee") sfx.magMelee();
  else sfx.magRange();
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
