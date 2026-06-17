"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { TIERS } from "@/app/lib/tiers";
import LoginModal from "@/app/_components/LoginModal";
import FlameCalculator from "@/app/_components/FlameCalculator";
import AccountsPanel from "@/app/_components/AccountsPanel";
import styles from "./page.module.css";

const nf = new Intl.NumberFormat("en-US");

type Period = "hourly" | "daily" | "monthly";
const PERIODS: { key: Period; label: string; note: string }[] = [
  { key: "hourly", label: "Hourly", note: "current tick" },
  { key: "daily", label: "Daily", note: "today" },
  { key: "monthly", label: "Monthly", note: "this month" },
];

export default function Home() {
  const [showLogin, setShowLogin] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [liveTotals, setLiveTotals] = useState<Record<string, number | null>>({});
  const [flameLoaded, setFlameLoaded] = useState(false);
  const [period, setPeriod] = useState<Period>("hourly");

  // Pull live per-tier Total Atia's Flame from the Terrarium leaderboard API.
  useEffect(() => {
    let cancelled = false;
    setFlameLoaded(false);
    async function load() {
      try {
        const res = await fetch(`/api/tier-flame?period=${period}`);
        const json = await res.json();
        if (!cancelled) {
          setLiveTotals(json.totals ?? {});
          setFlameLoaded(true);
        }
      } catch {
        if (!cancelled) setFlameLoaded(true);
      }
    }
    load();
    const id = setInterval(load, 60_000); // refresh each tick
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [period]);

  const periodNote = PERIODS.find((p) => p.key === period)?.note ?? "";

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
              {flameLoaded ? `Live flame · ${periodNote}` : "Loading live data…"}
            </span>
          </div>

          <div className={styles.periodToggle}>
            {PERIODS.map((p) => (
              <button
                key={p.key}
                className={`${styles.periodBtn} ${period === p.key ? styles.periodActive : ""}`}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>

        {/* ---------- Tier cards ---------- */}
        <section id="tiers" className={styles.grid}>
          {TIERS.map((t) => (
            <article key={t.key} className={`glass-card ${styles.card}`}>
              <span
                className={styles.cardBar}
                style={{ background: t.accent }}
              />
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
                <div className={styles.flameValue}>
                  {(() => {
                    const v = totalFor(t.key, t.totalAtiasFlame);
                    return v !== null ? nf.format(v) : flameLoaded ? "0" : "—";
                  })()}
                </div>
                <span className={styles.flameNote}>{t.bAxsPerTick} bAXS / hr</span>
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
    </div>
  );
}
