import { performAuthFlow } from "../auth/wallet";
import { saveSession, Session } from "../auth/session";
import { setUserScope } from "../auth/scope";
import { loadSettings, saveSettings } from "./settings";

export function renderWalletGate(root: HTMLElement, onAuthenticated: (s: Session) => void): void {
  root.innerHTML = `
    <div class="wallet-gate">
      <h1>Tower of Zeal</h1>
      <p class="wallet-gate__desc">Connect your Ronin wallet to verify NFT ownership and play.</p>
      <label class="wallet-gate__label">In-game name
        <input id="wg-ign" class="wallet-gate__input" type="text" maxlength="24" placeholder="Enter your IGN" />
      </label>
      <button id="wg-connect" class="wallet-gate__btn">Connect Ronin Wallet</button>
      <p id="wg-status" class="wallet-gate__status"></p>
    </div>
  `;
  const btn = root.querySelector<HTMLButtonElement>("#wg-connect")!;
  const status = root.querySelector<HTMLElement>("#wg-status")!;
  const ignInput = root.querySelector<HTMLInputElement>("#wg-ign")!;

  btn.addEventListener("click", async () => {
    const ign = ignInput.value.trim();
    if (!ign) {
      status.textContent = "Enter an in-game name first.";
      return;
    }
    btn.disabled = true;
    ignInput.disabled = true;
    status.textContent = "Connecting...";
    try {
      const { token, address } = await performAuthFlow();
      const session: Session = { token, address };
      saveSession(session);
      // Scope must be set before saving settings so the IGN lands in the wallet's namespace.
      setUserScope(address);
      const cur = loadSettings();
      saveSettings({ ...cur, playerName: ign });
      status.textContent = "Authenticated.";
      onAuthenticated(session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      status.textContent = `Failed: ${msg}`;
      btn.disabled = false;
      ignInput.disabled = false;
    }
  });
}
