import { Stats, deriveStats } from "./stats";
import { Rng } from "./rng";

export interface DamageResult {
  dmg: number;
  miss: boolean;
  crit: boolean;
}

// Hit/crit use derived chances. Damage = max(1, atk * skillPower - def * 0.5) ± 10%.
// Tune as needed once new stat values are play-tested.

export function physicalDamage(
  attacker: Stats,
  defender: Stats,
  power: number,
  rng: Rng,
  hitPenalty = 0,
): DamageResult {
  const a = deriveStats(attacker);
  const d = deriveStats(defender);
  const hit = clamp(a.hitChance - d.evadeChance - hitPenalty, 0.1, 1.0);
  if (!rng.chance(hit)) return { dmg: 0, miss: true, crit: false };

  const crit = rng.chance(a.critChance);
  let raw = a.physAtk * power - d.physDef * 0.5;
  raw = Math.max(1, raw);
  if (crit) raw *= 1.5;
  raw *= rng.range(0.9, 1.1);

  return { dmg: Math.max(1, Math.floor(raw)), miss: false, crit };
}

export function magicalDamage(
  attacker: Stats,
  defender: Stats,
  power: number,
  rng: Rng,
  hitPenalty = 0,
): DamageResult {
  const a = deriveStats(attacker);
  const d = deriveStats(defender);
  const hit = clamp(a.hitChance - d.evadeChance - hitPenalty, 0.1, 1.0);
  if (!rng.chance(hit)) return { dmg: 0, miss: true, crit: false };
  let raw = a.magAtk * power - d.magDef * 0.5;
  raw = Math.max(1, raw);
  raw *= rng.range(0.9, 1.1);
  return { dmg: Math.max(1, Math.floor(raw)), miss: false, crit: false };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
