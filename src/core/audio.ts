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

// ---- Crit-only file sample ----
let critAudio: HTMLAudioElement | null = null;
function playCritSample(): void {
  if (!sfxAllowed()) return;
  if (typeof window === "undefined") return;
  if (!critAudio) {
    critAudio = new Audio("/sfx/crit.wav");
    critAudio.preload = "auto";
  }
  // Clone so rapid crits overlap instead of cutting each other off.
  const a = new Audio("/sfx/crit.wav");
  a.volume = 0.7;
  a.play().catch(() => undefined);
}

// Public sounds — synth blips for everything except the crit damage WAV.
export const sfx = {
  click: () => blip({ freq: 880, type: "square", durMs: 35, gain: 0.05 }),
  hover: () => blip({ freq: 660, type: "sine", durMs: 25, gain: 0.03 }),
  physMelee: () => chord([
    { freq: 220, endFreq: 80, type: "sawtooth", durMs: 110, gain: 0.10 },
    { freq: 1200, endFreq: 200, type: "square", durMs: 60, gain: 0.04 },
  ]),
  physRange: () => chord([
    { freq: 1500, endFreq: 600, type: "triangle", durMs: 90, gain: 0.06 },
    { freq: 300, endFreq: 100, type: "square", durMs: 70, gain: 0.05 },
  ]),
  magMelee: () => chord([
    { freq: 320, endFreq: 110, type: "sawtooth", durMs: 130, gain: 0.07 },
    { freq: 880, endFreq: 1760, type: "sine", durMs: 130, gain: 0.05 },
  ]),
  magRange: () => chord([
    { freq: 660, endFreq: 1320, type: "sine", durMs: 160, gain: 0.06 },
    { freq: 220, endFreq: 880, type: "triangle", durMs: 160, gain: 0.04 },
  ]),
  heal: () => chord([
    { freq: 880, endFreq: 1320, type: "sine", durMs: 160, gain: 0.07 },
    { freq: 1320, endFreq: 1760, type: "sine", durMs: 160, gain: 0.05 },
  ]),
  manaHeal: () => chord([
    { freq: 660, endFreq: 990, type: "triangle", durMs: 160, gain: 0.06 },
  ]),
  // Critical hits use the prerecorded WAV; everything else stays synth.
  crit: () => playCritSample(),
  miss: () => blip({ freq: 220, endFreq: 110, type: "triangle", durMs: 80, gain: 0.04 }),
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
    if (clickable && !(clickable as HTMLButtonElement).disabled) sfx.click();
  }, true);
}
