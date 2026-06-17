"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Tier } from "@/app/lib/tiers";
import { shortAddress } from "@/app/lib/tracked";
import styles from "./TierModal.module.css";

const nf = new Intl.NumberFormat("en-US");

type Entry = {
  rank: number;
  address: string;
  plots: number;
  axies: number;
  flame: number;
};

type Data = {
  name: string;
  total: number;
  deployedTotal: number;
  participants: number;
  shown: number;
  entries: Entry[];
};

type Props = {
  tier: Tier;
  onClose: () => void;
  onTrackWallet: (address: string) => void;
};

export default function TierModal({ tier, onClose, onTrackWallet }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tier-leaderboard?key=${tier.key}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tier.key]);

  const ranked = data?.entries ?? [];

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className={styles.head}>
          <span
            className={styles.tile}
            style={{ boxShadow: `0 6px 18px ${tier.accent}55` }}
          >
            <Image src={tier.img} alt={tier.name} width={40} height={40} />
          </span>
          <div>
            <h3 className={styles.title}>{tier.name}</h3>
            <div className={styles.sub}>
              <span style={{ color: tier.accent }}>
                {data ? nf.format(data.deployedTotal) : "…"}
              </span>{" "}
              deployed flame · {data ? nf.format(data.participants) : "…"} wallets
              {data && data.participants > data.shown
                ? ` · top ${data.shown} by plots`
                : ""}
            </div>
          </div>
        </div>

        <div className={styles.cols}>
          <span>#</span>
          <span>Wallet</span>
          <span className={styles.right}>Plots</span>
          <span className={styles.right}>Axies</span>
          <span className={styles.right}>Flame</span>
        </div>

        <div className={styles.list}>
          {loading ? (
            <div className={styles.empty}>Loading wallets…</div>
          ) : ranked.length === 0 ? (
            <div className={styles.empty}>No wallets in this tier yet.</div>
          ) : (
            ranked.map((e) => (
              <button
                key={e.address}
                className={styles.row}
                onClick={() => onTrackWallet(e.address)}
                title="Load this wallet's Axies below"
              >
                <span className={styles.rank}>{e.rank}</span>
                <span className={styles.addr}>{shortAddress(e.address)}</span>
                <span className={styles.right}>{e.plots}</span>
                <span className={styles.right}>{e.axies}</span>
                <span className={`${styles.right} ${styles.flame}`}>
                  {nf.format(e.flame)}
                </span>
              </button>
            ))
          )}
        </div>

        <p className={styles.hint}>
          Tap a wallet to load its plots &amp; Axies in the Accounts Summary.
        </p>
      </div>
    </div>
  );
}
