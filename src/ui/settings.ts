// Persistent settings stored in localStorage.
import { addEnergy, getEnergy, ENERGY_MAX, msUntilNextRefill } from "../core/energy";
import { isAdmin } from "../core/admin";
import { scopedKey } from "../auth/scope";
import { saveServerIgn, formatCooldown } from "../auth/ign";
import { adminGrantServerEnergy, adminFillServerEnergy } from "../auth/energyApi";

export interface Settings {
  playerName: string;
  walletAddress: string;
  sfxOn: boolean;
  bgmOn: boolean;
  /** Dev override: when true, the units screen lets you change classes anytime. */
  devUnlockClass: boolean;
}

const KEY = () => scopedKey("stat-battler.settings.v1");

const DEFAULTS: Settings = {
  playerName: "",
  walletAddress: "",
  sfxOn: true,
  bgmOn: true,
  devUnlockClass: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY());
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY(), JSON.stringify(s));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function renderSettings(root: HTMLElement, onClose: () => void): void {
  const s = loadSettings();
  root.innerHTML = `
    <div class="screen-frame">
      ${topBarHtml("Settings", true)}
      <div class="settings-panel">
        <label class="setting-row">
          <span class="setting-label">Player name</span>
          <input id="setting-name" type="text" maxlength="24" value="${escapeAttr(s.playerName)}" />
          <span class="setting-hint">You can only change your name once every 7 days.</span>
          <span id="ign-status" class="setting-hint" style="color: var(--gold-bright);"></span>
        </label>

        <label class="setting-row">
          <span class="setting-label">Wallet address</span>
          <input id="setting-wallet" type="text" value="${escapeAttr(s.walletAddress)}" readonly />
          <span class="setting-hint">Linked via Ronin wallet at sign-in.</span>
        </label>

        <div class="setting-row">
          <span class="setting-label">Audio</span>
          <div class="audio-toggles">
            <label class="toggle">
              <input type="checkbox" id="setting-sfx" ${s.sfxOn ? "checked" : ""} />
              <span>Sound effects</span>
            </label>
            <label class="toggle">
              <input type="checkbox" id="setting-bgm" ${s.bgmOn ? "checked" : ""} />
              <span>Background music</span>
            </label>
          </div>
        </div>

        ${isAdmin() ? `
          <div class="setting-row">
            <span class="setting-label">Admin</span>
            <div class="admin-row">
              <span class="admin-info">Energy ${getEnergy()}/${ENERGY_MAX} · refills in ${formatHrs(msUntilNextRefill())}</span>
              <button class="ghost-btn" id="admin-add-energy" type="button">+5 Energy</button>
              <button class="ghost-btn" id="admin-fill-energy" type="button">Refill Max</button>
            </div>
            <label class="toggle">
              <input type="checkbox" id="setting-dev-class" ${s.devUnlockClass ? "checked" : ""} />
              <span>Allow class re-pick anytime</span>
            </label>
          </div>
        ` : ""}

        <div class="setting-actions">
          <button class="confirm-btn" id="save-settings" type="button">Save</button>
        </div>
      </div>
    </div>
  `;

  root.querySelector("#back-btn")?.addEventListener("click", onClose);

  root.querySelector<HTMLButtonElement>("#save-settings")?.addEventListener("click", async () => {
    const newName = (root.querySelector<HTMLInputElement>("#setting-name")?.value || DEFAULTS.playerName).trim();
    const status = root.querySelector<HTMLElement>("#ign-status");

    let finalName = newName;
    if (newName !== s.playerName && newName) {
      const result = await saveServerIgn(newName);
      if (!result.ok) {
        if (result.reason === "cooldown") {
          if (status) status.textContent = `Name change on cooldown — try again in ${formatCooldown(result.nextAllowedAt)}.`;
          finalName = result.serverIgn;
          const input = root.querySelector<HTMLInputElement>("#setting-name");
          if (input) input.value = result.serverIgn;
          // Don't close — let the user see the error.
          // Still save the other settings below.
        } else if (result.reason === "invalid") {
          if (status) status.textContent = "Name is invalid (empty or too long).";
          return;
        } else {
          if (status) status.textContent = "Couldn't reach the server — name not saved online.";
        }
      }
    }

    const next: Settings = {
      playerName: finalName,
      walletAddress: s.walletAddress,
      sfxOn: !!root.querySelector<HTMLInputElement>("#setting-sfx")?.checked,
      bgmOn: !!root.querySelector<HTMLInputElement>("#setting-bgm")?.checked,
      devUnlockClass: !!root.querySelector<HTMLInputElement>("#setting-dev-class")?.checked,
    };
    saveSettings(next);
    if (finalName === newName) onClose();
  });

  root.querySelector<HTMLButtonElement>("#admin-add-energy")?.addEventListener("click", async () => {
    const amt = await adminGrantServerEnergy(5);
    if (amt === null) { addEnergy(5); alert("Server unreachable — local-only +5 (won't persist)."); }
    onClose(); renderSettings(root, onClose);
  });
  root.querySelector<HTMLButtonElement>("#admin-fill-energy")?.addEventListener("click", async () => {
    const amt = await adminFillServerEnergy();
    if (amt === null) { addEnergy(ENERGY_MAX); alert("Server unreachable — local-only fill (won't persist)."); }
    onClose(); renderSettings(root, onClose);
  });

  root.querySelector<HTMLButtonElement>("#link-wallet")?.addEventListener("click", () => {
    const v = root.querySelector<HTMLInputElement>("#setting-wallet")?.value?.trim() || "";
    alert(v ? `Wallet ${v.slice(0, 10)}… linked (placeholder).` : "Paste an address first.");
  });
}

export function topBarHtml(title: string, withBack: boolean): string {
  return `
    <div class="top-bar">
      ${withBack ? `<button class="back-btn" id="back-btn" type="button">← Back</button>` : `<div></div>`}
      <h1 class="screen-title">${escapeHtml(title)}</h1>
      <div></div>
    </div>
  `;
}

function formatHrs(ms: number): string {
  const h = Math.max(0, Math.floor(ms / 3600000));
  const m = Math.max(0, Math.floor((ms % 3600000) / 60000));
  return `${h}h ${m}m`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  } as Record<string, string>)[c]);
}
function escapeAttr(s: string): string { return escapeHtml(s); }
