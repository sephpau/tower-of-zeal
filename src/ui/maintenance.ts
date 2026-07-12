/** Full-screen maintenance gate for Gauntlet Tower.
 *
 *  When MAINTENANCE_MODE is on (see main.ts), bootstrap() renders this screen
 *  INSTEAD of the wallet gate / game, so every mode (Tower, Survival, Boss
 *  Raid) is stopped at the door — no run can be started while it's up.
 *
 *  To bring the game back online: set MAINTENANCE_MODE = false in main.ts and
 *  redeploy. */
export function renderMaintenance(root: HTMLElement): void {
  root.innerHTML = `
    <div class="maintenance-gate">
      <div class="maintenance-gate__icon" aria-hidden="true">🛠️</div>
      <h1>Under Maintenance</h1>
      <p class="maintenance-gate__desc">
        Gauntlet Tower is currently down for maintenance and development.
        All game modes are temporarily unavailable.
      </p>
      <p class="maintenance-gate__thanks">Thank you for your patience — we'll be back soon. 🙏</p>
    </div>
  `;
}
