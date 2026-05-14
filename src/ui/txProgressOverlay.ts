// Full-screen transaction-progress overlay for shop purchases.
// Blocks all interaction with the page while the tx is in flight, so the
// player can't accidentally click around / start a new buy / leave the screen
// mid-flow. Walks through the states:
//   approving    — wallet popup is open, waiting for the player to sign
//   broadcasting — wallet has accepted the tx, sending to the network
//   verifying    — tx broadcast, server confirming receipt on-chain
//   complete     — item granted, item card shown, single Close button
//   failed       — error state, shows reason + tx hash if available
//
// The wallet's own "preview transaction" UI shows generic from/to/value info
// we can't customize — this overlay sits in the dApp and gives the player
// the context the wallet doesn't: WHAT item, HOW MUCH, WHICH WALLET, NEXT STEP.

export type TxState = "approving" | "broadcasting" | "verifying" | "complete" | "failed";

export interface TxProgressOptions {
  itemName: string;
  itemIcon: string;
  /** Optional /public/path/to/icon.svg — preferred over emoji when present. */
  itemIconUrl?: string;
  priceLabel: string;
  walletName: string;
  walletIconUrl?: string;
  walletIcon: string;
}

export interface TxProgressController {
  setState(state: TxState, extras?: { txHash?: string; reason?: string }): void;
  /** Programmatic close (e.g., player clicked Close on the complete card). */
  close(): void;
  /** Resolves when the player dismisses the overlay (Close button OR
   *  Cancel button on the approving state). */
  closed: Promise<void>;
}

export function showTxProgress(opts: TxProgressOptions): TxProgressController {
  // Drop any prior overlay first.
  document.querySelectorAll(".txp-overlay").forEach(el => el.remove());

  const overlay = document.createElement("div");
  overlay.className = "txp-overlay";
  overlay.innerHTML = `
    <div class="txp-card" role="dialog" aria-modal="true" aria-labelledby="txp-title">
      <div class="txp-item-card" id="txp-item-card">
        ${renderItemCard(opts)}
      </div>
      <div class="txp-body" id="txp-body">
        <!-- State-specific content slots in here -->
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  let resolveClosed: () => void = () => {};
  const closed = new Promise<void>(res => { resolveClosed = res; });

  const close = (): void => {
    overlay.remove();
    resolveClosed();
  };

  const setState = (state: TxState, extras: { txHash?: string; reason?: string } = {}): void => {
    const body = overlay.querySelector<HTMLElement>("#txp-body");
    if (!body) return;
    body.innerHTML = renderStateContent(state, opts, extras);
    // Update card outline color via class hook.
    overlay.querySelector(".txp-card")?.classList.remove(
      "txp-state-approving", "txp-state-broadcasting", "txp-state-verifying",
      "txp-state-complete", "txp-state-failed",
    );
    overlay.querySelector(".txp-card")?.classList.add(`txp-state-${state}`);
    // Wire close buttons on terminal states + cancel during approving.
    body.querySelectorAll<HTMLButtonElement>("[data-txp-close]").forEach(b => {
      b.addEventListener("click", close);
    });
  };

  // Initial state — wallet popup is opening.
  setState("approving");

  // Block Escape — the player has to explicitly choose Cancel or Close.
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") e.preventDefault();
  };
  document.addEventListener("keydown", onKey, true);
  void closed.then(() => document.removeEventListener("keydown", onKey, true));

  return { setState, close, closed };
}

function renderItemCard(o: TxProgressOptions): string {
  const itemIcon = o.itemIconUrl
    ? `<img class="txp-item-icon-img" src="${escapeAttr(o.itemIconUrl)}" alt="" />`
    : `<span class="txp-item-icon-glyph">${o.itemIcon}</span>`;
  const walletIcon = o.walletIconUrl
    ? `<img class="txp-wallet-icon-img" src="${escapeAttr(o.walletIconUrl)}" alt="" />`
    : `<span class="txp-wallet-icon-glyph">${o.walletIcon}</span>`;
  return `
    <div class="txp-item-row">
      ${itemIcon}
      <div class="txp-item-meta">
        <div class="txp-item-name">${escapeText(o.itemName)}</div>
        <div class="txp-item-price">${escapeText(o.priceLabel)}</div>
      </div>
    </div>
    <div class="txp-wallet-row">
      <span class="txp-wallet-label">Paying from</span>
      ${walletIcon}
      <span class="txp-wallet-name">${escapeText(o.walletName)}</span>
    </div>
  `;
}

function renderStateContent(state: TxState, o: TxProgressOptions, extras: { txHash?: string; reason?: string }): string {
  switch (state) {
    case "approving":
      return `
        <div class="txp-spinner"></div>
        <div class="txp-title" id="txp-title">Approve in ${escapeText(o.walletName)}</div>
        <div class="txp-sub">
          Your wallet has opened a transaction preview. Approve <strong>${escapeText(o.priceLabel)}</strong> to ${escapeText(o.itemName)} to continue.
        </div>
        <div class="txp-actions">
          <button class="ghost-btn txp-cancel" data-txp-close type="button">Cancel</button>
        </div>
      `;
    case "broadcasting":
      return `
        <div class="txp-spinner"></div>
        <div class="txp-title">Broadcasting…</div>
        <div class="txp-sub">Your wallet is sending the transaction to the Ronin network. Don't close this tab.</div>
      `;
    case "verifying": {
      const hashHtml = extras.txHash
        ? `<div class="txp-hash"><span class="txp-hash-label">Tx hash</span><span class="motz-tx-hash">${escapeText(extras.txHash)}</span></div>`
        : "";
      // If the caller passes a `reason` while in verifying state, treat it
      // as a status update (retry-progress message) and show it as the body.
      const sub = extras.reason
        ? escapeText(extras.reason)
        : "Waiting for 3 block confirmations. This usually takes ~10 seconds. Don't close this tab.";
      return `
        <div class="txp-spinner"></div>
        <div class="txp-title">Verifying on-chain…</div>
        <div class="txp-sub">${sub}</div>
        ${hashHtml}
      `;
    }
    case "complete":
      return `
        <div class="txp-check">✓</div>
        <div class="txp-title">Purchase Complete!</div>
        <div class="txp-sub">
          <strong>${escapeText(o.itemName)}</strong> has been added to your <strong>Inventory</strong> (Backpack icon).
        </div>
        ${extras.txHash ? `<div class="txp-hash"><span class="txp-hash-label">Tx hash</span><span class="motz-tx-hash">${escapeText(extras.txHash)}</span></div>` : ""}
        <div class="txp-actions">
          <button class="confirm-btn" data-txp-close type="button">Close</button>
        </div>
      `;
    case "failed":
      return `
        <div class="txp-x">✕</div>
        <div class="txp-title">Purchase Failed</div>
        <div class="txp-sub">${escapeText(extras.reason ?? "Something went wrong.")}</div>
        ${extras.txHash ? `<div class="txp-hash"><span class="txp-hash-label">Tx hash</span><span class="motz-tx-hash">${escapeText(extras.txHash)}</span><div class="txp-hash-note">Your RON was sent — save this hash and contact support if the item wasn't granted.</div></div>` : ""}
        <div class="txp-actions">
          <button class="ghost-btn" data-txp-close type="button">Close</button>
        </div>
      `;
  }
}

function escapeText(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  } as Record<string, string>)[c]);
}
function escapeAttr(s: string): string { return escapeText(s); }
