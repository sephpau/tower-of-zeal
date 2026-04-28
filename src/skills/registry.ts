import { Skill } from "./types";

// "low/mid/high/very_high" power coefficients used by sheet skills.
const POW = { low: 1.0, mid: 1.5, high: 2.5, very_high: 3.5 } as const;

export const SKILLS: Record<string, Skill> = {
  // ---- Generic ----
  idle: {
    id: "idle", name: "Idle",
    kind: "buff", targeting: "self",
    power: 0, mpCost: 0, cooldown: 0,
    description: "Do nothing this action.",
  },
  basic_attack: {
    id: "basic_attack", name: "Attack",
    kind: "physical", targeting: "enemy",
    power: 1.0, mpCost: 0, cooldown: 0,
    description: "A basic strike.",
  },
  guard: {
    id: "guard", name: "Guard",
    kind: "buff", targeting: "self",
    power: 0, mpCost: 0, cooldown: 0,
    description: "Halve damage taken until your next action.",
  },
  power_strike: {
    id: "power_strike", name: "Power Strike",
    kind: "physical", targeting: "enemy",
    power: 2.0, mpCost: 6, cooldown: 0,
    description: "A heavy physical attack.",
  },
  fireball: {
    id: "fireball", name: "Fireball",
    kind: "magical", targeting: "enemy",
    power: 1.6, mpCost: 5, cooldown: 0,
    description: "A magical strike.",
  },

  // ---- Slime / Boss (post-50%-nerf) ----
  slime_goo: {
    id: "slime_goo", name: "Slime Goo",
    kind: "physical", targeting: "enemy",
    power: 0, mpCost: 0, cooldown: 0,
    description: "Sticky goo splatter (2–5 dmg).",
    flatDamage: { min: 2, max: 5 },
  },
  slime_king_goo: {
    id: "slime_king_goo", name: "Slime Goo",
    kind: "physical", targeting: "enemy",
    power: 0, mpCost: 0, cooldown: 0,
    description: "King-sized goo splatter (8–10 dmg).",
    flatDamage: { min: 8, max: 10 },
  },
  slime_barrage: {
    id: "slime_barrage", name: "Slime Barrage",
    kind: "physical", targeting: "all_enemies",
    power: 0, mpCost: 0, cooldown: 0,
    description: "Hits every player unit (10–15 dmg each).",
    flatDamage: { min: 10, max: 15 },
  },
  spawn_slimes: {
    id: "spawn_slimes", name: "Spawn Slimes",
    kind: "summon", targeting: "self",
    power: 0, mpCost: 0, hpCost: 10, cooldown: 0,
    description: "Summon 2 Slimes (only when no Slimes alive). Costs 10 HP.",
    summon: { templateId: "slime", count: 2 },
  },

  // ============================================================
  // SKILLS final — class skills (3 per class; lvl 5 + lvl 10 unlocks).
  // Status effects (confuse/burn/freeze/etc.) are NO-OPs for now;
  // descriptions preserved verbatim for future implementation.
  // Power coefficients map low/mid/high/very_high → 1.0/1.5/2.5/3.5.
  // ============================================================

  // Fighter
  impact_strike: {
    id: "impact_strike", name: "Impact Strike",
    kind: "physical", targeting: "enemy",
    power: POW.mid, mpCost: 10, cooldown: 1, unlockLevel: 1,
    description: "Mid single melee phys. 50% chance to confuse target. (CC: not yet implemented)",
  },
  focus_pulse: {
    id: "focus_pulse", name: "Focus Pulse",
    kind: "buff", targeting: "self",
    power: 0, mpCost: 20, cooldown: 5, unlockLevel: 5,
    description: "+P.atk for 3 actions (scales with STR/VIT/DEF). (Buff: not yet implemented)",
  },
  colossal_slam: {
    id: "colossal_slam", name: "Colossal Slam",
    kind: "physical", targeting: "all_enemies",
    power: POW.high, mpCost: 30, cooldown: 4, unlockLevel: 10,
    description: "High AOE phys (scales with STR/DEF/VIT).",
  },

  // Fire Mage
  ignite_touch: {
    id: "ignite_touch", name: "Ignite Touch",
    kind: "magical", targeting: "enemy",
    power: POW.mid, mpCost: 10, cooldown: 1, unlockLevel: 1,
    description: "Mid single melee magical. 20% chance to burn. (Burn: not yet implemented)",
  },
  blazing_burst: {
    id: "blazing_burst", name: "Blazing Burst",
    kind: "magical", targeting: "all_enemies",
    power: POW.mid, mpCost: 20, cooldown: 3, unlockLevel: 5,
    description: "Mid AOE magical. 20% chance to burn each. (Burn: not yet implemented)",
  },
  inferno_crash: {
    id: "inferno_crash", name: "Inferno Crash",
    kind: "magical", targeting: "enemy",
    power: POW.very_high, mpCost: 40, cooldown: 5, unlockLevel: 10,
    description: "Very High single magical. Inflicts burn. (Burn: not yet implemented)",
  },

  // Sharpshooter
  quick_draw: {
    id: "quick_draw", name: "Quick Draw",
    kind: "physical", targeting: "enemy",
    power: POW.mid, mpCost: 5, cooldown: 1, unlockLevel: 1,
    description: "Mid single range phys. Refunds 30% gauge after use. (Gauge refund: not yet implemented)",
  },
  double_tap: {
    id: "double_tap", name: "Double Tap",
    kind: "physical", targeting: "enemy",
    power: POW.mid, mpCost: 10, cooldown: 2, unlockLevel: 5,
    description: "2× Mid single range phys. (Multi-hit: applies one big hit for now.)",
    multiHit: 2,
  },
  apex_shot: {
    id: "apex_shot", name: "Apex Shot",
    kind: "physical", targeting: "enemy",
    power: POW.high, mpCost: 30, cooldown: 5, unlockLevel: 10,
    description: "High single range phys. High crit chance. (Crit boost: not yet implemented)",
  },

  // Water Mage
  hydro_bolt: {
    id: "hydro_bolt", name: "Hydro Bolt",
    kind: "magical", targeting: "enemy",
    power: POW.mid, mpCost: 10, cooldown: 1, unlockLevel: 1,
    description: "Mid single range magical. Freezes target. (Freeze: not yet implemented)",
  },
  vortex_stream: {
    id: "vortex_stream", name: "Vortex Stream",
    kind: "magical", targeting: "all_enemies",
    power: POW.mid, mpCost: 20, cooldown: 2, unlockLevel: 5,
    description: "Mid AOE range magical. 20% chance to confuse. (CC: not yet implemented)",
  },
  tidal_wave: {
    id: "tidal_wave", name: "Tidal Wave",
    kind: "magical", targeting: "all_enemies",
    power: POW.high, mpCost: 40, cooldown: 6, unlockLevel: 10,
    description: "High AOE range magical. Freezes all enemies. (Freeze: not yet implemented)",
  },

  // Scout
  swift_jab: {
    id: "swift_jab", name: "Swift Jab",
    kind: "physical", targeting: "enemy",
    power: POW.mid, mpCost: 5, cooldown: 1, unlockLevel: 1,
    description: "Mid single melee phys. Self +50% evasion 1 action. (Buff: not yet implemented)",
  },
  shadow_step: {
    id: "shadow_step", name: "Shadow Step",
    kind: "physical", targeting: "enemy",
    power: POW.mid, mpCost: 10, cooldown: 2, unlockLevel: 5,
    description: "Mid single melee phys. Inflicts confuse. (CC: not yet implemented)",
  },
  phantom_flurry: {
    id: "phantom_flurry", name: "Phantom Flurry",
    kind: "physical", targeting: "enemy",
    power: POW.low, mpCost: 20, cooldown: 4, unlockLevel: 10,
    description: "10× low single melee phys. Inflicts confuse twice. (Multi-hit + CC partial.)",
    multiHit: 10,
  },

  // Defender
  bash: {
    id: "bash", name: "Bash",
    kind: "physical", targeting: "enemy",
    power: POW.mid, mpCost: 10, cooldown: 1, unlockLevel: 1,
    description: "Mid single melee phys. Stuns target. (Stun: not yet implemented)",
  },
  phalanx_wall: {
    id: "phalanx_wall", name: "Phalanx Wall",
    kind: "buff", targeting: "self",
    power: 0, mpCost: 20, cooldown: 3, unlockLevel: 5,
    description: "+25% P.def & M.def, blocks 100% range damage. (Buff: not yet implemented)",
  },
  earthshaker: {
    id: "earthshaker", name: "Earthshaker",
    kind: "physical", targeting: "all_enemies",
    power: POW.high, mpCost: 30, cooldown: 5, unlockLevel: 10,
    description: "High AOE melee phys. Stuns all enemies. (Stun: not yet implemented)",
  },

  // Warden
  binding_shot: {
    id: "binding_shot", name: "Binding Shot",
    kind: "magical", targeting: "enemy",
    power: POW.mid, mpCost: 5, cooldown: 1, unlockLevel: 1,
    description: "Mid single range magical. Slows target. (Slow: not yet implemented)",
  },
  aura_shield: {
    id: "aura_shield", name: "Aura Shield",
    kind: "buff", targeting: "self",
    power: 0, mpCost: 10, cooldown: 4, unlockLevel: 5,
    description: "Allies +50% P.def/M.def for 3 actions. (Buff/ally targeting: not yet implemented)",
  },
  celestial_beam: {
    id: "celestial_beam", name: "Celestial Beam",
    kind: "magical", targeting: "all_enemies",
    power: POW.high, mpCost: 20, cooldown: 5, unlockLevel: 10,
    description: "High AOE range magical.",
  },

  // ============================================================
  // Character signature skills (3 per character; lvl 1 / 2 / 5).
  // ============================================================

  // Hera (magical)
  lightburst: {
    id: "lightburst", name: "Lightburst",
    kind: "magical", targeting: "enemy",
    power: POW.low, mpCost: 2, cooldown: 1, unlockLevel: 1,
    description: "Low single melee magical (scales m.atk + INT).",
  },
  radiant_punch: {
    id: "radiant_punch", name: "Radiant Punch",
    kind: "magical", targeting: "all_enemies",
    power: POW.mid, mpCost: 15, cooldown: 2, unlockLevel: 2,
    description: "Mid magical hit + AOE splash. 20% blind 2 actions. (Splash + blind: not yet implemented)",
  },
  solar_flare: {
    id: "solar_flare", name: "Solar Flare",
    kind: "magical", targeting: "all_enemies",
    power: POW.high, mpCost: 40, cooldown: 5, unlockLevel: 5,
    description: "High AOE range magical. 20% burn 3 actions. (Burn: not yet implemented)",
  },

  // Aspen (physical)
  decimate: {
    id: "decimate", name: "Decimate",
    kind: "physical", targeting: "enemy",
    power: POW.low, mpCost: 0, cooldown: 1, unlockLevel: 1,
    description: "Low single melee phys (scales p.atk + STR + VIT).",
  },
  twin_slash: {
    id: "twin_slash", name: "Twin Slash",
    kind: "physical", targeting: "enemy",
    power: POW.low * 0.8, mpCost: 5, cooldown: 2, unlockLevel: 2,
    description: "2× single melee phys (80% Decimate dmg).",
    multiHit: 2,
  },
  whirlwind_edge: {
    id: "whirlwind_edge", name: "Whirlwind Edge",
    kind: "physical", targeting: "all_enemies",
    power: POW.mid, mpCost: 10, cooldown: 4, unlockLevel: 5,
    description: "Mid AOE melee phys. +50% VIT/DEF for 2 actions. (Buff: not yet implemented)",
  },

  // Oge (tank)
  iron_bulwark: {
    id: "iron_bulwark", name: "Iron Bulwark",
    kind: "buff", targeting: "self",
    power: 0, mpCost: 0, cooldown: 1, unlockLevel: 1,
    description: "+25% P.def/M.def for 2 actions (scales VIT + DEF). (Buff: not yet implemented)",
  },
  bastions_call: {
    id: "bastions_call", name: "Bastion's Call",
    kind: "buff", targeting: "self",
    power: 0, mpCost: 5, cooldown: 1, unlockLevel: 2,
    description: "Taunt all enemies for 2 actions. (Taunt: not yet implemented)",
  },
  unyielding_heart: {
    id: "unyielding_heart", name: "Unyielding Heart",
    kind: "buff", targeting: "self",
    power: 0, mpCost: 20, cooldown: 6, unlockLevel: 5,
    description: "−80% damage taken 3 actions; allies +P/M.atk. (Buff: not yet implemented)",
  },

  // Soda (physical / support heal)
  soda_punch: {
    id: "soda_punch", name: "Soda Punch",
    kind: "physical", targeting: "enemy",
    power: POW.low, mpCost: 0, cooldown: 1, unlockLevel: 1,
    description: "Low single melee phys (scales p.atk + AGI).",
  },
  soda_pop: {
    id: "soda_pop", name: "Soda Pop",
    kind: "buff", targeting: "self",
    power: 0, mpCost: 10, cooldown: 3, unlockLevel: 2,
    description: "Heal target ally 20% (scales DEX). (Heal: not yet implemented)",
  },
  swift_echo: {
    id: "swift_echo", name: "Swift Echo",
    kind: "physical", targeting: "enemy",
    power: POW.low, mpCost: 10, cooldown: 2, unlockLevel: 5,
    description: "3 rapid low melee strikes (scales AGI).",
    multiHit: 3,
  },

  // Ego (physical)
  body_slam: {
    id: "body_slam", name: "Body Slam",
    kind: "physical", targeting: "enemy",
    power: POW.low, mpCost: 0, cooldown: 1, unlockLevel: 1,
    description: "Low single melee phys (scales p.atk + STR).",
  },
  limit_break: {
    id: "limit_break", name: "Limit Break",
    kind: "buff", targeting: "self",
    power: 0, mpCost: 5, cooldown: 3, unlockLevel: 2,
    description: "2× P.atk, −50% P/M.def for 3 turns. (Buff: not yet implemented)",
  },
  all_or_nothing: {
    id: "all_or_nothing", name: "All or Nothing!",
    kind: "physical", targeting: "enemy",
    power: POW.high, mpCost: 10, cooldown: 2, unlockLevel: 5,
    description: "High single phys; recoil = 20% damage. (Recoil + confuse: not yet implemented)",
  },

  // Gruyere (physical / debuff)
  tactical_hit: {
    id: "tactical_hit", name: "Tactical Hit",
    kind: "physical", targeting: "enemy",
    power: POW.low, mpCost: 0, cooldown: 1, unlockLevel: 1,
    description: "Low single melee phys (scales p.atk + DEX).",
  },
  analyze_vulnerability: {
    id: "analyze_vulnerability", name: "Analyze Vulnerability",
    kind: "buff", targeting: "self",
    power: 0, mpCost: 5, cooldown: 2, unlockLevel: 2,
    description: "Allies +15% dmg vs target for 2 actions. (Debuff: not yet implemented)",
  },
  grandmasters_domain: {
    id: "grandmasters_domain", name: "Grandmaster's Domain",
    kind: "buff", targeting: "self",
    power: 0, mpCost: 20, cooldown: 5, unlockLevel: 5,
    description: "Allies +20% DEX/AGI for 3 actions. (Buff: not yet implemented)",
  },

  // Calypso (magical / support heal)
  siphon_pulse: {
    id: "siphon_pulse", name: "Siphon Pulse",
    kind: "magical", targeting: "enemy",
    power: POW.low, mpCost: 0, cooldown: 1, unlockLevel: 1,
    description: "Low single range magical (scales m.atk + INT).",
  },
  tidal_mending: {
    id: "tidal_mending", name: "Tidal Mending",
    kind: "buff", targeting: "self",
    power: 0, mpCost: 5, cooldown: 2, unlockLevel: 2,
    description: "Heal ally 20% HP + restore 20 mana. (Heal/refresh: not yet implemented)",
  },
  sirens_sanctuary: {
    id: "sirens_sanctuary", name: "Siren's Sanctuary",
    kind: "buff", targeting: "self",
    power: 0, mpCost: 20, cooldown: 5, unlockLevel: 5,
    description: "Allies CC immune, −50% mana cost & cooldowns, heal 10% HP. (Buff: not yet implemented)",
  },

  // Calico (magical / range)
  horizon_strike: {
    id: "horizon_strike", name: "Horizon Strike",
    kind: "magical", targeting: "enemy",
    power: POW.low, mpCost: 0, cooldown: 1, unlockLevel: 1,
    description: "Low single range magical (scales m.atk + AGI + INT).",
  },
  needle_shot: {
    id: "needle_shot", name: "Needle Shot",
    kind: "physical", targeting: "enemy",
    power: POW.mid, mpCost: 5, cooldown: 2, unlockLevel: 2,
    description: "Mid single range phys, 100% hit, 20% crit. Bleed 3 actions. (Bleed: not yet implemented)",
  },
  mark_of_death: {
    id: "mark_of_death", name: "Mark of Death",
    kind: "buff", targeting: "self",
    power: 0, mpCost: 20, cooldown: 5, unlockLevel: 5,
    description: "Mark a target: cant evade, +20% incoming, −20% AGI for 4 actions. (Debuff: not yet implemented)",
  },

  // Nova (magical)
  water_bolt: {
    id: "water_bolt", name: "Water Bolt",
    kind: "magical", targeting: "enemy",
    power: POW.low, mpCost: 5, cooldown: 1, unlockLevel: 1,
    description: "Low single range magical (scales m.atk + INT).",
  },
  frost_bite: {
    id: "frost_bite", name: "Frost Bite",
    kind: "magical", targeting: "all_enemies",
    power: POW.mid, mpCost: 15, cooldown: 2, unlockLevel: 2,
    description: "Mid AOE range magical. Freeze enemies. (Freeze: not yet implemented)",
  },
  navigators_wrath: {
    id: "navigators_wrath", name: "Navigator's Wrath",
    kind: "magical", targeting: "enemy",
    power: POW.very_high, mpCost: 40, cooldown: 6, unlockLevel: 5,
    description: "Very High single range magical (scales m.atk + INT).",
  },
};

