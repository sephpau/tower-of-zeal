// Post-run summary screen for survival and boss-raid modes.
// Triggered after a run ends (victory or defeat). Shows per-unit damage / kills /
// XP gained, the active daily multiplier, and a one-click path back to Home.

import { PLAYER_ROSTER } from "../units/roster";
import { portraitInner, capeHtml } from "../units/art";
import { getProgress } from "../core/progress";
import { getCachedDailyMultiplier } from "../core/daily";

export interface RunSummaryUnit {
  templateId: string;
  level: number;
  xpGained: number;
  damageDealt: number;
  damageTaken: number;
  kills: number;
}

export interface RunSummary {
  mode: "survival" | "boss_raid" | "floor";
  outcome: "victory" | "defeat";
  /** Survival/boss-raid: floors cleared this run. Floor mode: the stage id played. */
  floorsCleared: number;
  totalMs: number;
  units: RunSummaryUnit[];
  /** Provided by the leaderboard endpoint when the run was submitted. */
  submitted?: boolean;
  /** Floor-mode only — the stage name to display alongside the floor number. */
  floorLabel?: string;
  /** MVP unit id (already factored into units[].xpGained if a bonus was applied). */
  mvpId?: string | null;
  /** Extra XP awarded to the MVP on top of their regular share. */
  mvpBonusXp?: number;
}

/** Highest score = damageDealt + 1000 × kills. Returns null if no candidates. */
export function pickMvpId(units: RunSummaryUnit[]): string | null {
  if (units.length === 0) return null;
  let bestId = units[0].templateId;
  let bestScore = -1;
  for (const u of units) {
    const score = u.damageDealt + u.kills * 1000;
    if (score > bestScore) { bestScore = score; bestId = u.templateId; }
  }
  return bestId;
}

export function renderRunSummary(root: HTMLElement, summary: RunSummary, onClose: () => void): void {
  const mvpId = summary.mvpId ?? pickMvpId(summary.units);
  const dailyMul = getCachedDailyMultiplier();
  const totalDamageDealt = summary.units.reduce((s, u) => s + u.damageDealt, 0);
  const totalDamageTaken = summary.units.reduce((s, u) => s + u.damageTaken, 0);
  const totalKills = summary.units.reduce((s, u) => s + u.kills, 0);
  const totalXp = summary.units.reduce((s, u) => s + u.xpGained, 0);

  const modeLabel = summary.mode === "survival" ? "Survival"
                  : summary.mode === "boss_raid" ? "Boss Raid"
                  : "Floor";
  const outcomeLabel = summary.outcome === "victory"
    ? (summary.mode === "floor" ? "Floor Cleared" : "Run Complete")
    : (summary.mode === "floor" ? "Floor Failed" : "Run Ended");

  root.innerHTML = `
    <div class="run-summary-screen">
      <div class="rs-card">
        <div class="rs-header">
          <div class="rs-mode-tag rs-mode-${summary.mode}">${modeLabel}</div>
          <div class="rs-outcome rs-outcome-${summary.outcome}">${outcomeLabel}</div>
        </div>

        <div class="rs-headline">
          <div class="rs-headline-floor">Floor ${summary.floorsCleared}${summary.floorLabel ? ` · ${escapeHtml(summary.floorLabel)}` : ""}</div>
          <div class="rs-headline-time">${formatMs(summary.totalMs)}</div>
        </div>

        ${dailyMul > 1 ? `<div class="rs-multiplier-banner">🔥 Daily streak active · ${dailyMul}× XP</div>` : ""}
        ${summary.mvpBonusXp && summary.mvpBonusXp > 0 ? `<div class="rs-mvp-banner">⭐ MVP bonus · +${summary.mvpBonusXp.toLocaleString()} XP (1.2×)</div>` : ""}

        <div class="rs-totals">
          <div class="rs-total"><span class="rs-total-label">Damage Dealt</span><span class="rs-total-value">${totalDamageDealt.toLocaleString()}</span></div>
          <div class="rs-total"><span class="rs-total-label">Damage Taken</span><span class="rs-total-value">${totalDamageTaken.toLocaleString()}</span></div>
          <div class="rs-total"><span class="rs-total-label">Total Kills</span><span class="rs-total-value">${totalKills}</span></div>
          <div class="rs-total"><span class="rs-total-label">Total XP</span><span class="rs-total-value">${totalXp.toLocaleString()}</span></div>
        </div>

        <div class="rs-units-list">
          ${summary.units.map(u => unitRowHtml(u, u.templateId === mvpId)).join("")}
        </div>

        ${summary.submitted ? `<div class="rs-submitted">✓ Submitted to leaderboard</div>` : ""}

        <div class="rs-actions">
          <button class="confirm-btn" id="rs-home" type="button">Home</button>
        </div>
      </div>
    </div>
  `;

  root.querySelector<HTMLButtonElement>("#rs-home")?.addEventListener("click", onClose);
}

function unitRowHtml(u: RunSummaryUnit, isMvp: boolean): string {
  const t = PLAYER_ROSTER.find(p => p.id === u.templateId);
  if (!t) return "";
  const classId = getProgress(t.id).classId ?? t.classId;
  return `
    <div class="rs-unit-row${isMvp ? " mvp" : ""}">
      <div class="portrait">${capeHtml(classId)}${portraitInner(t.id, t.portrait)}</div>
      <div class="rs-unit-main">
        <div class="rs-unit-name">
          ${isMvp ? `<span class="mvp-tag">MVP</span>` : ""}
          <span class="lv-inline">Lv${u.level}</span> ${escapeHtml(t.name)}
        </div>
        <div class="rs-unit-stats">
          <span><span class="dim">DMG</span> ${u.damageDealt.toLocaleString()}</span>
          <span><span class="dim">TAKEN</span> ${u.damageTaken.toLocaleString()}</span>
          <span><span class="dim">KILLS</span> ${u.kills}</span>
          <span><span class="dim">XP</span> +${u.xpGained.toLocaleString()}</span>
        </div>
      </div>
    </div>
  `;
}


function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
