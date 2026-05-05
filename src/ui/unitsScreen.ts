import { PLAYER_ROSTER } from "../units/roster";
import { UnitTemplate } from "../units/types";
import { Stats, ZERO_STATS, sumStats, deriveStats, STAT_KEYS, StatKey } from "../core/stats";
import { classBaseStats, getClass, CLASSES } from "../units/classes";
import { topBarHtml, loadSettings } from "./settings";
import { hexStatSvg, hexLegendHtml } from "./hexStat";
import { getProgress, setProgress, UnitProgress, MAX_EQUIPPED_SKILLS } from "../core/progress";
import { xpToNext, MAX_LEVEL } from "../core/levels";
import { CLASS_SKILLS, CHARACTER_SKILLS, getSkill } from "../skills/registry";
import { isAdmin } from "../core/admin";

const LORE: Record<string, string> = {
  soda: "A fizzy elemental from the spring. Said to fight harder when shaken.",
  ego: "Sees its own reflection on every blade. Charming. Insufferable.",
  gruyere: "A wedge of ancient cheese. Surprisingly tough rind.",
  calypso: "Sings to the tide. The tide answers back, sometimes.",
  calico: "Three patches, three lives, one wicked grin.",
  nova: "Born from a starfall. Burns first, asks later.",
  hera: "Carries an old crown and an older grudge.",
  aspen: "Quiet ranger of the high pines. Aim true, leave no trace.",
  oge: "A walking boulder with a slow heart and a slow swing.",
  slime: "Common woodland goo. Rude but mostly harmless.",
  slime_king: "What every Slime aspires to. Bigger, gooier, royaler.",
};

let allocatingFor: string | null = null;       // template id currently in alloc modal
let allocDraft: Stats | null = null;             // pending custom stats during modal

export function renderUnitsScreen(root: HTMLElement, onBack: () => void): void {
  const pickingFor = new Set<string>();
  const editingSkillsFor = new Set<string>();
  const settings = loadSettings();
  const admin = isAdmin();

  const draw = () => {
    root.innerHTML = `
      <div class="screen-frame">
        ${topBarHtml("Units", true)}
        ${hexLegendHtml()}
        <div class="units-section">
          <div class="section-label">Player roster</div>
          <div class="units-grid">
            ${PLAYER_ROSTER.map(t => unitCardHtml(t, pickingFor.has(t.id), settings.devUnlockClass || admin, admin, editingSkillsFor.has(t.id))).join("")}
          </div>
        </div>
      </div>
      ${allocatingFor ? allocModalHtml(allocatingFor) : ""}
    `;
    root.querySelector("#back-btn")?.addEventListener("click", onBack);
    wireOpenAlloc(root, draw);
    wireAllocModal(root, draw);
    wireClassPicker(root, pickingFor, settings.devUnlockClass || admin, draw);
    wireSkillLoadout(root, editingSkillsFor, draw);
    wireAdminControls(root, admin, draw);
  };
  draw();
}

function isPlayerTemplate(id: string): boolean {
  return PLAYER_ROSTER.some(t => t.id === id);
}

