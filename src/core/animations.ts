// Combat-side event queue. The combat module pushes events here; the battle
// UI drains them each frame and renders floating popups + plays sfx.

import { sfx } from "./audio";

// Multi-hit skills (Phantom Flurry, Double Tap, etc.) and AOE skills fire N
// damage rolls in the same synchronous combat tick. Without staggering, all N
// `new Audio` sources start at ~0ms offset and overlap into one big fat sound
// instead of reading as a rapid sequence. We schedule subsequent hits a short
// delay apart so they audibly trill.
let nextHitSfxAt = 0;
const HIT_STAGGER_MS = 70; // ≈14 hits/sec ceiling — fast enough to read as machine-gun, slow enough to count individual hits
function playStaggeredHitSfx(play: () => void): void {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const fireAt = Math.max(now, nextHitSfxAt);
  const delay = fireAt - now;
  nextHitSfxAt = fireAt + HIT_STAGGER_MS;
  if (delay <= 0) play();
  else setTimeout(play, delay);
}

export type DamageIcon =
  | "sword"        // melee phys
  | "bow"          // range phys
  | "staff"        // melee mag
  | "wizard"       // range mag
  | "cross"        // hp heal
  | "raindrop"     // mp heal
  | "miss"
  | "moneybag";    // cosmetic RON drop indicator (purely visual)

export interface FloatEvent {
  targetId: string;
  text: string;
  icon: DamageIcon;
  color: string;
  crit?: boolean;
}

const queue: FloatEvent[] = [];

/** Optional context kept for API back-compat — currently unused since the
 *  battle-scene SFX were rolled back to the synth defaults. */
export interface HitSfxContext {
  attackerTemplateId: string;
  attackerClassId?: string;
  skillId: string;
  targetGuarding?: boolean;
}

export function pushDamage(
  targetId: string,
  amount: number,
  kind: "physical" | "magical",
  range: "melee" | "range",
  crit = false,
  _ctx?: HitSfxContext,
): void {
  void _ctx;
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
  // Stagger rapid back-to-back hit SFX so multi-hit / AOE skills play as a
  // sequence ("tat-tat-tat") instead of one piled-up thud.
  if (crit) {
    playStaggeredHitSfx(() => sfx.crit());
  } else if (kind === "physical" && range === "melee") {
    playStaggeredHitSfx(() => sfx.physMelee());
  } else if (kind === "physical") {
    playStaggeredHitSfx(() => sfx.physRange());
  } else if (kind === "magical" && range === "melee") {
    playStaggeredHitSfx(() => sfx.magMelee());
  } else {
    playStaggeredHitSfx(() => sfx.magRange());
  }
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

/** Cosmetic money-bag popup over a killed enemy. The actual RON awarded
 *  is decided server-side at run-end — this is pure visual flair so the
 *  player gets the satisfying "drop" feedback in real time. */
export function pushBronDrop(targetId: string, tier: "t1" | "t2" | "t3" | "t4" | "t5"): void {
  const tierColor: Record<typeof tier, string> = {
    t1: "#cfd6e4",       // bronze-ish gray
    t2: "#a0e5ff",       // teal
    t3: "#ffd96f",       // light gold
    t4: "#ffb05f",       // amber
    t5: "var(--gold-bright)", // royal gold
  };
  queue.push({
    targetId,
    text: `T${tier[1]}`,
    icon: "moneybag",
    color: tierColor[tier],
  });
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
    case "moneybag": return "💰";
  }
}
