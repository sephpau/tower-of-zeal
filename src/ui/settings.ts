// Persistent settings stored in localStorage.
import { addEnergy, getEnergy, ENERGY_MAX, msUntilNextRefill } from "../core/energy";
import { isAdmin } from "../core/admin";
import { scopedKey } from "../auth/scope";
import { saveServerIgn, formatCooldown } from "../auth/ign";
import { adminGrantServerEnergy, adminFillServerEnergy, adminWipeDevServerData } from "../auth/energyApi";
import { isDevBuild } from "../auth/devBuild";
import { confirmModal } from "./confirmModal";
import { clearSession } from "../auth/session";
import { getSfxVolume, setSfxVolume, sfx } from "../core/audio";
import { getBgmVolume, setBgmVolume } from "../core/bgm";

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
          <span class="setting-label">Wallet session</span>
          <div class="wallet-actions">
            <button class="ghost-btn" id="setting-switch-wallet" type="button">Switch Wallet</button>
            <button class="ghost-btn wallet-sign-out" id="setting-sign-out" type="button">Sign Out</button>
          </div>
          <span class="setting-hint">
            <strong>Switch Wallet</strong> ends this session and asks you to re-sign with a different wallet.
            <strong>Sign Out</strong> ends this session entirely. Both require a fresh signature on next login —
            session caching is bypassed, so a tampered localStorage can't impersonate you.
          </span>
        </div>

        <div class="setting-row">
          <span class="setting-label">Audio</span>
          <div class="audio-toggles">
            <label class="toggle">
              <input type="checkbox" id="setting-sfx" ${s.sfxOn ? "checked" : ""} />
              <span>Sound effects</span>
            </label>
            <div class="volume-row">
              <span class="volume-label">SFX volume</span>
              <input type="range" id="setting-sfx-volume" min="0" max="100" step="1" value="${Math.round(getSfxVolume() * 100)}" />
              <span class="volume-value" id="setting-sfx-volume-value">${Math.round(getSfxVolume() * 100)}</span>
            </div>

            <label class="toggle">
              <input type="checkbox" id="setting-bgm" ${s.bgmOn ? "checked" : ""} />
              <span>Background music</span>
            </label>
            <div class="volume-row">
              <span class="volume-label">Music volume</span>
              <input type="range" id="setting-bgm-volume" min="0" max="100" step="1" value="${Math.round(getBgmVolume() * 100)}" />
              <span class="volume-value" id="setting-bgm-volume-value">${Math.round(getBgmVolume() * 100)}</span>
            </div>
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
            ${isDevBuild() ? `
              <div class="admin-row" style="margin-top: 8px;">
                <span class="admin-info">⚠ Dev build only — wipes EVERY wallet's data on this dev environment.</span>
                <button class="ghost-btn" id="admin-wipe-dev" type="button" style="border-color:#ff5a6b;color:#ff5a6b;">Wipe All Dev Data</button>
              </div>
            ` : ""}
          </div>
        ` : ""}

        <div class="setting-actions">
          <button class="confirm-btn" id="save-settings" type="button">Save</button>
        </div>
      </div>
    </div>
  `;

  root.querySelector("#back-btn")?.addEventListener("click", onClose);

  // Volume sliders — apply live (no need to hit Save) so the user hears the
  // change immediately. Persistence is in their own localStorage keys
  // (toz.sfx.volume / toz.bgm.volume) separate from the main settings blob.
  const sfxVolEl = root.querySelector<HTMLInputElement>("#setting-sfx-volume");
  const sfxVolValueEl = root.querySelector<HTMLElement>("#setting-sfx-volume-value");
  sfxVolEl?.addEventListener("input", () => {
    const n = Number(sfxVolEl.value);
    if (sfxVolValueEl) sfxVolValueEl.textContent = String(n);
    setSfxVolume(n / 100);
  });
  sfxVolEl?.addEventListener("change", () => {
    // Single sample on release so the user can hear the new level without
    // spamming clicks during the drag.
    sfx.click();
  });

  const bgmVolEl = root.querySelector<HTMLInputElement>("#setting-bgm-volume");
  const bgmVolValueEl = root.querySelector<HTMLElement>("#setting-bgm-volume-value");
  bgmVolEl?.addEventListener("input", () => {
    const n = Number(bgmVolEl.value);
    if (bgmVolValueEl) bgmVolValueEl.textContent = String(n);
    setBgmVolume(n / 100);
  });

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
  root.querySelector<HTMLButtonElement>("#admin-wipe-dev")?.addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "Wipe All Dev Data?",
      message: `This deletes EVERY wallet's run / energy / leaderboard / replay / progress entry from the dev Redis (KEY_PREFIX=dev:).<br><br>Live data is untouched. After the wipe, the page will reload — you'll need to sign in again.`,
      confirmLabel: "Wipe Everything",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!ok) return;
    const r = await adminWipeDevServerData();
    if (!r.ok) {
      alert(`Wipe failed: ${r.error ?? "unknown"}`);
      return;
    }
    // Also nuke localStorage so the current player isn't left with stale
    // cached state (saved IGN, energy, progress, etc.) that contradicts the
    // empty server.
    try { localStorage.clear(); } catch { /* ignore */ }
    clearSession();
    alert(`Dev wipe complete — scanned ${r.scanned}, deleted ${r.deleted} keys. Reloading…`);
    location.reload();
  });

  root.querySelector<HTMLButtonElement>("#link-wallet")?.addEventListener("click", () => {
    const v = root.querySelector<HTMLInputElement>("#setting-wallet")?.value?.trim() || "";
    alert(v ? `Wallet ${v.slice(0, 10)}… linked (placeholder).` : "Paste an address first.");
  });

  // ---- Wallet session management ----
  // Both actions end the current session and force a fresh signature on next
  // login. The 24-hour JWT auto-restore in bootstrap() is bypassed because
  // clearSession() wipes the stored token entirely — loadSession() will
  // return null on reload, and the wallet gate's challenge → personal_sign →
  // verify dance is the only way back in. This is the defense against a
  // devtools-tampered localStorage impersonating the player's wallet.
  root.querySelector<HTMLButtonElement>("#setting-sign-out")?.addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "Sign Out?",
      message: "End this session and return to the wallet gate. Next login will require a fresh signature in your wallet.",
      confirmLabel: "Sign Out",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    clearSession();
    location.reload();
  });
  root.querySelector<HTMLButtonElement>("#setting-switch-wallet")?.addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "Switch Wallet?",
      message: "End this session and let you re-sign in with a different wallet. You'll be asked to <strong>sign a fresh challenge</strong> with the new wallet — there's no way to switch without a signature, so devtools can't change your linked wallet on you.",
      confirmLabel: "Switch Wallet",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    clearSession();
    // Also clear the player-name + cached wallet-address from settings so the
    // wallet gate doesn't pre-fill stale info from the previous wallet.
    try {
      const cur = loadSettings();
      saveSettings({ ...cur, walletAddress: "" });
    } catch { /* ignore */ }
    location.reload();
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
