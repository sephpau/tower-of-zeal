const UNIT_ART_IDS = new Set([
  "soda", "ego", "gruyere", "calypso", "calico", "nova", "hera", "aspen", "oge", "shego",
]);

/** Player units that require holding the MoTZ Vault Key to use. */
export const MOTZ_KEY_LOCKED_UNITS = new Set(["hera", "nova", "oge", "shego"]);

import { getVerifiedPerks } from "../auth/session";

/** True if this unit is currently locked behind a perk the player doesn't have. */
export function isUnitLocked(unitId: string): boolean {
  if (!MOTZ_KEY_LOCKED_UNITS.has(unitId)) return false;
  return !getVerifiedPerks().motzKey;
}
const CLASS_CAPE_IDS = new Set([
  "fighter", "fire_mage", "water_mage", "sharpshooter", "scout", "defender", "warden",
]);

// Enemy art is dropped under /public/tiles. Keys are roster template ids;
// values are the exact filenames on disk (spaces preserved, original case).
// Add a new line here whenever a new tile is added.
const ENEMY_TILE_FILES: Record<string, string> = {
  slime: "slime.png",
  slime_king: "slime king.png",
  wolf: "wolf.png",
  bandit: "bandit.png",
  acolyte: "acolyte.png",
  skeleton: "Skeleton.png",
  wraith: "Wraith.png",
  skeleton_knight: "Skeleton knight.png",
  elite_wraith: "Elite Wraith.png",
  cleric: "Cleric.png",
  cantor: "Cantor.png",
  archon: "Archon.png",
  hexer: "Hexer.png",
  plague_bearer: "plague bearer.png",
  jinx: "Jinx.png",
  gravelock: "Gravelock.png",
  dark_knight: "Dark knight.png",
  lich: "lich.png",
  berserker: "Berserker.png",
  night_hag: "night hag.png",
  gargoyle: "Gargoyle.png",
  demon_hound: "Demon hound.png",
  stone_sentinel: "Stone Sentinel.png",
  wraith_lord: "Wraith Lord.png",
  tower_lord: "Tower Lord.png",
  iron_behemoth: "Iron Behemoth.png",
  storm_lord: "Storm Lord.png",
  demon_general: "Demon General.png",
  witch_queen: "Witch Queen.png",
  dragon_lord: "Dragon Lord.png",
  tower_god: "Tower God.png",
  null_guardian: "Null Guardian.png",
  void_knight: "Void knight.png",
  spectre: "Spectre.png",
  stormcaller: "Storm Caller.png",
  air_dancer: "Air Dancer.png",
  floating_eye: "Floating eye.png",
  bulwark_bear: "Bulwark Bear.png",
  spiked_shell: "Spiked Shell.png",
  null_hierophant: "Null Hierophant.png",
  the_untouched: "The Untouched.png",
  shield_priest: "Shield Priest.png",
  warding_paladin: "Warding Paladin.png",
  wraith_hexer: "Wraith Hexer.png",
  storm_oracle: "Storm Oracle.png",
  dust_djinn: "Dust Djinn.png",
  mirror_sprite: "Mirror Sprite.png",
  husk_titan: "Husk Titan.png",
  carapace_matron: "Carapace Matron.png",
  apex_arbiter: "Apex Arbiter.png",
  world_ender: "World Ender.png",
};

export function unitArtUrl(unitId: string): string | null {
  if (UNIT_ART_IDS.has(unitId)) return `/units/${unitId}.webp`;
  const tile = ENEMY_TILE_FILES[unitId];
  if (tile) return `/tiles/${encodeURIComponent(tile)}`;
  return null;
}

export function classCapeUrl(classId: string | undefined): string | null {
  return classId && CLASS_CAPE_IDS.has(classId) ? `/capes/${classId}.webp` : null;
}

/** Returns either an <img> tag for units with art, or the emoji fallback. */
export function portraitInner(unitId: string, emojiFallback: string): string {
  const url = unitArtUrl(unitId);
  return url
    ? `<img class="portrait-art" src="${url}" alt="" draggable="false" />`
    : emojiFallback;
}

/** Class-cape <img> rendered behind the portrait, or empty string if no class. */
export function capeHtml(classId: string | undefined): string {
  const url = classCapeUrl(classId);
  return url
    ? `<img class="portrait-cape" src="${url}" alt="" draggable="false" />`
    : "";
}
