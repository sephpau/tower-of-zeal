"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { TIERS } from "@/app/lib/tiers";
import { shortAddress } from "@/app/lib/tracked";
import styles from "./TierLeaderboard.module.css";

const nf = new Intl.NumberFormat("en-US");
const TOP_N = 12;

// Gold / silver / bronze for the top three, like an in-game leaderboard.
const RANK_COLOR: Record<number, string> = {
  1: "#fbbf24",
  2: "#cbd5e1",
  3: "#d8975a",
};

type Entry = {
  rank: number;
  address: string;
  plots: number;
  axies: number;
  flame: number;
};
type Data = {
  name: string;
  deployedTotal: number;
  participants: number;
  shown: number;
  entries: Entry[];
};

export default function TierLeaderboard() {
  const [activeKey, setActiveKey] = useState(TIERS[0].key);
  const [cache, setCache] = useState<Record<string, Data>>({});
  const [loading, setLoading] = useState(false);

  const active = TIERS.find((t) => t.key === activeKey)!;
  const data = cache[activeKey];

  // Lazily fetch each tier's ranked wallet list once, then cache it.
  useEffect(() => {
    if (cache[activeKey]) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/tier-leaderboard?key=${activeKey}`);
        const json = await res.json();
        if (!cancelled && json && !json.error) {
          setCache((c) => ({ ...c, [activeKey]: json }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeKey, cache]);

  const rows = (data?.entries ?? []).slice(0, TOP_N);

  return (
    <section id="leaderboard" className={styles.wrap}>
      <div className={styles.header}>
        <span className="eyebrow">In-game style · per tier</span>
        <h2 className={styles.heading}>Tier Leaderboard</h2>
        <p className={styles.subhead}>
          Top wallets ranked by deployed Atia&apos;s Flame.
        </p>
      </div>

      <div className={styles.tabs}>
        {TIERS.map((t) => {
          const on = t.key === activeKey;
          return (
            <button
              key={t.key}
              type="button"
              className={`${styles.tab} ${on ? styles.tabActive : ""}`}
              style={on ? { borderColor: t.accent, color: t.accent } : undefined}
              onClick={() => setActiveKey(t.key)}
            >
              <Image src={t.img} alt="" width={18} height={18} />
              <span>{t.name}</span>
            </button>
          );
        })}
      </div>

      <div className={`glass-card ${styles.panel}`}>
        <div className={styles.panelHead}>
          <span className={styles.tierName} style={{ color: active.accent }}>
            {active.name}
          </span>
          <span className={styles.meta}>
            {data
              ? `${nf.format(data.deployedTotal)} deployed flame · ${nf.format(
                  data.participants
                )} wallets`
              : "…"}
          </span>
        </div>

        <div className={styles.cols}>
          <span>#</span>
          <span>Wallet</span>
          <span className={styles.right}>Plots</span>
          <span className={styles.right}>Axies</span>
          <span className={styles.right}>Flame</span>
        </div>

        <div className={styles.list}>
          {loading && !data ? (
            <div className={styles.empty}>Loading leaderboard…</div>
          ) : rows.length === 0 ? (
            <div className={styles.empty}>
              {data && data.participants === 0
                ? "This tier doesn't expose a wallet list."
                : "No deployed Axies in this tier yet."}
            </div>
          ) : (
            rows.map((e) => (
              <div key={e.address} className={styles.row}>
                <span
                  className={styles.rank}
                  style={RANK_COLOR[e.rank] ? { color: RANK_COLOR[e.rank] } : undefined}
                >
                  {e.rank}
                </span>
                <span className={styles.addr}>{shortAddress(e.address)}</span>
                <span className={styles.right}>{e.plots}</span>
                <span className={styles.right}>{e.axies}</span>
                <span className={`${styles.right} ${styles.flame}`}>
                  {nf.format(e.flame)}
                </span>
              </div>
            ))
          )}
        </div>

        {data && data.entries.length > TOP_N ? (
          <p className={styles.more}>
            + {nf.format(data.entries.length - TOP_N)} more wallets with flame
          </p>
        ) : null}
      </div>
    </section>
  );
}
