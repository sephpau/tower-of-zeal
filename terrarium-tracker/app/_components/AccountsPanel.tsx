"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { TIERS } from "@/app/lib/tiers";
import { flameInfo } from "@/app/lib/collections";
import {
  AccountSummary,
  TrackedAddress,
  readTracked,
  writeTracked,
  addTracked,
  removeTracked,
  normalizeAddress,
  shortAddress,
  fetchAccount,
} from "@/app/lib/tracked";
import styles from "./AccountsPanel.module.css";

const nf = new Intl.NumberFormat("en-US");
const nf2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const tierByKey = Object.fromEntries(TIERS.map((t) => [t.key, t]));
// Display order: Luna's Landing → Genesis → Mystic → Arctic → Forest → Savannah
// (matches the TIERS array order).
const tierOrder = Object.fromEntries(TIERS.map((t, i) => [t.key, i]));

type Props = {
  liveTotals?: Record<string, number | null>;
  liveTicks?: Record<string, number | null>;
};

export default function AccountsPanel({
  liveTotals = {},
  liveTicks = {},
}: Props) {
  const [tracked, setTracked] = useState<TrackedAddress[]>([]);
  const [data, setData] = useState<Record<string, AccountSummary | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (address: string) => {
    setLoading((p) => ({ ...p, [address]: true }));
    const summary = await fetchAccount(address);
    setData((p) => ({ ...p, [address]: summary }));
    setLoading((p) => ({ ...p, [address]: false }));
  }, []);

  useEffect(() => {
    function refresh() {
      const list = readTracked();
      setTracked(list);
      list.forEach((t) => load(t.address));
    }
    refresh();
    // Re-read when Login (wallet connect) adds an address.
    window.addEventListener("tracked-updated", refresh);
    return () => window.removeEventListener("tracked-updated", refresh);
  }, [load]);

  function sync(list: TrackedAddress[]) {
    writeTracked(list);
    setTracked(list);
  }

  function handleAdd() {
    setError(null);
    const addr = normalizeAddress(input);
    if (!addr) {
      setError("Enter a valid Ronin/0x address.");
      return;
    }
    sync(addTracked(readTracked(), addr));
    setInput("");
    load(addr);
  }

  function handleRemove(address: string) {
    sync(removeTracked(readTracked(), address));
  }

  return (
    <section id="accounts" className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Accounts Summary</h2>
          <p className={styles.sub}>
            Live in-plot Axies &amp; Atia&apos;s Flame per wallet — public, no
            login needed.
          </p>
        </div>
      </div>

      <div className={styles.addRow}>
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Track a Ronin address (0x… or ronin:…)"
        />
        <button className="btn-primary" onClick={handleAdd} disabled={!input.trim()}>
          Track
        </button>
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}

      {tracked.length === 0 ? (
        <div className={`glass-card ${styles.empty}`}>
          <Image
            src="/motz/ego.png"
            alt="Ego"
            width={72}
            height={72}
            className={styles.egoImg}
          />
          <p className={styles.emptyTitle}>No wallets tracked yet, fam.</p>
          <p className={styles.emptySub}>
            Paste a Ronin address above to see its plots, working Axies, and
            total Atia&apos;s Flame — live.
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {tracked.map((t) => {
            const summary = data[t.address];
            const busy = loading[t.address];
            // Plots with Axies OR open slots (so empty, deployable plots show
            // too), ordered by tier (free plots last).
            const shownPlots = (summary?.plots ?? [])
              .filter((p) => p.axieCount > 0 || p.openSlots > 0)
              .sort(
                (a, b) =>
                  (tierOrder[a.tierKey ?? ""] ?? 99) -
                  (tierOrder[b.tierKey ?? ""] ?? 99)
              );

            // Lands owned per tier (paid plots), and the est. bAXS/hr summed
            // across tiers: the wallet's flame is already in each tier total, so
            // est = walletFlame / tierTotal × hourly tick (no self-add here).
            const paidPlots = (summary?.plots ?? []).filter((p) => !p.isFree);
            const landsByTier = TIERS.map((t) => ({
              tier: t,
              count: paidPlots.filter((p) => p.tierKey === t.key).length,
            })).filter((x) => x.count > 0);

            let estPerHr = 0;
            let estOk = false;
            for (const t of TIERS) {
              const tierTotal = liveTotals[t.key];
              if (!tierTotal || tierTotal <= 0) continue;
              const flame = paidPlots
                .filter((p) => p.tierKey === t.key)
                .reduce((s, p) => s + p.flame, 0);
              if (flame <= 0) continue;
              estPerHr += (flame / tierTotal) * (liveTicks[t.key] ?? t.bAxsPerTick);
              estOk = true;
            }
            return (
              <div key={t.address} className={`glass-card ${styles.card}`}>
                <div className={styles.cardHead}>
                  <div className={styles.who}>
                    <span className={styles.name}>
                      {t.name || shortAddress(t.address)}
                    </span>
                    <span className={styles.addr}>{t.address}</span>
                  </div>
                  <button
                    className={styles.remove}
                    onClick={() => handleRemove(t.address)}
                    aria-label="Stop tracking"
                  >
                    ×
                  </button>
                </div>

                {busy && !summary ? (
                  <div className={styles.loading}>Loading live data…</div>
                ) : !summary ? (
                  <div className={styles.loading}>Couldn&apos;t load this wallet.</div>
                ) : (
                  <>
                    <div className={styles.stats}>
                      <div className={styles.stat}>
                        <span className={styles.statLabel}>Active plots</span>
                        <span className={styles.statValue}>
                          {summary.paidPlotCount}
                        </span>
                      </div>
                      <div className={styles.stat}>
                        <span className={styles.statLabel}>Working Axies</span>
                        <span className={styles.statValue}>
                          {summary.totalAxies}
                        </span>
                      </div>
                      <div className={styles.stat}>
                        <span className={styles.statLabel}>Active flame</span>
                        <span className={styles.statValueGold}>
                          {nf.format(summary.totalFlame)}
                        </span>
                      </div>
                      <div className={styles.stat}>
                        <span className={styles.statLabel}>Est. bAXS / hr</span>
                        <span className={styles.statValueGold}>
                          {estOk ? nf2.format(estPerHr) : "—"}
                        </span>
                        {estOk ? (
                          <span className={styles.statSub}>
                            ≈ {nf2.format(estPerHr * 24)} / day
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {landsByTier.length > 0 ? (
                      <div className={styles.lands}>
                        <span className={styles.landsLabel}>Lands</span>
                        <div className={styles.landsChips}>
                          {landsByTier.map(({ tier, count }) => (
                            <span key={tier.key} className={styles.landChip}>
                              <Image
                                src={tier.img}
                                alt=""
                                width={18}
                                height={18}
                              />
                              {tier.name}
                              <span className={styles.landChipCount}>
                                ×{count}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className={styles.capacity}>
                      <span className={styles.capLabel}>
                        Available to deploy
                      </span>
                      <span className={styles.capValue}>
                        {summary.openSlots} open slot
                        {summary.openSlots === 1 ? "" : "s"}
                        {" · "}
                        {summary.idleAxies} idle ax
                        {summary.idleAxies === 1 ? "ie" : "ies"}
                      </span>
                    </div>

                    {shownPlots.length > 0 ? (
                      <div className={styles.plots}>
                        {shownPlots.map((p) => {
                            const tier = p.tierKey
                              ? tierByKey[p.tierKey]
                              : undefined;
                            const tierTotal = p.tierKey
                              ? liveTotals[p.tierKey]
                              : null;
                            const plotEstHr =
                              tier && tierTotal && tierTotal > 0
                                ? (p.flame / tierTotal) *
                                  (liveTicks[tier.key] ?? tier.bAxsPerTick)
                                : null;
                            return (
                              <div key={p.id} className={styles.plot}>
                                <div className={styles.plotMain}>
                                  {tier ? (
                                    <Image
                                      src={tier.img}
                                      alt={p.landType}
                                      width={28}
                                      height={28}
                                    />
                                  ) : (
                                    <span className={styles.plotDot} />
                                  )}
                                  <span className={styles.plotName}>
                                    {tier?.name ?? p.landType}
                                  </span>
                                  <span className={styles.plotMeta}>
                                    {p.filled} / {p.slots} slots
                                    {p.openSlots > 0 ? (
                                      <span className={styles.openSlots}>
                                        {" "}
                                        · {p.openSlots} open
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className={styles.plotFlame}>
                                    {nf.format(p.flame)}
                                  </span>
                                </div>
                                {!p.isFree && p.shrineState ? (
                                  <div className={styles.energy}>
                                    <span
                                      className={`${styles.energyDot} ${
                                        p.active ? styles.energyOn : styles.energyOff
                                      }`}
                                    />
                                    <span
                                      className={
                                        p.active
                                          ? styles.energyLabelOn
                                          : styles.energyLabelOff
                                      }
                                    >
                                      {p.active ? "Active" : "Resting"}
                                    </span>
                                    <span className={styles.energyNote}>
                                      {p.active
                                        ? p.luniumTicks != null
                                          ? `~${p.luniumTicks} tick${
                                              p.luniumTicks === 1 ? "" : "s"
                                            } of Lunium left`
                                          : "Lunium stable"
                                        : p.lunium > 0
                                        ? "low Lunium"
                                        : "out of Lunium · not earning bAXS"}
                                    </span>
                                  </div>
                                ) : null}
                                {p.breakdown.length > 0 || plotEstHr !== null ? (
                                  <div className={styles.plotSub}>
                                    {p.breakdown.length > 0 ? (
                                      <div className={styles.breakdown}>
                                        {p.breakdown.map((b) => {
                                          const info = flameInfo(b.flame);
                                          return (
                                            <span
                                              key={b.flame}
                                              className={styles.kind}
                                            >
                                              <span
                                                className={styles.kindDot}
                                                style={{ background: info.color }}
                                              />
                                              {info.label}
                                              <span className={styles.kindCount}>
                                                ×{b.count}
                                              </span>
                                            </span>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <span />
                                    )}
                                    {plotEstHr !== null ? (
                                      <span className={styles.plotEst}>
                                        ≈ {nf2.format(plotEstHr)} / hr ·{" "}
                                        {nf2.format(plotEstHr * 24)} / day
                                      </span>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <div className={styles.noPlots}>
                        No Axies in plots yet.
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
