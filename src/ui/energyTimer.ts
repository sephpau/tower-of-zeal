// Background loop that updates any [data-energy-timer] element on the page
// once per second. Cheap, idempotent — installed once on first call.

import { msUntilNextRefill } from "../core/energy";

let started = false;

export function startEnergyTimerLoop(): void {
  if (started) return;
  started = true;
  setInterval(() => {
    const ms = msUntilNextRefill();
    const text = formatRefillCountdown(ms);
    document.querySelectorAll<HTMLElement>("[data-energy-timer]").forEach(el => {
      el.textContent = text;
    });
  }, 1000);
}

export function formatRefillCountdown(ms: number): string {
  if (ms <= 0) return "Refilling…";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
