# Terrarium Tracker

A MoTZ tool that shows **Total Atia's Flame per land tier** for Terrariums —
the denominator in the bAXS reward formula, so players can estimate their share
(`your flame ÷ tier total`).

Built ahead of the **Terrariums launch (June 17, 2026)**. The UI, theme, login,
and account handling are done; the live per-tier flame numbers wire in the moment
the Terrariums API is reachable.

## Stack

- Next.js 16 (App Router, TS), no Tailwind — plain CSS + CSS Modules
- [MoTZ Design System](../design-system) tokens (void mode, Fredoka/Inter/JetBrains)
- Deploy target: Vercel

## Run

```bash
npm install
npm run dev   # http://localhost:3001 via .claude/launch.json
```

## How it's wired

### Dashboard (`app/page.tsx`)
Six tier cards (Luna's Landing, Genesis, Mystic, Arctic, Forest, Savannah) in the
wireframe order. Each shows `Total Atia's Flame` (placeholder `—` until launch) plus
known reference data — bAXS pool/month and bAXS/tick from the Land Utility Breakdown
(`app/lib/tiers.ts`).

### Login — same as Homeland Stats
Reuses the exact Sky Mavis flow so tokens are interchangeable with
homeland.markofthezeal.com:

- Password is **SHA-256 hex** hashed client-side (`app/lib/auth.ts`).
- `POST /api/login {email, password, captcha}` → on MFA, `POST /api/mfa {token, passcode}`.
- Tokens are merged into `localStorage.ACCOUNTS_DATA` (same schema/key as homeland),
  so multi-account works and accounts carry over.
- Our `/api/*` routes (`app/api/*`) **proxy to the MoTZ backend**
  (`app/lib/proxy.ts`, `TERRARIUM_UPSTREAM_BASE`, default homeland). Repoint this
  env var to the Terrariums endpoints at launch — no client changes.

**Status of each path:**
- ✅ **Import Accounts** (paste `ACCOUNTS_DATA` JSON) — works today, no captcha.
- ✅ Account storage / summary / multi-account / logout — verified.
- ⚠️ **Email + password + MFA** — fully wired, but needs the Sky Mavis
  rotate-captcha widget (`x.skymavis.com/captcha-srv`). For now there's a captcha-token
  field; the interactive widget is the one remaining piece to validate on launch day.

## Live data (wired ✅)

Total Atia's Flame per tier is **live** from the public Terrarium API:

```
GET https://axie-terrarium-api.axieinfinity.com/api/v1/leaderboards/baxs
    ?land_type=<Savannah|Forest|Arctic|Mystic|Genesis|LunasLanding>
    &period=<hourly|daily|monthly>
→ { total_atia_flame, window_start_tick, window_end_tick, entries[] }
```

- `app/api/tier-flame/route.ts` proxies all six tiers (default `period=hourly`
  = current tick). Override host with `TERRARIUM_API_BASE`.
- `app/page.tsx` fetches it on mount + every 60s; the cards and the calculator
  read the same `liveTotals`, so the bAXS estimate computes from the real
  denominator. No login needed for tier totals.
- Param is snake_case `land_type`; Luna's Landing = `LunasLanding`.

### Still per-account (needs Sky Mavis auth)
`/api/v1/me/*` (getMe, listActivatedAxies, baxs-rewards) for the Accounts
Summary's "current Axies in plots" — auth via `athena.skymavis.com/v2`.
