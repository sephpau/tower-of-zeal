// First-run tutorial. Walks the player through unit/class pick, a scripted
// battle, and a brief stat-allocation explainer, then resets all progress for
// this wallet and marks the tutorial complete.

import { PLAYER_ROSTER, SLIME } from "../units/roster";
import { CLASSES } from "../units/classes";
import { Battle, startBattle, tick, queueAction, Combatant, PlayerSlot } from "../core/combat";
import { renderBattle, updateLive } from "./battle";
import { getProgress, setProgress, resetAllProgress } from "../core/progress";
import { scopedKey } from "../auth/scope";
import { topBarHtml } from "./settings";
import { STAT_KEYS } from "../core/stats";

const FLAG_KEY = () => scopedKey("toz.tutorial.complete.v1");

export function isTutorialComplete(): boolean {
  try { return localStorage.getItem(FLAG_KEY()) === "1"; } catch { return false; }
}

function markComplete(): void {
  try { localStorage.setItem(FLAG_KEY(), "1"); } catch { /* ignore */ }
}

export function renderTutorial(root: HTMLElement, onComplete: () => void): void {
  renderPickStep(root, (unitId, classId) => {
    renderBattleStep(root, unitId, classId, () => {
      renderStatsStep(root, unitId, () => {
        resetAllProgress();
        markComplete();
        renderCompletePanel(root, onComplete);
      });
    });
  });
}

// ---------- Step 1: pick unit + class ----------

function renderPickStep(root: HTMLElement, onConfirm: (unitId: string, classId: string) => void): void {
  let chosenUnit: string | null = null;
  let chosenClass: string | null = null;

  const draw = () => {
    root.innerHTML = `
      <div class="screen-frame">
        ${topBarHtml("Tutorial — Pick a unit & class", false)}
        <div class="tutorial-panel">
          <p class="tutorial-text">Welcome to Tower of Zeal! Let's start with a quick walkthrough. Pick one unit and one class. <strong>All progress made during this tutorial will reset when it ends.</strong></p>

          <div class="tutorial-section-label">Unit</div>
          <div class="tutorial-grid units">
            ${PLAYER_ROSTER.map(t => `
              <button class="tutorial-card unit ${chosenUnit === t.id ? "selected" : ""}" data-unit="${t.id}" type="button">
                <div class="portrait">${t.portrait}</div>
                <div class="card-name">${escapeHtml(t.name)}</div>
              </button>
            `).join("")}
          </div>

          <div class="tutorial-section-label">Class</div>
          <div class="tutorial-grid classes">
            ${CLASSES.map(c => `
              <button class="tutorial-card class ${chosenClass === c.id ? "selected" : ""}" data-class="${c.id}" type="button">
                <div class="card-name">${escapeHtml(c.name)}</div>
                <div class="card-sub">${escapeHtml(c.role)}</div>
              </button>
            `).join("")}
          </div>

          <div class="tutorial-actions">
            <button class="confirm-btn" id="tutorial-confirm" type="button" ${chosenUnit && chosenClass ? "" : "disabled"}>Confirm</button>
          </div>
        </div>
      </div>
    `;
    root.querySelectorAll<HTMLButtonElement>("[data-unit]").forEach(b => {
      b.addEventListener("click", () => { chosenUnit = b.dataset.unit!; draw(); });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-class]").forEach(b => {
      b.addEventListener("click", () => { chosenClass = b.dataset.class!; draw(); });
    });
    root.querySelector<HTMLButtonElement>("#tutorial-confirm")?.addEventListener("click", () => {
      if (!chosenUnit || !chosenClass) return;
      // Persist class to the unit's progress so makeCombatant picks it up.
      const cur = getProgress(chosenUnit);
      setProgress(chosenUnit, { ...cur, classId: chosenClass });
      onConfirm(chosenUnit, chosenClass);
    });
  };

  draw();
}

// ---------- Step 2: scripted battle vs one slime ----------

