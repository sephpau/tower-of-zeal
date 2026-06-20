"use client";

import { TIERS } from "@/app/lib/tiers";
import styles from "./TickChart.module.css";

const nf2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

type Props = { liveTicks?: Record<string, number | null> };

export default function TickChart({ liveTicks = {} }: Props) {
  const rows = TIERS.map((t) => ({
    tier: t,
    tick: liveTicks[t.key] ?? t.bAxsPerTick,
    live: liveTicks[t.key] != null,
  }));
  const max = Math.max(...rows.map((r) => r.tick), 1);
  const anyLive = rows.some((r) => r.live);

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <span className="eyebrow">{anyLive ? "Live · per tier" : "Per tier"}</span>
        <h2 className={styles.heading}>bAXS per Tick</h2>
        <p className={styles.sub}>
          Current hourly bAXS distributed to each land tier
          {anyLive ? " (live from the leaderboard)" : ""}.
        </p>
      </div>

      <div className={`glass-card ${styles.chart}`}>
        {rows.map(({ tier, tick }) => (
          <div key={tier.key} className={styles.row}>
            <span className={styles.label}>{tier.name}</span>
            <div className={styles.track}>
              <div
                className={styles.bar}
                style={{
                  width: `${(tick / max) * 100}%`,
                  background: tier.accent,
                  boxShadow: `0 0 12px ${tier.accent}66`,
                }}
              />
            </div>
            <span className={styles.value}>
              {nf2.format(tick)}
              <span className={styles.unit}> /hr</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
