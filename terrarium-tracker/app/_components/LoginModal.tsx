"use client";

import { useState } from "react";
import {
  WalletKind,
  connectWallet,
  readTracked,
  writeTracked,
  addTracked,
  notifyTrackedUpdated,
} from "@/app/lib/tracked";
import styles from "./LoginModal.module.css";

type Props = { onClose: () => void };

type Wallet = { key: WalletKind; name: string; color: string; mark: string };

const PRIMARY: Wallet = {
  key: "ronin",
  name: "Ronin Wallet",
  color: "#1273ea",
  mark: "R",
};
const OTHERS: Wallet[] = [
  { key: "rabby", name: "Rabby Wallet", color: "#8697ff", mark: "R" },
  { key: "coinbase", name: "Coinbase Wallet", color: "#0052ff", mark: "C" },
  { key: "metamask", name: "MetaMask", color: "#e2761b", mark: "M" },
  { key: "walletconnect", name: "WalletConnect", color: "#3b99fc", mark: "W" },
];

export default function LoginModal({ onClose }: Props) {
  const [busy, setBusy] = useState<WalletKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect(kind: WalletKind) {
    setError(null);
    setBusy(kind);
    try {
      const { address, error } = await connectWallet(kind);
      if (error || !address) {
        setError(error ?? "Connection failed.");
        return;
      }
      writeTracked(addTracked(readTracked(), address));
      notifyTrackedUpdated();
      onClose();
    } finally {
      setBusy(null);
    }
  }

  const Badge = ({ w }: { w: Wallet }) => (
    <span className={styles.badge} style={{ background: w.color }}>
      {w.mark}
    </span>
  );

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>

        <h3 className={styles.title}>Login</h3>

        <button
          className={styles.primaryWallet}
          onClick={() => connect(PRIMARY.key)}
          disabled={busy !== null}
        >
          <Badge w={PRIMARY} />
          <span>
            {busy === PRIMARY.key
              ? "Connecting…"
              : `Continue with ${PRIMARY.name}`}
          </span>
        </button>

        <div className={styles.divider}>
          <span>Other options</span>
        </div>

        <div className={styles.others}>
          {OTHERS.map((w) => (
            <button
              key={w.key}
              className={styles.walletBtn}
              onClick={() => connect(w.key)}
              disabled={busy !== null}
            >
              <Badge w={w} />
              <span>
                {busy === w.key ? "Connecting…" : `Continue with ${w.name}`}
              </span>
            </button>
          ))}
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}

        <p className={styles.terms}>
          By connecting, you agree to the Terms of Service.
        </p>
      </div>
    </div>
  );
}
