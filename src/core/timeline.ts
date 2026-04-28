export const ATB_PACE = 15;   // gauge units per (atbSpeed * second). 50% slower than original (30).
export const ATB_FULL = 100;

export interface Gauged {
  gauge: number;
  alive: boolean;
  atbSpeed: number;
}

export function tickGauges(combatants: Gauged[], dtSeconds: number): void {
  for (const c of combatants) {
    if (!c.alive) continue;
    if (c.gauge >= ATB_FULL) continue;
    c.gauge = Math.min(ATB_FULL, c.gauge + c.atbSpeed * ATB_PACE * dtSeconds);
  }
}
