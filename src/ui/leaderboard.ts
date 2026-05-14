import { fetchTop, fetchTopWithExtras, formatMs, LbEntry, FirstConquerEntry, WorldEnderEntry, adminResetOneLeaderboard, AdminLbScope, fetchReplayBlob } from "../core/leaderboard";
import { topBarHtml } from "./settings";
import { loadSession } from "../auth/session";
import { isAdmin } from "../core/admin";
import { ReplayBlob } from "../core/replay";
import { confirmModal, alertModal } from "./confirmModal";

export function renderLeaderboard(root: HTMLElement, onBack: () => void, onPlayReplay?: (blob: ReplayBlob) => void): void {
  const myAddr = loadSession()?.address.toLowerCase() ?? null;

  const admin = isAdmin();
  const titleHtml = (label: string, scope: AdminLbScope): string =>
    admin
      ? `<div class="lb-board-title-row">
           <span class="lb-board-title">${escapeHtml(label)}</span>
           <button class="lb-admin-reset" type="button" data-reset-scope="${scope}" title="Admin: reset this board">Reset</button>
         </div>`
      : `<div class="lb-board-title">${escapeHtml(label)}</div>`;

  root.innerHTML = `
    <div class="screen-frame lb-screen">
      ${topBarHtml("Leaderboard", true)}
      <div class="lb-grid">
        <div class="lb-board lb-survival">
          ${titleHtml("Survival", "survival")}
          <div class="lb-rows" id="lb-survival-rows">
            <div class="lb-empty">Loading…</div>
          </div>
        </div>
        <div class="lb-board lb-bossraid">
          ${titleHtml("Boss Raid", "bossraid")}
          <div class="lb-rows" id="lb-bossraid-rows">
            <div class="lb-empty">Loading…</div>
          </div>
        </div>
        <div class="lb-side">
          <div class="lb-board lb-conquer">
            ${titleHtml("First to Conquer the Tower", "conquer")}
            <div class="lb-rows" id="lb-conquer-rows">
              <div class="lb-empty">Loading…</div>
            </div>
          </div>
          <div class="lb-board lb-fastest">
            ${titleHtml("Fastest to Kill World Ender", "we")}
            <div class="lb-rows" id="lb-fastest-rows">
              <div class="lb-empty">Loading…</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  root.querySelector<HTMLButtonElement>("#back-btn")?.addEventListener("click", onBack);

  if (admin) {
    root.querySelectorAll<HTMLButtonElement>(".lb-admin-reset").forEach(btn => {
      btn.addEventListener("click", async () => {
        const scope = btn.dataset.resetScope as AdminLbScope | undefined;
        if (!scope) return;
        const labels: Record<AdminLbScope, string> = {
          survival: "Survival LB",
          bossraid: "Boss Raid LB",
          we: "Fastest World Ender LB",
          conquer: "First to Conquer record",
        };
        const ok = await confirmModal({
          title: "Wipe Leaderboard?",
          message: `Permanently wipe <strong>${labels[scope]}</strong>?<br><br>This can't be undone.`,
          confirmLabel: "Wipe",
          cancelLabel: "Cancel",
          danger: true,
        });
        if (!ok) return;
        btn.disabled = true;
        const r = await adminResetOneLeaderboard(scope);
        btn.disabled = false;
        if (r.ok) {
          renderLeaderboard(root, onBack, onPlayReplay);
        } else {
          await alertModal({
            kind: "error",
            title: "Reset Failed",
            message: `Couldn't reset the leaderboard: ${r.error ?? "unknown error"}`,
          });
        }
      });
    });
  }

  // Survival board (with first-conquer + world-ender in same payload).
  // Show up to 10 entries; replays available for top 3.
  void fetchTopWithExtras("survival", 10).then(({ entries, firstConquer, worldEnder }) => {
    fillRows("lb-survival-rows", entries, myAddr, { replayTopN: 3, mode: "survival" });
    fillFirstConquer("lb-conquer-rows", firstConquer, myAddr);
    fillWorldEnder("lb-fastest-rows", worldEnder, myAddr);
  });

  // Boss raid board (independent fetch). Up to 10 entries.
  void fetchTop("boss_raid", 10).then(entries => {
    fillRows("lb-bossraid-rows", entries, myAddr, { replayTopN: 3, mode: "boss_raid" });
  });

  // Wire replay button clicks (delegated for buttons rendered later by async loaders).
  root.addEventListener("click", async e => {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>("button.lb-replay-btn");
    if (!btn || btn.disabled) return;
    const scope = btn.dataset.replayScope;
    const address = btn.dataset.replayAddr;
    if (!scope || !address || !onPlayReplay) return;
    btn.disabled = true;
    btn.textContent = "Loading…";
    const blob = await fetchReplayBlob<ReplayBlob>(scope, address);
    if (!blob) {
      // Older entries (predating the replay save) won't have a blob — gray the
      // button out in place instead of showing a browser alert.
      btn.disabled = true;
      btn.textContent = "No replay";
      btn.classList.add("lb-replay-empty");
      btn.title = "This entry was set before replays were recorded.";
      return;
    }
    onPlayReplay(blob);
  });
}

