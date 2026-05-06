const UNIT_ART_IDS = new Set([
  "soda", "ego", "gruyere", "calypso", "calico", "nova", "hera", "aspen", "oge",
]);

/** Player units that require holding the MoTZ Vault Key to use. */
export const MOTZ_KEY_LOCKED_UNITS = new Set(["hera", "nova", "oge"]);

import { getVerifiedPerks } from "../auth/session";

/** True if this unit is currently locked behind a perk the player doesn't have. */
export function isUnitLocked(unitId: string): boolean {
  if (!MOTZ_KEY_LOCKED_UNITS.has(unitId)) return false;
  return !getVerifiedPerks().motzKey;
}
const CLASS_CAPE_IDS = new Set([
  "fighter", "fire_mage", "water_mage", "sharpshooter", "scout", "defender", "warden",
]);

export function unitArtUrl(unitId: string): string | null {
  return UNIT_ART_IDS.has(unitId) ? `/units/${unitId}.webp` : null;
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
