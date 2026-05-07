// First-run tutorial. Walks the player through unit/class pick, a scripted
// battle, and a brief stat-allocation explainer, then resets all progress for
// this wallet and marks the tutorial complete.

import { PLAYER_ROSTER, SLIME } from "../units/roster";
import { CLASSES } from "../units/classes";
import { Battle, startBattle, tickAccum, queueAction, Combatant, PlayerSlot } from "../core/combat";
import { renderBattle, updateLive } from "./battle";
import { renderUnitsScreen } from "./unitsScreen";
import { getProgress, setProgress, resetAllProgress, snapshotAllProgress, restoreAllProgress } from "../core/progress";
import { scopedKey } from "../auth/scope";
import { topBarHtml } from "./settings";
import { STAT_KEYS } from "../core/stats";
import { confirmModal } from "./confirmModal";

const FLAG_KEY = () => scopedKey("toz.tutorial.complete.v1");

export function isTutorialComplete(): boolean {
  try { return localStorage.getItem(FLAG_KEY()) === "1"; } catch { return false; }
}

function markComplete(): void {
  try { localStorage.setItem(FLAG_KEY(), "1"); } catch { /* ignore */ }
}

export interface TutorialOpts {
  /** "replay" snapshots progress beforehand and restores it on completion;
   *  "first-run" (default) resets all progress at the end. */
  mode?: "first-run" | "replay";
}

export function renderTutorial(root: HTMLElement, onComplete: () => void, opts: TutorialOpts = {}): void {
  const mode = opts.mode ?? "first-run";
  const snapshot = mode === "replay" ? snapshotAllProgress() : null;

  const finish = () => {
    if (mode === "replay") {
      restoreAllProgress(snapshot);
    } else {
      resetAllProgress();
      markComplete();
    }
    renderCompletePanel(root, onComplete, mode);
  };

  renderPickStep(
    root,
    (unitId, classId) => {
      renderBattleStep(root, unitId, classId, () => {
        renderStatsStep(root, unitId, finish);
      });
    },
    finish,
    mode,
  );
}

// ---------- Step 1: pick unit + class ----------

function renderPickStep(root: HTMLElement, onConfirm: (unitId: string, classId: string) => void, onSkip: () => void, mode: "first-run" | "replay" = "first-run"): void {
  let chosenUnit: string | null = null;
  let chosenClass: string | null = null;
  const isReplay = mode === "replay";
  const skipLabel = isReplay ? "Exit" : "Skip tutorial";
  const skipConfirmMsg = isReplay
    ? "Exit the tutorial replay? Your real progress is unaffected."
    : "Skip the tutorial? It will be marked complete and your progress will be reset, just like finishing it normally.";
  const intro = isReplay
    ? "Tutorial replay. Pick one unit and one class. <strong>Your real progress is preserved — anything you do here is discarded when you exit.</strong>"
    : "Welcome to The Gauntlet Tower! Let's start with a quick walkthrough. Pick one unit and one class. <strong>All progress made during this tutorial will reset when it ends.</strong>";

  const draw = () => {
    root.innerHTML = `
      <div class="screen-frame">
        ${topBarHtml("Tutorial — Pick a unit & class", false)}
        <div class="tutorial-panel">
          <p class="tutorial-text">${intro}</p>

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
            <button class="confirm-btn secondary" id="tutorial-skip" type="button">${skipLabel}</button>
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
    root.querySelector<HTMLButtonElement>("#tutorial-skip")?.addEventListener("click", async () => {
      const ok = await confirmModal({
        title: isReplay ? "Exit Replay?" : "Skip Tutorial?",
        message: skipConfirmMsg,
        confirmLabel: isReplay ? "Exit" : "Skip",
        cancelLabel: "Stay",
        danger: !isReplay,
      });
      if (!ok) return;
      onSkip();
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
      "Each unit has an <strong>ATB gauge</strong> that fills based on its <strong>Speed</strong> stat (Speed scales with AGI). When the gauge is full, the unit takes its queued action; if no action is queued, it waits on standby until you pick one. Click a skill button below to queue an action — it'll fire as soon as the gauge fills.",
      "Got it",
    );
  };

  const frame = (t: number): void => {
    if (stopped) return;
    const dt = Math.min(0.1, (t - lastT) / 1000);
    lastT = t;
    if (battle.state.kind === "ticking") tickAccum(battle, dt);

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
      // Grant a tutorial level-up so the player has 4 points to spend on the next step.
      const cur = getProgress(unitId);
      if (cur.level < 2) {
        setProgress(unitId, { ...cur, level: 2, xp: 0, availablePoints: (cur.availablePoints ?? 0) + 4 });
      }
      showOverlay(
        "Victory! Level Up!",
        "Nice work — your unit reached <strong>Lv 2</strong> and earned <strong>4 stat points</strong>. Let's spend them.",
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
    AGI: "Agility — raises Speed (which fills your ATB gauge) and improves dodge.",
    DEX: "Dexterity — improves accuracy and crit chance.",
    VIT: "Vitality — increases max HP.",
    INT: "Intelligence — boosts magical attack damage and max MP.",
  };

  // Render the real Units screen so the player can experience class change +
  // stat allocation in-place. The screen's "back" callback finishes the tutorial.
  renderUnitsScreen(root, onConfirm);

  // Floating one-time overlay above the screen explaining what to try.
  const statRows = STAT_KEYS.map(k =>
    `<div class="tutorial-stat-row"><span class="tutorial-stat-key">${k}</span><span class="tutorial-stat-desc">${escapeHtml(explainers[k] ?? "")}</span></div>`
  ).join("");

  showOverlay(
    "Stats & Class",
    `This is the <strong>Units</strong> screen. Tap your unit to expand it — you'll see a class picker (pick one starting at Lv1) and a <strong>+</strong> button next to each stat to spend your <strong>4 points per level</strong>.<br><br>${statRows}<br>When you're ready to wrap up, tap the <strong>back arrow</strong> in the header to finish the tutorial.`,
    "Got it",
  );
}

// ---------- Step 4: completion panel ----------

function renderCompletePanel(root: HTMLElement, onClose: () => void, mode: "first-run" | "replay"): void {
  const desc = mode === "replay"
    ? "Tutorial closed. Your saved progress has been restored."
    : "All changes from the tutorial have been reset. Time to play for real.";
  root.innerHTML = `
    <div class="wallet-gate">
      <h1>Tutorial Complete</h1>
      <p class="wallet-gate__desc">${desc}</p>
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

