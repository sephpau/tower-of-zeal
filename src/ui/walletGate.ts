import { performAuthFlow } from "../auth/wallet";
import { saveSession, Session } from "../auth/session";
import { setUserScope } from "../auth/scope";

export function renderWalletGate(root: HTMLElement, onAuthenticated: (s: Session) => void): void {
  root.innerHTML = `
    <div class="wallet-gate">
      <h1>The Gauntlet Tower</h1>
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
      // Scope must be set so any later IGN write lands in the wallet's namespace.
      setUserScope(address);
      status.textContent = "Authenticated.";
      // proceedAfterAuth() in main.ts decides whether to show the IGN gate
      // (new wallet) or load the server-saved IGN (returning wallet).
      onAuthenticated(session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      status.textContent = `Failed: ${msg}`;
      btn.disabled = false;
    }
  });
}
