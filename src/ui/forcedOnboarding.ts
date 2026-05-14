// Forced onboarding screens — fired after tutorial:
//   1. Class pick: player must choose a class for ONE unit before reaching home.
//   2. Stat alloc: the FIRST time any unit reaches Lv 2, player must spend
//      that unit's available points before continuing.
//
// Both screens are intentionally non-dismissable — no back button, no escape.
// They render directly into the app root and call the provided onDone callback
// when the player has completed the required action.

import { PLAYER_ROSTER } from "../units/roster";
import { CLASSES } from "../units/classes";
import { portraitInner, capeHtml } from "../units/art";
import { getProgress, setProgress, type UnitProgress } from "../core/progress";
import { ZERO_STATS, type Stats } from "../core/stats";

const STAT_KEYS: (keyof Stats)[] = ["STR", "DEF", "AGI", "DEX", "VIT", "INT"];

// ---------- Forced class pick ----------

export function renderForcedClassPick(root: HTMLElement, onDone: () => void): void {
  let selectedUnit = PLAYER_ROSTER[0].id;
  let selectedClass: string | null = null;

  const draw = (): void => {
    const unit = PLAYER_ROSTER.find(u => u.id === selectedUnit) ?? PLAYER_ROSTER[0];
    root.innerHTML = `
      <div class="forced-screen">
        <div class="forced-card">
          <div class="forced-title">Pick Your First Class</div>
          <div class="forced-sub">
            Welcome to the Tower. Before you can begin, choose <strong>one of your units</strong>
            and assign it a <strong>class</strong>. The class shapes the unit's growth and unlocks
            its starting skills.
          </div>

          <div class="forced-step">1. Choose a unit</div>
          <div class="forced-unit-row">
            ${PLAYER_ROSTER.map(u => `
              <button class="forced-unit ${u.id === selectedUnit ? "selected" : ""}" data-unit="${u.id}" type="button">
                <span class="forced-unit-portrait">${capeHtml(undefined)}${portraitInner(u.id, u.portrait)}</span>
                <span class="forced-unit-name">${escapeHtml(u.name)}</span>
              </button>
            `).join("")}
          </div>

          <div class="forced-step">2. Choose a class for <strong>${escapeHtml(unit.name)}</strong></div>
          <div class="forced-class-grid">
            ${CLASSES.map(c => `
              <button class="forced-class-card ${c.id === selectedClass ? "selected" : ""}" data-class="${c.id}" type="button">
                <div class="forced-class-name">${escapeHtml(c.name)}</div>
                <div class="forced-class-role">${escapeHtml(c.role)}</div>
                <div class="forced-class-stats">
                  ${STAT_KEYS.map(k => `<span class="forced-stat">${k} +${c.baseStats[k]}</span>`).join("")}
                </div>
              </button>
            `).join("")}
          </div>

          <div class="forced-actions">
            <button class="confirm-btn forced-confirm" id="forced-confirm" type="button" ${selectedClass ? "" : "disabled"}>
              Confirm: <strong>${escapeHtml(unit.name)}</strong>${selectedClass ? ` → <strong>${escapeHtml(CLASSES.find(c => c.id === selectedClass)?.name ?? "")}</strong>` : ""}
            </button>
          </div>
        </div>
      </div>
    `;

    root.querySelectorAll<HTMLButtonElement>("[data-unit]").forEach(btn => {
      btn.onclick = () => {
        selectedUnit = btn.dataset.unit!;
        // Reset class pick when switching units — keeps the flow clear.
        selectedClass = null;
        draw();
      };
    });
    root.querySelectorAll<HTMLButtonElement>("[data-class]").forEach(btn => {
      btn.onclick = () => {
        selectedClass = btn.dataset.class!;
        draw();
      };
    });
    root.querySelector<HTMLButtonElement>("#forced-confirm")?.addEventListener("click", () => {
      if (!selectedClass) return;
      const cur = getProgress(selectedUnit);
      const next: UnitProgress = { ...cur, classId: selectedClass };
      setProgress(selectedUnit, next);
      onDone();
    });
  };

  draw();
}

// ---------- Forced stat allocation ----------

export function renderForcedStatAlloc(root: HTMLElement, templateId: string, onDone: () => void): void {
  const unit = PLAYER_ROSTER.find(u => u.id === templateId) ?? PLAYER_ROSTER[0];
  // Snapshot the current progress so we can apply a single setProgress at the end.
  const baseline = getProgress(unit.id);
  const totalPoints = baseline.availablePoints;
  // Working state: a copy of customStats + how much we've spent.
  const working: Stats = { ...ZERO_STATS, ...baseline.customStats };
  const spentBefore: Stats = { ...working };
  let pointsLeft = totalPoints;

  const draw = (): void => {
    root.innerHTML = `
      <div class="forced-screen">
        <div class="forced-card forced-card-narrow">
          <div class="forced-title">First Level Up!</div>
          <div class="forced-sub">
            <strong>${escapeHtml(unit.name)}</strong> just reached <strong>Lv ${baseline.level}</strong> and
            earned <strong>${totalPoints} stat point${totalPoints === 1 ? "" : "s"}</strong>. Allocate them
            now to shape this unit's build — points carry over into every battle.
          </div>

          <div class="forced-alloc-header">
            <span>Points remaining</span>
            <span class="forced-alloc-counter ${pointsLeft === 0 ? "ok" : ""}">${pointsLeft}</span>
          </div>

          <div class="forced-alloc-grid">
            ${STAT_KEYS.map(k => `
              <div class="forced-alloc-row">
                <span class="forced-alloc-stat">${k}</span>
                <span class="forced-alloc-value">${working[k]}</span>
                <div class="forced-alloc-buttons">
                  <button class="ghost-btn forced-alloc-minus" data-stat="${k}" data-delta="-1" type="button" ${working[k] <= spentBefore[k] ? "disabled" : ""}>−</button>
                  <button class="ghost-btn forced-alloc-plus" data-stat="${k}" data-delta="1" type="button" ${pointsLeft <= 0 ? "disabled" : ""}>+</button>
                </div>
              </div>
            `).join("")}
          </div>

          <div class="forced-actions">
            <button class="confirm-btn forced-confirm" id="forced-confirm" type="button" ${pointsLeft === 0 ? "" : "disabled"}>
              ${pointsLeft === 0 ? "Confirm & Continue" : `Allocate all points to continue (${pointsLeft} left)`}
            </button>
          </div>
        </div>
      </div>
    `;

    root.querySelectorAll<HTMLButtonElement>("[data-stat]").forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.stat as keyof Stats;
        const delta = Number(btn.dataset.delta);
        if (delta > 0 && pointsLeft <= 0) return;
        if (delta < 0 && working[key] <= spentBefore[key]) return;
        working[key] += delta;
        pointsLeft -= delta;
        draw();
      };
    });
    root.querySelector<HTMLButtonElement>("#forced-confirm")?.addEventListener("click", () => {
      if (pointsLeft !== 0) return;
      const next: UnitProgress = {
        ...baseline,
        customStats: working,
        availablePoints: 0,
      };
      setProgress(unit.id, next);
      onDone();
    });
  };

  draw();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  } as Record<string, string>)[c]);
}
