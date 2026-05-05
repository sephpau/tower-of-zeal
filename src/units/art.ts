const UNIT_ART_IDS = new Set([
  "soda", "ego", "gruyere", "calypso", "calico", "nova", "hera", "aspen", "oge",
]);

export function unitArtUrl(unitId: string): string | null {
  return UNIT_ART_IDS.has(unitId) ? `/units/${unitId}.webp` : null;
}

/** Returns either an <img> tag for units with art, or the emoji fallback. */
export function portraitInner(unitId: string, emojiFallback: string): string {
  const url = unitArtUrl(unitId);
  return url
    ? `<img class="portrait-art" src="${url}" alt="" draggable="false" />`
    : emojiFallback;
}
