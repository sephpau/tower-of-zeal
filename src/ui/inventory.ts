// Inventory screen — central place for everything the player owns from the
// Shop. Energy packs are USED here (server-authoritative grant); campaign
// buffs are slotted here for the next battle; unit entitlements show a
// pointer to the Units screen.

import { topBarHtml } from "./settings";
import { getEnergy, ENERGY_MAX } from "../core/energy";
import {
  SHOP_CATALOG, ShopItemDef, ShopItemId,
  fetchShopStatus, useEnergyItem,
} from "../core/shop";

export async function renderInventory(root: HTMLElement, onBack: () => void): Promise<void> {
  root.innerHTML = `
    <div class="screen-frame inventory-screen">
      ${topBarHtml("Inventory", true)}
      <div class="inv-header">
        <div class="inv-title">Backpack</div>
        <div class="inv-sub">Items you've bought from the <strong>Shop</strong>. Click <strong>Use</strong> on energy packs to refill, or slot a campaign buff for your next battle.</div>
        <div class="inv-energy-pill">⚡ ${getEnergy()} / ${ENERGY_MAX}</div>
      </div>
      <div class="inv-body" id="inv-body">
        <div class="inv-loading">Loading inventory…</div>
      </div>
    </div>
  `;
  root.querySelector("#back-btn")?.addEventListener("click", onBack);

  await draw(root);
}

async function draw(root: HTMLElement): Promise<void> {
  const body = root.querySelector<HTMLElement>("#inv-body");
  if (!body) return;
  const status = await fetchShopStatus();
  if (!status) {
    body.innerHTML = `<div class="inv-loading">Couldn't reach the server. Please refresh.</div>`;
    return;
  }
  const owned = SHOP_CATALOG
    .map(def => ({ def, count: status.inventory.buffs[def.id] ?? 0 }))
    .filter(x => x.count > 0);

  const tempKeyActive = !!status.tempMotzKey?.active;

  if (owned.length === 0 && !tempKeyActive) {
    body.innerHTML = `
      <div class="inv-empty">
        <div class="inv-empty-icon">🎒</div>
        <div class="inv-empty-title">Your backpack is empty</div>
        <div class="inv-empty-sub">Visit the <strong>Shop</strong> on the home screen to buy energy packs, campaign buffs, or unit utilities.</div>
      </div>
    `;
    return;
  }

  const sections: { label: string; cat: ShopItemDef["category"] }[] = [
    { label: "Energy Packs", cat: "energy" },
    { label: "Campaign Buffs", cat: "buff" },
    { label: "Unit Utilities", cat: "unit" },
  ];

  const sectionsHtml = sections.map(sec => {
    const items = owned.filter(x => x.def.category === sec.cat);
    // The Unit Utilities section gets an extra "active pass" card when the
    // seasonal MoTZ key is live, even if no other entitlements are owned.
    const tempKeyHere = sec.cat === "unit" && tempKeyActive
      ? tempKeyCardHtml(status.tempMotzKey.expiresAt ?? 0)
      : "";
    if (items.length === 0 && !tempKeyHere) return "";
    return `
      <div class="inv-section">
        <div class="inv-section-title">${sec.label}</div>
        <div class="inv-items">
          ${tempKeyHere}
          ${items.map(x => itemRowHtml(x.def, x.count)).join("")}
        </div>
      </div>
    `;
  }).join("");
  body.innerHTML = sectionsHtml;

  // Wire energy "Use" buttons.
  body.querySelectorAll<HTMLButtonElement>("[data-use-energy]").forEach(btn => {
    const id = btn.dataset.useEnergy as "energy_5" | "energy_10" | "energy_20";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Using…";
      const result = await useEnergyItem(id);
      if (!result.ok) {
        alert(result.reason ?? "Failed to use item.");
      }
      // Re-render to reflect new inventory count + energy pill.
      const pill = root.querySelector<HTMLElement>(".inv-energy-pill");
      if (pill) pill.textContent = `⚡ ${getEnergy()} / ${ENERGY_MAX}`;
      await draw(root);
    });
  });

  // Buffs are chosen from Squad Select now — no buff button handler here.
}

function tempKeyCardHtml(expiresAt: number): string {
  const msLeft = Math.max(0, expiresAt - Date.now());
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const daysLeft = Math.floor(msLeft / dayMs);
  const hoursLeft = Math.floor((msLeft % dayMs) / hourMs);
  const remainStr = daysLeft >= 1
    ? `${daysLeft} day${daysLeft === 1 ? "" : "s"}${hoursLeft > 0 ? `, ${hoursLeft}h` : ""} remaining`
    : `${Math.max(1, hoursLeft)}h remaining`;
  const expiryDate = new Date(expiresAt).toLocaleString();
  return `
    <div class="inv-item inv-item-active-pass">
      <div class="inv-item-icon">🗝</div>
      <div class="inv-item-body">
        <div class="inv-item-head">
          <span class="inv-item-name">Temporary MoTZ Key</span>
          <span class="inv-item-active-badge">ACTIVE · ${escapeHtml(remainStr)}</span>
        </div>
        <div class="inv-item-desc">
          Seasonal pass — Hera, Nova, Oge, and Shego are unlocked while this is active.
          Expires <strong>${escapeHtml(expiryDate)}</strong>. Buy again to extend.
        </div>
      </div>
      <div class="inv-item-action">
        <div class="inv-action-hint">Active — perks applied automatically.</div>
      </div>
    </div>
  `;
}

function itemRowHtml(def: ShopItemDef, count: number): string {
  const icon = iconFor(def.id);
  let action = "";
  if (def.category === "energy") {
    action = `<button class="confirm-btn inv-use-btn" data-use-energy="${def.id}" type="button">Use</button>`;
  } else if (def.category === "buff") {
    // Buffs are chosen from the Squad Select screen before a battle starts,
    // not from here. We just show the count + a pointer.
    action = `<div class="inv-action-hint">Choose before a battle on the <strong>Squad Select</strong> screen.</div>`;
  } else {
    action = `<div class="inv-action-hint">Spend on the <strong>Units</strong> screen</div>`;
  }
  return `
    <div class="inv-item">
      <div class="inv-item-icon">${icon}</div>
      <div class="inv-item-body">
        <div class="inv-item-head">
          <span class="inv-item-name">${escapeHtml(def.name)}</span>
          <span class="inv-item-count">×${count}</span>
        </div>
        <div class="inv-item-desc">${escapeHtml(def.description)}</div>
      </div>
      <div class="inv-item-action">${action}</div>
    </div>
  `;
}

function iconFor(id: ShopItemId): string {
  switch (id) {
    case "energy_5": return "⚡";
    case "energy_10": return "⚡⚡";
    case "energy_20": return "⚡⚡⚡";
    case "unit_stat_reset": return "🔄";
    case "unit_class_change": return "🛡";
    case "unit_temp_motz_key": return "🗝";
    case "buff_battle_cry": return "📯";
    case "buff_phoenix_embers": return "🔥";
    case "buff_scholars_insight": return "📖";
    case "buff_quickdraw": return "⚡";
    case "buff_last_stand": return "🗡";
    default: return "❔";
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  } as Record<string, string>)[c]);
}
