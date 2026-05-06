import { loadSettings } from "./settings";
import { getEnergy, ENERGY_MAX, msUntilNextRefill } from "../core/energy";
import { startEnergyTimerLoop, formatRefillCountdown } from "./energyTimer";
import { fetchDailyStatus, claimDailyBonus, DailyStatus } from "../core/daily";
import { setEnergy } from "../core/energy";

export type HomeAction = "tower" | "units" | "settings" | "tutorial" | "leaderboard";

export function renderHome(root: HTMLElement, onAction: (a: HomeAction) => void): void {
  const s = loadSettings();
  const energy = getEnergy();
  root.innerHTML = `
    <div class="home-screen">
      <button class="gear-btn" id="open-settings" type="button" title="Settings">⚙</button>
      <button class="gear-btn tutorial-btn" id="open-tutorial" type="button" title="Replay tutorial">?</button>
      <div class="energy-pill" title="Energy">
        <span class="energy-icon">⚡</span>
        <span>${energy} / ${ENERGY_MAX}</span>
        <span class="energy-timer" data-energy-timer>${formatRefillCountdown(msUntilNextRefill())}</span>
      </div>
      <div class="daily-slot" id="daily-slot"></div>
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
        <button class="home-tile" data-action="leaderboard" type="button">
          <div class="tile-title">Leaderboard</div>
        </button>
      </div>
    </div>
  `;
  startEnergyTimerLoop();
  root.querySelector("#open-settings")?.addEventListener("click", () => onAction("settings"));
  root.querySelector("#open-tutorial")?.addEventListener("click", () => onAction("tutorial"));
  root.querySelectorAll<HTMLButtonElement>(".home-tile").forEach(btn => {
    btn.addEventListener("click", () => onAction(btn.dataset.action as HomeAction));
  });

  void mountDailyWidget(root);
}

async function mountDailyWidget(root: HTMLElement): Promise<void> {
  const slot = root.querySelector<HTMLElement>("#daily-slot");
  if (!slot) return;
  const status = await fetchDailyStatus();
  if (!status) { slot.innerHTML = ""; return; }
  renderDailyWidget(slot, status);
}

function renderDailyWidget(slot: HTMLElement, status: DailyStatus): void {
  const next = status.todayReward;
  const streakDisplay = status.claimedToday ? status.streak : Math.max(1, status.streak + 1);
  if (status.claimedToday) {
    slot.innerHTML = `
      <div class="daily-card claimed">
        <div class="daily-streak">🔥 Day ${status.streak}</div>
        <div class="daily-claimed-text">Daily reward claimed</div>
        <div class="daily-bonus-line">${formatBonus(status.todayReward, /*active*/ true)}</div>
      </div>
    `;
    return;
  }
  slot.innerHTML = `
    <div class="daily-card">
      <div class="daily-streak">🔥 Day ${streakDisplay}</div>
      <button class="daily-claim-btn" id="daily-claim-btn" type="button">Claim Daily Reward</button>
      <div class="daily-bonus-line">${formatBonus(next, /*active*/ false)}</div>
    </div>
  `;
  slot.querySelector<HTMLButtonElement>("#daily-claim-btn")?.addEventListener("click", async () => {
    const btn = slot.querySelector<HTMLButtonElement>("#daily-claim-btn");
    if (btn) btn.disabled = true;
    const result = await claimDailyBonus();
    if (!result) {
      if (btn) btn.disabled = false;
      alert("Couldn't reach server. Try again.");
      return;
    }
    if (!result.ok) {
      // Race: another tab claimed first; refresh to claimed view.
      renderDailyWidget(slot, {
        streak: result.streak, claimedToday: true,
        todayReward: result.reward, multiplier: result.multiplier,
      });
      return;
    }
    setEnergy(result.energy);
    // Update the energy pill so the bonus shows immediately.
    const pill = document.querySelector<HTMLElement>(".energy-pill span:nth-child(2)");
    if (pill) pill.textContent = `${result.energy} / ${ENERGY_MAX}`;
    renderDailyWidget(slot, {
      streak: result.streak, claimedToday: true,
      todayReward: result.reward, multiplier: result.multiplier,
    });
  });
}

function formatBonus(reward: { energy: number; multiplier: number }, active: boolean): string {
  const verb = active ? "Active today:" : "Today's reward:";
  const mulPart = reward.multiplier > 1 ? ` · ${reward.multiplier}× XP` : "";
  return `${verb} +${reward.energy} energy${mulPart}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  } as Record<string, string>)[c]);
}