function unitCardHtml(t: UnitTemplate, isPicking: boolean, devUnlock: boolean, admin: boolean, isEditingSkills: boolean): string {
  const isPlayer = isPlayerTemplate(t.id);
  const progress: UnitProgress | null = isPlayer ? getProgress(t.id) : null;

  const unit = t.unitBaseStats;
  const classId = progress?.classId ?? t.classId;
  const cls = classBaseStats(classId);
  const cust = progress?.customStats ?? t.customStats ?? { ...ZERO_STATS };
  const effective = sumStats(unit, cls, cust);
  const d = deriveStats(effective);
  const maxHp = t.overrideMaxHp ?? d.maxHp;
  const maxMp = t.overrideMaxMp ?? d.maxMp;
  const lore = LORE[t.id] ?? "Lore coming soon.";
  const className = classId ? (getClass(classId)?.name ?? "—") : "—";
  const lvl = progress?.level ?? t.level ?? 1;
  const points = progress?.availablePoints ?? 0;
  const xp = progress?.xp ?? 0;

  return `
    <div class="unit-card" data-template="${escapeAttr(t.id)}">
      <div class="unit-card-head">
        <div class="portrait">${t.portrait}<span class="lv-badge">Lv${lvl}</span></div>
        <div class="unit-card-head-info">
          <div class="unit-card-name">${escapeHtml(t.name)}</div>
          <div class="unit-card-hp">HP ${maxHp} · MP ${maxMp} · Class: ${escapeHtml(className)}</div>
          ${isPlayer && admin ? `
            <div class="admin-row-inline">
              <button class="admin-btn" data-admin-levelup="${escapeAttr(t.id)}" type="button" ${lvl >= MAX_LEVEL ? "disabled" : ""}>+ Level</button>
              <button class="admin-btn" data-admin-reset-stats="${escapeAttr(t.id)}" type="button">Reset Stats</button>
            </div>
          ` : ""}
        </div>
      </div>

      ${isPlayer ? xpBarHtml(lvl, xp) : ""}

      ${isPlayer ? classRowHtml(t, classId, isPicking, devUnlock) : ""}

      <div class="hex-wrap">${hexStatSvg({ unit, classBase: cls, custom: cust, size: 220 })}</div>

      ${isPlayer ? statSummaryHtml(t.id, cust, points) : ""}

      ${isPlayer ? skillLoadoutHtml(t, classId, lvl, isEditingSkills, progress?.equippedSkills ?? []) : ""}

      <div class="derived-grid">
        ${pillHtml("PhysAtk", d.physAtk)}
        ${pillHtml("MagAtk", d.magAtk)}
        ${pillHtml("PhysDef", d.physDef)}
        ${pillHtml("MagDef", d.magDef)}
        ${pillHtml("Speed", d.speed)}
        ${pillHtml("Acc", d.accuracy)}
        ${pillHtml("Crit%", d.critPoints)}
        ${pillHtml("Eva%", d.evadePoints)}
      </div>

      <div class="unit-card-lore">${escapeHtml(lore)}</div>
    </div>
  `;
}

function xpBarHtml(level: number, xp: number): string {
  if (level >= MAX_LEVEL) {
    return `
      <div class="xp-row">
        <span class="xp-row-label">XP</span>
        <div class="bar xp maxed"><div class="fill" style="width:100%"></div><span class="bar-text">MAX (Lv${MAX_LEVEL})</span></div>
      </div>
    `;
  }
  const need = xpToNext(level);
  const pct = (xp / need) * 100;
  return `
    <div class="xp-row">
      <span class="xp-row-label">XP</span>
      <div class="bar xp"><div class="fill" style="width:${pct}%"></div><span class="bar-text">${xp}/${need}</span></div>
    </div>
  `;
}

function classRowHtml(t: UnitTemplate, classId: string | undefined, isPicking: boolean, devUnlock: boolean): string {
  const locked = !!classId && !devUnlock;
  if (isPicking) {
    return `
      <div class="class-row picking">
        <div class="class-row-head">Pick a class for ${escapeHtml(t.name)}: <em class="warning">cannot change later this season</em></div>
        <div class="class-pick-grid">
          ${CLASSES.map(c => `
            <button class="class-pick-btn ${classId === c.id ? "current" : ""}" data-pick-class="${escapeAttr(c.id)}" data-template="${escapeAttr(t.id)}" type="button">
              <div class="class-name">${escapeHtml(c.name)}</div>
              <div class="class-role">${escapeHtml(c.role)}</div>
              ${classSkillTipHtml(c.id)}
            </button>
          `).join("")}
        </div>
        <div class="class-pick-actions">
          <button class="ghost-btn" data-cancel-pick="${escapeAttr(t.id)}" type="button">Cancel</button>
        </div>
      </div>
    `;
  }
  if (!classId) {
    return `
      <div class="class-row">
        <span class="class-row-text">No class assigned.</span>
        <button class="ghost-btn" data-open-pick="${escapeAttr(t.id)}" type="button">Pick class</button>
      </div>
    `;
  }
  const cls = getClass(classId);
  return `
    <div class="class-row chosen">
      <span class="class-row-text">Class: <strong>${escapeHtml(cls?.name ?? classId)}</strong> · ${escapeHtml(cls?.role ?? "")}</span>
      ${locked
        ? `<span class="locked-tag" title="Locked for the season">🔒 locked</span>`
        : `<button class="ghost-btn" data-open-pick="${escapeAttr(t.id)}" type="button">Change (dev)</button>`}
    </div>
  `;
}

