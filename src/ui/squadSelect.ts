import { UnitTemplate } from "../units/types";
import { PlayerSlot } from "../core/combat";
import { PLAYER_ROSTER, MAX_PARTY_SIZE, getStage, STAGE_DEFS } from "../units/roster";
import { topBarHtml } from "./settings";
import { getProgress } from "../core/progress";

export interface SquadResult {
  players: PlayerSlot[];
  enemies: UnitTemplate[];
  stageId: number;
}

export function renderSquadSelect(root: HTMLElement, stageId: number, onConfirm: (r: SquadResult) => void, onBack: () => void): void {
  const picks: UnitTemplate[] = [];
  const stage = getStage(stageId) ?? STAGE_DEFS[0];

  const draw = () => {
    const placed = picks.length;
    const atCap = placed >= MAX_PARTY_SIZE;
    root.innerHTML = `
      <div class="squad-screen">
        ${topBarHtml(`Floor ${stage.id} · ${stage.name}`, true)}
        <div class="party-count-row">Party <span class="party-count">${placed}/${MAX_PARTY_SIZE}</span></div>
        <p class="screen-sub">Pick up to ${MAX_PARTY_SIZE} units. Click a roster card to add or remove.</p>

        <div class="squad-layout-flat">
          <div class="roster">
            <div class="section-label">Roster</div>
            <div class="roster-list">
              ${PLAYER_ROSTER.map(t => rosterItemHtml(t, picks, atCap)).join("")}
            </div>
          </div>

          <div class="enemy-config">
            <div class="section-label">Floor ${stage.id} — ${stage.soloBoss ? "Solo Boss" : "Mob"}</div>
            <div class="stage-info">
              ${enemyChipsHtml(stage.enemies, !!stage.soloBoss)}
            </div>
          </div>
        </div>

        <div class="squad-actions">
          <button class="confirm-btn" id="confirm" ${placed === 0 ? "disabled" : ""}>
            Start Battle (${placed} unit${placed === 1 ? "" : "s"})
          </button>
        </div>
      </div>
    `;

    root.querySelector("#back-btn")?.addEventListener("click", onBack);

    root.querySelectorAll<HTMLElement>("[data-roster]").forEach(el => {
      const id = el.dataset.roster!;
      el.addEventListener("click", () => {
        const t = PLAYER_ROSTER.find(x => x.id === id)!;
        const idx = picks.findIndex(p => p.id === t.id);
        if (idx >= 0) picks.splice(idx, 1);
        else if (picks.length < MAX_PARTY_SIZE) picks.push(t);
        draw();
      });
    });

    root.querySelector<HTMLButtonElement>("#confirm")?.addEventListener("click", () => {
      if (picks.length === 0) return;
      const players: PlayerSlot[] = picks.map((t, i) => ({
        template: t,
        position: { row: i, col: 0 },
      }));
      onConfirm({ players, enemies: stage.enemies, stageId: stage.id });
    });
  };

  draw();
}

function enemyChipsHtml(enemies: UnitTemplate[], soloBoss: boolean): string {
  if (soloBoss) {
    const e = enemies[0];
    return `<div class="enemy-chip boss">${e.portrait} ${e.name} · BOSS</div>`;
  }
  // Group same-template enemies into "Slime ×3"
  const counts = new Map<string, { t: UnitTemplate; n: number }>();
  for (const e of enemies) {
    const cur = counts.get(e.id);
    if (cur) cur.n++;
    else counts.set(e.id, { t: e, n: 1 });
  }
  return [...counts.values()].map(({ t, n }) =>
    `<div class="enemy-chip">${t.portrait} ${t.name}${n > 1 ? ` ×${n}` : ""}</div>`
  ).join("");
}

function rosterItemHtml(t: UnitTemplate, picks: UnitTemplate[], atCap: boolean): string {
  const selected = picks.some(p => p.id === t.id);
  const locked = atCap && !selected;
  const cls = ["roster-item",
    selected ? "selected" : "",
    locked ? "locked" : "",
  ].filter(Boolean).join(" ");
  const lvl = getProgress(t.id).level;
  const s = t.unitBaseStats;
  return `
    <div class="${cls}" data-roster="${escapeAttr(t.id)}">
      <div class="portrait">${t.portrait}<span class="lv-badge">Lv${lvl}</span></div>
      <div class="info">
        <div class="name">${escapeHtml(t.name)}</div>
        <div class="stats">STR ${s.STR} · DEF ${s.DEF} · AGI ${s.AGI} · DEX ${s.DEX} · VIT ${s.VIT} · INT ${s.INT}</div>
        ${selected ? `<div class="placed-tag">Selected</div>` : ""}
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  } as Record<string, string>)[c]);
}
function escapeAttr(s: string): string { return escapeHtml(s); }
