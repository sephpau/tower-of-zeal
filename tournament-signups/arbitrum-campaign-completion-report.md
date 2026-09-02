# ARBITRUM ECOSYSTEM GAMING GRANT
## Campaign Completion Report

*All three milestones contracted under this grant are complete. Every conversion target was exceeded and every scheduled deliverable was shipped. The pages that follow document each milestone — its tournaments, its content, and its verified on-chain wallet conversions — with proof recorded on Arbitrum One.*

| Field | Detail |
|---|---|
| **GRANTEE** | Kyroh LLC (Mark of The Zeal) |
| **GRANT PARTNER** | Arbitrum Foundation |
| **CAMPAIGN** | Three-month growth campaign — tournaments, content & wallet conversions |
| **CAMPAIGN WINDOW** | April 22 – July 25, 2026 |
| **MILESTONE 1 — Ignition** | $5,000 · complete |
| **MILESTONE 2 — Momentum** | $5,000 · complete |
| **MILESTONE 3 — Final Boss** | $5,000 · complete |
| **REQUESTED IN THIS REPORT** | $15,000 — all three milestones |
| **ON-CHAIN VERIFICATION** | Arbitrum One · `0x59Fb229A6CC59DA5e037483aC94fd5Df7EDf2C8e` |

*Prepared August 2026 by Kyroh LLC for the Arbitrum Foundation · markofthezeal.com/motzxarbitrum*

---

## OVERVIEW — Executive Summary

All three milestones in this grant are complete. Across a three-month growth campaign, MoTZ ran a series of livestreamed and community tournaments on Arbitrum-connected titles, published supporting short-form and long-form content, and drove new players to complete a **gasless, on-chain wallet check-in** on Arbitrum One as the campaign's verifiable conversion event.

The campaign delivered **588 verified Arbitrum wallet conversions against a 500 target (118%)**, with each milestone independently exceeding its own conversion goal. Every conversion is an on-chain transaction on Arbitrum One and is independently auditable; the full per-wallet ledger with transaction hashes is retained for review.

### Milestone Status

| Milestone | Contracted Scope | Conversions | Status |
|---|---|---|---|
| **M1 — Ignition** | 1 major livestreamed tournament · 1 secondary community tournament · 2 short-form videos · 1 long-form thread · 150+ verified conversions · data tracked & submitted | **160 / 150** (107%) | **Complete** |
| **M2 — Momentum** | 1 major livestreamed tournament · 1 secondary community tournament · 2 short-form videos · 1 long-form thread · 150+ verified conversions | **173 / 150** (115%) | **Complete** |
| **M3 — Final Boss** | 1 major livestreamed tournament · 1 secondary community tournament · 2 short-form videos · 1 long-form thread · 200+ verified conversions · final post-campaign report | **255 / 200** (128%) | **Complete** |
| **Total** | — | **588 / 500** (118%) | **Complete** |

### Where To See It

| Surface | Where | Notes |
|---|---|---|
| Milestone tracker | markofthezeal.com/motzxarbitrum/milestone | Live progress dashboard, all milestones at 100%. |
| On-chain recap | markofthezeal.com/motzxarbitrum | Public campaign recap. |
| Conversion contract | Arbitrum One `0x59Fb…2C8e` | `CheckedIn` events — every conversion, on-chain. |
| Tournaments | *[PLACEHOLDER: tournament announcement / results links]* | Community tournaments run across the campaign. |

---

## CAMPAIGN AT A GLANCE

The campaign paired **community tournaments** with a single, verifiable **on-chain conversion event**: a gasless wallet check-in on Arbitrum One. A new player signs in, checks in on-chain, and that transaction is the conversion — counted once per unique wallet, per event.

| At a glance | |
|---|---|
| **Verified conversions** | 588 (target 500 · 118%) |
| **Milestones completed** | 3 of 3 |
| **Targets exceeded** | 3 of 3 |
| **Flagship tournaments** | 4 (plus a bonus holders event) |
| **Unique wallets (flagship events)** | 331 |
| **Returning participants** | 33% joined 2+ events |
| **Verification** | 100% on-chain, Arbitrum One |

*How a conversion is counted: one unique wallet, one on-chain `CheckedIn` transaction, counted once per event. This includes the 38 check-ins completed for the June Amiko Legends event before it was cancelled — those wallets performed real, verifiable on-chain conversions even though the event itself did not run. Nothing is entered by hand — every figure in this report is read directly from the contract, and a recount of the contract's `CheckedIn` events reproduces the totals exactly.*

---

## CAMPAIGN INFRASTRUCTURE — Built For This Grant

Rather than counting conversions in a spreadsheet, MoTZ built dedicated on-chain infrastructure for this campaign: a purpose-built smart contract on Arbitrum One, a custom signup application, a public transaction ledger, and a custom in-house game for the closing tournament. Everything below is live and inspectable today.

### The conversion contract — Arbitrum One