function classSkillTipHtml(classId: string): string {
  const ids = CLASS_SKILLS[classId] ?? [];
  if (ids.length === 0) return "";
  const sorted = [...ids].sort((a, b) => (getSkill(a).unlockLevel ?? 1) - (getSkill(b).unlockLevel ?? 1));
  const rows = sorted.map(id => {
    const s = getSkill(id);
    const lvl = s.unlockLevel ?? 1;
    return `<div class="class-tip-row">
      <span class="class-tip-skill"><span class="class-tip-lvl">Lv${lvl}</span> ${escapeHtml(s.name)}</span>
      <span class="class-tip-desc">${escapeHtml(s.description)}</span>
    </div>`;
  }).join("");
  return `<span class="class-tip">
    <span class="class-tip-head">Class skills</span>
    ${rows}
  </span>`;
}

function skillLoadoutHtml(t: UnitTemplate, classId: string | undefined, level: number, editing: boolean, equipped: string[]): string {
  const charSkills = CHARACTER_SKILLS[t.id] ?? [];
  const classSkills = classId ? (CLASS_SKILLS[classId] ?? []) : [];
  const pool = [...charSkills, ...classSkills];

  // Filter to currently unlocked skills (level requirement met).
  const unlocked = pool.filter(id => (getSkill(id).unlockLevel ?? 1) <= level);
  const lockedNext = pool.filter(id => (getSkill(id).unlockLevel ?? 1) > level)
    .sort((a, b) => (getSkill(a).unlockLevel ?? 1) - (getSkill(b).unlockLevel ?? 1));

  if (!editing) {
    const eqVisible = equipped.filter(id => unlocked.includes(id));
    const chip = (id: string, locked: boolean) => {
      const s = getSkill(id);
      const lvlNote = locked ? `Unlocks Lv${s.unlockLevel ?? 1}` : `${s.mpCost > 0 ? `${s.mpCost} MP` : "0 MP"}${s.cooldown > 0 ? ` · CD ${s.cooldown}` : ""}`;
      const cls = ["skill-chip", locked ? "locked" : "", eqVisible.includes(id) ? "equipped" : ""].filter(Boolean).join(" ");
      return `<span class="${cls}">
        ${locked ? "🔒 " : ""}${escapeHtml(s.name)}
        <span class="skill-tip"><span class="skill-tip-name">${escapeHtml(s.name)}</span><span class="skill-tip-desc">${escapeHtml(s.description)}</span><span class="skill-tip-meta">${escapeHtml(lvlNote)}</span></span>
      </span>`;
    };

    const equippedChips = eqVisible.length > 0
      ? eqVisible.map(id => chip(id, false)).join("")
      : `<span class="skill-empty">(no skills equipped — Idle only)</span>`;

    const remainingUnlocked = unlocked.filter(id => !eqVisible.includes(id));
    const lockedSorted = lockedNext;
    const browseChips = [
      ...remainingUnlocked.map(id => chip(id, false)),
      ...lockedSorted.map(id => chip(id, true)),
    ].join("");

    return `
      <div class="skill-loadout">
        <div class="skill-loadout-head">
          <span class="skill-loadout-label">Equipped (${eqVisible.length}/${MAX_EQUIPPED_SKILLS})</span>
          <button class="ghost-btn" data-edit-skills="${escapeAttr(t.id)}" type="button" ${pool.length === 0 ? "disabled" : ""}>Edit Loadout</button>
        </div>
        <div class="skill-chips">${equippedChips}</div>
        ${browseChips ? `
          <div class="skill-loadout-sub">All skills (hover for details)</div>
          <div class="skill-chips skill-chips-browse">${browseChips}</div>
        ` : ""}
      </div>
    `;
  }

  const checkboxes = unlocked.map(id => {
    const s = getSkill(id);
    const checked = equipped.includes(id);
    return `
      <label class="skill-pick">
        <div class="skill-pick-row">
          <input type="checkbox" data-skill-toggle="${escapeAttr(t.id)}" data-skill-id="${escapeAttr(id)}" ${checked ? "checked" : ""}>
          <span class="skill-pick-name">${escapeHtml(s.name)}</span>
          <span class="skill-pick-meta">${s.mpCost > 0 ? `${s.mpCost} MP` : ""}${s.cooldown > 0 ? ` · CD ${s.cooldown}` : ""}</span>
        </div>
        <div class="skill-pick-desc">${escapeHtml(s.description)}</div>
      </label>
    `;
  }).join("");
  const lockedPreview = lockedNext.slice(0, 3).map(id => {
    const s = getSkill(id);
    return `<div class="skill-pick locked">
      <div class="skill-pick-row">
        <span class="skill-pick-name">🔒 ${escapeHtml(s.name)}</span>
        <span class="skill-pick-meta">unlocks Lv${s.unlockLevel}</span>
      </div>
      <div class="skill-pick-desc">${escapeHtml(s.description)}</div>
    </div>`;
  }).join("");

  return `
    <div class="skill-loadout editing">
      <div class="skill-loadout-head">
        <span class="skill-loadout-label">Pick up to ${MAX_EQUIPPED_SKILLS} skills for combat</span>
        <button class="ghost-btn" data-edit-skills-done="${escapeAttr(t.id)}" type="button">Done</button>
      </div>
      <div class="skill-pick-grid">
        ${unlocked.length > 0 ? checkboxes : `<div class="skill-empty">No skills unlocked yet. Pick a class and level up.</div>`}
        ${lockedPreview}
      </div>
    </div>
  `;
}

