import { atbSpeedMultiplier, ActiveEffect } from "./effects";

export const ATB_PACE = 7.5; // gauge units per (atbSpeed * second). 50% slower than the previous 15 (which was already 50% off the original 30).
export const ATB_FULL = 100;

export interface Gauged {
  gauge: number;
  alive: boolean;
  atbSpeed: number;
  effects: ActiveEffect[];
  hp: number;
  maxHp: number;
}

// Gauge is allowed to accumulate past ATB_FULL. The amount of overflow tells us
// who has been waiting longest at the front of the queue, so the action loop
// can dispatch in "first ready" order rather than array order.
export function tickGauges(combatants: Gauged[], dtSeconds: number): void {
  for (const c of combatants) {
    if (!c.alive) continue;
    const speedMult = atbSpeedMultiplier(c);
    c.gauge = c.gauge + c.atbSpeed * speedMult * ATB_PACE * dtSeconds;
  }
}
