import { Battle, Combatant } from "../core/combat";
import { ATB_FULL } from "../core/timeline";
import { getSkill } from "../skills/registry";
import { drainEvents, FloatEvent, iconGlyph } from "../core/animations";
import { effectIcon, effectName, isDebuff, isSkillBlockedBySilence, isSilenced } from "../core/effects";
import { portraitInner, capeHtml } from "../units/art";
import { runCheatCheck } from "../core/cheatCheck";

const BASE_SKILL_IDS = new Set(["idle", "basic_attack", "guard"]);
type ActionTab = "basic" | "skills";
const actionTabByUnit = new Map<string, ActionTab>();
function getActionTab(c: Combatant): ActionTab {
  const cur = actionTabByUnit.get(c.id);
  if (cur) return cur;
  return isSilenced(c) ? "basic" : "skills";
}

export type ActionHandler = (unitId: string, skillId: string, targetId: string) => void;
export type PostBattleAction = "home" | "stages" | "surrender";
export type PostBattleHandler = (a: PostBattleAction) => void;

interface Targeting {
  unitId: string;
  skillId: string;
}
let targeting: Targeting | null = null;

export interface RenderBattleOpts {
  /** When false, victory/defeat suppress the Return-to-Home / Tower-Stages buttons (used between survival floors). */
  showPostBattleButtons?: boolean;
  /** Floors 31+ render in slow motion — adds a CSS class that stretches all animation durations. */
  slowMo?: boolean;
}

export function renderBattle(
  root: HTMLElement,
  b: Battle,
  onAction: ActionHandler,
  onPost: PostBattleHandler,
  opts: RenderBattleOpts = {},
): void {
  targeting = null;
  const showPost = opts.showPostBattleButtons !== false;
  const slowMo = !!opts.slowMo;
  root.innerHTML = `
    <div class="battle${slowMo ? " slowmo" : ""}">
      <div class="battle-toolbar">
        <button class="surrender-btn" id="surrender-btn" type="button">Surrender</button>
        ${slowMo ? `<span class="slowmo-tag">SLOW MOTION</span>` : ""}
      </div>

      <div class="battle-field" id="battle-field">
        <div class="battle-log-panel">
          <div class="battle-log-title">Battle Log</div>
          <div class="log" id="log">
            ${logLinesHtml(b)}
          </div>
        </div>
        <div class="enemy-cluster" id="enemy-cluster">
          ${enemyClusterHtml(b)}
        </div>
        <div class="player-stack" id="player-stack">
          ${playerStackHtml(b)}
        </div>
        <div class="float-layer" id="float-layer"></div>
      </div>

      <div class="action-panel">
        ${actionPanelHtml(b, showPost)}
      </div>

      ${b.state.kind === "victory" ? `<div class="banner victory">Victory!</div>` : ""}
      ${b.state.kind === "defeat" ? `<div class="banner defeat">Defeat</div>` : ""}
    </div>
  `;

  wireActionButtons(root, b, onAction);
  wireEnemyClicks(root, b, onAction);
  wireSurrender(root, b, onPost);
  wirePostBattleButtons(root, onPost);

  // Anti-cheat: ask the server whether this wallet's claimed total XP fits
  // the lifetime ceiling we've recorded. Admin wallets are exempt server-side.
  // Network failures fall through silently — never block a legit player.
  void runCheatCheck().then(result => {
    if (result && !result.ok) {
      mountCheaterOverlay(root, result.claimed, result.cap);
    }
  });
}

function mountCheaterOverlay(root: HTMLElement, claimed: number, cap: number): void {
  if (root.querySelector(".cheater-overlay")) return;
  const overlay = document.createElement("div");
  overlay.className = "cheater-overlay";
  overlay.innerHTML = `
    <div class="cheater-card">
      <div class="cheater-title">⚠ CHEATER DETECTED</div>
      <div class="cheater-sub">
        Your local progress doesn't match the server audit log.
        Battles are blocked until your save is reset.
      </div>
      <div class="cheater-stats">
        Claimed total XP: <strong>${claimed.toLocaleString()}</strong><br>
        Server ceiling:&nbsp;&nbsp;&nbsp; <strong>${cap.toLocaleString()}</strong>
      </div>
    </div>
  `;
  root.appendChild(overlay);
}

