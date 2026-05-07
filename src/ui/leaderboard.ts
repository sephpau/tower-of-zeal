import { fetchTop, fetchTopWithExtras, formatMs, LbEntry, FirstConquerEntry } from "../core/leaderboard";
import { topBarHtml } from "./settings";
import { loadSession } from "../auth/session";

const BOSS_RAID_FINAL_FLOOR = 5; // BOSS_RAID_FLOORS.length — keep in sync if floors change

export function renderLeaderboard(root: HTMLElement, onBack: () => void): void {
  const myAddr = loadSession()?.address.toLowerCase() ?? null;

  root.innerHTML = `
    <div class="screen-frame lb-screen">
      ${topBarHtml("Leaderboard", true)}
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

  // Survival board (with first-conquer in same payload).
  void fetchTopWithExtras("survival", 50).then(({ entries, firstConquer }) => {
    fillRows("lb-survival-rows", entries, myAddr, { replayTopN: 3, mode: "survival" });
    fillFirstConquer("lb-conquer-rows", firstConquer, myAddr);
  });

  // Boss raid board + derive Fastest World Ender from it.
  void fetchTop("boss_raid", 50).then(entries => {
    fillRows("lb-bossraid-rows", entries, myAddr, { replayTopN: 3, mode: "boss_raid" });
    const fastest = entries.filter(e => e.floor >= BOSS_RAID_FINAL_FLOOR).slice(0, 3);
    fillRows("lb-fastest-rows", fastest, myAddr, { replayTopN: 3, mode: "boss_raid", hideFloor: true });
    if (fastest.length === 0) {
      const el = document.getElementById("lb-fastest-rows");
      if (el) el.innerHTML = `<div class="lb-empty">No completed kills yet.</div>`;
    }
  });
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
      <span class="lb-col time">${formatMs(fc.ms)}</span>
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
      ${replayBtnHtml(showReplay)}
    </div>
  `;
}

function replayBtnHtml(show: boolean): string {
  if (!show) return "";
  // Disabled placeholder until the replay-recording system ships.
  return `<button class="lb-replay-btn" type="button" title="Replay coming soon" disabled>▶ Replay</button>`;
}

function shortAddr(a: string): string {
  if (a.length < 12) return escapeHtml(a);
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  } as Record<string, string>)[c]);
}
