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

export interface AlertOptions {
  title?: string;
  /** Body. May contain HTML — sanitize on the caller side if it's user input. */
  message: string;
  okLabel?: string;
  /** Visual flavor — drives the title color + dot accent. */
  kind?: "info" | "warning" | "error" | "success";
}

/** Game-styled drop-in replacement for window.alert. Single OK button.
 *  Resolves when the user dismisses (OK click, Enter, Escape, or backdrop). */
export function alertModal(opts: AlertOptions): Promise<void> {
  const {
    title,
    message,
    okLabel = "OK",
    kind = "info",
  } = opts;
  // Default titles per kind so callers can skip passing one for common cases.
  const defaultTitles: Record<NonNullable<AlertOptions["kind"]>, string> = {
    info: "Notice",
    warning: "Heads Up",
    error: "Something Went Wrong",
    success: "Done",
  };
  const finalTitle = title ?? defaultTitles[kind];

  return new Promise<void>(resolve => {
    document.querySelectorAll(".game-confirm-overlay").forEach(el => el.remove());

    const overlay = document.createElement("div");
    overlay.className = "game-confirm-overlay";
    overlay.innerHTML = `
      <div class="game-confirm-card game-alert-card game-alert-${kind}" role="alertdialog" aria-modal="true" aria-labelledby="game-alert-title">
        <div class="game-alert-icon" aria-hidden="true">${alertGlyph(kind)}</div>
        <div class="game-confirm-title game-alert-title" id="game-alert-title">${escapeText(finalTitle)}</div>
        <div class="game-confirm-body">${message}</div>
        <div class="game-confirm-actions">
          <button class="confirm-btn game-confirm-ok" type="button">${escapeText(okLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = (): void => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      resolve();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" || e.key === "Enter") close();
    };

    overlay.querySelector<HTMLButtonElement>(".game-confirm-ok")!.addEventListener("click", close);
    overlay.addEventListener("click", e => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", onKey);

    setTimeout(() => overlay.querySelector<HTMLButtonElement>(".game-confirm-ok")?.focus(), 0);
  });
}

function alertGlyph(kind: NonNullable<AlertOptions["kind"]>): string {
  switch (kind) {
    case "warning": return "⚠";
    case "error":   return "✕";
    case "success": return "✓";
    case "info":    return "ⓘ";
  }
}

export interface PromptOptions {
  title?: string;
  message: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/** Game-styled drop-in replacement for window.prompt. Used by destructive
 *  admin actions where we need the user to type a phrase verbatim before
 *  proceeding. Resolves to the entered string on confirm, or null on
 *  cancel / Escape / backdrop click. */
export function promptModal(opts: PromptOptions): Promise<string | null> {
  const {
    title = "Type to Confirm",
    message,
    placeholder = "",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
  } = opts;

  return new Promise<string | null>(resolve => {
    document.querySelectorAll(".game-confirm-overlay").forEach(el => el.remove());

    const overlay = document.createElement("div");
    overlay.className = "game-confirm-overlay";
    overlay.innerHTML = `
      <div class="game-confirm-card" role="dialog" aria-modal="true" aria-labelledby="game-prompt-title">
        <div class="game-confirm-title" id="game-prompt-title">${escapeText(title)}</div>
        <div class="game-confirm-body">${message}</div>
        <input class="game-prompt-input" id="game-prompt-input" type="text" placeholder="${escapeText(placeholder)}" autocomplete="off" spellcheck="false" />
        <div class="game-confirm-actions">
          <button class="confirm-btn ghost-btn game-confirm-cancel" type="button">${escapeText(cancelLabel)}</button>
          <button class="confirm-btn ${danger ? "danger-btn" : ""} game-confirm-ok" type="button">${escapeText(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector<HTMLInputElement>("#game-prompt-input")!;

    const close = (result: string | null): void => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close(null);
      else if (e.key === "Enter") close(input.value);
    };

    overlay.querySelector<HTMLButtonElement>(".game-confirm-ok")!.addEventListener("click", () => close(input.value));
    overlay.querySelector<HTMLButtonElement>(".game-confirm-cancel")!.addEventListener("click", () => close(null));
    overlay.addEventListener("click", e => {
      if (e.target === overlay) close(null);
    });
    document.addEventListener("keydown", onKey);

    setTimeout(() => input.focus(), 0);
  });
}
