import { UnitTemplate, DamageResistance } from "../units/types";
import { PlayerSlot } from "../core/combat";
import { PLAYER_ROSTER, MAX_PARTY_SIZE, getStage, STAGE_DEFS, unitBaseAtLevel } from "../units/roster";
import { topBarHtml } from "./settings";
import { getProgress } from "../core/progress";
import { Stats, ZERO_STATS, STAT_KEYS, sumStats } from "../core/stats";
import { classBaseAtLevel } from "../units/classes";
import { hexStatSvg } from "./hexStat";
import { portraitInner, capeHtml, isUnitLocked } from "../units/art";

// Effective stats = unit base@lvl + class base@lvl + allocated custom points.
// Mirrors what makeCombatant does, so the roster preview matches battle reality.
function effectiveStats(t: UnitTemplate): Stats {
  const progress = getProgress(t.id);
  const classId = progress.classId ?? t.classId;
  const level = progress.level ?? t.level ?? 1;
  const custom = { ...ZERO_STATS, ...(progress.customStats ?? t.customStats ?? ZERO_STATS) };
  return sumStats(unitBaseAtLevel(t, level), classBaseAtLevel(classId, level), custom);
}

export interface SquadResult {
  players: PlayerSlot[];
  enemies: UnitTemplate[];
  stageId: number;
}

type SortKey = "lvl" | "name" | "STR" | "DEF" | "AGI" | "DEX" | "VIT" | "INT";
const SORT_LABELS: Record<SortKey, string> = {
  lvl: "Level",
  name: "Name (A→Z)",
  STR: "STR",
  DEF: "DEF",
  AGI: "AGI",
  DEX: "DEX",
  VIT: "VIT",
  INT: "INT",
};
let lastSortKey: SortKey = "lvl";
let lastSortDir: "asc" | "desc" = "desc";

function sortRoster(roster: UnitTemplate[], key: SortKey, dir: "asc" | "desc"): UnitTemplate[] {
  const out = [...roster];
  out.sort((a, b) => {
    let cmp = 0;
    if (key === "lvl") cmp = getProgress(a.id).level - getProgress(b.id).level;
    else if (key === "name") cmp = a.name.localeCompare(b.name);
    else cmp = effectiveStats(a)[key] - effectiveStats(b)[key];
    if (cmp === 0) cmp = a.name.localeCompare(b.name);
    return dir === "asc" ? cmp : -cmp;
  });
  return out;
}

export function renderSquadSelect(root: HTMLElement, stageId: number, onConfirm: (r: SquadResult) => void, onBack: () => void): void {
  const picks: UnitTemplate[] = [];
  const stage = getStage(stageId) ?? STAGE_DEFS[0];

  const draw = () => {
    const placed = picks.length;
    const atCap = placed >= MAX_PARTY_SIZE;
    const sorted = sortRoster(PLAYER_ROSTER, lastSortKey, lastSortDir);
    root.innerHTML = `
      <div class="squad-screen">
        ${topBarHtml(`Floor ${stage.id} · ${stage.name}`, true)}
        <div class="party-count-row">Party <span class="party-count">${placed}/${MAX_PARTY_SIZE}</span></div>
        <p class="screen-sub">Pick up to ${MAX_PARTY_SIZE} units. Click a roster card to add or remove.</p>

        <div class="squad-layout-flat">
          <div class="roster">
            <div class="roster-header">
              <span class="section-label">Roster</span>
              <div class="roster-sort">
                <label class="roster-sort-label">Sort
                  <select id="roster-sort-key">
                    ${(Object.keys(SORT_LABELS) as SortKey[]).map(k =>
                      `<option value="${k}" ${k === lastSortKey ? "selected" : ""}>${SORT_LABELS[k]}</option>`
                    ).join("")}
                  </select>
                </label>
                <button class="ghost-btn roster-sort-dir" id="roster-sort-dir" type="button" title="Toggle direction">
                  ${lastSortDir === "desc" ? "↓ High→Low" : "↑ Low→High"}
                </button>
              </div>
            </div>
            <div class="roster-list">
              ${sorted.map(t => rosterItemHtml(t, picks, atCap)).join("")}
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

    root.querySelector<HTMLSelectElement>("#roster-sort-key")?.addEventListener("change", e => {
      lastSortKey = (e.target as HTMLSelectElement).value as SortKey;
      draw();
    });
    root.querySelector<HTMLButtonElement>("#roster-sort-dir")?.addEventListener("click", () => {
      lastSortDir = lastSortDir === "desc" ? "asc" : "desc";
      draw();
    });

    root.querySelectorAll<HTMLElement>("[data-roster]").forEach(el => {
      const id = el.dataset.roster!;
      el.addEventListener("click", () => {
        if (isUnitLocked(id)) return;
        const t = PLAYER_ROSTER.find(x => x.id === id)!;
        const idx = picks.findIndex(p => p.id === t.id);
        if (idx >= 0) picks.splice(idx, 1);
        else if (picks.length < MAX_PARTY_SIZE) picks.push(t);
        draw();
      });
    });

    root.querySelector<HTMLButtonElement>("#confirm")?.addEventListener("click", () => {
      if (picks.length === 0) return;
      const partyNames = picks.map(p => p.name).join(", ");
      if (!confirm(`Start the battle with ${picks.length} unit${picks.length === 1 ? "" : "s"} (${partyNames})?\n\nYou can't change your party once the battle begins.`)) return;
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
    return `<div class="enemy-chip boss" tabindex="0">${e.portrait} ${e.name} · BOSS${enemyTipHtml(e, 1)}</div>`;
  }
  const counts = new Map<string, { t: UnitTemplate; n: number }>();
  for (const e of enemies) {
    const cur = counts.get(e.id);
    if (cur) cur.n++;
    else counts.set(e.id, { t: e, n: 1 });
  }
  return [...counts.values()].map(({ t, n }) =>
    `<div class="enemy-chip" tabindex="0">${t.portrait} ${t.name}${n > 1 ? ` ×${n}` : ""}${enemyTipHtml(t, n)}</div>`
  ).join("");
}

