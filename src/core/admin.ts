// Admin gating: only specific player names can use dev controls.
// Set the player name in Settings → "Player name" to match.

import { loadSettings } from "../ui/settings";

const ADMIN_NAMES = new Set<string>(["Sephpau"]);

export function isAdmin(): boolean {
  try {
    const s = loadSettings();
    return ADMIN_NAMES.has(s.playerName.trim());
  } catch {
    return false;
  }
}
