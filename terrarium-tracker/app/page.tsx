"use client";

import { useCallback, useEffect, useState } from "react";
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

function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 30) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function Home() {
  const [showLogin, setShowLogin] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [liveTotals, setLiveTotals] = useState<Record<string, number | null>>({});
  const [reportedTotals, setReportedTotals] = useState<Record<string, number | null>>({});
  const [hourlyTotals, setHourlyTotals] = useState<Record<string, number | null>>({});
  const [reportedMap, setReportedMap] = useState<Record<string, boolean>>({});
  const [flameLoaded, setFlameLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [, setNowTick] = useState(0); // re-render to keep "x ago" live

  // Live "updated X ago" ticker.
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // From the tier modal: track a wallet and jump to the Accounts Summary.
  function trackWallet(address: string) {
    writeTracked(addTracked(readTracked(), address));
    notifyTrackedUpdated();
    setSelectedTier(null);
    document.getElementById("accounts")?.scrollIntoView({ behavior: "smooth" });
  }

  // Pull each tier's flame. `fresh` bypasses the ~10-min edge cache (cache-bust
  // query + no-store) to force a live recompute — used by the Refresh button.
  const loadFlame = useCallback(async (fresh = false) => {
    const results = await Promise.all(
      TIERS.map(async (t) => {
        try {
          const url =
            `/api/tier-flame?key=${t.key}` + (fresh ? `&t=${Date.now()}` : "");
          const res = await fetch(url, fresh ? { cache: "no-store" } : {});
          const j = await res.json();
          return [
            t.key,
            typeof j.total === "number" ? j.total : null,
            !!j.reported,
            j.updatedAt ? Date.parse(j.updatedAt) : null,
            typeof j.reportedTotal === "number" ? j.reportedTotal : null,
            typeof j.reportedHourly === "number" ? j.reportedHourly : null,
          ] as const;
        } catch {
          return [t.key, null, false, null, null, null] as const;
        }
      })
    );
    const totals: Record<string, number | null> = {};
    const reported: Record<string, boolean> = {};
    const reportedVals: Record<string, number | null> = {};
    const hourlyVals: Record<string, number | null> = {};
    const times: number[] = [];
    for (const [k, v, rep, ts, repVal, hrVal] of results) {
      totals[k] = v;
      reported[k] = rep;
      reportedVals[k] = repVal;
      hourlyVals[k] = hrVal;
      if (ts) times.push(ts);
    }
    setLiveTotals(totals);
    setReportedMap(reported);
    setReportedTotals(reportedVals);
    setHourlyTotals(hourlyVals);
    // Oldest compute time across tiers = how fresh the dashboard is.
    setUpdatedAt(times.length ? Math.min(...times) : Date.now());
    setFlameLoaded(true);
  }, []);

  // Initial load + 2-min polling (cached values, cheap).
  useEffect(() => {
    loadFlame();
    const id = setInterval(() => loadFlame(), 120_000);
    return () => clearInterval(id);
  }, [loadFlame]);

  // Manual refresh: force a fresh recompute past the cache (expensive).
  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadFlame(true);
    } finally {
      setRefreshing(false);
    }
  }

  const totalFor = (key: string, fallback: number | null) =>
    liveTotals[key] ?? fallback;

  // All-plots roll-up: season total vs last hour, both summed across tiers from
  // the leaderboard's reported total_atia_flame (apples-to-apples windows).
  const allPlotsSeason = TIERS.reduce(
    (s, t) => s + (reportedTotals[t.key] ?? 0),
    0
  );
  const allPlotsHour = TIERS.reduce(
    (s, t) => s + (hourlyTotals[t.key] ?? 0),
    0
  );

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
          <div className={styles.updatedRow}>
            {updatedAt ? (
              <span
                className={styles.updated}
                title={`Data computed ${new Date(updatedAt).toLocaleString()}`}
              >
                Updated {relTime(updatedAt)}
              </span>
            ) : null}
            <button
              type="button"
              className={styles.refreshBtn}
              onClick={handleRefresh}
              disabled={refreshing}
              title="Force a fresh recompute (bypasses the ~10-min cache)"
            >
              {refreshing ? "Refreshing…" : "↻ Refresh"}
            </button>
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
                    // Headline = our live deployed flame (sum across all plots).
                    const deployed = totalFor(t.key, t.totalAtiasFlame);
                    if (deployed == null) return flameLoaded ? "0" : "—";
                    return nf.format(deployed);
                  })()}
                </div>
                {(() => {
                  const api = reportedTotals[t.key];
                  if (api == null) return null;
                  return (
                    <span className={styles.flameNote}>
                      in-game leaderboard: {nf.format(api)}
                    </span>
                  );
                })()}
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

        {/* ---------- All-plots roll-up: season total vs last hour ---------- */}
        <section className={`glass-card ${styles.rollup}`}>
          <div className={styles.rollupItem}>
            <span className="eyebrow">Total Atia&apos;s Flame · all plots</span>
            <span className={styles.rollupValue}>
              {flameLoaded ? nf.format(allPlotsSeason) : "—"}
            </span>
            <span className={styles.rollupSub}>current atia flame</span>
          </div>
          <span className={styles.rollupDivider} />
          <div className={styles.rollupItem}>
            <span className="eyebrow">Last hour · all plots</span>
            <span className={`${styles.rollupValue} ${styles.rollupHour}`}>
              {flameLoaded ? nf.format(allPlotsHour) : "—"}
            </span>
            <span className={styles.rollupSub}>atia flame hour ago</span>
          </div>
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
