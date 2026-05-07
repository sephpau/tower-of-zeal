import { fetchTop, fetchTopWithExtras, formatMs, LbEntry, FirstConquerEntry, WorldEnderEntry, adminResetLeaderboards, fetchReplayBlob } from "../core/leaderboard";
import { topBarHtml } from "./settings";
import { loadSession } from "../auth/session";
import { isAdmin } from "../core/admin";
import { ReplayBlob } from "../core/replay";

export function renderLeaderboard(root: HTMLElement, onBack: () => void, onPlayReplay?: (blob: ReplayBlob) => void): void {
  const myAddr = loadSession()?.address.toLowerCase() ?? null;

  const adminControls = isAdmin()
    ? `<div class="lb-admin-controls"><button class="ghost-btn lb-admin-reset" id="lb-admin-reset" type="button">Admin: Reset All Leaderboards</button></div>`
    : "";

  root.innerHTML = `
    <div class="screen-frame lb-screen">
      ${topBarHtml("Leaderboard", true)}
      ${adminControls}
      <div class="lb-grid">
        <div class="lb-board lb-survival">
          <div class="lb-board-title">Survival</div>
          <div class="lb-rows" id="lb-survival-rows">
            <div class="lb-empty">Loading…</div>
          </div>
        </div>
        <div class="lb-board lb-bossraid">
          <div class="lb-board-title">Boss Raid</div>
          <div class="lb-rows" id="lb-bossraid-rows">
            <div class="lb-empty">Loading…</div>
          </div>
        </div>
        <div class="lb-side">
          <div class="lb-board lb-conquer">
            <div class="lb-board-title">First to Conquer the Tower</div>
            <div class="lb-rows" id="lb-conquer-rows">
              <div class="lb-empty">Loading…</div>
            </div>
          </div>
          <div class="lb-board lb-fastest">
            <div class="lb-board-title">Fastest to Kill World Ender</div>
            <div class="lb-rows" id="lb-fastest-rows">
              <div class="lb-empty">Loading…</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  root.querySelector<HTMLButtonElement>("#back-btn")?.addEventListener("click", onBack);
  root.querySelector<HTMLButtonElement>("#lb-admin-reset")?.addEventListener("click", async () => {
    if (!confirm("Wipe Survival, Boss Raid, World Ender LBs and First Conquer? This can't be undone.")) return;
    const r = await adminResetLeaderboards();
    if (r.ok) {
      alert(`Cleared:\n${(r.cleared ?? []).join("\n")}`);
      renderLeaderboard(root, onBack);
    } else {
      alert(`Reset failed: ${r.error ?? "unknown"}`);
    }
  });

  // Survival board (with first-conquer + world-ender in same payload).
  // Show up to 10 entries; replays available for top 3 once Phase 2 ships.
  void fetchTopWithExtras("survival", 10).then(({ entries, firstConquer, worldEnder }) => {
    fillRows("lb-survival-rows", entries, myAddr, { replayTopN: 0, mode: "survival" });
    fillFirstConquer("lb-conquer-rows", firstConquer, myAddr);
    fillWorldEnder("lb-fastest-rows", worldEnder, myAddr);
  });

  // Boss raid board (independent fetch). Up to 10 entries.
  void fetchTop("boss_raid", 10).then(entries => {
    fillRows("lb-bossraid-rows", entries, myAddr, { replayTopN: 0, mode: "boss_raid" });
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
      btn.disabled = false;
      btn.textContent = "▶ Replay";
      alert("No replay available for this entry yet.");
      return;
    }
    onPlayReplay(blob);
  });
}

function fillWorldEnder(elId: string, entries: WorldEnderEntry[], myAddr: string | null): void {
  const el = document.getElementById(elId);
  if (!el) return;
  if (entries.length === 0) {
    el.innerHTML = `<div class="lb-empty">No floor 50 clears yet.</div>`;
    return;
  }
  // Top 5 displayed; replays available for top 3.
  const display = entries.slice(0, 5);
  el.innerHTML = display.map(e => {
    const isMe = myAddr !== null && e.address.toLowerCase() === myAddr;
    return `
      <div class="lb-row ${isMe ? "me" : ""}">
        <span class="lb-col rank">${e.rank}</span>
        <span class="lb-col player">
          <span class="lb-ign">${escapeHtml(e.ign ?? "—")}</span>
          <span class="lb-addr" title="${escapeHtml(e.address)}">${shortAddr(e.address)}</span>
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
  if (entries.length === 0) {
    el.innerHTML = `<div class="lb-empty">No runs yet — be the first!</div>`;
    return;
  }
  el.innerHTML = entries.map(e => rowHtml(e, myAddr, opts)).join("");
}

function fillFirstConquer(elId: string, fc: FirstConquerEntry | null, myAddr: string | null): void {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!fc) {
    el.innerHTML = `<div class="lb-empty">No conqueror yet.</div>`;
    return;
  }
  const isMe = myAddr !== null && fc.address.toLowerCase() === myAddr;
  const date = new Date(fc.when).toLocaleDateString();
  el.innerHTML = `
    <div class="lb-row lb-conquer-row ${isMe ? "me" : ""}">
      <span class="lb-col rank">★</span>
      <span class="lb-col player">
        <span class="lb-ign">${escapeHtml(fc.ign ?? "—")}</span>
        <span class="lb-addr" title="${escapeHtml(fc.address)}">${shortAddr(fc.address)}</span>
        <span class="lb-conquer-date">${escapeHtml(date)}</span>
      </span>
      ${replayBtnHtml(true)}
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
