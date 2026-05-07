// Background music. One pre-cached <audio> element per track so switching
// between home → battle → boss is instant and doesn't re-download.
// Each track applies a fixed multiplier on top of the user's volume slider
// so battle tracks can sit lower in the mix than the menu loop.

import { loadSettings } from "../ui/settings";

export type BgmTrack = "home" | "battle" | "boss" | "floor50";

const SRC: Record<BgmTrack, string> = {
  home: "/bgm-home.weba",
  battle: "/bgm-battle.mp3",
  boss: "/bgm-boss.mp3",
  floor50: "/floor-50.mp3",
};

/** Per-track loudness multiplier. The user's volume slider × this = effective volume. */
const TRACK_MUL: Record<BgmTrack, number> = {
  home: 1.0,
  battle: 0.4,
  boss: 0.45,
  floor50: 0.5,
};

const VOL_KEY = "toz.bgm.volume";

const cache: Partial<Record<BgmTrack, HTMLAudioElement>> = {};
let activeTrack: BgmTrack | null = null;

function effectiveVolume(track: BgmTrack): number {
  return Math.max(0, Math.min(1, readVolume() * TRACK_MUL[track]));
}

function getAudio(track: BgmTrack): HTMLAudioElement {
  let a = cache[track];
  if (a) return a;
  a = new Audio(SRC[track]);
  a.loop = true;
  a.preload = "auto";
  a.volume = effectiveVolume(track);
  cache[track] = a;
  return a;
}

function readVolume(): number {
  try {
    const raw = localStorage.getItem(VOL_KEY);
    if (raw === null) return 0.4;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.4;
  } catch { return 0.4; }
}

export function setBgmVolume(v: number): void {
  const clamped = Math.max(0, Math.min(1, v));
  try { localStorage.setItem(VOL_KEY, String(clamped)); } catch { /* ignore */ }
  for (const t of Object.keys(cache) as BgmTrack[]) {
    const el = cache[t];
    if (el) el.volume = effectiveVolume(t);
  }
}

export function getBgmVolume(): number {
  return readVolume();
}

/** Play a track, stopping any other track that's currently playing. */
export function playTrack(track: BgmTrack): void {
  if (!loadSettings().bgmOn) {
    stopBgm();
    return;
  }
  if (activeTrack === track) {
    const cur = cache[track];
    if (cur && cur.paused) cur.play().catch(() => undefined);
    return;
  }
  // Stop the previous track.
  if (activeTrack) {
    const prev = cache[activeTrack];
    if (prev) { prev.pause(); prev.currentTime = 0; }
  }
  activeTrack = track;
  const a = getAudio(track);
  a.volume = effectiveVolume(track);
  a.play().catch(() => { /* autoplay may be blocked until interaction */ });
}

/** Resume / play the home (non-combat) track. Kept for legacy call sites. */
export function playBgm(): void {
  playTrack("home");
}

/** Pick the right battle track based on the floor being fought and the mode. */
export function playBattleBgm(stageId: number, mode: "floor" | "survival" | "boss_raid", isSoloBoss: boolean): void {
  if (stageId === 50) { playTrack("floor50"); return; }
  if (mode === "boss_raid" || isSoloBoss) { playTrack("boss"); return; }
  playTrack("battle");
}

export function stopBgm(): void {
  if (!activeTrack) return;
  const cur = cache[activeTrack];
  if (cur) { cur.pause(); cur.currentTime = 0; }
  activeTrack = null;
}
