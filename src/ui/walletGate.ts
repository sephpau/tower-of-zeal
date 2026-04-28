import { performAuthFlow } from "../auth/wallet";
import { saveSession, Session } from "../auth/session";

export function renderWalletGate(root: HTMLElement, onAuthenticated: (s: Session) => void): void {
  root.innerHTML = `
    <div class="wallet-gate">
      <h1>Tower of Zeal</h1>
      <p class="wallet-gate__desc">Connect your Ronin wallet to verify NFT ownership and play.</p>
      <button id="wg-connect" class="wallet-gate__btn">Connect Ronin Wallet</button>
      <p id="wg-status" class="wallet-gate__status"></p>
    </div>
  `;
  const btn = root.querySelector<HTMLButtonElement>("#wg-connect")!;
  const status = root.querySelector<HTMLElement>("#wg-status")!;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.textContent = "Connecting...";
    try {
      const { token, address } = await performAuthFlow();
      const session: Session = { token, address };
      saveSession(session);
      status.textContent = "Authenticated.";
      onAuthenticated(session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      status.textContent = `Failed: ${msg}`;
      btn.disabled = false;
    }
  });
}