/** Prize tables per leaderboard. Values in RON. */
const PRIZES_RUN: Record<number, number> = { 1: 120, 2: 75, 3: 45, 4: 30, 5: 30 };
const PRIZES_WORLD_ENDER: Record<number, number> = { 1: 100, 2: 60, 3: 40 };
const PRIZE_FIRST_CONQUER = 200;

function prizeChip(amount: number | undefined): string {
  if (!amount) return "";
  return `<span class="lb-prize" title="Prize: ${amount} $RON">${amount} RON</span>`;
}

function fillWorldEnder(elId: string, entries: WorldEnderEntry[], myAddr: string | null): void {
  const el = document.getElementById(elId);
  if (!el) return;
  // Top 5 displayed; replays available for top 3; prizes for top 3.
  // Pad to 5 rows so empty slots still display the rank + RON reward (top 3).
  const SLOT_COUNT = 5;
  const display: (WorldEnderEntry | null)[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    display.push(entries[i] ?? null);
  }
  el.innerHTML = display.map((e, idx) => {
    const rank = idx + 1;
    if (!e) return emptySlotRowHtml(rank, PRIZES_WORLD_ENDER[rank]);
    const isMe = myAddr !== null && e.address.toLowerCase() === myAddr;
    return `
      <div class="lb-row ${isMe ? "me" : ""}">
        <span class="lb-col rank">${e.rank}</span>
        <span class="lb-col player">
          <span class="lb-ign">${escapeHtml(e.ign ?? "—")}</span>
          <span class="lb-addr" title="${escapeHtml(e.address)}">${shortAddr(e.address)}</span>
          ${prizeChip(PRIZES_WORLD_ENDER[e.rank])}
        </span>
        <span class="lb-col time">${formatMs(e.ms)}</span>
        ${replayBtnHtml(e.rank <= 3, "we", e.address)}
      </div>
    `;
  }).join("");
}

interface FillOpts {
  replayTopN: number;
  mode: "survival" | "boss_raid";
  hideFloor?: boolean;
}

function fillRows(elId: string, entries: LbEntry[], myAddr: string | null, opts: FillOpts): void {
  const el = document.getElementById(elId);
  if (!el) return;
  // Pad to 10 rows so empty slots still display rank + RON reward (top 5).
  const SLOT_COUNT = 10;
  const display: (LbEntry | null)[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    display.push(entries[i] ?? null);
  }
  el.innerHTML = display.map((e, idx) => {
    const rank = idx + 1;
    if (!e) return emptySlotRowHtml(rank, PRIZES_RUN[rank], opts.hideFloor);
    return rowHtml(e, myAddr, opts);
  }).join("");
}

/** Empty-rank row: shows the rank and (if any) RON reward, nothing else. */
function emptySlotRowHtml(rank: number, prize: number | undefined, hideFloor?: boolean): string {
  return `
    <div class="lb-row lb-row-empty">
      <span class="lb-col rank">${rank}</span>
      <span class="lb-col player">
        <span class="lb-ign dim">—</span>
        ${prizeChip(prize)}
      </span>
      ${hideFloor ? "" : `<span class="lb-col floor dim">—</span>`}
      <span class="lb-col time dim">—:—</span>
    </div>
  `;
}

