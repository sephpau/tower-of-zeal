// Three-option reward picker shown between Boss Raid floors.
//
// 1. Heal      — restores 20% HP/MP at start of next floor (one-shot)
// 2. Boost     — +10% player stats for the rest of the run (stacks)
// 3. Weaken    — −5% next boss stats for the rest of the run (stacks)

export type BossRaidReward = "heal" | "boost" | "weaken";

interface RewardMeta { name: string; desc: string; cls: string; }
const REWARDS: Record<BossRaidReward, RewardMeta> = {
  heal:   { name: "Restore", desc: "Heal 20% of HP and MP for the next floor.", cls: "heal" },
  boost:  { name: "Empower", desc: "+10% to your party's stats for the rest of the run.", cls: "boost" },
  weaken: { name: "Weaken",  desc: "−5% to upcoming boss stats for the rest of the run.", cls: "weaken" },
};

export function showBossRaidReward(root: HTMLElement, onPick: (r: BossRaidReward) => void): void {
  // Append, don't replace — battle UI stays visible behind the dimmed overlay.
  const overlay = document.createElement("div");
  overlay.className = "br-reward-overlay";
  root.appendChild(overlay);

  const renderPick = () => {
    overlay.innerHTML = `
      <div class="br-reward-card">
        <div class="br-reward-title">Boss Down — Pick a Boon</div>
        <div class="br-reward-grid">
          ${(Object.keys(REWARDS) as BossRaidReward[]).map(k => `
            <button class="br-reward-option ${REWARDS[k].cls}" data-r="${k}" type="button">
              <div class="br-reward-icon">${k === "heal" ? "+HP" : k === "boost" ? "▲" : "▼"}</div>
              <div class="br-reward-name">${REWARDS[k].name}</div>
              <div class="br-reward-desc">${REWARDS[k].desc}</div>
            </button>
          `).join("")}
        </div>
      </div>
    `;
    overlay.querySelectorAll<HTMLButtonElement>("[data-r]").forEach(btn => {
      btn.addEventListener("click", () => {
        renderConfirm(btn.dataset.r as BossRaidReward);
      });
    });
  };

  const renderConfirm = (choice: BossRaidReward) => {
    const meta = REWARDS[choice];
    overlay.innerHTML = `
      <div class="br-reward-card">
        <div class="br-reward-title">Confirm Choice</div>
        <div class="br-confirm-body">
          <div class="br-reward-option ${meta.cls} br-confirm-preview">
            <div class="br-reward-name">${meta.name}</div>
            <div class="br-reward-desc">${meta.desc}</div>
          </div>
          <p class="br-confirm-prompt">Lock in this boon? You can't change it once you continue.</p>
          <div class="br-confirm-actions">
            <button class="ghost-btn" id="br-confirm-back" type="button">Back</button>
            <button class="confirm-btn" id="br-confirm-yes" type="button">Confirm</button>
          </div>
        </div>
      </div>
    `;
    overlay.querySelector<HTMLButtonElement>("#br-confirm-back")?.addEventListener("click", renderPick);
    overlay.querySelector<HTMLButtonElement>("#br-confirm-yes")?.addEventListener("click", () => {
      overlay.remove();
      onPick(choice);
    });
  };

  renderPick();
}