function statSummaryHtml(templateId: string, custom: Stats, points: number): string {
  const allocated = STAT_KEYS.map(k => `<span class="stat-mini">${k} +${custom[k]}</span>`).join("");
  return `
    <div class="stat-alloc-row">
      <div class="stat-mini-grid">${allocated}</div>
      <button class="alloc-open-btn" data-open-alloc="${escapeAttr(templateId)}" type="button" ${points <= 0 ? "disabled" : ""}>
        Stat Point Allocation${points > 0 ? ` · ${points} pt${points === 1 ? "" : "s"}` : ""}
      </button>
    </div>
  `;
}

function allocModalHtml(templateId: string): string {
  const t = PLAYER_ROSTER.find(p => p.id === templateId);
  if (!t) return "";
  const progress = getProgress(templateId);
  if (!allocDraft) {
    allocDraft = { ...ZERO_STATS, ...progress.customStats };
  }
  const used = STAT_KEYS.reduce((sum, k) => sum + Math.max(0, allocDraft![k] - (progress.customStats[k] ?? 0)), 0);
  const remaining = progress.availablePoints - used;
  return `
    <div class="modal-overlay" id="alloc-modal-overlay">
      <div class="modal-panel">
        <div class="modal-title">Stat Point Allocation — ${escapeHtml(t.name)}</div>
        <div class="modal-sub">Available: <strong>${remaining}</strong> point${remaining === 1 ? "" : "s"}</div>

        <div class="alloc-row">
          ${STAT_KEYS.map(k => {
            const baseVal = progress.customStats[k] ?? 0;
            const cur = allocDraft![k];
            const canDec = cur > baseVal;
            const canInc = remaining > 0;
            return `
              <div class="alloc-cell">
                <span class="alloc-label">${k}</span>
                <span class="alloc-value">+${cur}</span>
                <div class="alloc-buttons">
                  <button class="alloc-btn dec" data-alloc-dec="${k}" type="button" ${canDec ? "" : "disabled"}>−</button>
                  <button class="alloc-btn inc" data-alloc-inc="${k}" type="button" ${canInc ? "" : "disabled"}>+</button>
                </div>
              </div>
            `;
          }).join("")}
        </div>

        <div class="modal-actions">
          <button class="ghost-btn" id="alloc-cancel" type="button">Cancel</button>
          <button class="confirm-btn" id="alloc-finalize" type="button" ${used === 0 ? "disabled" : ""}>Finalize (${used})</button>
        </div>
      </div>
    </div>
  `;
}