export function getSkill(id: string): Skill {
  const s = SKILLS[id];
  if (!s) throw new Error(`Unknown skill: ${id}`);
  return s;
}

// Skills earned by class membership (looked up by class id).
export const CLASS_SKILLS: Record<string, string[]> = {
  fighter: ["impact_strike", "focus_pulse", "colossal_slam"],
  fire_mage: ["ignite_touch", "blazing_burst", "inferno_crash"],
  sharpshooter: ["quick_draw", "double_tap", "apex_shot"],
  water_mage: ["hydro_bolt", "vortex_stream", "tidal_wave"],
  scout: ["swift_jab", "shadow_step", "phantom_flurry"],
  defender: ["bash", "phalanx_wall", "earthshaker"],
  warden: ["binding_shot", "aura_shield", "celestial_beam"],
};

// Signature skills earned by character (looked up by template id).
export const CHARACTER_SKILLS: Record<string, string[]> = {
  hera: ["lightburst", "radiant_punch", "solar_flare"],
  aspen: ["decimate", "twin_slash", "whirlwind_edge"],
  oge: ["iron_bulwark", "bastions_call", "unyielding_heart"],
  soda: ["soda_punch", "soda_pop", "swift_echo"],
  ego: ["body_slam", "limit_break", "all_or_nothing"],
  gruyere: ["tactical_hit", "analyze_vulnerability", "grandmasters_domain"],
  calypso: ["siphon_pulse", "tidal_mending", "sirens_sanctuary"],
  calico: ["horizon_strike", "needle_shot", "mark_of_death"],
  nova: ["water_bolt", "frost_bite", "navigators_wrath"],
};
