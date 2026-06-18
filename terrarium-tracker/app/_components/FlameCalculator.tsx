"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { COLLECTIONS, MAX_WORKING_AXIES } from "@/app/lib/collections";
import { TIERS } from "@/app/lib/tiers";
import styles from "./FlameCalculator.module.css";

const nf = new Intl.NumberFormat("en-US");
const nf2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

type Props = {
  onClose: () => void;
  liveTotals?: Record<string, number | null>;
};

export default function FlameCalculator({ onClose, liveTotals = {} }: Props) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [tierKey, setTierKey] = useState<string>(TIERS[0].key);

  const tier = useMemo(
    () => TIERS.find((t) => t.key === tierKey) ?? TIERS[0],
    [tierKey]
  );

  const used = useMemo(
    () => Object.values(counts).reduce((a, b) => a + b, 0),
    [counts]
  );
  const yourFlame = useMemo(
    () =>
      COLLECTIONS.reduce((sum, c) => sum + (counts[c.key] || 0) * c.flame, 0),
    [counts]
  );
  const over = used > MAX_WORKING_AXIES;
  const remaining = MAX_WORKING_AXIES - used;

  // 1 tick = 1 hour (pool/month ÷ perTick = 720 ticks ≈ 24/day).
  const hourlyTick = tier.bAxsPerTick;
  // Live denominator from the Terrarium leaderboard API (current tick).
  const tierTotal = liveTotals[tier.key] ?? tier.totalAtiasFlame;
  // Deploying your Axies adds their flame to the tier total, so include it in
  // the denominator: your share = yourFlame / (tierTotal + yourFlame).
  const estPerHr =
    tierTotal && tierTotal > 0
      ? (yourFlame / (tierTotal + yourFlame)) * hourlyTick
      : null;

  function setCount(key: string, value: number) {
    const v = Math.max(0, Math.floor(value) || 0);
    setCounts((prev) => ({ ...prev, [key]: v }));
  }
  function bump(key: string, delta: number) {
    if (delta > 0 && remaining <= 0) return;
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
            {`Assign up to ${MAX_WORKING_AXIES} working Axies, then pick a plot to estimate your bAXS.`}
          </p>
        </div>

        {/* ---------- Land selector ---------- */}
        <span className={styles.groupLabel}>Plot</span>
        <div className={styles.landRow}>
          {TIERS.map((t) => (
            <button
              key={t.key}
              className={`${styles.land} ${t.key === tierKey ? styles.landActive : ""}`}
              onClick={() => setTierKey(t.key)}
              style={
                t.key === tierKey ? { borderColor: t.accent } : undefined
              }
            >
              <Image src={t.img} alt={t.name} width={30} height={30} />
              <span className={styles.landName}>{t.name}</span>
            </button>
          ))}
        </div>

        {/* ---------- Selected plot stats ---------- */}
        <div className={styles.plotPanel}>
          <div className={styles.plotStat}>
            <span className={styles.plotLabel}>Total Atia&apos;s Flame</span>
            {tierTotal !== null ? (
              <span className={styles.plotValueFlame}>
                {nf.format(tierTotal)}
              </span>
            ) : (
              <span className={styles.plotPending}>— live at launch</span>
            )}
          </div>
          <div className={styles.plotStat}>
            <span className={styles.plotLabel}>Hourly tick</span>
            <span className={styles.plotValue}>
              {nf2.format(hourlyTick)}{" "}
              <span className={styles.unit}>bAXS/hr</span>
            </span>
          </div>
        </div>

        {/* ---------- Axie assignment ---------- */}
        <span className={styles.groupLabel}>Your working Axies</span>
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
            <span className={styles.totalLabel}>Your Atia&apos;s Flame</span>
            <span className={styles.totalValue}>{nf.format(yourFlame)}</span>
          </div>
        </div>

        {over ? (
          <div className={styles.warn}>
            Over the {MAX_WORKING_AXIES}-slot limit by {used - MAX_WORKING_AXIES}.
          </div>
        ) : null}

        {/* ---------- Estimated earnings ---------- */}
        <div className={styles.estimate}>
          <div className={styles.estLine}>
            <span className={styles.estLabel}>
              Est. bAXS on {tier.name}
            </span>
            <span className={styles.estValue}>
              {estPerHr !== null ? (
                <>
                  {nf2.format(estPerHr)}{" "}
                  <span className={styles.unit}>/ hr</span>
                  <span className={styles.estDay}>
                    ≈ {nf2.format(estPerHr * 24)} / day
                  </span>
                </>
              ) : (
                <span className={styles.estDim}>live at launch</span>
              )}
            </span>
          </div>
          <span className={styles.hint}>
            Your flame ÷ (tier total + your flame) × hourly tick. Fills in
            automatically once the tier total goes live at launch.
          </span>
        </div>

        <div className={styles.actions}>
          <button
            className="btn-ghost"
            onClick={() => setCounts({})}
            disabled={used === 0}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