export function updateLive(root: HTMLElement, b: Battle): void {
  for (const c of b.combatants) {
    const el = root.querySelector<HTMLElement>(`[data-id="${cssAttr(c.id)}"]`);
    if (el) {
      setBar(el, "hp", c.hp, c.maxHp, true);
      if (c.maxMp > 0) setBar(el, "mp", c.mp, c.maxMp, true);
      // Enemies render their own ATB on the chip; players render ATB in the action row only.
      if (c.side === "enemy") setBar(el, "atb", c.gauge, ATB_FULL, false);
      el.classList.toggle("dead", !c.alive);
      el.classList.toggle("ready", c.alive && c.gauge >= ATB_FULL);
      const badge = el.querySelector<HTMLElement>(".guard-badge");
      if (badge) badge.style.display = c.guarding ? "" : "none";
    }

    // Action-row vitals (player only) hold the ATB gauge.
    if (c.side === "player") {
      const row = root.querySelector<HTMLElement>(`[data-row-id="${cssAttr(c.id)}"]`);
      if (row) {
        setBar(row, "atb", c.gauge, ATB_FULL, false);
        row.classList.toggle("ready", c.alive && c.gauge >= ATB_FULL);
        row.classList.toggle("dead", !c.alive);
        const hpEl = row.querySelector<HTMLElement>(".vstat-val.hp");
        if (hpEl) hpEl.textContent = `${c.hp}/${c.maxHp}`;
        const mpEl = row.querySelector<HTMLElement>(".vstat-val.mp");
        if (mpEl) mpEl.textContent = `${c.mp}/${c.maxMp}`;
      }
    }
  }

  // Action buttons.
  for (const c of b.combatants) {
    if (c.side !== "player") continue;
    for (const skillId of visibleSkills(c)) {
      const btn = root.querySelector<HTMLButtonElement>(
        `button[data-unit-id="${cssAttr(c.id)}"][data-skill="${cssAttr(skillId)}"]`
      );
      if (!btn) continue;
      const skill = getSkill(skillId);
      const cd = c.skillCooldowns[skillId] ?? 0;
      const unaffordable = skill.mpCost > c.mp || (skill.hpCost !== undefined && skill.hpCost >= c.hp);
      const onCooldown = cd > 0;
      btn.classList.toggle("unaffordable", unaffordable);
      btn.classList.toggle("on-cooldown", onCooldown);
      btn.classList.toggle("queued", c.queuedAction?.skillId === skillId);
      btn.classList.toggle("targeting", targeting?.unitId === c.id && targeting?.skillId === skillId);
      btn.disabled = unaffordable || onCooldown || !c.alive;
      const cdBadge = btn.querySelector<HTMLElement>(".cd-badge");
      if (cdBadge) cdBadge.textContent = onCooldown ? `${cd}` : "";
    }
  }

  // Battle log (latest entry rendered first / on top).
  const logEl = root.querySelector<HTMLElement>("#log");
  if (logEl) {
    if (logEl.dataset.lastLen !== String(b.log.length)) {
      logEl.innerHTML = logLinesHtml(b);
      logEl.dataset.lastLen = String(b.log.length);
      logEl.scrollTop = 0;
    }
  }

  // Queued-target tag on enemies.
  root.querySelectorAll<HTMLElement>(".queued-target-tag").forEach(a => a.remove());
  for (const c of b.combatants) {
    if (c.side !== "player" || !c.queuedAction) continue;
    const skill = getSkill(c.queuedAction.skillId);
    if (skill.targeting !== "enemy") continue;
    const tEl = root.querySelector<HTMLElement>(`[data-id="${cssAttr(c.queuedAction.targetId)}"]`);
    if (!tEl) continue;
    const tag = document.createElement("div");
    tag.className = "queued-target-tag";
    tag.textContent = `← ${c.name}`;
    tEl.appendChild(tag);
  }

  // Targetable highlight + cursor mode on enemies.
  const cluster = root.querySelector<HTMLElement>(".enemy-cluster");
  cluster?.classList.remove("cursor-sword", "cursor-wand");
  root.querySelectorAll<HTMLElement>(".enemy-cluster .combatant").forEach(el => {
    el.classList.remove("targetable");
  });
  if (targeting) {
    const skill = getSkill(targeting.skillId);
    if (skill.targeting === "enemy") {
      for (const e of b.combatants) {
        if (e.side === "enemy" && e.alive) {
          const el = root.querySelector<HTMLElement>(`[data-id="${cssAttr(e.id)}"]`);
          if (el) el.classList.add("targetable");
        }
      }
      // Pick cursor based on resolved damage kind for this skill.
      const attacker = b.combatants.find(c => c.id === targeting!.unitId);
      const kind: "physical" | "magical" =
        skill.id === "basic_attack" && attacker?.basicAttackKind === "magical"
          ? "magical"
          : (skill.kind === "magical" ? "magical" : "physical");
      cluster?.classList.add(kind === "magical" ? "cursor-wand" : "cursor-sword");
    }
  }

  // Float damage popups.
  flushFloats(root);
}

