// Brief sword-clash transition played after "Begin Battle?" is confirmed,
// before the squad-select handoff actually starts the fight. ~1.4s total —
// long enough to feel cinematic, short enough not to annoy on repeat runs.

const SWORD_SVG = `
<svg viewBox="0 0 32 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="blade-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"  stop-color="#94a3b8"/>
      <stop offset="50%" stop-color="#e7e8ec"/>
      <stop offset="100%" stop-color="#6b7280"/>
    </linearGradient>
  </defs>
  <!-- Blade -->
  <polygon points="16,4 22,160 16,170 10,160" fill="url(#blade-grad)" stroke="#1a1d28" stroke-width="0.5" />
  <!-- Crossguard -->
  <rect x="2" y="160" width="28" height="6" rx="1.5" fill="#d4a93e" stroke="#7a5a14" stroke-width="0.5"/>
  <!-- Grip -->
  <rect x="13" y="166" width="6" height="20" fill="#1e1812" stroke="#0a0805" stroke-width="0.5"/>
  <!-- Pommel -->
  <circle cx="16" cy="190" r="5" fill="#d4a93e" stroke="#7a5a14" stroke-width="0.5"/>
</svg>
`;

/** Mounts a full-viewport overlay, plays the clash animation, resolves once
 *  the animation finishes. Safe to call from anywhere (caller awaits). */
export function playBattleStartAnimation(): Promise<void> {
  return new Promise<void>(resolve => {
    // Strip any prior instance just in case (double-click resilience).
    document.querySelectorAll(".battle-start-overlay").forEach(el => el.remove());

    const overlay = document.createElement("div");
    overlay.className = "battle-start-overlay";
    overlay.innerHTML = `
      <div class="bsa-stage">
        <div class="bsa-sword bsa-sword-left">${SWORD_SVG}</div>
        <div class="bsa-sword bsa-sword-right">${SWORD_SVG}</div>
        <div class="bsa-flash"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Total animation length matches the longest CSS animation duration below.
    const DURATION_MS = 1400;
    setTimeout(() => {
      overlay.classList.add("bsa-exit");
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, 220);
    }, DURATION_MS);
  });
}
