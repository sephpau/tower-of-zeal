// Tiny Web Audio synth for menu/click and combat hits, plus a single
// prerecorded WAV for crit damage. Honors loadSettings().sfxOn so all
// sounds can be muted from settings.

import { loadSettings } from "../ui/settings";

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); }
    catch { ctx = null; }
  }
  return ctx;
}

function sfxAllowed(): boolean {
  try { return loadSettings().sfxOn; } catch { return true; }
}

// User-facing SFX volume (0..1). Independent from the bgm volume slider.
// Each individual sound source applies its own gain on top of this master.
const SFX_VOL_KEY = "toz.sfx.volume";
function readSfxVolume(): number {
  try {
    const raw = localStorage.getItem(SFX_VOL_KEY);
    if (raw === null) return 0.8;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.8;
  } catch { return 0.8; }
}
export function getSfxVolume(): number { return readSfxVolume(); }
export function setSfxVolume(v: number): void {
  const clamped = Math.max(0, Math.min(1, v));
  try { localStorage.setItem(SFX_VOL_KEY, String(clamped)); } catch { /* ignore */ }
}

interface Tone {
  freq: number;
  type?: OscillatorType;
  durMs?: number;
  gain?: number;
  /** Frequency at end (linear glide). */
  endFreq?: number;
}

function blip(t: Tone): void {
  if (!sfxAllowed()) return;
  const a = ac();
  if (!a) return;
  const dur = (t.durMs ?? 90) / 1000;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = t.type ?? "square";
  o.frequency.setValueAtTime(t.freq, a.currentTime);
  if (t.endFreq !== undefined) {
    o.frequency.linearRampToValueAtTime(t.endFreq, a.currentTime + dur);
  }
  // Scale per-sound peak gain by the user's SFX volume slider.
  const peak = (t.gain ?? 0.08) * readSfxVolume();
  g.gain.setValueAtTime(0, a.currentTime);
  g.gain.linearRampToValueAtTime(peak, a.currentTime + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + dur + 0.02);
}

function chord(tones: Tone[]): void {
  for (const t of tones) blip(t);
}

// ---- File-based samples (small set) ----
const SAMPLE_SRC: Record<string, string> = {
  crit: "/sfx/crit.wav",
  hitPhys: "/sfx/hit-physical.wav",
  hitMag: "/sfx/hit-magical.wav",
  castBuff: "/sfx/cast-buff.wav",
  victory: "/sfx/victory.mp3",
};
const sampleCache: Record<string, HTMLAudioElement> = {};
function preloadSample(key: string): void {
  if (typeof window === "undefined") return;
  if (sampleCache[key]) return;
  const src = SAMPLE_SRC[key];
  if (!src) return;
  const a = new Audio(src);
  a.preload = "auto";
  sampleCache[key] = a;
}
function playSample(key: string, gain: number): void {
  if (!sfxAllowed()) return;
  if (typeof window === "undefined") return;
  const src = SAMPLE_SRC[key];
  if (!src) return;
  preloadSample(key);
  // Fresh Audio per call so rapid hits don't cut each other off.
  const a = new Audio(src);
  a.volume = Math.max(0, Math.min(1, gain * readSfxVolume()));
  a.play().catch(() => undefined);
}

// Public sounds — synth blips for everything except the crit damage WAV.
export const sfx = {
  click: () => blip({ freq: 880, type: "square", durMs: 35, gain: 0.05 }),
  hover: () => blip({ freq: 660, type: "sine", durMs: 25, gain: 0.03 }),
  physMelee: () => playSample("hitPhys", 0.22),
  physRange: () => playSample("hitPhys", 0.22),
  magMelee: () => playSample("hitMag", 0.22),
  magRange: () => playSample("hitMag", 0.22),
  castBuff: () => playSample("castBuff", 0.22),
  heal: () => chord([
    { freq: 880, endFreq: 1320, type: "sine", durMs: 160, gain: 0.07 },
    { freq: 1320, endFreq: 1760, type: "sine", durMs: 160, gain: 0.05 },
  ]),
  manaHeal: () => chord([
    { freq: 660, endFreq: 990, type: "triangle", durMs: 160, gain: 0.06 },
  ]),
  crit: () => playSample("crit", 0.32),
  miss: () => blip({ freq: 220, endFreq: 110, type: "triangle", durMs: 80, gain: 0.04 }),
  fall: () => blip({ freq: 200, endFreq: 60, type: "sawtooth", durMs: 240, gain: 0.10 }),
  victory: () => playSample("victory", 0.5),
  /** Sword-clash sound for the begin-battle transition. Layers crit ring +
   *  physical impact for a meatier clang. */
  skirmish: () => {
    playSample("crit", 0.5);
    setTimeout(() => playSample("hitPhys", 0.4), 30);
  },
  defeat: () => chord([
    { freq: 392, type: "sawtooth", durMs: 220, gain: 0.06 },
    { freq: 311, type: "sawtooth", durMs: 320, gain: 0.07 },
  ]),
  idle: () => blip({ freq: 440, type: "sine", durMs: 50, gain: 0.04 }),
};

// Global click/hover delegation for any clickable element.
let clickWired = false;
export function installGlobalClickSounds(): void {
  if (clickWired || typeof document === "undefined") return;
  clickWired = true;
  document.addEventListener("click", e => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const clickable = t.closest("button, [data-roster], [data-cell], .stage-tile, .home-tile, .roster-item, .class-pick-btn, .alloc-btn, .gear-btn, .back-btn");
    if (clickable && !(clickable as HTMLButtonElement).disabled) sfx.click();
  }, true);
}