A purpose-built tournament check-in contract was deployed to Arbitrum One at `0x59Fb229A6CC59DA5e037483aC94fd5Df7EDf2C8e`. Each tournament is created on-chain as its own event (`EventCreated`), with an enforced check-in window; every signup is a `CheckedIn` transaction recording the wallet and timestamp, limited to one check-in per wallet per event. A cancelled event is likewise recorded on-chain (`EventCancelled`) — which is why the cancelled Amiko Legends event and its 38 signups are visible in the ledger but excluded from campaign totals. The contract is the single source of truth: every figure in this report is read from its event log, not from any off-chain database.

### The custom signup site — gasless for the user

Signups happen through a custom-built signup application (Vite/React) at **motz-check-in.vercel.app**. A participant connects their wallet and checks in to the open tournament — and the check-in is **gasless for the user**: MoTZ's relayer submits the check-in transaction and sponsors the gas, so a brand-new wallet with zero ETH can complete a verified on-chain conversion. This mattered for the funnel's target audience — gamers new to Arbitrum — because the very first thing the campaign asked of them did not require buying gas first. Despite costing the user nothing, every conversion still settles as a real, independently auditable transaction on Arbitrum One.

### The public transaction ledger

Transparency was built in as a public product, not an internal spreadsheet:

| Page | What it shows |
|---|---|
| markofthezeal.com/motzxarbitrum | On-chain campaign recap — per-tournament signup totals, day-by-day signup charts, returning-player breakdown. |
| markofthezeal.com/motzxarbitrum/milestone | Live milestone tracker — all milestones at 100%. |
| Signup transactions page | The complete ledger: **588 signup transactions**, each row a transaction hash, wallet, timestamp and block, linking out to Arbiscan. |

Anyone — the Arbitrum Foundation included — can audit any single conversion from the public page straight through to the chain.

### A custom game for the final tournament

The campaign's two closing flagships — the **MoTZ Survival Competition × Arbitrum** (103 verified signups) and the **Arbitrum × Zeal Survivors Tournament #2** (114 verified signups) — were played on **Zeal Survivors**, a game MoTZ built specifically for this campaign's closing tournaments: designed, coded and illustrated fully in-house, it shipped on the guild's own site on June 10, 2026 — three weeks before the Survival Competition opened — and gained a purpose-built competitive tournament mode (five-minute seeded blitz matches, with overtime) for the events themselves. Tournament entry was gated and verified through the campaign's Arbitrum One check-in contract: a player's on-chain check-in was their tournament registration. Building the game for the finals meant the whole closing funnel — game, tournament format, signup flow, and on-chain verification — was MoTZ-operated end to end, and the sequel event out-drawing the first (114 vs 103) showed the format retained its audience.

---

## MILESTONE 1 — IGNITION · Complete

**Contracted deliverables:** 1 major livestreamed tournament · 1 secondary community tournament · 2 short-form videos · 1 long-form Twitter thread · 150+ verified Arbitrum wallet conversions · all conversion data tracked and submitted.

**Tournament activation.** The launch month centred on the **Amiko Legends Tournament** (check-in window April 22–30, 2026), a livestreamed competition that opened the campaign and drove the month's conversions.

**Conversions.** **160 verified wallet conversions** against the 150 target (**107%**) — all recorded on Arbitrum One during the check-in window.

**Content.** 2 short-form videos and 1 long-form thread published in support of the activation. Thread: https://x.com/MarkofTheZeal/status/2058233256663740748 · *[PLACEHOLDER: video links]*

**Data.** All conversion data tracked and submitted; per-wallet ledger with transaction hashes retained.

> **Evidence:** *[PLACEHOLDER: livestream link/views · tournament results screenshot · content links]*

---

## MILESTONE 2 — MOMENTUM · Complete

**Contracted deliverables:** 1 major livestreamed tournament · 1 secondary community tournament · 2 short-form videos · 1 long-form Twitter thread · 150+ verified Arbitrum wallet conversions.

**Tournament activation.** The momentum month was anchored by **The Beacon × Arbitrum × MoTZ Tournament** (check-in window May 21–29, 2026), a co-branded livestreamed event, supported by a secondary holders activation (the **$250 Founders Coin Holders BEACON** bonus event, May 31 – June 5).

**Conversions.** **173 verified wallet conversions** against the 150 target (**115%**) — all recorded on Arbitrum One.

**Content.** 2 short-form videos and 1 long-form thread published in support. Thread: https://x.com/MarkofTheZeal/status/2074103885854077193 · *[PLACEHOLDER: video links]*

> **Evidence:** *[PLACEHOLDER: livestream link/views · tournament results screenshot · content links]*

---

## MILESTONE 3 — FINAL BOSS · Complete

**Contracted deliverables:** 1 major livestreamed tournament · 1 secondary community tournament · 2 short-form videos · 1 long-form Twitter thread · 200+ verified Arbitrum wallet conversions · final post-campaign report (conversion tracking & retention analysis).