function enemyTipHtml(t: UnitTemplate, count: number): string {
  const lvl = t.level ?? 1;
  const tags = resistTags(t.resist);
  const atk = t.atkMultiplier && t.atkMultiplier > 1
    ? `<span class="stt-tag stt-warn">×${t.atkMultiplier} ATK</span>`
    : "";
  return `
    <div class="stage-tooltip stage-tooltip-anchor-left" role="tooltip">
      <div class="stt-head">
        <span class="stt-title">${escapeHtml(t.name)}${count > 1 ? ` ×${count}` : ""}</span>
        <span class="stt-meta">Lv${lvl}</span>
      </div>
      <div class="stt-rows">
        <div class="stt-row">${tags || `<span class="stt-meta">No special resists</span>`}${atk}</div>
      </div>
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

function rosterItemHtml(t: UnitTemplate, picks: UnitTemplate[], atCap: boolean): string {
  const selected = picks.some(p => p.id === t.id);
  const motzLocked = isUnitLocked(t.id);
  const locked = (atCap && !selected) || motzLocked;
  const cls = ["roster-card",
    selected ? "selected" : "",
    locked ? "locked" : "",
    motzLocked ? "motz-locked" : "",
  ].filter(Boolean).join(" ");
  const progress = getProgress(t.id);
  const lvl = progress.level;
  const classId = progress.classId ?? t.classId;
  const custom = { ...ZERO_STATS, ...(progress.customStats ?? t.customStats ?? ZERO_STATS) };
  const unitBase = unitBaseAtLevel(t, lvl);
  const classBase = classBaseAtLevel(classId, lvl);
  const s = sumStats(unitBase, classBase, custom);
  const statRows = STAT_KEYS.map(k => `<span class="rs-stat"><span class="rs-stat-k">${k}</span><span class="rs-stat-v">${Math.round(s[k])}</span></span>`).join("");
  return `
    <div class="${cls}" data-roster="${escapeAttr(t.id)}">
      ${motzLocked ? `<div class="rs-locked-overlay" title="Requires MoTZ Vault Key">🔒</div>` : ""}
      <div class="rs-portrait-wrap">
        <div class="rs-portrait">${capeHtml(classId)}${portraitInner(t.id, t.portrait)}<span class="lv-badge">Lv${lvl}</span></div>
        <div class="rs-name">${escapeHtml(t.name)}</div>
        ${selected ? `<div class="placed-tag">Selected</div>` : ""}
      </div>
      <div class="rs-hex">${hexStatSvg({ unit: unitBase, classBase, custom, size: 140 })}</div>
      <div class="rs-stat-row">${statRows}</div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  } as Record<string, string>)[c]);
}
function escapeAttr(s: string): string { return escapeHtml(s); }