function pillHtml(label: string, value: number): string {
  return `<div class="pill"><span class="pill-label">${label}</span><span class="pill-value">${value.toFixed(0)}</span></div>`;
}

function wireOpenAlloc(root: HTMLElement, redraw: () => void): void {
  root.querySelectorAll<HTMLButtonElement>("[data-open-alloc]").forEach(btn => {
    btn.addEventListener("click", () => {
      allocatingFor = btn.dataset.openAlloc!;
      allocDraft = null;
      redraw();
    });
  });
}

function wireAllocModal(root: HTMLElement, redraw: () => void): void {
  if (!allocatingFor || !allocDraft) return;

  root.querySelectorAll<HTMLButtonElement>("[data-alloc-inc]").forEach(btn => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.allocInc as StatKey;
      const progress = getProgress(allocatingFor!);
      const used = STAT_KEYS.reduce((sum, kk) => sum + Math.max(0, allocDraft![kk] - (progress.customStats[kk] ?? 0)), 0);
      if (used >= progress.availablePoints) return;
      allocDraft![k] = (allocDraft![k] ?? 0) + 1;
      redraw();
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-alloc-dec]").forEach(btn => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.allocDec as StatKey;
      const progress = getProgress(allocatingFor!);
      const baseVal = progress.customStats[k] ?? 0;
      if (allocDraft![k] <= baseVal) return;
      allocDraft![k] = allocDraft![k] - 1;
      redraw();
    });
  });

  root.querySelector<HTMLButtonElement>("#alloc-cancel")?.addEventListener("click", () => {
    allocatingFor = null;
    allocDraft = null;
    redraw();
  });

  root.querySelector<HTMLButtonElement>("#alloc-finalize")?.addEventListener("click", () => {
    const tid = allocatingFor!;
    const progress = getProgress(tid);
    const used = STAT_KEYS.reduce((sum, kk) => sum + Math.max(0, allocDraft![kk] - (progress.customStats[kk] ?? 0)), 0);
    if (used <= 0) return;
    if (!confirm(`Spend ${used} stat point${used === 1 ? "" : "s"}? This is final.`)) return;
    const next: UnitProgress = {
      ...progress,
      customStats: { ...allocDraft! },
      availablePoints: progress.availablePoints - used,
    };
    setProgress(tid, next);
    allocatingFor = null;
    allocDraft = null;
    redraw();
  });
}

function wireSkillLoadout(root: HTMLElement, editing: Set<string>, redraw: () => void): void {
  root.querySelectorAll<HTMLButtonElement>("[data-edit-skills]").forEach(btn => {
    btn.addEventListener("click", () => {
      editing.add(btn.dataset.editSkills!);
      redraw();
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-edit-skills-done]").forEach(btn => {
    btn.addEventListener("click", () => {
      editing.delete(btn.dataset.editSkillsDone!);
      redraw();
    });
  });
  root.querySelectorAll<HTMLInputElement>("[data-skill-toggle]").forEach(cb => {
    cb.addEventListener("change", () => {
      const tid = cb.dataset.skillToggle!;
      const sid = cb.dataset.skillId!;
      const cur = getProgress(tid);
      const equipped = new Set<string>(cur.equippedSkills ?? []);
      if (cb.checked) {
        if (equipped.size >= MAX_EQUIPPED_SKILLS) {
          cb.checked = false;
          alert(`Max ${MAX_EQUIPPED_SKILLS} skills.`);
          return;
        }
        equipped.add(sid);
      } else {
        equipped.delete(sid);
      }
      setProgress(tid, { ...cur, equippedSkills: [...equipped] });
      redraw();
    });
  });
}

function wireAdminControls(root: HTMLElement, admin: boolean, redraw: () => void): void {
  if (!admin) return;
  root.querySelectorAll<HTMLButtonElement>("[data-admin-levelup]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tid = btn.dataset.adminLevelup!;
      const cur = getProgress(tid);
      if (cur.level >= MAX_LEVEL) return;
      setProgress(tid, {
        ...cur,
        level: cur.level + 1,
        xp: 0,
        availablePoints: cur.availablePoints + 4,
      });
      redraw();
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-admin-reset-stats]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tid = btn.dataset.adminResetStats!;
      const cur = getProgress(tid);
      const refund = STAT_KEYS.reduce((sum, k) => sum + (cur.customStats[k] ?? 0), 0);
      if (refund === 0 && cur.availablePoints === 0) return;
      if (!confirm(`Refund ${refund} allocated point${refund === 1 ? "" : "s"} back to available? This zeroes out the unit's custom stat allocation.`)) return;
      setProgress(tid, {
        ...cur,
        customStats: { ...ZERO_STATS },
        availablePoints: cur.availablePoints + refund,
      });
      redraw();
    });
  });
}

