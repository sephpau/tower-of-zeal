// Hybrid SFX: a few synth blips for menu/click and prerecorded WAV/MP3
// samples for combat hits, crits, misses, and the ATB-ready chime.
// Honors loadSettings().sfxOn so all sounds can be muted from settings.

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
  const peak = t.gain ?? 0.08;
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

// ---- File-based samples ----
// Pre-cached <audio> per sample. We clone on each play so rapid-fire SFX
// can overlap (e.g. multiple hits in the same animation lock).
const SAMPLE_SRC: Record<string, string> = {
  hitPhys: "/sfx/hit-physical.wav",
  hitMag: "/sfx/hit-magical.wav",
  hitFire: "/sfx/hit-fire.mp3",
  hitWater: "/sfx/hit-water.wav",
  hitWind: "/sfx/hit-wind.wav",
  hitSharpshooter: "/sfx/hit-sharpshooter.wav",
  hitWraith: "/sfx/hit-wraith.wav",
  slimeAttack: "/sfx/slime-attack.wav",
  guardedHit: "/sfx/guarded-hit.wav",
  crit: "/sfx/crit.wav",
  miss: "/sfx/miss.mp3",
  atbReady: "/sfx/atb-ready.wav",
  castMagical: "/sfx/cast-magical.wav",
  castBuff: "/sfx/cast-buff.wav",
  clickBattle: "/sfx/click-battle.wav",
};
const sampleCache: Record<string, HTMLAudioElement> = {};
function loadSample(key: string): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  let cached = sampleCache[key];
  if (cached) return cached;
  const src = SAMPLE_SRC[key];
  if (!src) return null;
  cached = new Audio(src);
  cached.preload = "auto";
  sampleCache[key] = cached;
  return cached;
}

function playSample(key: string, gain = 0.5): void {
  if (!sfxAllowed()) return;
  const src = SAMPLE_SRC[key];
  if (!src) return;
  // Pre-warm the cache; clone lets concurrent plays not cut each other off.
  loadSample(key);
  const a = new Audio(src);
  a.volume = Math.max(0, Math.min(1, gain));
  a.play().catch(() => undefined);
}

// Public sounds. File-backed for combat hits / crits / misses / atb-ready.
export const sfx = {
  click: () => blip({ freq: 880, type: "square", durMs: 35, gain: 0.05 }),
  hover: () => blip({ freq: 660, type: "sine", durMs: 25, gain: 0.03 }),
  physMelee: () => playSample("hitPhys", 0.6),
  physRange: () => playSample("hitPhys", 0.6),
  magMelee: () => playSample("hitMag", 0.55),
  magRange: () => playSample("hitMag", 0.55),
  crit: () => playSample("crit", 0.7),
  miss: () => playSample("miss", 0.45),
  atbReady: () => playSample("atbReady", 0.35),
  castMagical: () => playSample("castMagical", 0.55),
  castBuff: () => playSample("castBuff", 0.5),
  hitFire: () => playSample("hitFire", 0.6),
  hitWater: () => playSample("hitWater", 0.6),
  hitWind: () => playSample("hitWind", 0.6),
  hitSharpshooter: () => playSample("hitSharpshooter", 0.6),
  hitWraith: () => playSample("hitWraith", 0.6),
  slimeAttack: () => playSample("slimeAttack", 0.55),
  guardedHit: () => playSample("guardedHit", 0.55),
  clickBattle: () => playSample("clickBattle", 0.5),
  // Synth-only — no asset for these yet.
  heal: () => chord([
    { freq: 880, endFreq: 1320, type: "sine", durMs: 160, gain: 0.07 },
    { freq: 1320, endFreq: 1760, type: "sine", durMs: 160, gain: 0.05 },
  ]),
  manaHeal: () => chord([
    { freq: 660, endFreq: 990, type: "triangle", durMs: 160, gain: 0.06 },
  ]),
  fall: () => blip({ freq: 200, endFreq: 60, type: "sawtooth", durMs: 240, gain: 0.10 }),
  victory: () => chord([
    { freq: 523, type: "square", durMs: 160, gain: 0.06 },
    { freq: 659, type: "square", durMs: 160, gain: 0.06 },
    { freq: 784, type: "square", durMs: 220, gain: 0.07 },
  ]),
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
    if (!clickable || (clickable as HTMLButtonElement).disabled) return;
    // Inside a .battle screen → use the prerecorded battle click. Elsewhere → synth blip.
    if (clickable.closest(".battle")) sfx.clickBattle();
    else sfx.click();
  }, true);
}
