"use client";

import { useState } from "react";
import {
  Account,
  readAccounts,
  mergeAccount,
  sha256Hex,
  login,
  submitMfa,
} from "@/app/lib/auth";
import styles from "./LoginModal.module.css";

type Props = {
  onClose: () => void;
  onAccounts: (next: Account[]) => void;
};

type Tab = "signin" | "import";

export default function LoginModal({ onClose, onAccounts }: Props) {
  const [tab, setTab] = useState<Tab>("signin");

  // sign-in state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");

  // import state
  const [importText, setImportText] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function persist(incoming: Account) {
    const next = mergeAccount(readAccounts(), incoming);
    onAccounts(next);
    onClose();
  }

  async function handleLogin() {
    setError(null);
    setBusy(true);
    try {
      const hashed = await sha256Hex(password);
      const res = await login(email.trim(), hashed, captcha.trim());
      if (res.success && res.data) {
        persist(res.data);
        return;
      }
      const mfa = res.error?.error_details?.mfaToken;
      if (mfa) {
        setMfaToken(mfa);
        return;
      }
      setError(res.error?.error_message || "Login failed. Check your details.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleMfa() {
    if (!mfaToken) return;
    setError(null);
    setBusy(true);
    try {
      const res = await submitMfa(mfaToken, passcode.trim());
      if (res.success && res.data) {
        persist(res.data as Account);
        return;
      }
      setError("Verification failed. Try the code again.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleImport() {
    setError(null);
    try {
      const parsed = JSON.parse(importText);
      const list: Account[] = Array.isArray(parsed) ? parsed : [parsed];
      const valid = list.filter((a) => a && a.accessToken && a.userID);
      if (valid.length === 0) {
        setError("No valid accounts found. Expected ACCOUNTS_DATA JSON.");
        return;
      }
      let next = readAccounts();
      for (const a of valid) next = mergeAccount(next, a);
      onAccounts(next);
      onClose();
    } catch {
      setError("Invalid JSON.");
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className={styles.head}>
          <h3 className={styles.title}>
            Welcome to <span className="text-gradient">Terrarium Tracker</span>
          </h3>
          <p className={styles.sub}>Same Sky Mavis login as Homeland Stats.</p>
        </div>

        {mfaToken ? (
          /* ---------- MFA step ---------- */
          <div className={styles.form}>
            <label className={styles.label}>Two-factor code</label>
            <input
              className={styles.input}
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="6-digit code"
              inputMode="numeric"
              autoFocus
            />
            {error ? <div className={styles.error}>{error}</div> : null}
            <button
              className="btn-primary"
              onClick={handleMfa}
              disabled={busy || passcode.length < 4}
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
            <button
              className={styles.linkBtn}
              onClick={() => {
                setMfaToken(null);
                setPasscode("");
                setError(null);
              }}
            >
              ← Back
            </button>
          </div>
        ) : (
          <>
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${tab === "signin" ? styles.tabActive : ""}`}
                onClick={() => setTab("signin")}
              >
                Sign In
              </button>
              <button
                className={`${styles.tab} ${tab === "import" ? styles.tabActive : ""}`}
                onClick={() => setTab("import")}
              >
                Import Accounts
              </button>
            </div>

            {tab === "signin" ? (
              /* ---------- Email / password ---------- */
              <div className={styles.form}>
                <label className={styles.label}>Email</label>
                <input
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  autoFocus
                />
                <label className={styles.label}>Password</label>
                <input
                  className={styles.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  type="password"
                />
                <label className={styles.label}>
                  Captcha token
                  <span className={styles.hint}>
                    Sky Mavis rotate-captcha widget lands at launch — paste a
                    token for now, or use Import.
                  </span>
                </label>
                <input
                  className={styles.input}
                  value={captcha}
                  onChange={(e) => setCaptcha(e.target.value)}
                  placeholder="captcha token"
                />
                {error ? <div className={styles.error}>{error}</div> : null}
                <button
                  className="btn-primary"
                  onClick={handleLogin}
                  disabled={busy || !email || !password}
                >
                  {busy ? "Signing in…" : "Sign In"}
                </button>
              </div>
            ) : (
              /* ---------- JSON import ---------- */
              <div className={styles.form}>
                <label className={styles.label}>
                  Accounts JSON
                  <span className={styles.hint}>
                    Paste your <code>ACCOUNTS_DATA</code> array exported from
                    Homeland Stats (Manage Accounts → export). Tokens are stored
                    locally in your browser only.
                  </span>
                </label>
                <textarea
                  className={styles.textarea}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder='[{"accessToken":"…","userID":"…","gameToken":"…","name":"…"}]'
                  rows={7}
                />
                {error ? <div className={styles.error}>{error}</div> : null}
                <button
                  className="btn-primary"
                  onClick={handleImport}
                  disabled={!importText.trim()}
                >
                  Import
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