function wireClassPicker(root: HTMLElement, pickingFor: Set<string>, devUnlock: boolean, redraw: () => void): void {
  root.querySelectorAll<HTMLButtonElement>("[data-open-pick]").forEach(btn => {
    btn.addEventListener("click", () => {
      pickingFor.add(btn.dataset.openPick!);
      redraw();
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-cancel-pick]").forEach(btn => {
    btn.addEventListener("click", () => {
      pickingFor.delete(btn.dataset.cancelPick!);
      redraw();
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-pick-class]").forEach(btn => {
    btn.addEventListener("click", () => {
      const classId = btn.dataset.pickClass!;
      const tid = btn.dataset.template!;
      const cur = getProgress(tid);
      if (cur.classId && !devUnlock) return;
      openClassConfirmModal(root, classId, tid, () => {
        const c = getProgress(tid);
        setProgress(tid, { ...c, classId });
        pickingFor.delete(tid);
        redraw();
      });
    });
  });
}

function openClassConfirmModal(root: HTMLElement, classId: string, templateId: string, onConfirm: () => void): void {
  const cls = getClass(classId);
  if (!cls) return;
  const ids = CLASS_SKILLS[classId] ?? [];
  const sorted = [...ids].sort((a, b) => (getSkill(a).unlockLevel ?? 1) - (getSkill(b).unlockLevel ?? 1));
  const skillRows = sorted.map(id => {
    const s = getSkill(id);
    const lvl = s.unlockLevel ?? 1;
    const meta = `${s.mpCost > 0 ? `${s.mpCost} MP` : "0 MP"}${s.cooldown > 0 ? ` · CD ${s.cooldown}` : ""}`;
    return `
      <div class="class-confirm-skill">
        <div class="class-confirm-skill-head">
          <span class="class-tip-lvl">Lv${lvl}</span>
          <span class="class-confirm-skill-name">${escapeHtml(s.name)}</span>
          <span class="class-confirm-skill-meta">${escapeHtml(meta)}</span>
        </div>
        <div class="class-confirm-skill-desc">${escapeHtml(s.description)}</div>
      </div>
    `;
  }).join("");

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay class-confirm-modal";
  overlay.innerHTML = `
    <div class="modal-panel">
      <div class="modal-title">Confirm Class — ${escapeHtml(cls.name)}</div>
      <div class="modal-sub">Role: ${escapeHtml(cls.role)}</div>
      <div class="class-confirm-warning">
        <strong>Warning:</strong> Once you confirm, this class is locked for the season and cannot be changed.
      </div>
      <div class="class-confirm-skills">
        <div class="class-confirm-skills-head">Class skills</div>
        ${skillRows || `<div class="skill-empty">(no class skills defined)</div>`}
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" data-class-confirm-cancel type="button">Cancel</button>
        <button class="confirm-btn" data-class-confirm-ok type="button">Confirm ${escapeHtml(cls.name)}</button>
      </div>
    </div>
  `;
  root.appendChild(overlay);

  const close = () => { overlay.remove(); };
  overlay.querySelector<HTMLButtonElement>("[data-class-confirm-cancel]")?.addEventListener("click", close);
  overlay.querySelector<HTMLButtonElement>("[data-class-confirm-ok]")?.addEventListener("click", () => {
    close();
    onConfirm();
  });
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
  void templateId;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  } as Record<string, string>)[c]);
}
function escapeAttr(s: string): string { return escapeHtml(s); }