function flushFloats(root: HTMLElement): void {
  const layer = root.querySelector<HTMLElement>("#float-layer");
  const field = root.querySelector<HTMLElement>("#battle-field");
  if (!layer || !field) return;
  const events: FloatEvent[] = drainEvents();
  if (events.length === 0) return;

  const fieldRect = field.getBoundingClientRect();

  for (const e of events) {
    const tgt = root.querySelector<HTMLElement>(`[data-id="${cssAttr(e.targetId)}"]`);
    if (!tgt) continue;
    const r = tgt.getBoundingClientRect();
    const x = r.left - fieldRect.left + r.width / 2;
    const y = r.top - fieldRect.top + 6;

    const div = document.createElement("div");
    div.className = "float-popup" + (e.crit ? " crit" : "");
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    div.style.color = e.color;
    div.innerHTML = `<span class="float-icon">${iconGlyph(e.icon)}</span><span class="float-text">${escapeHtml(e.text)}</span>${e.crit ? `<span class="float-crit">CRIT!</span>` : ""}`;
    layer.appendChild(div);

    // Hit-flash on target.
    tgt.classList.remove("hit-flash");
    void tgt.offsetWidth;
    tgt.classList.add("hit-flash");

    setTimeout(() => div.remove(), 900);
  }
}

function visibleSkills(c: Combatant): string[] {
  // Hide skills until the unit reaches the unlock level.
  return c.skills.filter(id => {
    const s = getSkill(id);
    return (s.unlockLevel ?? 1) <= c.level;
  });
}

function wireActionButtons(root: HTMLElement, b: Battle, onAction: ActionHandler): void {
  // Use onclick property assignment (not addEventListener) so repeat calls are
  // idempotent — reassignment overwrites the previous handler instead of stacking.
  root.querySelectorAll<HTMLButtonElement>("[data-tab-unit]").forEach(btn => {
    btn.onclick = () => {
      const unitId = btn.dataset.tabUnit!;
      const tab = btn.dataset.tab as ActionTab;
      const c = b.combatants.find(x => x.id === unitId);
      if (!c) return;
      if (tab === "skills" && isSilenced(c)) return;
      actionTabByUnit.set(unitId, tab);
      const row = root.querySelector<HTMLElement>(`[data-row-id="${cssAttr(unitId)}"]`);
      if (!row) return;
      row.outerHTML = unitRowHtml(c);
      wireActionButtons(root, b, onAction);
    };
  });

  for (const c of b.combatants) {
    if (c.side !== "player") continue;
    for (const skillId of visibleSkills(c)) {
      const btn = root.querySelector<HTMLButtonElement>(
        `button[data-unit-id="${cssAttr(c.id)}"][data-skill="${cssAttr(skillId)}"]`
      );
      if (!btn) continue;
      btn.onclick = () => {
        const skill = getSkill(skillId);
        if (skill.targeting === "self" || skill.targeting === "all_enemies") {
          onAction(c.id, skillId, c.id);
          targeting = null;
        } else {
          if (targeting?.unitId === c.id && targeting?.skillId === skillId) {
            targeting = null;
          } else {
            targeting = { unitId: c.id, skillId };
          }
        }
        updateLive(root, b);
      };
    }
  }
}

