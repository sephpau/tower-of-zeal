// Looping background music for non-combat screens.

import { loadSettings } from "../ui/settings";

const SRC = "/bgm-home.weba";
const VOL_KEY = "toz.bgm.volume";

let audio: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio(SRC);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = readVolume();
  return audio;
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
  if (audio) audio.volume = clamped;
}

export function getBgmVolume(): number {
  return readVolume();
}

export function playBgm(): void {
  if (!loadSettings().bgmOn) {
    // If user disabled BGM, make sure any prior playback is stopped.
    if (audio && !audio.paused) {
      audio.pause();
      audio.currentTime = 0;
    }
    return;
  }
  const a = getAudio();
  if (!a.paused) return;
  a.play().catch(() => { /* autoplay may be blocked until interaction */ });
}

export function stopBgm(): void {
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}
