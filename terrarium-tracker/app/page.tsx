"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { TIERS, Tier } from "@/app/lib/tiers";
import {
  readTracked,
  writeTracked,
  addTracked,
  notifyTrackedUpdated,
} from "@/app/lib/tracked";
import LoginModal from "@/app/_components/LoginModal";
import FlameCalculator from "@/app/_components/FlameCalculator";
import AccountsPanel from "@/app/_components/AccountsPanel";
import TierModal from "@/app/_components/TierModal";
import styles from "./page.module.css";

const nf = new Intl.NumberFormat("en-US");

export default function Home() {
  const [showLogin, setShowLogin] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [liveTotals, setLiveTotals] = useState<Record<string, number | null>>({});
  const [reportedMap, setReportedMap] = useState<Record<string, boolean>>({});
  const [flameLoaded, setFlameLoaded] = useState(false);

  // From the tier modal: track a wallet and jump to the Accounts Summary.
  function trackWallet(address: string) {
    writeTracked(addTracked(readTracked(), address));
    notifyTrackedUpdated();
    setSelectedTier(null);
    document.getElementById("accounts")?.scrollIntoView({ behavior: "smooth" });
  }

  // Pull each tier's deployed Total Atia's Flame (sum of all axies' flame).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const results = await Promise.all(
        TIERS.map(async (t) => {
          try {
            const res = await fetch(`/api/tier-flame?key=${t.key}`);
            const j = await res.json();
            return [t.key, typeof j.total === "number" ? j.total : null, !!j.reported] as const;
          } catch {
            return [t.key, null, false] as const;
          }
        })
      );
      if (cancelled) return;
      const totals: Record<string, number | null> = {};
      const reported: Record<string, boolean> = {};
      for (const [k, v, rep] of results) {
        totals[k] = v;
        reported[k] = rep;
      }
      setLiveTotals(totals);
      setReportedMap(reported);
      setFlameLoaded(true);
    }
    load();
    const id = setInterval(load, 120_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const totalFor = (key: string, fallback: number | null) =>
    liveTotals[key] ?? fallback;

  return (
    <div className={styles.page}>
      {/* ---------- Header ---------- */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <Image
            className={styles.wordmark}
            src="/motz/logos/motz-wordmark-horizontal.png"
            alt="MoTZ"
            width={132}
            height={36}
            priority
          />
          <span className={styles.brandDivider} />
          <span className={styles.brandName}>Terrarium Tracker</span>
        </div>

        <nav className={styles.nav}>
          <button className="btn-ghost" onClick={() => setShowCalc(true)}>
            Calculator
          </button>
          <button className="btn-primary" onClick={() => setShowLogin(true)}>
            Login
          </button>
        </nav>
      </header>

      <main className={styles.main}>
        {/* ---------- Hero ---------- */}
        <section className={styles.hero}>
          <span className="eyebrow">Mark of the Zeal · Terrariums</span>
          <h1 className={styles.heroTitle}>
            Total <span className="text-gradient">Atia&apos;s Flame</span> per Tier
          </h1>
          <p className={styles.heroSub}>
            The reward-formula denominator, live for every land tier. Your bAXS
            share = your flame ÷ the tier total below.
          </p>
          <div className={styles.heroBadges}>
            <span className="chip chip-live">
              <span className="pulse-dot" /> Terrariums · Live
            </span>
            <span className="chip chip-gold">
              {flameLoaded ? "Live · total flame per tier" : "Loading live data…"}
            </span>
          </div>
        </section>

        {/* ---------- Tier cards ---------- */}
        <section id="tiers" className={styles.grid}>
          {TIERS.map((t) => (
            <article
              key={t.key}
              className={`glass-card ${styles.card} ${styles.cardClickable}`}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedTier(t)}
              onKeyDown={(e) => e.key === "Enter" && setSelectedTier(t)}
            >
              <span
                className={styles.cardBar}
                style={{ background: t.accent }}
              />
              <span className={styles.cardHint}>View wallets ↗</span>
              <div className={styles.cardHead}>
                <span
                  className={styles.tierTile}
                  style={{ boxShadow: `0 6px 18px ${t.accent}55` }}
                >
                  <Image
                    src={t.img}
                    alt={`${t.name} land tile`}
                    width={44}
                    height={44}
                  />
                </span>
                <h3 className={styles.tierName}>{t.name}</h3>
              </div>

              <div className={styles.flameBlock}>
                <span className="eyebrow">Total Atia&apos;s Flame</span>
                <div
                  className={styles.flameValue}
                  style={{
                    color: t.accent,
                    textShadow: `0 0 22px ${t.accent}66`,
                  }}
                >
                  {(() => {
                    const v = totalFor(t.key, t.totalAtiasFlame);
                    if (v === null) return flameLoaded ? "0" : "—";
                    return nf.format(v);
                  })()}
                </div>
                {reportedMap[t.key] ? (
                  <span className={styles.flameNote}>
                    game-reported · no wallet list
                  </span>
                ) : null}
              </div>

              <div className={styles.cardStats}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>bAXS pool / mo</span>
                  <span className={styles.statValue}>
                    {nf.format(t.bAxsPoolMonth)}
                  </span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>bAXS / tick</span>
                  <span className={styles.statValue}>{t.bAxsPerTick}</span>
                </div>
              </div>
            </article>
          ))}
        </section>

        {/* ---------- Accounts summary (live, by Ronin address) ---------- */}
        <AccountsPanel />
      </main>

      <footer className={styles.footer}>
        <span>
          Owned &amp; maintained by <strong>MoTZ</strong>
        </span>
        <span className={styles.footerDim}>
          Live Terrariums data · not affiliated with Sky Mavis
        </span>
      </footer>

      {showLogin ? <LoginModal onClose={() => setShowLogin(false)} /> : null}

      {showCalc ? (
        <FlameCalculator
          onClose={() => setShowCalc(false)}
          liveTotals={liveTotals}
        />
      ) : null}

      {selectedTier ? (
        <TierModal
          tier={selectedTier}
          onClose={() => setSelectedTier(null)}
          onTrackWallet={trackWallet}
        />
      ) : null}
    </div>
  );
}
