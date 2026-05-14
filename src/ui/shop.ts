// Shop screen — MoTZ glass cards in three sections (Energy / Unit / Buffs).
// Each item is 1-purchase-per-PH-day, server-enforced. Crypto payment is not
// wired yet (beta): purchases succeed for free but the UI labels them as paid
// so users can preview the shop.

import { topBarHtml } from "./settings";
import { getEnergy, ENERGY_MAX } from "../core/energy";
import {
  SHOP_CATALOG, ShopItemDef, ShopItemId,
  fetchShopStatus, buyShopItem,
} from "../core/shop";
import { confirmModal, alertModal } from "./confirmModal";
import { loadSession, validateSession, setVerifiedPerks } from "../auth/session";
import { payWithWallet } from "../auth/payment";
import { pickWalletModal } from "./walletPicker";

export async function renderShop(root: HTMLElement, onBack: () => void): Promise<void> {
  // Initial paint — empty list while we wait on the status fetch.
  root.innerHTML = `
    <div class="screen-frame shop-screen">
      ${topBarHtml("Shop", true)}
      <div class="shop-header">
        <div class="shop-title">Tower Exchange</div>
        <div class="shop-sub">Each item can be purchased <strong>once per day</strong>. Resets at 8 AM PH.</div>
      </div>
      <div class="shop-one-buff-notice">
        ⚡ <strong>Only ONE campaign buff can be chosen per floor.</strong> Each charge applies to a single battle — pick the buff that matters most for the fight you're about to enter.
      </div>
      <div class="shop-floor50-notice">
        🌑 <strong>Campaign buffs are disabled on Floor 50 (World Ender).</strong> The capstone fight is fair-fight only — slotted buffs are not consumed and have no effect there.
      </div>
      <div class="shop-grid" id="shop-grid">
        <div class="shop-loading">Loading inventory…</div>
      </div>
    </div>
  `;
  root.querySelector("#back-btn")?.addEventListener("click", onBack);

  const status = await fetchShopStatus();
  const grid = root.querySelector<HTMLElement>("#shop-grid");
  if (!grid) return;

  if (!status) {
    grid.innerHTML = `<div class="shop-loading">Couldn't reach server. Please refresh.</div>`;
    return;
  }

  const sections: { label: string; cat: ShopItemDef["category"] }[] = [
    { label: "Energy", cat: "energy" },
    { label: "Unit Utilities", cat: "unit" },
    { label: "Campaign Buffs", cat: "buff" },
  ];

  grid.innerHTML = sections.map(sec => {
    const items = SHOP_CATALOG.filter(i => i.category === sec.cat);
    if (items.length === 0) return "";
    return `
      <div class="shop-section">
        <div class="shop-section-title">${sec.label}</div>
        <div class="shop-items">
          ${items.map(i => shopCardHtml(i, status)).join("")}
        </div>
      </div>
    `;
  }).join("");

  // Buy button handlers.
  grid.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach(btn => {
    const id = btn.dataset.buy as ShopItemId;
    btn.addEventListener("click", async () => {
      const def = SHOP_CATALOG.find(i => i.id === id);
      if (!def) return;
      if (def.comingSoon) { await alertModal({ kind: "info", title: "Coming Soon", message: "This item isn't ready yet — check back soon." }); return; }
      const priceWeiStr = status.pricesWei?.[id];
      if (!priceWeiStr) { await alertModal({ kind: "warning", message: "Price not available — refresh and try again." }); return; }
      const ok = await confirmModal({
        title: "Confirm Purchase",
        message: `Buy <strong>${def.name}</strong> for <strong>${def.priceLabel}</strong>?<br><br>${def.description}<br><br>💸 You'll pick a wallet next, then approve a <strong>${def.priceLabel}</strong> transfer on the <strong>Ronin network</strong>. The item is added to your Inventory once the payment is confirmed on-chain (a few seconds).`,
        confirmLabel: "Choose Wallet",
        cancelLabel: "Cancel",
      });
      if (!ok) return;
      btn.disabled = true;
      btn.textContent = "Pick wallet…";
      // 1. Player picks the wallet they want to pay from.
      const chosen = await pickWalletModal({
        title: "Pay With Which Wallet?",
        subtitle: `Approving ${def.priceLabel} to the shop treasury`,
      });
      if (!chosen) {
        btn.disabled = false;
        btn.textContent = "Buy";
        return;
      }
      let priceWei: bigint;
      try { priceWei = BigInt(priceWeiStr); }
      catch {
        btn.disabled = false; btn.textContent = "Buy";
        await alertModal({ kind: "error", message: "Bad price format from server." });
        return;
      }
      btn.textContent = `Open ${chosen.name}…`;
      // 2. Send the tx through the chosen wallet.
      const pay = await payWithWallet(chosen, priceWei);
      if (!pay.ok || !pay.txHash) {
        btn.disabled = false;
        btn.textContent = "Buy";
        if (pay.reason && pay.reason !== "purchase cancelled") {
          await alertModal({ kind: "error", title: "Payment Failed", message: escapeHtml(pay.reason) });
        }
        return;
      }
      btn.textContent = "Verifying tx…";
      // 2. Hand the tx hash to the server. Server polls Ronin RPC, validates
      //    the receipt against treasury / wallet / price / used-set, then grants.
      const result = await buyShopItem(id, pay.txHash);
      if (!result.ok) {
        await alertModal({
          kind: "error",
          title: "Purchase Failed",
          message: `${escapeHtml(result.reason ?? "Something went wrong")}<br><br><strong>Tx hash:</strong><br><span class="motz-tx-hash">${escapeHtml(pay.txHash)}</span><br><br>Your RON was sent. <strong>Save this hash</strong> and contact support if the item isn't granted.`,
        });
        // Re-fetch + re-render to refresh "Bought today" state.
        await renderShop(root, onBack);
        return;
      }
      // Temp MoTZ Key applies to perks immediately — refresh the verified
      // perks cache so locked unit overlays clear without waiting for the
      // next periodic /auth/me poll.
      if (id === "unit_temp_motz_key") {
        const sess = loadSession();
        if (sess) {
          const refreshed = await validateSession(sess.token);
          if (refreshed) setVerifiedPerks(refreshed.perks);
        }
      }
      // Successful — re-render to reflect new state.
      await renderShop(root, onBack);
    });
  });

  // Buff "choose" UX lives on the Inventory + Squad-Select screens — the Shop
  // is purchase-only. No slot handler wired here on purpose.
}