function wireEnemyClicks(root: HTMLElement, b: Battle, onAction: ActionHandler): void {
  // Event-delegated: a single listener on the cluster survives DOM rebuilds of
  // the individual enemy chips, so clicks never get lost between renders.
  const cluster = root.querySelector<HTMLElement>(".enemy-cluster");
  if (!cluster) return;
  cluster.addEventListener("click", e => {
    if (!targeting) return;
    const cell = (e.target as HTMLElement | null)?.closest<HTMLElement>(".combatant");
    if (!cell) return;
    const targetId = cell.dataset.id;
    if (!targetId) return;
    const target = b.combatants.find(c => c.id === targetId);
    if (!target) return;
    // Don't block on `alive`: the engine retargets to the nearest survivor.
    if (target.side !== "enemy") return;
    onAction(targeting.unitId, targeting.skillId, targetId);
    targeting = null;
    updateLive(root, b);
  });
}

function wireSurrender(root: HTMLElement, b: Battle, onPost: PostBattleHandler): void {
  const btn = root.querySelector<HTMLButtonElement>("#surrender-btn");
  if (!btn) return;
  if (b.state.kind !== "ticking") {
    btn.disabled = true;
    return;
  }
  btn.addEventListener("click", () => {
    if (!confirm("Surrender this battle? You'll keep XP earned so far.")) return;
    onPost("surrender");
  });
}

function wirePostBattleButtons(root: HTMLElement, onPost: PostBattleHandler): void {
  root.querySelector<HTMLButtonElement>("#post-home")?.addEventListener("click", () => onPost("home"));
  root.querySelector<HTMLButtonElement>("#post-stages")?.addEventListener("click", () => onPost("stages"));
}

function enemyClusterHtml(b: Battle): string {
  const enemies = b.combatants.filter(c => c.side === "enemy");
  // Cluster: arrange in roughly circular bunches with deterministic seeded jitter.
  const count = enemies.length;
  // Hand-tuned cluster layout (percent positions inside .enemy-cluster).
  const positions = clusterPositions(count);
  // A single enemy means a solo boss — rendered larger to convey threat.
  const soloBoss = count === 1;
  return enemies.map((c, i) => {
    const p = positions[i] ?? { x: 50, y: 50 };
    return `<div class="cluster-slot ${soloBoss ? "boss" : ""}" style="left:${p.x}%;top:${p.y}%">
      ${enemyChipHtml(c, soloBoss)}
    </div>`;
  }).join("");
}

function clusterPositions(n: number): { x: number; y: number }[] {
  // Spread chips far enough that ~210px-wide bubbles don't visually collide.
  // The cluster container is ~640px × ~360px, so we use generous fractional placements.
  if (n === 1) return [{ x: 50, y: 50 }];
  const presets: Record<number, { x: number; y: number }[]> = {
    2: [{ x: 28, y: 50 }, { x: 72, y: 50 }],
    3: [{ x: 22, y: 30 }, { x: 70, y: 30 }, { x: 46, y: 78 }],
    4: [{ x: 22, y: 22 }, { x: 70, y: 22 }, { x: 22, y: 78 }, { x: 70, y: 78 }],
    5: [{ x: 20, y: 18 }, { x: 70, y: 18 }, { x: 50, y: 50 }, { x: 20, y: 82 }, { x: 70, y: 82 }],
    6: [{ x: 20, y: 18 }, { x: 70, y: 18 }, { x: 20, y: 50 }, { x: 70, y: 50 }, { x: 20, y: 82 }, { x: 70, y: 82 }],
    7: [{ x: 20, y: 14 }, { x: 70, y: 14 }, { x: 20, y: 46 }, { x: 70, y: 46 }, { x: 20, y: 78 }, { x: 70, y: 78 }, { x: 46, y: 100 }],
    8: [{ x: 18, y: 14 }, { x: 70, y: 14 }, { x: 18, y: 42 }, { x: 70, y: 42 }, { x: 18, y: 70 }, { x: 70, y: 70 }, { x: 18, y: 96 }, { x: 70, y: 96 }],
    9: [{ x: 18, y: 14 }, { x: 50, y: 14 }, { x: 82, y: 14 }, { x: 18, y: 50 }, { x: 50, y: 50 }, { x: 82, y: 50 }, { x: 18, y: 86 }, { x: 50, y: 86 }, { x: 82, y: 86 }],
  };
  return presets[Math.min(9, n)] ?? presets[9];
}