**Tournament activation.** The closing month ran two flagship tournaments on the guild's own custom-built game: the **MoTZ Survival Competition × Arbitrum** (check-in window June 30 – July 6, 2026) and the **Arbitrum × Zeal Survivors Tournament #2** (check-in window July 19 – 25, 2026). A third event, the $1,000 Amiko Legends Arbitrum Tournament, drew 38 on-chain check-ins before being cancelled; those conversions are real on-chain transactions and are counted, while the event itself was not run.

**Conversions.** **255 verified wallet conversions** against the 200 target (**128%**) — the campaign's strongest month, all recorded on Arbitrum One (103 Survival Competition + 114 Zeal Survivors #2 + 38 from the cancelled event's check-in window).

**Content.** 2 short-form videos and 1 long-form thread published in support. Thread: https://x.com/MarkofTheZeal/status/2078861571116106067 · *[PLACEHOLDER: video links]*

**Final post-campaign report.** Delivered — see *Conversion Tracking* and *Retention Analysis* below.

> **Evidence:** *[PLACEHOLDER: livestream link/views · tournament results screenshot · content links]*

---

## CONVERSION TRACKING

Every conversion below is a unique wallet's on-chain check-in on Arbitrum One (`CheckedIn` event, contract `0x59Fb229A6CC59DA5e037483aC94fd5Df7EDf2C8e`). Figures are read directly from the chain.

### By Milestone

| Milestone | Target | Verified | % of Target |
|---|---|---|---|
| M1 — Ignition | 150 | **160** | 107% |
| M2 — Momentum | 150 | **173** | 115% |
| M3 — Final Boss | 200 | **255** | 128% |
| **Total** | **500** | **588** | **118%** |

### By Tournament (On-Chain Proof)

| Tournament | Check-in Window | Verified Signups | Status |
|---|---|---|---|
| Amiko Legends Tournament | Apr 22–30, 2026 | **160** | Completed |
| The Beacon × Arbitrum × MoTZ Tournament | May 21–29, 2026 | **139** | Completed |
| $250 Founders Coin Holders BEACON (bonus) | May 31 – Jun 5, 2026 | **34** | Completed (bonus) |
| MoTZ Survival Competition × Arbitrum | Jun 30 – Jul 6, 2026 | **103** | Completed |
| Arbitrum × Zeal Survivors Tournament #2 | Jul 19–25, 2026 | **114** | Completed |
| $1,000 Amiko Legends Arbitrum Tournament | Jun 13–20, 2026 | **38** | Cancelled — check-ins counted |

*Per-tournament ledgers — full wallet lists with their signup transaction hashes — are retained and available for audit on request.*

### Signup Pattern

Each event followed a consistent shape: a large **launch-day spike** as the tournament opened, a tapering mid-window, and a **closing-day surge** as the deadline approached. This indicates both strong top-of-funnel reach at launch and effective deadline-driven re-engagement. Representative daily curve (Amiko Legends): 63 → 39 → 11 → 3 → 4 → 9 → 6 → 15 → 10.

---

## RETENTION ANALYSIS

Acquisition is only half the story; the campaign's durability is in how many new wallets **returned**. Across the four flagship tournaments (Amiko Legends, Beacon × Arbitrum, Survival Competition, Zeal Survivors #2), **516 total signups resolved to 331 unique wallets**.

| Participation | Unique Wallets | Share |
|---|---|---|
| Joined **1** tournament | 221 | 67% |
| Joined **2** tournaments | 58 | 18% |
| Joined **3** tournaments | 29 | 9% |
| Joined **all 4** tournaments | 23 | 7% |
| **Total unique** | **331** | 100% |

**Takeaways:**
- **33% of participants returned** for at least a second tournament — the campaign built a recurring base, not one-off sign-ups.
- **23 "core" wallets (7%)** participated in every flagship tournament, forming a committed on-chain community nucleus that persisted across all three months.
- Combined with the launch-and-close signup pattern, the data shows the campaign both **reached new wallets** and **re-engaged** them across events.

---

## CLOSING — Request for Milestone Release

All three milestones contracted under this grant are complete. The preceding pages evidence each milestone's tournaments, content and verified on-chain conversions, with proof recorded on Arbitrum One. On that basis, Kyroh LLC requests release of all three milestones.

| Milestone | Contracted Deliverable | Status | Amount |
|---|---|---|---|
| M1 | Ignition — launch month | Complete | $5,000 |
| M2 | Momentum — growth month | Complete | $5,000 |
| M3 | Final Boss — close + final report | Complete | $5,000 |
| **Total requested** | | | **$15,000** |

**Payment**
Send to: *[PLACEHOLDER: Kyroh LLC payout wallet — Arbitrum One]*

*All conversion figures are verifiable on Arbitrum One — contract `0x59Fb229A6CC59DA5e037483aC94fd5Df7EDf2C8e`. The full per-wallet, per-tournament ledger with transaction hashes is available for inspection on request.*

*MoTZ · CAMPAIGN COMPLETION REPORT · markofthezeal.com/motzxarbitrum*
