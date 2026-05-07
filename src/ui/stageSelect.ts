import { topBarHtml } from "./settings";
import { getEnergy, ENERGY_MAX, msUntilNextRefill } from "../core/energy";
import { STAGE_DEFS, StageEnemyDef } from "../units/roster";
import { getMaxCleared } from "../core/clears";
import { UnitTemplate, DamageResistance } from "../units/types";

export const SURVIVAL_ENERGY_COST: number = 3;
export const BOSS_RAID_ENERGY_COST: number = 3;

export type StagePick =
  | { kind: "floor"; id: number }
  | { kind: "survival" }
  | { kind: "boss_raid" };

export function renderStageSelect(root: HTMLElement, onPick: (pick: StagePick) => void, onBack: () => void): void {
  const energy = getEnergy();
  const maxCleared = getMaxCleared();

  root.innerHTML = `
    <div class="screen-frame stage-select-screen">
      ${topBarHtml("Ascension", true)}
      <div class="energy-pill standalone" title="Energy">
        <span class="energy-icon">⚡</span><span>${energy} / ${ENERGY_MAX}</span>
        <span class="energy-hint">refills in <span id="energy-refill-timer">${formatCountdown(msUntilNextRefill())}</span></span>
      </div>
      <div class="stage-layout">
        <div class="stage-grid">
          ${STAGE_DEFS.map(s => stageTileHtml(s, energy, maxCleared)).join("")}
        </div>
        <div class="side-tiles">
          <button class="survival-tile" id="survival-tile" type="button" ${energy < SURVIVAL_ENERGY_COST ? "disabled" : ""}>
            <div class="survival-art"></div>
            <div class="survival-overlay">
              <div class="survival-title">Survival Mode!</div>
              <div class="survival-sub">(${SURVIVAL_ENERGY_COST} energy spent per run)</div>
            </div>
          </button>
          <button class="bossraid-tile" id="bossraid-tile" type="button" ${energy < BOSS_RAID_ENERGY_COST ? "disabled" : ""}>
            <div class="bossraid-art">
              <img class="bossraid-img" src="/boss-raid.png" alt="" draggable="false" />
            </div>
            <div class="bossraid-overlay">
              <div class="bossraid-title">Boss Raid</div>
              <div class="bossraid-sub">(${BOSS_RAID_ENERGY_COST} energy spent per run)</div>
            </div>
          </button>
        </div>
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
  root.querySelector<HTMLButtonElement>("#bossraid-tile")?.addEventListener("click", () => {
    if (getEnergy() < BOSS_RAID_ENERGY_COST) return;
    onPick({ kind: "boss_raid" });
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

function stageTileHtml(s: StageEnemyDef, energy: number, maxCleared: number): string {
  const unlocked = s.id <= maxCleared + 1;
  const noEnergy = energy <= 0;
  const playable = unlocked && !noEnergy;
  const cls = ["stage-tile",
    unlocked && !noEnergy ? "unlocked" : "locked",
    s.soloBoss ? "boss" : "",
  ].filter(Boolean).join(" ");
  const label = unlocked ? s.name : "Locked";
  const tag = s.soloBoss ? `<div class="stage-tag boss-tag">BOSS</div>` : "";
  const tooltip = unlocked ? stageTooltipHtml(s) : "";
  return `
    <button class="${cls}" data-stage="${s.id}" type="button" ${playable ? "" : "disabled"}>
      <div class="stage-num">Floor ${s.id}</div>
      <div class="stage-name">${label}</div>
      ${tag}
      ${tooltip}
    </button>
  `;
}

function stageTooltipHtml(s: StageEnemyDef): string {
  const counts = new Map<string, { unit: UnitTemplate; count: number }>();
  for (const u of s.enemies) {
    const cur = counts.get(u.id);
    if (cur) cur.count += 1;
    else counts.set(u.id, { unit: u, count: 1 });
  }
  const rows = [...counts.values()].map(({ unit, count }) => {
    const lvl = unit.level ?? 1;
    const tags = resistTags(unit.resist);
    const atk = unit.atkMultiplier && unit.atkMultiplier > 1
      ? `<span class="stt-tag stt-warn">×${unit.atkMultiplier} ATK</span>`
      : "";
    return `
      <div class="stt-row">
        <span class="stt-portrait">${unit.portrait}</span>
        <span class="stt-name">${escapeHtml(unit.name)}${count > 1 ? ` ×${count}` : ""}</span>
        <span class="stt-lv">Lv${lvl}</span>
        ${tags}${atk}
      </div>
    `;
  }).join("");
  const heading = s.soloBoss ? "Solo Boss" : `${s.enemies.length} enemies`;
  return `
    <div class="stage-tooltip" role="tooltip">
      <div class="stt-head">
        <span class="stt-title">${escapeHtml(s.name)}</span>
        <span class="stt-meta">${heading}</span>
      </div>
      <div class="stt-rows">${rows}</div>
    </div>
  `;
}

function resistTags(r: DamageResistance | undefined): string {
  if (!r) return "";
  const tags: string[] = [];
  for (const key of ["physical", "magical", "melee", "range"] as const) {
    const v = r[key];
    if (v === undefined) continue;
    if (v < 1) tags.push(`<span class="stt-tag stt-resist">resists ${key}</span>`);
    else if (v > 1) tags.push(`<span class="stt-tag stt-weak">weak ${key}</span>`);
  }
  return tags.join("");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