function enemyChipHtml(c: Combatant, isBoss = false): string {
  const dead = !c.alive ? "dead" : "";
  const ready = c.alive && c.gauge >= ATB_FULL ? "ready" : "";
  const boss = isBoss ? "boss" : "";
  const guardStyle = c.guarding ? "" : "display:none";
  return `
    <div class="combatant enemy split ${boss} ${dead} ${ready}" data-id="${escapeAttr(c.id)}">
      <div class="info">
        <div class="name">
          <span class="lv-inline">Lv${c.level}</span> ${escapeHtml(c.name)}
          <span class="badge guard-badge" style="${guardStyle}">G</span>
        </div>
        ${renderEffectChips(c)}
        <div class="bar hp"><div class="fill" style="width:${(c.hp / c.maxHp) * 100}%"></div><span class="bar-text">${c.hp}/${c.maxHp}</span></div>
        ${c.maxMp > 0 ? `<div class="bar mp"><div class="fill" style="width:${(c.mp / c.maxMp) * 100}%"></div><span class="bar-text">${c.mp}/${c.maxMp}</span></div>` : ""}
        <div class="bar atb"><div class="fill" style="width:${(c.gauge / ATB_FULL) * 100}%"></div></div>
      </div>
      <div class="enemy-avatar">
        <div class="portrait">${capeHtml(c.classId)}${portraitInner(c.templateId, c.portrait)}</div>
      </div>
    </div>
  `;
}

function playerStackHtml(b: Battle): string {
  const players = b.combatants.filter(c => c.side === "player").sort((a, b) => a.position.row - b.position.row);
  return players.map((c, i) => `
    <div class="player-slot" style="--idx:${i}">
      ${playerChipHtml(c)}
    </div>
  `).join("");
}

function playerChipHtml(c: Combatant): string {
  const dead = !c.alive ? "dead" : "";
  const ready = c.alive && c.gauge >= ATB_FULL ? "ready" : "";
  const guardStyle = c.guarding ? "" : "display:none";
  return `
    <div class="combatant player split ${dead} ${ready}" data-id="${escapeAttr(c.id)}">
      <div class="info">
        <div class="name">
          <span class="lv-inline">Lv${c.level}</span> ${escapeHtml(c.name)}
          <span class="badge guard-badge" style="${guardStyle}">G</span>
        </div>
        ${renderEffectChips(c)}
        <div class="bar hp"><div class="fill" style="width:${(c.hp / c.maxHp) * 100}%"></div><span class="bar-text">${c.hp}/${c.maxHp}</span></div>
        ${c.maxMp > 0 ? `<div class="bar mp"><div class="fill" style="width:${(c.mp / c.maxMp) * 100}%"></div><span class="bar-text">${c.mp}/${c.maxMp}</span></div>` : ""}
      </div>
      <div class="enemy-avatar">
        <div class="portrait">${capeHtml(c.classId)}${portraitInner(c.templateId, c.portrait)}</div>
      </div>
    </div>
  `;
}

function setBar(host: HTMLElement, kind: "hp" | "mp" | "atb", cur: number, max: number, withText = true): void {
  const fill = host.querySelector<HTMLElement>(`.bar.${kind} .fill`);
  if (fill) fill.style.width = `${(cur / max) * 100}%`;
  if (withText) {
    const text = host.querySelector<HTMLElement>(`.bar.${kind} .bar-text`);
    if (text) text.textContent = `${Math.round(cur)}/${max}`;
  }
}

function logLinesHtml(b: Battle): string {
  // Latest line first.
  return b.log.slice(-12).slice().reverse().map(line => `<div class="log-line">${escapeHtml(line)}</div>`).join("");
}

function actionPanelHtml(b: Battle, showPostButtons: boolean): string {
  if (b.state.kind === "victory" || b.state.kind === "defeat") {
    if (!showPostButtons) {
      return `<div class="action-empty">${b.state.kind === "victory" ? "Floor cleared!" : "Defeated."}</div>`;
    }
    return `
      <div class="post-battle">
        <button class="confirm-btn" id="post-home" type="button">Return to Home</button>
        <button class="ghost-btn" id="post-stages" type="button">Tower Stages</button>
      </div>
    `;
  }
  const players = b.combatants.filter(c => c.side === "player");
  if (players.length === 0) return `<div class="action-empty">No units.</div>`;
  return `<div class="action-grid">${players.map(unitRowHtml).join("")}</div>`;
}

