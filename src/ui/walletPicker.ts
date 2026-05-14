// Wallet picker modal — shows every detected EIP-1193 wallet and lets the
// player choose which one to pay from. Resolves with the chosen WalletOption,
// or null if the player cancels (Escape, backdrop click, or Cancel button).
//
// Patterned after confirmModal so it slots into existing UI flows without
// new dependencies.

import { discoverWallets, WalletOption } from "../auth/payment";

export function pickWalletModal(opts: { title?: string; subtitle?: string } = {}): Promise<WalletOption | null> {
  const { title = "Choose a Wallet", subtitle = "Pick the wallet you want to pay from" } = opts;
  return new Promise<WalletOption | null>(resolve => {
    document.querySelectorAll(".wallet-picker-overlay").forEach(el => el.remove());

    const overlay = document.createElement("div");
    overlay.className = "wallet-picker-overlay";
    overlay.innerHTML = `
      <div class="wallet-picker-card" role="dialog" aria-modal="true" aria-labelledby="wallet-picker-title">
        <div class="wallet-picker-title" id="wallet-picker-title">${escapeText(title)}</div>
        <div class="wallet-picker-sub">${escapeText(subtitle)}</div>
        <div class="wallet-picker-list" id="wallet-picker-list">
          <div class="wallet-picker-loading">Detecting wallets…</div>
        </div>
        <div class="wallet-picker-actions">
          <button class="ghost-btn wallet-picker-cancel" type="button">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cleanup = (result: WalletOption | null) => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cleanup(null);
    };
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", e => {
      if (e.target === overlay) cleanup(null);
    });
    overlay.querySelector<HTMLButtonElement>(".wallet-picker-cancel")?.addEventListener("click", () => cleanup(null));

    // Async-load wallet options + render.
    void (async () => {
      const list = overlay.querySelector<HTMLElement>("#wallet-picker-list");
      if (!list) return;
      const options = await discoverWallets();
      if (options.length === 0) {
        list.innerHTML = `
          <div class="wallet-picker-empty">
            <div class="wallet-picker-empty-icon">💼</div>
            <div class="wallet-picker-empty-title">No wallet detected</div>
            <div class="wallet-picker-empty-sub">
              Install one of these to continue:
              <ul>
                <li><a href="https://wallet.roninchain.com/" target="_blank" rel="noreferrer">Ronin Wallet</a></li>
                <li><a href="https://metamask.io/" target="_blank" rel="noreferrer">MetaMask</a></li>
                <li><a href="https://rabby.io/" target="_blank" rel="noreferrer">Rabby</a></li>
              </ul>
              Then refresh this page.
            </div>
          </div>
        `;
        return;
      }
      list.innerHTML = options.map((opt, i) => `
        <button class="wallet-pick-btn" data-wallet-idx="${i}" type="button">
          <span class="wallet-pick-icon">${opt.icon}</span>
          <span class="wallet-pick-name">${escapeText(opt.name)}</span>
          <span class="wallet-pick-status">${opt.detected ? "Detected" : "Open"}</span>
        </button>
      `).join("");
      list.querySelectorAll<HTMLButtonElement>("[data-wallet-idx]").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.dataset.walletIdx);
          if (Number.isInteger(idx) && options[idx]) cleanup(options[idx]);
        });
      });
    })();
  });
}

function escapeText(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  } as Record<string, string>)[c]);
}
