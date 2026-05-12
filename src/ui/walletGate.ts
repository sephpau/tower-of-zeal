import { performAuthFlow } from "../auth/wallet";
import { saveSession, Session, clearSession } from "../auth/session";
import { setUserScope } from "../auth/scope";
import { isDevBuild, isAllowedOnDev } from "../auth/devBuild";

export function renderWalletGate(root: HTMLElement, onAuthenticated: (s: Session) => void): void {
  const devBanner = isDevBuild()
    ? `<div class="wallet-gate__dev-banner">🛠 DEV BUILD — restricted to allowlisted wallets</div>`
    : "";
  root.innerHTML = `
    <div class="wallet-gate">
      ${devBanner}
      <h1>Gauntlet Tower</h1>
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
      // Dev build: gate sign-in to allowlisted wallets only. Reject anyone
      // else immediately before we save the session so they can't bypass
      // by editing localStorage.
      if (!isAllowedOnDev(address)) {
        clearSession();
        status.textContent = "This wallet is not on the dev tester allowlist. Use the live build instead.";
        btn.disabled = false;
        return;
      }
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
