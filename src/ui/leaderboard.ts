import { fetchTop, formatMs, LbEntry } from "../core/leaderboard";
import { topBarHtml } from "./settings";
import { loadSession } from "../auth/session";

export function renderLeaderboard(root: HTMLElement, onBack: () => void): void {
  const myAddr = loadSession()?.address.toLowerCase() ?? null;

  root.innerHTML = `
    <div class="screen-frame">
      ${topBarHtml("Survival Leaderboard", true)}
      <div class="lb-panel">
        <div class="lb-header-row">
          <span class="lb-col rank">#</span>
          <span class="lb-col addr">Player</span>
          <span class="lb-col floor">Floor</span>
          <span class="lb-col time">Time</span>
        </div>
        <div class="lb-rows" id="lb-rows">
          <div class="lb-empty">Loading…</div>
        </div>
      </div>
    </div>
  `;
  root.querySelector<HTMLButtonElement>("#back-btn")?.addEventListener("click", onBack);

  void fetchTop(50).then(entries => {
    const rows = root.querySelector<HTMLElement>("#lb-rows");
    if (!rows) return;
    if (entries.length === 0) {
      rows.innerHTML = `<div class="lb-empty">No runs yet — be the first!</div>`;
      return;
    }
    rows.innerHTML = entries.map(e => rowHtml(e, myAddr)).join("");
  });
}

function rowHtml(e: LbEntry, myAddr: string | null): string {
  const isMe = myAddr !== null && e.address.toLowerCase() === myAddr;
  return `
    <div class="lb-row ${isMe ? "me" : ""}">
      <span class="lb-col rank">${e.rank}</span>
      <span class="lb-col addr" title="${escapeHtml(e.address)}">${shortAddr(e.address)}</span>
      <span class="lb-col floor">${e.floor}</span>
      <span class="lb-col time">${formatMs(e.ms)}</span>
    </div>
  `;
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