function fillFirstConquer(elId: string, fc: FirstConquerEntry | null, myAddr: string | null): void {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!fc) {
    el.innerHTML = `
      <div class="lb-row lb-conquer-row lb-row-empty">
        <span class="lb-col rank">★</span>
        <span class="lb-col player">
          <span class="lb-ign dim">No conqueror yet</span>
          ${prizeChip(PRIZE_FIRST_CONQUER)}
        </span>
      </div>
    `;
    return;
  }
  const isMe = myAddr !== null && fc.address.toLowerCase() === myAddr;
  const date = new Date(fc.when).toLocaleDateString();
  // Phase 3: show the party on the floor-50 finish (no replay button).
  const partyHtml = fc.party && fc.party.length > 0
    ? `<div class="lb-conquer-party">${fc.party.map(conquerPartyCardHtml).join("")}</div>`
    : "";
  el.innerHTML = `
    <div class="lb-row lb-conquer-row ${isMe ? "me" : ""}">
      <span class="lb-col rank">★</span>
      <span class="lb-col player">
        <span class="lb-ign">${escapeHtml(fc.ign ?? "—")}</span>
        <span class="lb-addr" title="${escapeHtml(fc.address)}">${shortAddr(fc.address)}</span>
        <span class="lb-conquer-date">${escapeHtml(date)}</span>
        ${prizeChip(PRIZE_FIRST_CONQUER)}
      </span>
    </div>
    ${partyHtml}
  `;
}

function conquerPartyCardHtml(m: { templateId: string; classId?: string; level: number; customStats: Record<string, number>; equippedSkills: string[] }): string {
  const STAT_KEYS = ["STR", "DEF", "AGI", "DEX", "VIT", "INT"];
  const statRow = STAT_KEYS.map(k => `<span class="lb-stat"><span class="lb-stat-k">${k}</span><span class="lb-stat-v">+${(m.customStats as Record<string, number>)[k] ?? 0}</span></span>`).join("");
  const skills = m.equippedSkills.length > 0
    ? m.equippedSkills.map(s => `<span class="lb-skill-chip">${escapeHtml(s)}</span>`).join("")
    : `<span class="lb-skill-chip dim">(none)</span>`;
  return `
    <div class="lb-conquer-card">
      <div class="lb-conquer-head">
        <span class="lb-conquer-unit">${escapeHtml(m.templateId)}</span>
        <span class="lv-inline">Lv${m.level}</span>
        ${m.classId ? `<span class="lb-conquer-class">${escapeHtml(m.classId)}</span>` : ""}
      </div>
      <div class="lb-conquer-stats">${statRow}</div>
      <div class="lb-conquer-skills">${skills}</div>
    </div>
  `;
}

function rowHtml(e: LbEntry, myAddr: string | null, opts: FillOpts): string {
  const isMe = myAddr !== null && e.address.toLowerCase() === myAddr;
  const name = e.ign ?? "—";
  const showReplay = e.rank <= opts.replayTopN;
  return `
    <div class="lb-row ${isMe ? "me" : ""}">
      <span class="lb-col rank">${e.rank}</span>
      <span class="lb-col player">
        <span class="lb-ign">${escapeHtml(name)}</span>
        <span class="lb-addr" title="${escapeHtml(e.address)}">${shortAddr(e.address)}</span>
        ${prizeChip(PRIZES_RUN[e.rank])}
      </span>
      ${opts.hideFloor ? "" : `<span class="lb-col floor">${e.floor}</span>`}
      <span class="lb-col time">${formatMs(e.ms)}</span>
      ${replayBtnHtml(showReplay, opts.mode === "survival" ? "lb_survival" : "lb_bossraid", e.address)}
    </div>
  `;
}

/** Renders a replay button. Pass scope+address to make it active. Without a
 *  scope (or with replay still pending Phase 2), shows a disabled placeholder. */
function replayBtnHtml(show: boolean, scope?: string, address?: string): string {
  if (!show) return "";
  if (scope && address) {
    return `<button class="lb-replay-btn" type="button" data-replay-scope="${escapeAttr(scope)}" data-replay-addr="${escapeAttr(address)}">▶ Replay</button>`;
  }
  return `<button class="lb-replay-btn" type="button" title="Replay coming soon" disabled>▶ Replay</button>`;
}

function escapeAttr(s: string): string { return escapeHtml(s); }

function shortAddr(a: string): string {
  if (a.length < 12) return escapeHtml(a);
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  } as Record<string, string>)[c]);
}