function unitRowHtml(c: Combatant): string {
  const all = visibleSkills(c);
  const basicIds = all.filter(id => BASE_SKILL_IDS.has(id));
  const skillIds = all.filter(id => !BASE_SKILL_IDS.has(id));
  const tab = getActionTab(c);
  const silenced = isSilenced(c);

  const renderButton = (id: string): string => {
    const skill = getSkill(id);
    const cd = c.skillCooldowns[id] ?? 0;
    const unaffordable = skill.mpCost > c.mp || (skill.hpCost !== undefined && skill.hpCost >= c.hp);
    const onCd = cd > 0;
    const queued = c.queuedAction?.skillId === id;
    const blockedBySilence = isSkillBlockedBySilence(c, id);
    const cls = [
      "skill-btn",
      unaffordable ? "unaffordable" : "",
      onCd ? "on-cooldown" : "",
      queued ? "queued" : "",
      blockedBySilence ? "silenced" : "",
    ].filter(Boolean).join(" ");
    const cost = skill.mpCost > 0 ? `<span class="cost">${skill.mpCost} MP</span>` : "";
    const hp = skill.hpCost ? `<span class="cost hp">${skill.hpCost}HP</span>` : "";
    const cdBadge = `<span class="cd-badge">${onCd ? cd : ""}</span>`;
    const tip = `<span class="skill-tip"><span class="skill-tip-name">${escapeHtml(skill.name)}</span><span class="skill-tip-desc">${escapeHtml(skill.description)}</span></span>`;
    const disabled = unaffordable || onCd || blockedBySilence;
    return `<button class="${cls}" data-unit-id="${escapeAttr(c.id)}" data-skill="${escapeAttr(id)}" ${disabled ? "disabled" : ""}><span class="skill-label">${escapeHtml(skill.name)}</span>${cost}${hp}${cdBadge}${tip}</button>`;
  };

  const visibleIds = tab === "basic" ? basicIds : skillIds;
  const buttons = visibleIds.map(renderButton).join("");
  const dead = !c.alive ? "dead" : "";
  const effectChips = renderEffectChips(c);
  return `
    <div class="unit-row ${dead}" data-row-id="${escapeAttr(c.id)}">
      <div class="unit-label">
        ${escapeHtml(c.name)}
        ${effectChips}
      </div>
      <div class="unit-vitals-stack">
        <div class="vstat"><span class="vstat-label hp">HP</span><span class="vstat-val hp">${c.hp}/${c.maxHp}</span></div>
        ${c.maxMp > 0 ? `<div class="vstat"><span class="vstat-label mp">MP</span><span class="vstat-val mp">${c.mp}/${c.maxMp}</span></div>` : ""}
      </div>
      <div class="unit-atb">
        <div class="bar atb"><div class="fill" style="width:${(c.gauge / ATB_FULL) * 100}%"></div></div>
      </div>
      <div class="unit-action-tabs">
        <button class="action-tab ${tab === "basic" ? "active" : ""}" data-tab-unit="${escapeAttr(c.id)}" data-tab="basic" type="button">Basic</button>
        <button class="action-tab ${tab === "skills" ? "active" : ""} ${silenced ? "tab-disabled" : ""}" data-tab-unit="${escapeAttr(c.id)}" data-tab="skills" type="button">Skills</button>
      </div>
      <div class="unit-actions">${buttons}</div>
    </div>
  `;
}

function renderEffectChips(c: Combatant): string {
  if (c.effects.length === 0) return "";
  return `<span class="effect-chips">${c.effects.map(e => {
    const icon = effectIcon(e.id);
    const cls = isDebuff(e.id) ? "effect-chip debuff" : "effect-chip buff";
    return `<span class="${cls}" title="${escapeAttr(effectName(e.id))} (${e.duration} actions)">${icon}<span class="effect-dur">${e.duration}</span></span>`;
  }).join("")}</span>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  } as Record<string, string>)[c]);
}
function escapeAttr(s: string): string { return escapeHtml(s); }
function cssAttr(s: string): string { return s.replace(/(["\\])/g, "\\$1"); }
