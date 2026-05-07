// In-game Codex / glossary screen. Static reference for stats, universal
// actions, effect tags, and the three stat sources.

import { topBarHtml } from "./settings";

export function renderCodex(root: HTMLElement, onBack: () => void): void {
  root.innerHTML = `
    <div class="screen-frame codex-screen">
      <div class="codex-sticky-header">
        ${topBarHtml("Codex", true)}
      </div>

      <div class="codex-body">

        <section class="codex-section">
          <h2 class="codex-h2">🎮 Game Modes</h2>
          <p class="codex-intro">Three ways to play — pick what you're trying to accomplish.</p>
          <div class="codex-list">
            <div class="codex-mode mode-floor">
              <div class="codex-mode-head">Normal Floor Run</div>
              <p>The main progression loop. Pick a single floor (1–50) and battle through it. <strong>Where you level up your units</strong> — XP rewards are awarded at full multiplier. Floor 1 unlocks Floor 2 only on a successful clear; the tower opens up sequentially. 1 energy per attempt; 3 free retries per day on a defeat before energy is consumed again.</p>
            </div>
            <div class="codex-mode mode-survival">
              <div class="codex-mode-head">Survival Mode</div>
              <p>Start from Floor 1 and keep going as far as you can — every cleared floor carries your party's HP/MP/cooldowns into the next, no rest. Run ends the moment your whole party falls. <em>Prove you are the strongest.</em> XP earned in survival is heavily reduced (1/50× the floor mode rate) — this is a leaderboard mode, not a leveling mode.</p>
            </div>
            <div class="codex-mode mode-bossraid">
              <div class="codex-mode-head">Boss Raid</div>
              <p>Fight every solo boss in the tower back-to-back: Stone Sentinel → Wraith Lord → Tower Lord → Iron Behemoth → Storm Lord → Demon General → Witch Queen → Dragon Lord → Tower God → World Ender. Bosses are scaled up (~2× stats, +25% ATB) and you pick a boon between fights (Heal / Boost / Weaken). XP = 1/10× floor mode. Top times go on the Boss Raid leaderboard.</p>
            </div>
          </div>
        </section>

        <section class="codex-section">
          <h2 class="codex-h2">📊 Stats</h2>
          <p class="codex-intro">Each stat feeds multiple derived combat values.</p>
          <div class="codex-grid">
            ${statCard("STR", "Strength",
              `Drives physical attack power. Adds to <em>physAtk</em> ×3 and gives small bumps to HP and both defenses.`,
              ["+3 per point to physical attack", "+3 per point to max HP", "+1 per point to phys/mag defense"])}
            ${statCard("DEX", "Dexterity",
              `Accuracy + critical hits + armor penetration. Hits more often, lands more crits, and ignores part of the target's defense.`,
              ["+3 per point to accuracy", "+2 per point to crit chance", "+1% armor penetration per point (cap 50%)"])}
            ${statCard("AGI", "Agility",
              `Speed of the ATB gauge and evasion. High AGI = more turns and dodge incoming hits more often.`,
              ["Sets ATB speed (faster gauge fill)", "+1% evade per point", "+1 to physical attack"])}
            ${statCard("VIT", "Vitality",
              `Toughness. Mostly HP, with a smaller defensive contribution.`,
              ["+10 per point to max HP", "+1 per point to phys/mag defense"])}
            ${statCard("INT", "Intelligence",
              `Magic damage + mana pool. Casters live and die by INT.`,
              ["+3 per point to magical attack", "+10 per point to max MP", "+2 per point to magic defense"])}
            ${statCard("DEF", "Defense",
              `Pure defensive stat. Reduces incoming damage on both attack types.`,
              ["+3 per point to physical defense", "+2 per point to magical defense", "+5 per point to max HP"])}
          </div>
        </section>

        <section class="codex-section">
          <h2 class="codex-h2">🧬 Three Sources of Stats</h2>
          <div class="codex-list">
            <div class="codex-source unit">
              <div class="codex-source-head">Unit Base</div>
              <p>Innate stats from the character template (e.g., Hera's INT-heavy line). Grow with level.</p>
            </div>
            <div class="codex-source class">
              <div class="codex-source-head">Class Base</div>
              <p>Layer added when a class is assigned (available from Lv 1). Grows with level on top of the unit's base.</p>
            </div>
            <div class="codex-source custom">
              <div class="codex-source-head">Custom (Allocatable)</div>
              <p>Spendable points earned on level-up — 4 per level. You distribute them by hand on the Units screen and they stay locked once finalized.</p>
            </div>
          </div>
          <p class="codex-tip"><strong>Effective stat</strong> = Unit Base + Class Base + Custom. The hex chart on each unit card shows all three layers stacked.</p>
        </section>

        <section class="codex-section">
          <h2 class="codex-h2">⚙ Universal Actions</h2>
          <p class="codex-intro">Every unit always has these three on top of their kit.</p>
          <div class="codex-list">
            <div class="codex-action">
              <div class="codex-action-head">Idle</div>
              <p>Wait this action. No MP cost, no damage. Your ATB gauge keeps <strong>25% of full</strong> instead of resetting to 0, so your next turn fires noticeably sooner. Useful for stalling a beat on a slow boss skill, letting a teammate act first, or syncing turns.</p>
            </div>
            <div class="codex-action">
              <div class="codex-action-head">Attack</div>
              <p>Basic strike. No MP, no cooldown. Always available — use it when every skill is on cooldown or you're saving MP. Damage type follows the unit's <code>basicAttackKind</code> (Hera/Nova/Calypso are magical).</p>
            </div>
            <div class="codex-action">
              <div class="codex-action-head">Guard</div>
              <p>Brace until your next action. <strong>Halves all incoming damage</strong> until you act again. No MP cost. Best used the turn before a known boss AOE.</p>
            </div>
          </div>
        </section>

        <section class="codex-section">
          <h2 class="codex-h2">🎯 Single vs AOE</h2>
          <div class="codex-list">
            <div class="codex-pair">
              <div class="codex-pair-label">Single-target</div>
              <p>Full damage to one enemy. Best on bosses or to focus down high-priority targets first. Status effects apply only to the chosen target.</p>
            </div>
            <div class="codex-pair">
              <div class="codex-pair-label">AOE (all enemies)</div>
              <p>Hits every living enemy at <strong>75% damage</strong> per hit. With a five-mob floor that's roughly 3.75× the total damage of a single-target cast — but each AOE costs 50% more MP than its single-target counterpart, and the boss raid plus solo-boss floors get nothing extra from AOE.</p>
            </div>
          </div>
        </section>

        <section class="codex-section">
          <h2 class="codex-h2">⬆ Buffs</h2>
          <div class="codex-effects">
            ${effectRow("⚔", "Atk Up", "buff", "+X% physical or magical attack for N actions.")}
            ${effectRow("⬆", "Stat Up", "buff", "+X% to a specific stat (STR/DEF/AGI/etc.) for N actions.")}
            ${effectRow("💚", "Heal", "buff", "Instant heal — restores HP at cast time, no duration.")}
            ${effectRow("💨", "Haste", "buff", "ATB gauge fills X% faster for N actions.")}
            ${effectRow("🛡", "Shield", "buff", "Reduce incoming damage by X% for N actions.")}
            ${effectRow("🎯", "Drawing Fire", "buff", "All damage to allies (including each AOE hit) is redirected to this unit.")}
          </div>
        </section>

        <section class="codex-section">
          <h2 class="codex-h2">⬇ Debuffs</h2>
          <div class="codex-effects">
            ${effectRow("🔥", "Burn", "debuff", "Take X damage at the start of each of your actions for N actions.")}
            ${effectRow("☠", "Poison", "debuff", "Same as Burn but with a different damage source flavor.")}
            ${effectRow("🩸", "Bleed", "debuff", "Lose 5% of max HP per action — scales with the target's HP, not the attacker's.")}
            ${effectRow("❄", "Freeze", "debuff", "ATB gauge fills 25% slower for N actions.")}
            ${effectRow("💫", "Stun", "debuff", "Skip your next action entirely.")}
            ${effectRow("🔇", "Silence", "debuff", "Can't use skills — only Idle, Attack, Guard.")}
            ${effectRow("🌫", "Blind", "debuff", "−X hit chance — likely to miss your attacks.")}
            ${effectRow("❓", "Confuse", "debuff", "Attacks land on a random combatant (could be your own ally).")}
            ${effectRow("💢", "Vulnerable", "debuff", "+X% damage taken for N actions.")}
          </div>
        </section>

      </div>
    </div>
  `;
  root.querySelector<HTMLButtonElement>("#back-btn")?.addEventListener("click", onBack);
}

function statCard(key: string, name: string, summary: string, bullets: string[]): string {
  return `
    <div class="codex-stat">
      <div class="codex-stat-head">
        <span class="codex-stat-key">${key}</span>
        <span class="codex-stat-name">${name}</span>
      </div>
      <p>${summary}</p>
      <ul>${bullets.map(b => `<li>${b}</li>`).join("")}</ul>
    </div>
  `;
}

function effectRow(icon: string, name: string, kind: "buff" | "debuff", desc: string): string {
  return `
    <div class="codex-effect codex-effect-${kind}">
      <span class="codex-effect-icon">${icon}</span>
      <span class="codex-effect-name">${name}</span>
      <span class="codex-effect-desc">${desc}</span>
    </div>
  `;
}
