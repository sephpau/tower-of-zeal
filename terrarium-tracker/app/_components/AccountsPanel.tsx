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
const tierByKey = Object.fromEntries(TIERS.map((t) => [t.key, t]));
// Display order: Luna's Landing → Genesis → Mystic → Arctic → Forest → Savannah
// (matches the TIERS array order).
const tierOrder = Object.fromEntries(TIERS.map((t, i) => [t.key, i]));

export default function AccountsPanel() {
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
            // Paid plots that actually have Axies, ordered by tier.
            const shownPlots = (summary?.plots ?? [])
              .filter((p) => !p.isFree && p.axieCount > 0)
              .sort(
                (a, b) =>
                  (tierOrder[a.tierKey ?? ""] ?? 99) -
                  (tierOrder[b.tierKey ?? ""] ?? 99)
              );
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
                        <span className={styles.statLabel}>Your Atia&apos;s Flame</span>
                        <span className={styles.statValueGold}>
                          {nf.format(summary.totalFlame)}
                        </span>
                      </div>
                    </div>

                    {shownPlots.length > 0 ? (
                      <div className={styles.plots}>
                        {shownPlots.map((p) => {
                            const tier = p.tierKey
                              ? tierByKey[p.tierKey]
                              : undefined;
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
                                    {p.axieCount} axie{p.axieCount === 1 ? "" : "s"}
                                  </span>
                                  <span className={styles.plotFlame}>
                                    {nf.format(p.flame)}
                                  </span>
                                </div>
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