function renderBattleStep(
  root: HTMLElement,
  unitId: string,
  _classId: string,
  onVictory: () => void,
): void {
  const template = PLAYER_ROSTER.find(t => t.id === unitId);
  if (!template) { onVictory(); return; }

  let battle = makeBattle(template);
  let lastT = performance.now();
  let lastStateKind = battle.state.kind;
  let lastAlive = countAlive(battle);
  let rafId: number | null = null;
  let stopped = false;

  const handleAction = (uid: string, sid: string, tid: string) => {
    queueAction(battle, uid, sid, tid);
  };

  const draw = () => {
    renderBattle(root, battle, handleAction, () => { /* no post buttons — we drive the flow */ }, { showPostBattleButtons: false });
    showOverlay(
      "How combat works",
      "Each unit has an <strong>ATB gauge</strong> that fills based on AGI. When it's full, the unit takes its queued action; if no action is queued, it waits until you pick one. Click a skill button below to queue an action — it'll fire as soon as the gauge fills.",
      "Got it",
    );
  };

  const frame = (t: number): void => {
    if (stopped) return;
    const dt = Math.min(0.1, (t - lastT) / 1000);
    lastT = t;
    if (battle.state.kind === "ticking") tick(battle, dt);

    if (battle.state.kind !== lastStateKind || countAlive(battle) !== lastAlive) {
      lastStateKind = battle.state.kind;
      lastAlive = countAlive(battle);
      // Keep overlay messages aligned with current state.
      renderBattle(root, battle, handleAction, () => { /* */ }, { showPostBattleButtons: false });
    } else {
      updateLive(root, battle);
    }

    if (battle.state.kind === "victory") {
      stopped = true;
      showOverlay(
        "Victory!",
        "Nice work. Next, let's look at how to spend stat points after a level-up.",
        "Continue",
        () => {
          if (rafId !== null) cancelAnimationFrame(rafId);
          onVictory();
        },
      );
      return;
    }
    if (battle.state.kind === "defeat") {
      showOverlay(
        "Defeated",
        "Don't worry — we'll restart the fight so you can try again.",
        "Retry",
        () => {
          // Restart the battle from a fresh state.
          battle = makeBattle(template);
          lastStateKind = battle.state.kind;
          lastAlive = countAlive(battle);
          renderBattle(root, battle, handleAction, () => { /* */ }, { showPostBattleButtons: false });
        },
      );
      return;
    }

    rafId = requestAnimationFrame(frame);
  };

  draw();
  rafId = requestAnimationFrame(t => { lastT = t; frame(t); });
}

function makeBattle(template: import("../units/types").UnitTemplate): Battle {
  const players: PlayerSlot[] = [{ template, position: { row: 1, col: 0 } }];
  return startBattle(players, [SLIME]);
}

function countAlive(b: Battle): number {
  return b.combatants.filter((c: Combatant) => c.alive).length;
}

// ---------- Step 3: stat-allocation explainer ----------

function renderStatsStep(root: HTMLElement, _unitId: string, onConfirm: () => void): void {
  const explainers: Record<string, string> = {
    STR: "Strength — boosts physical attack damage.",
    DEF: "Defense — reduces incoming physical damage.",
    AGI: "Agility — fills your ATB gauge faster and improves dodge.",
    DEX: "Dexterity — improves accuracy and crit chance.",
    VIT: "Vitality — increases max HP.",
    INT: "Intelligence — boosts magical attack damage and max MP.",
  };

  root.innerHTML = `
    <div class="screen-frame">
      ${topBarHtml("Tutorial — Stats", false)}
      <div class="tutorial-panel">
        <p class="tutorial-text">Each level gives you <strong>4 stat points</strong> to spend on the Units screen. Every stat changes how your unit performs:</p>
        <div class="tutorial-stats-list">
          ${STAT_KEYS.map(k => `
            <div class="tutorial-stat-row">
              <span class="tutorial-stat-key">${k}</span>
              <span class="tutorial-stat-desc">${escapeHtml(explainers[k] ?? "")}</span>
            </div>
          `).join("")}
        </div>
        <p class="tutorial-text">When you're ready, hit Confirm. Tutorial progress will reset and you'll start fresh on the home screen.</p>
        <div class="tutorial-actions">
          <button class="confirm-btn" id="tutorial-stats-confirm" type="button">Confirm</button>
        </div>
      </div>
    </div>
  `;
  root.querySelector<HTMLButtonElement>("#tutorial-stats-confirm")?.addEventListener("click", onConfirm);
}

// ---------- Step 4: completion panel ----------

function renderCompletePanel(root: HTMLElement, onClose: () => void): void {
  root.innerHTML = `
    <div class="wallet-gate">
      <h1>Tutorial Complete</h1>
      <p class="wallet-gate__desc">All changes from the tutorial have been reset. Time to play for real.</p>
      <button id="tutorial-done" class="wallet-gate__btn">Continue</button>
    </div>
  `;
  root.querySelector<HTMLButtonElement>("#tutorial-done")?.addEventListener("click", onClose);
}

// ---------- Overlay helper ----------

function showOverlay(title: string, body: string, btnLabel: string, onDismiss?: () => void): void {
  // Remove any prior overlay first.
  document.querySelectorAll(".tutorial-overlay").forEach(el => el.remove());
  const overlay = document.createElement("div");
  overlay.className = "tutorial-overlay";
  overlay.innerHTML = `
    <div class="tutorial-overlay-card">
      <div class="tutorial-overlay-title">${escapeHtml(title)}</div>
      <div class="tutorial-overlay-body">${body}</div>
      <button class="confirm-btn" type="button">${escapeHtml(btnLabel)}</button>
    </div>
  `;
  overlay.querySelector("button")!.addEventListener("click", () => {
    overlay.remove();
    onDismiss?.();
  });
  document.body.appendChild(overlay);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  } as Record<string, string>)[c]);
}

