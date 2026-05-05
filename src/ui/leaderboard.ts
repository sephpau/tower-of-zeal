import { fetchTop, formatMs, LbEntry, LbMode } from "../core/leaderboard";
import { topBarHtml } from "./settings";
import { loadSession } from "../auth/session";

const MODE_LABEL: Record<LbMode, string> = {
  survival: "Survival",
  boss_raid: "Boss Raid",
};
const FLOOR_LABEL: Record<LbMode, string> = {
  survival: "Floor",
  boss_raid: "Bosses",
};

export function renderLeaderboard(root: HTMLElement, onBack: () => void): void {
  const myAddr = loadSession()?.address.toLowerCase() ?? null;
  let mode: LbMode = "survival";

  const draw = () => {
    root.innerHTML = `
      <div class="screen-frame">
        ${topBarHtml("Leaderboard", true)}
        <div class="lb-mode-tabs">
          <button class="lb-mode-tab ${mode === "survival" ? "active" : ""}" data-mode="survival" type="button">${MODE_LABEL.survival}</button>
          <button class="lb-mode-tab ${mode === "boss_raid" ? "active" : ""}" data-mode="boss_raid" type="button">${MODE_LABEL.boss_raid}</button>
        </div>
        <div class="lb-panel">
          <div class="lb-header-row">
            <span class="lb-col rank">#</span>
            <span class="lb-col player">Player</span>
            <span class="lb-col floor">${FLOOR_LABEL[mode]}</span>
            <span class="lb-col time">Time</span>
          </div>
          <div class="lb-rows" id="lb-rows">
            <div class="lb-empty">Loading…</div>
          </div>
        </div>
      </div>
    `;
    root.querySelector<HTMLButtonElement>("#back-btn")?.addEventListener("click", onBack);
    root.querySelectorAll<HTMLButtonElement>(".lb-mode-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        const m = btn.dataset.mode as LbMode;
        if (m === mode) return;
        mode = m;
        draw();
      });
    });

    void fetchTop(mode, 50).then(entries => {
      const rows = root.querySelector<HTMLElement>("#lb-rows");
      if (!rows) return;
      if (entries.length === 0) {
        rows.innerHTML = `<div class="lb-empty">No runs yet — be the first!</div>`;
        return;
      }
      rows.innerHTML = entries.map(e => rowHtml(e, myAddr)).join("");
    });
  };

  draw();
}

function rowHtml(e: LbEntry, myAddr: string | null): string {
  const isMe = myAddr !== null && e.address.toLowerCase() === myAddr;
  const name = e.ign ?? "—";
  return `
    <div class="lb-row ${isMe ? "me" : ""}">
      <span class="lb-col rank">${e.rank}</span>
      <span class="lb-col player">
        <span class="lb-ign">${escapeHtml(name)}</span>
        <span class="lb-addr" title="${escapeHtml(e.address)}">${shortAddr(e.address)}</span>
      </span>
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
