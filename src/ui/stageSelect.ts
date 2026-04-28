import { topBarHtml } from "./settings";
import { getEnergy, ENERGY_MAX, msUntilNextRefill } from "../core/energy";
import { STAGE_DEFS } from "../units/roster";
import { getMaxCleared } from "../core/clears";

export const SURVIVAL_ENERGY_COST: number = 3;

export type StagePick = { kind: "floor"; id: number } | { kind: "survival" };

export function renderStageSelect(root: HTMLElement, onPick: (pick: StagePick) => void, onBack: () => void): void {
  const energy = getEnergy();
  const maxCleared = getMaxCleared();

  root.innerHTML = `
    <div class="screen-frame stage-select-screen">
      ${topBarHtml("Tower of Zeal", true)}
      <div class="energy-pill standalone" title="Energy">
        <span class="energy-icon">⚡</span><span>${energy} / ${ENERGY_MAX}</span>
        <span class="energy-hint">refills in <span id="energy-refill-timer">${formatCountdown(msUntilNextRefill())}</span></span>
      </div>
      <div class="stage-layout">
        <div class="stage-grid">
          ${STAGE_DEFS.map(s => stageTileHtml(s, energy, maxCleared)).join("")}
        </div>
        <button class="survival-tile" id="survival-tile" type="button" ${energy < SURVIVAL_ENERGY_COST ? "disabled" : ""}>
          <div class="survival-art"></div>
          <div class="survival-overlay">
            <div class="survival-title">Survival Mode!</div>
            <div class="survival-sub">(${SURVIVAL_ENERGY_COST} energy spent per run)</div>
          </div>
        </button>
      </div>
    </div>
  `;
  root.querySelector("#back-btn")?.addEventListener("click", onBack);
  root.querySelectorAll<HTMLButtonElement>(".stage-tile").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.stage);
      const stage = STAGE_DEFS.find(s => s.id === id);
      if (!stage) return;
      const unlocked = id <= maxCleared + 1;
      if (!unlocked) return;
      if (getEnergy() <= 0) return;
      onPick({ kind: "floor", id });
    });
  });
  root.querySelector<HTMLButtonElement>("#survival-tile")?.addEventListener("click", () => {
    if (getEnergy() < SURVIVAL_ENERGY_COST) return;
    onPick({ kind: "survival" });
  });

  // Live countdown — tick every second; stop when the timer element disappears (screen change).
  const tick = () => {
    const t = document.getElementById("energy-refill-timer");
    if (!t) return;
    t.textContent = formatCountdown(msUntilNextRefill());
    setTimeout(tick, 1000);
  };
  setTimeout(tick, 1000);
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n < 10 ? `0${n}` : `${n}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function stageTileHtml(s: { id: number; name: string; soloBoss?: boolean }, energy: number, maxCleared: number): string {
  const unlocked = s.id <= maxCleared + 1;
  const noEnergy = energy <= 0;
  const playable = unlocked && !noEnergy;
  const cls = ["stage-tile",
    unlocked && !noEnergy ? "unlocked" : "locked",
    s.soloBoss ? "boss" : "",
  ].filter(Boolean).join(" ");
  const label = unlocked ? s.name : "Locked";
  const tag = s.soloBoss ? `<div class="stage-tag boss-tag">BOSS</div>` : "";
  return `
    <button class="${cls}" data-stage="${s.id}" type="button" ${playable ? "" : "disabled"}>
      <div class="stage-num">Floor ${s.id}</div>
      <div class="stage-name">${label}</div>
      ${tag}
    </button>
  `;
}