function shopCardHtml(def: ShopItemDef, status: { inventory: { buffs: Partial<Record<ShopItemId, number>> }; boughtToday: Partial<Record<ShopItemId, boolean>> }): string {
  const bought = !!status.boughtToday[def.id];
  const owned = status.inventory.buffs[def.id] ?? 0;
  const isBuff = def.category === "buff";
  const isEntitlement = def.id === "unit_stat_reset" || def.id === "unit_class_change";
  const ctaLabel = def.comingSoon ? "Coming Soon" : (bought ? "Bought Today" : "Buy");
  const ctaDisabled = def.comingSoon || bought;
  const ownedBadge = (isBuff || isEntitlement) && owned > 0
    ? `<span class="shop-owned">Owned: <strong>${owned}</strong></span>`
    : "";
  return `
    <div class="shop-card ${def.comingSoon ? "shop-card-soon" : ""} ${bought ? "shop-card-bought" : ""}">
      <div class="shop-card-head">
        <span class="shop-card-icon">${iconFor(def)}</span>
        <span class="shop-card-name">${escapeHtml(def.name)}</span>
        ${ownedBadge}
      </div>
      <div class="shop-card-desc">
        ${escapeHtml(def.description)}
        ${def.category === "buff" ? `<div class="shop-card-restrict">⚠ Not usable on Floor 50 (World Ender)</div>` : ""}
      </div>
      <div class="shop-card-foot">
        <span class="shop-card-price">${escapeHtml(def.priceLabel)}</span>
        <div class="shop-card-actions">
          <button class="confirm-btn shop-buy-btn" data-buy="${def.id}" type="button" ${ctaDisabled ? "disabled" : ""}>${escapeHtml(ctaLabel)}</button>
        </div>
      </div>
    </div>
  `;
}

function iconFor(def: ShopItemDef): string {
  switch (def.id) {
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

// Suppress unused-import warning for energy values referenced indirectly.
void getEnergy; void ENERGY_MAX;
