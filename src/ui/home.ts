import { loadSettings } from "./settings";
import { getEnergy, ENERGY_MAX } from "../core/energy";

export type HomeAction = "tower" | "units" | "settings";

export function renderHome(root: HTMLElement, onAction: (a: HomeAction) => void): void {
  const s = loadSettings();
  const energy = getEnergy();
  root.innerHTML = `
    <div class="home-screen">
      <button class="gear-btn" id="open-settings" type="button" title="Settings">⚙</button>
      <div class="energy-pill" title="Energy"><span class="energy-icon">⚡</span><span>${energy} / ${ENERGY_MAX}</span></div>
      <div class="home-header">
        <div class="home-greeting">Welcome, ${escapeHtml(s.playerName)}</div>
        <h1 class="home-title">Tower of Zeal</h1>
      </div>
      <div class="home-tiles">
        <button class="home-tile primary" data-action="tower" type="button">
          <div class="tile-title">Explore!</div>
        </button>
        <button class="home-tile" data-action="units" type="button">
          <div class="tile-title">Units</div>
        </button>
      </div>
    </div>
  `;
  root.querySelector("#open-settings")?.addEventListener("click", () => onAction("settings"));
  root.querySelectorAll<HTMLButtonElement>(".home-tile").forEach(btn => {
    btn.addEventListener("click", () => onAction(btn.dataset.action as HomeAction));
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  } as Record<string, string>)[c]);
}
