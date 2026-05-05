import { loadSettings, saveSettings } from "./settings";
import { saveServerIgn } from "../auth/ign";

export function renderIgnGate(root: HTMLElement, onComplete: () => void): void {
  root.innerHTML = `
    <div class="wallet-gate">
      <h1>Welcome</h1>
      <p class="wallet-gate__desc">Pick an in-game name to continue.</p>
      <label class="wallet-gate__label">In-game name
        <input id="ig-input" class="wallet-gate__input" type="text" maxlength="24" placeholder="Enter your IGN" autofocus />
      </label>
      <button id="ig-save" class="wallet-gate__btn">Continue</button>
      <p id="ig-status" class="wallet-gate__status"></p>
    </div>
  `;
  const btn = root.querySelector<HTMLButtonElement>("#ig-save")!;
  const input = root.querySelector<HTMLInputElement>("#ig-input")!;
  const status = root.querySelector<HTMLElement>("#ig-status")!;

  const submit = () => {
    const ign = input.value.trim();
    if (!ign) { status.textContent = "Enter an in-game name first."; return; }
    saveSettings({ ...loadSettings(), playerName: ign });
    void saveServerIgn(ign);
    onComplete();
  };

  btn.addEventListener("click", submit);
  input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
}
