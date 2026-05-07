// Game-styled drop-in replacement for window.confirm. Centered modal with the
// project's Cinzel/gold aesthetic. Resolves to true on confirm, false on
// cancel / Escape / backdrop click.

export interface ConfirmOptions {
  title?: string;
  /** Body. May contain HTML — sanitize on the caller side if it's user input. */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, the confirm button is styled as a destructive red action. */
  danger?: boolean;
}

export function confirmModal(opts: ConfirmOptions): Promise<boolean> {
  const {
    title = "Confirm",
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
  } = opts;

  return new Promise<boolean>(resolve => {
    // Strip any prior modal so we never stack two.
    document.querySelectorAll(".game-confirm-overlay").forEach(el => el.remove());

    const overlay = document.createElement("div");
    overlay.className = "game-confirm-overlay";
    overlay.innerHTML = `
      <div class="game-confirm-card" role="dialog" aria-modal="true" aria-labelledby="game-confirm-title">
        <div class="game-confirm-title" id="game-confirm-title">${escapeText(title)}</div>
        <div class="game-confirm-body">${message}</div>
        <div class="game-confirm-actions">
          <button class="confirm-btn ghost-btn game-confirm-cancel" type="button">${escapeText(cancelLabel)}</button>
          <button class="confirm-btn ${danger ? "danger-btn" : ""} game-confirm-ok" type="button">${escapeText(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = (result: boolean): void => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close(false);
      else if (e.key === "Enter") close(true);
    };

    overlay.querySelector<HTMLButtonElement>(".game-confirm-ok")!.addEventListener("click", () => close(true));
    overlay.querySelector<HTMLButtonElement>(".game-confirm-cancel")!.addEventListener("click", () => close(false));
    overlay.addEventListener("click", e => {
      if (e.target === overlay) close(false);
    });
    document.addEventListener("keydown", onKey);

    // Focus the confirm button so Enter/Space activates it.
    setTimeout(() => overlay.querySelector<HTMLButtonElement>(".game-confirm-ok")?.focus(), 0);
  });
}

function escapeText(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  } as Record<string, string>)[c]);
}
