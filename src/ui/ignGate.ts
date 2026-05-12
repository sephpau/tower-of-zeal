import { loadSettings, saveSettings } from "./settings";
import { saveServerIgn } from "../auth/ign";

export function renderIgnGate(root: HTMLElement, onComplete: () => void): void {
  root.innerHTML = `
    <div class="wallet-gate">
      <h1>Welcome, Legend</h1>
      <p class="wallet-gate__desc">Pick the name your party calls you in battle. Up to 24 characters.</p>
      <label class="wallet-gate__label">In-game name
        <input id="ig-input" class="wallet-gate__input" type="text" maxlength="24" placeholder="e.g. Sephpau" autofocus />
      </label>
      <button id="ig-save" class="wallet-gate__btn">Enter the Tower</button>
      <p id="ig-status" class="wallet-gate__status"></p>
    </div>
  `;
  const btn = root.querySelector<HTMLButtonElement>("#ig-save")!;
  const input = root.querySelector<HTMLInputElement>("#ig-input")!;
  const status = root.querySelector<HTMLElement>("#ig-status")!;

  const setStatus = (text: string, state: "info" | "success" | "error" | "idle" = "idle"): void => {
    status.textContent = text;
    status.classList.remove("is-info", "is-success", "is-error");
    if (state !== "idle") status.classList.add(`is-${state}`);
  };

  const submit = () => {
    const ign = input.value.trim();
    if (!ign) {
      setStatus("Enter an in-game name first.", "error");
      input.focus();
      return;
    }
    setStatus("Saving…", "info");
    saveSettings({ ...loadSettings(), playerName: ign });
    void saveServerIgn(ign).then(r => { void r; });
    onComplete();
  };

  btn.addEventListener("click", submit);
  input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
  input.addEventListener("input", () => {
    // Clear stale error state once the user starts correcting their input.
    if (status.classList.contains("is-error")) setStatus("");
  });
}
