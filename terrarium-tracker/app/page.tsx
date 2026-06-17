"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { TIERS } from "@/app/lib/tiers";
import { Account, readAccounts, writeAccounts, removeAccount } from "@/app/lib/auth";
import LoginModal from "@/app/_components/LoginModal";
import FlameCalculator from "@/app/_components/FlameCalculator";
import styles from "./page.module.css";

const nf = new Intl.NumberFormat("en-US");

export default function Home() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showLogin, setShowLogin] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [liveTotals, setLiveTotals] = useState<Record<string, number | null>>({});
  const [flameLoaded, setFlameLoaded] = useState(false);

  // Hydrate accounts from localStorage on mount.
  useEffect(() => {
    setAccounts(readAccounts());
  }, []);

  // Pull live per-tier Total Atia's Flame from the Terrarium leaderboard API.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/tier-flame?period=hourly");
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
    const id = setInterval(load, 60_000); // refresh each tick (hourly window)
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const totalFor = (key: string, fallback: number | null) =>
    liveTotals[key] ?? fallback;

  function syncAccounts(next: Account[]) {
    writeAccounts(next);
    setAccounts(next);
  }

  function logout(userID: string) {
    syncAccounts(removeAccount(readAccounts(), userID));
  }

  const loggedIn = accounts.length > 0;

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
          <a className={styles.navLink} href="#tiers">
            Tiers
          </a>
          <a className={styles.navLink} href="#accounts">
            Accounts
          </a>
          {loggedIn ? (
            <span className="chip chip-gold">
              {accounts.length} account{accounts.length > 1 ? "s" : ""}
            </span>
          ) : null}
          <button className="btn-ghost" onClick={() => setShowCalc(true)}>
            Calculator
          </button>
          <button className="btn-primary" onClick={() => setShowLogin(true)}>
            {loggedIn ? "Add account" : "Login"}
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
              {flameLoaded ? "Live flame · current tick" : "Loading live data…"}
            </span>
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

        {/* ---------- Accounts summary ---------- */}
        <section id="accounts" className={styles.accounts}>
          <div className={styles.accountsHead}>
            <div>
              <h2 className={styles.sectionTitle}>Accounts Summary</h2>
              <p className={styles.sectionSub}>
                Your accounts&apos; current Axies in plots — live flame per
                account at launch.
              </p>
            </div>
            <button className="btn-ghost" onClick={() => setShowLogin(true)}>
              + Add account
            </button>
          </div>

          {loggedIn ? (
            <div className={styles.accountList}>
              {accounts.map((a) => (
                <div key={a.userID} className={`glass-card ${styles.accountRow}`}>
                  <div className={styles.accountInfo}>
                    <span className={styles.accountName}>
                      {a.name || a.email || a.userID.slice(0, 8)}
                    </span>
                    <span className={styles.accountEmail}>{a.email}</span>
                  </div>
                  <div className={styles.accountMeta}>
                    {a.tokenExpired ? (
                      <span className="chip" style={{ color: "var(--warn)" }}>
                        Token expired
                      </span>
                    ) : (
                      <span className="chip chip-live">
                        <span className="pulse-dot" /> Active
                      </span>
                    )}
                    <button
                      className={styles.logoutBtn}
                      onClick={() => logout(a.userID)}
                    >
                      Log out
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={`glass-card ${styles.empty}`}>
              <Image
                src="/motz/ego.png"
                alt="Ego"
                width={84}
                height={84}
                className={styles.egoImg}
              />
              <p className={styles.emptyTitle}>No accounts yet, fam.</p>
              <p className={styles.emptySub}>
                Log in with your Sky Mavis account to track your flame across
                every tier.
              </p>
              <button className="btn-primary" onClick={() => setShowLogin(true)}>
                Login
              </button>
            </div>
          )}
        </section>
      </main>

      <footer className={styles.footer}>
        <span>
          Owned &amp; maintained by <strong>MoTZ</strong>
        </span>
        <span className={styles.footerDim}>
          Prepping for Terrariums · data wires up at launch
        </span>
      </footer>

      {showLogin ? (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onAccounts={(next) => syncAccounts(next)}
        />
      ) : null}

      {showCalc ? (
        <FlameCalculator
          onClose={() => setShowCalc(false)}
          liveTotals={liveTotals}
        />
      ) : null}
    </div>
  );
}
