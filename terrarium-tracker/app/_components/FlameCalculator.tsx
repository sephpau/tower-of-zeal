"use client";

import { useMemo, useState } from "react";
import { COLLECTIONS, MAX_WORKING_AXIES } from "@/app/lib/collections";
import styles from "./FlameCalculator.module.css";

const nf = new Intl.NumberFormat("en-US");

type Props = { onClose: () => void };

export default function FlameCalculator({ onClose }: Props) {
  // quantity per collection key
  const [counts, setCounts] = useState<Record<string, number>>({});

  const used = useMemo(
    () => Object.values(counts).reduce((a, b) => a + b, 0),
    [counts]
  );
  const totalFlame = useMemo(
    () =>
      COLLECTIONS.reduce((sum, c) => sum + (counts[c.key] || 0) * c.flame, 0),
    [counts]
  );
  const over = used > MAX_WORKING_AXIES;
  const remaining = MAX_WORKING_AXIES - used;

  function setCount(key: string, value: number) {
    const v = Math.max(0, Math.floor(value) || 0);
    setCounts((prev) => ({ ...prev, [key]: v }));
  }
  function bump(key: string, delta: number) {
    if (delta > 0 && remaining <= 0) return; // respect the 30-slot cap
    setCount(key, (counts[key] || 0) + delta);
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className={styles.head}>
          <h3 className={styles.title}>
            Atia&apos;s Flame <span className="text-gradient">Calculator</span>
          </h3>
          <p className={styles.sub}>
            {`Assign up to ${MAX_WORKING_AXIES} working Axies to plan a plot's total flame.`}
          </p>
        </div>

        <div className={styles.list}>
          {COLLECTIONS.map((c) => {
            const n = counts[c.key] || 0;
            return (
              <div key={c.key} className={styles.row}>
                <span
                  className={styles.dot}
                  style={{ background: c.accent, boxShadow: `0 0 10px ${c.accent}88` }}
                />
                <span className={styles.name}>{c.name}</span>
                <span className={styles.flameEach}>
                  {nf.format(c.flame)} <span className={styles.flameUnit}>flame</span>
                </span>
                <div className={styles.stepper}>
                  <button
                    className={styles.stepBtn}
                    onClick={() => bump(c.key, -1)}
                    disabled={n <= 0}
                    aria-label={`Remove ${c.name}`}
                  >
                    −
                  </button>
                  <input
                    className={styles.qty}
                    value={n}
                    onChange={(e) => setCount(c.key, Number(e.target.value))}
                    inputMode="numeric"
                  />
                  <button
                    className={styles.stepBtn}
                    onClick={() => bump(c.key, 1)}
                    disabled={remaining <= 0}
                    aria-label={`Add ${c.name}`}
                  >
                    +
                  </button>
                </div>
                <span className={styles.rowTotal}>
                  {n > 0 ? nf.format(n * c.flame) : "—"}
                </span>
              </div>
            );
          })}
        </div>

        <div className={styles.footer}>
          <div className={styles.slots}>
            <span className={styles.slotsLabel}>Working Axies</span>
            <span
              className={styles.slotsValue}
              style={over ? { color: "var(--err)" } : undefined}
            >
              {used} / {MAX_WORKING_AXIES}
            </span>
          </div>
          <div className={styles.totalBlock}>
            <span className={styles.totalLabel}>Total Atia&apos;s Flame</span>
            <span className={styles.totalValue}>{nf.format(totalFlame)}</span>
          </div>
        </div>

        {over ? (
          <div className={styles.warn}>
            Over the {MAX_WORKING_AXIES}-slot limit by {used - MAX_WORKING_AXIES}.
          </div>
        ) : null}

        <div className={styles.actions}>
          <button
            className="btn-ghost"
            onClick={() => setCounts({})}
            disabled={used === 0}
          >
            Reset
          </button>
          <span className={styles.hint}>
            Your bAXS share = this flame ÷ the tier&apos;s total flame (live at
            launch).
          </span>
        </div>
      </div>
    </div>
  );
}
