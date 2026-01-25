# AQUARI Weekly Airdrop System

> Automated weekly reward distribution system for AQUARI token holders on Base blockchain.

---

## Table of Contents

1. [Overview](#overview)
2. [How It Works](#how-it-works)
3. [Production Flow](#production-flow)
4. [Test Mode](#test-mode)
5. [Fork Testing (Recommended)](#fork-testing-recommended)
6. [Technical Architecture](#technical-architecture)
7. [Disperse Contract Limits](#disperse-contract-limits)
8. [Configuration](#configuration)
9. [Admin Dashboard](#admin-dashboard)
10. [Database Schema](#database-schema)
11. [Deployment Checklist](#deployment-checklist)

---

## Overview

### What Is This?

A **fully autonomous** system that automatically rewards loyal AQUARI token holders every week. Once configured, cron jobs handle everything - the admin dashboard is purely for **monitoring and manual approval** when needed.

### Key Features

- **Autonomous Operation**: Cron jobs run snapshots, calculations, and airdrops automatically
- **MIN Balance Method**: Uses minimum of (start, end) balance to prevent gaming
- **Batch Airdrops**: Gas-efficient multi-send via Disperse contract (500 recipients/tx)
- **Real-time Monitoring**: Dashboard shows all job progress, status, and logs
- **Configurable Modes**: Test mode (minutes) vs Production mode (weekly)
- **Fork Testing**: Test with real mainnet data without spending real funds

### Token Information

| Property | Value |
|----------|-------|
| Token | AQUARI |
| Contract | `0x7F0E9971D3320521Fc88F863E173a4cddBB051bA` |
| Chain | Base Mainnet (Chain ID: 8453) |
| Decimals | 18 |
| Holders | ~12,000 |

### Disperse Contract

| Network | Address | Max Recipients/TX |
|---------|---------|-------------------|
| Base Mainnet | `0xD152f549545093347A162Dce210e7293f1452150` | 500 |
| Base Sepolia | `0xD152f549545093347A162Dce210e7293f1452150` | 500 |

---

## How It Works

### The MIN Balance Anti-Gaming System

```
┌─────────────────────────────────────────────────────────────────┐
│                    ELIGIBILITY CALCULATION                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  For each holder:                                               │
│                                                                 │
│    PREVIOUS Balance (Last Snap)   CURRENT Balance (New Snap)    │
│           ↓                              ↓                      │
│           └──────────┬───────────────────┘                      │
│                      ↓                                          │
│            MIN(PREVIOUS, CURRENT)                               │
│                      ↓                                          │
│         Is MIN >= 1000 AQUARI?                                  │
│                      │                                          │
│           ┌─────────┴─────────┐                                 │
│           ↓                   ↓                                 │
│          YES                  NO                                │
│           ↓                   ↓                                 │
│       ELIGIBLE            EXCLUDED                              │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  REWARD FORMULA:                                                │
│                                                                 │
│                    Holder's MIN Balance                         │
│  Holder Reward = ────────────────────────── × Total Reward Pool │
│                   Sum of ALL MIN Balances                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Anti-Gaming Examples

| Scenario | Previous | Current | MIN | Eligible? | Why |
|----------|----------|---------|-----|-----------|-----|
| Loyal Holder | 10,000 | 10,000 | 10,000 | ✅ Yes | Held full week |
| Partial Seller | 10,000 | 5,000 | 5,000 | ✅ Yes | Credit = lower amount |
| Accumulator | 5,000 | 15,000 | 5,000 | ✅ Yes | Credit = previous amount |
| Last-Minute Buy | 0 | 50,000 | 0 | ❌ No | Wasn't holding before |
| Dumper | 10,000 | 500 | 500 | ❌ No | Below 1000 minimum |

---

## Production Flow

### Data Sources

```
┌─────────────────────────────────────────────────────────────────────┐
│                    WHERE DATA COMES FROM                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   SNAPSHOTS (Holder Balances)                                      │
│   ────────────────────────────                                     │
│   Source: MORALIS API                                              │
│   • Queries real Base mainnet blockchain                           │
│   • Gets all AQUARI token holders + balances                       │
│   • ~12,000 holders per snapshot                                   │
│   • Always real data (cannot be faked)                             │
│                                                                     │
│   TRANSACTIONS (Airdrop Execution)                                 │
│   ─────────────────────────────────                                │
│   Source: RPC ENDPOINT                                             │
│   • Fork Mode = Anvil (test without real funds)                    │
│   • Production = Base Mainnet RPC                                  │
│   • Uses Disperse contract for batch transfers                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Weekly Production Cycle (3-Step Cron)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PRODUCTION WEEKLY FLOW                           │
│                    (Fully Autonomous)                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   .env CONFIG:                                                     │
│   MODE=production                                                  │
│   SNAPSHOT_CRON=0 0 * * 0    (Sundays at midnight UTC)             │
│   CALCULATE_CRON=5 0 * * 0   (Sundays at 00:05 UTC)                │
│   AIRDROP_CRON=10 0 * * 0    (Sundays at 00:10 UTC)                │
│                                                                     │
│   ══════════════════════════════════════════════════════════════   │
│   WEEK 1 - BASELINE (First Run Only)                               │
│   ══════════════════════════════════════════════════════════════   │
│                                                                     │
│   Sunday 00:00 ──► SNAPSHOT: Take 2026-W04 snapshot                │
│                    └─► Calls Moralis API                           │
│                    └─► Saves all 12,000 holders                    │
│                    └─► BASELINE (no previous to compare)           │
│                                                                     │
│   Sunday 00:05 ──► CALCULATE: Skipped (only 1 snapshot)            │
│   Sunday 00:10 ──► AIRDROP: Skipped (no distribution)              │
│                                                                     │
│   ══════════════════════════════════════════════════════════════   │
│   WEEK 2+ - FULL CYCLE (Repeats Every Week)                        │
│   ══════════════════════════════════════════════════════════════   │
│                                                                     │
│   SUNDAY 00:00 UTC                                                 │
│   ┌────────────────────────────────────────────────────────────┐   │
│   │  STEP 1: SNAPSHOT                                          │   │
│   │  ─────────────────────                                     │   │
│   │  • Call Moralis API                                        │   │
│   │  • Fetch all ~12,000 AQUARI holders                        │   │
│   │  • Save as 2026-W05 snapshot                               │   │
│   │  • Used as CURRENT for this week                           │   │
│   │  • Used as PREVIOUS for next week                          │   │
│   └────────────────────────────────────────────────────────────┘   │
│                          │                                         │
│                          ▼                                         │
│   SUNDAY 00:05 UTC                                                 │
│   ┌────────────────────────────────────────────────────────────┐   │
│   │  STEP 2: CALCULATE                                         │   │
│   │  ─────────────────────                                     │   │
│   │  • Load previous snapshot (2026-W04)                       │   │
│   │  • Load current snapshot (2026-W05)                        │   │
│   │  • Compare all holders                                     │   │
│   │  • Apply MIN(previous, current) rule                       │   │
│   │  • Filter: MIN balance >= 1000 AQUARI                      │   │
│   │  • Exclude: restricted addresses (bots)                    │   │
│   │  • Calculate rewards based on wallet balance               │   │
│   │  • Create batches (200 recipients each)                    │   │
│   │  • Status → "ready"                                        │   │
│   └────────────────────────────────────────────────────────────┘   │
│                          │                                         │
│                          ▼                                         │
│   SUNDAY 00:10 UTC                                                 │
│   ┌────────────────────────────────────────────────────────────┐   │
│   │  STEP 3: AIRDROP (Auto-Approve)                            │   │
│   │  ─────────────────────                                     │   │
│   │  • Read wallet balance as reward pool                      │   │
│   │  • Auto-approve distribution                               │   │
│   │  • Execute batches via Disperse contract                   │   │
│   │  • Process 200 recipients per transaction                  │   │
│   │  • Record txHash for each batch                            │   │
│   │  • Status → "completed"                                    │   │
│   └────────────────────────────────────────────────────────────┘   │
│                                                                     │
│   Logs show: [2026-W05] AIRDROP - Completed! 2889 recipients       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Snapshot Timeline Visual

```
Week 1          Week 2          Week 3          Week 4
│               │               │               │
▼               ▼               ▼               ▼
┌───┐           ┌───┐           ┌───┐           ┌───┐
│ A │           │ B │           │ C │           │ D │   ← Snapshots (via Moralis)
└───┘           └───┘           └───┘           └───┘
  │               │               │               │
  │ (saved only)  │               │               │
  │               │               │               │
  └───────┬───────┘               │               │
          │                       │               │
     Compare A↔B            Compare B↔C      Compare C↔D
     Airdrop #1             Airdrop #2       Airdrop #3

Note: Each snapshot is used TWICE:
  • As END of current week
  • As START of next week
  → Saves 50% API calls!
```

### Cron Schedule Summary (3-Step System)

| Step | Example Schedule | What It Does |
|------|------------------|--------------|
| 1. Snapshot | `0 0 * * 0` (Sun midnight) | Fetch all holders from Moralis |
| 2. Calculate | `5 0 * * 0` (Sun 00:05) | Compare with previous snapshot, create batches |
| 3. Airdrop | `10 0 * * 0` (Sun 00:10) | Auto-approve and execute batches |

**Note:** Each snapshot serves as:
- **Current** for this week's calculation
- **Previous** for next week's calculation

---

## Test Mode

### Overview

Test mode runs the **exact same cron job logic** but with **minute-based timing** instead of weekly. The UI is purely for monitoring - you don't trigger anything manually.

### Test vs Production Comparison

| Aspect | Fork Mode (`MODE=fork`) | Production Mode (`MODE=production`) |
|--------|-------------------------|-------------------------------------|
| Network | Base Mainnet Fork (Anvil) | Base Mainnet |
| Snapshot Source | Moralis API (real data!) | Moralis API |
| Timing | Hourly cron (configurable) | Weekly cron |
| Transactions | Fork (no real funds) | Real AQUARI tokens |
| Week IDs | `TEST-001`, `TEST-002`, `TEST-003` | `2026-W04`, `2026-W05`, `2026-W06` |
| Full Cycle | ~5-10 minutes | 1 week |
| RPC Endpoint | `http://localhost:8545` (Anvil) | Alchemy/Infura/Public RPC |

### Fork Mode Timeline (3-Step Cron)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FORK MODE FLOW (3-Step Cron)                     │
│                    Cron Jobs Do Everything!                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   .env CONFIG:                                                     │
│   MODE=fork                                                        │
│   SNAPSHOT_CRON=0 * * * *    (every hour at :00)                   │
│   CALCULATE_CRON=2 * * * *   (every hour at :02)                   │
│   AIRDROP_CRON=4 * * * *     (every hour at :04)                   │
│                                                                     │
│   ══════════════════════════════════════════════════════════════   │
│   CYCLE 1 (Baseline - No Airdrop)                                  │
│   ══════════════════════════════════════════════════════════════   │
│                                                                     │
│   :00  ──► SNAPSHOT: Take TEST-001 snapshot                        │
│            └─► Moralis API fetches 12,000 holders                  │
│            └─► This is BASELINE (no previous to compare)           │
│                                                                     │
│   :02  ──► CALCULATE: Skipped (only 1 snapshot exists)             │
│            └─► "Need at least 2 snapshots"                         │
│                                                                     │
│   :04  ──► AIRDROP: Skipped (no distribution ready)                │
│                                                                     │
│   ══════════════════════════════════════════════════════════════   │
│   CYCLE 2+ (Full Cycle with Airdrop)                               │
│   ══════════════════════════════════════════════════════════════   │
│                                                                     │
│   :00  ──► SNAPSHOT: Take TEST-002 snapshot                        │
│            └─► Moralis API fetches current balances                │
│                                                                     │
│   :02  ──► CALCULATE: Compare TEST-001 vs TEST-002                 │
│            └─► Apply MIN(previous, current) rule                   │
│            └─► Create eligible list + batches                      │
│            └─► Status → "ready"                                    │
│                                                                     │
│   :04  ──► AIRDROP: Auto-approve and execute                       │
│            └─► Use wallet balance as reward pool                   │
│            └─► Execute batches via Disperse contract               │
│            └─► Status → "completed"                                │
│                                                                     │
│   ══════════════════════════════════════════════════════════════   │
│   CYCLE 3 (continues automatically)                                │
│   ══════════════════════════════════════════════════════════════   │
│                                                                     │
│   :00  ──► SNAPSHOT: Take TEST-003                                 │
│   :02  ──► CALCULATE: Compare TEST-002 vs TEST-003                 │
│   :04  ──► AIRDROP: Execute                                        │
│                                                                     │
│   ... continues every hour until stopped ...                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### What You See in Dashboard (Monitoring Only)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ADMIN DASHBOARD                                  │
│                    (Read-Only Monitoring)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  MODE: TEST          NETWORK: Base Mainnet Fork             │  │
│   │  Current Cycle: TEST-003                                    │  │
│   │  Next Action: CALCULATE in 2:34                             │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  ACTIVE JOBS                                                │  │
│   │  ─────────────────────────────────────────────────────────  │  │
│   │  [████████████████░░░░] 78% - Snapshot TEST-003-end         │  │
│   │  Fetching holders... 9,234 / 12,000                         │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  JOB LOGS (Real-time)                                       │  │
│   │  ─────────────────────────────────────────────────────────  │  │
│   │  [12:34:56] Starting snapshot for TEST-003-end              │  │
│   │  [12:34:57] Fetching page 1 from Moralis...                 │  │
│   │  [12:34:58] Got 100 holders, cursor: abc123...              │  │
│   │  [12:34:59] Fetching page 2 from Moralis...                 │  │
│   │  [12:35:01] Inserted batch of 100 holders                   │  │
│   │  ...                                                        │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  RECENT DISTRIBUTIONS                                       │  │
│   │  ─────────────────────────────────────────────────────────  │  │
│   │  TEST-002  │  completed  │  487 recipients  │  1000 AQUARI  │  │
│   │  TEST-001  │  completed  │  512 recipients  │  1000 AQUARI  │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  CONFIG                                                     │  │
│   │  ─────────────────────────────────────────────────────────  │  │
│   │  Snapshot Interval: 5 minutes                               │  │
│   │  Calculate Delay: 1 minute                                  │  │
│   │  Airdrop Delay: 1 minute                                    │  │
│   │  Auto Approve: YES                                          │  │
│   │  Default Reward Pool: 1,000 AQUARI                          │  │
│   │  Batch Size: 500 recipients                                 │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Fork Testing (Recommended)

### Why Fork Testing?

Instead of deploying test tokens on Base Sepolia, fork Base mainnet directly:

| Aspect | Testnet Approach | Fork Approach |
|--------|------------------|---------------|
| Token Contract | Deploy new test token | Real AQUARI contract |
| Holder Data | Create fake holders | Real 12,000 holders |
| Disperse Contract | Same address | Same address |
| Setup Time | Hours | Minutes |
| Realism | Low | **100% identical to prod** |

### How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FORK TESTING ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   TERMINAL 1: Anvil (Fork of Base Mainnet)                         │
│   ─────────────────────────────────────────                        │
│   $ anvil --fork-url https://mainnet.base.org                      │
│                                                                     │
│   Output:                                                          │
│   ├─ RPC: http://127.0.0.1:8545                                   │
│   ├─ Chain ID: 8453 (same as mainnet!)                            │
│   ├─ All mainnet contracts available                              │
│   └─ 10 test accounts with 10,000 ETH each                        │
│                                                                     │
│   ──────────────────────────────────────────────────────────────   │
│                                                                     │
│   TERMINAL 2: Your App                                             │
│   ────────────────────────                                         │
│   $ npm run dev                                                    │
│                                                                     │
│   App uses:                                                        │
│   ├─ Moralis API → Real holder data (always mainnet)              │
│   ├─ RPC (Anvil) → Simulated transactions (no real funds)         │
│   └─ Same contract addresses as production!                       │
│                                                                     │
│   ──────────────────────────────────────────────────────────────   │
│                                                                     │
│   SWITCHING TO PRODUCTION:                                         │
│   Just change one line in .env:                                    │
│                                                                     │
│   # Fork testing:                                                  │
│   RPC_URL=http://127.0.0.1:8545                                   │
│                                                                     │
│   # Production:                                                    │
│   RPC_URL=https://mainnet.base.org                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Quick Start Commands

```bash
# Terminal 1: Start Anvil fork
anvil --fork-url https://mainnet.base.org --block-time 2

# Terminal 2: Start app
AIRDROP_MODE=test RPC_URL=http://127.0.0.1:8545 npm run dev

# Open dashboard
open http://localhost:3000/admin

# Watch the magic happen automatically!
```

---

## Disperse Contract Limits

### Gas Calculations

| Component | Value |
|-----------|-------|
| Base Block Gas Limit | 375,000,000 |
| Gas per Token Recipient | ~65,000 |
| Theoretical Max Recipients | ~5,700 |
| **Recommended Batch Size** | **500** |

### Cost Per Batch (500 Recipients)

| Fee Type | Amount |
|----------|--------|
| L2 Execution | ~$0.001 |
| L1 Data Posting | ~$0.01 - $0.05 |
| **Total per Batch** | **~$0.02 - $0.06** |

### Full Airdrop Cost (12,000 Holders)

| Batch Size | # Batches | Total Cost |
|------------|-----------|------------|
| 100 | 120 | $2.40 - $7.20 |
| **500** | **24** | **$0.50 - $1.50** |
| 1000 | 12 | $0.25 - $0.75 |

**Base is extremely cheap!** Full airdrop to 12,000 holders costs less than $2.

---

## Configuration

### Environment Variables

```bash
# ═══════════════════════════════════════════════════════════
# MODE: fork | production
# ═══════════════════════════════════════════════════════════
MODE=fork                        # fork = Anvil testing, production = real mainnet

# ═══════════════════════════════════════════════════════════
# 3-STEP CRON SCHEDULE
# ═══════════════════════════════════════════════════════════
# Fork Mode (fast testing - every hour)
SNAPSHOT_CRON=0 * * * *          # Take snapshot at :00
CALCULATE_CRON=2 * * * *         # Calculate at :02
AIRDROP_CRON=4 * * * *           # Airdrop at :04

# Production Mode (weekly - Sundays)
# SNAPSHOT_CRON=0 0 * * 0        # Sunday midnight UTC
# CALCULATE_CRON=5 0 * * 0       # Sunday 00:05 UTC
# AIRDROP_CRON=10 0 * * 0        # Sunday 00:10 UTC

# ═══════════════════════════════════════════════════════════
# RPC CONFIGURATION
# ═══════════════════════════════════════════════════════════
BASE_RPC_URL=http://localhost:8545     # Fork: Anvil
# BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY  # Production

# ═══════════════════════════════════════════════════════════
# DATABASE
# ═══════════════════════════════════════════════════════════
MONGODB_URI=mongodb://localhost:27017/aquari-airdrop

# ═══════════════════════════════════════════════════════════
# ADMIN AUTH (generate with: npm run generate-credentials)
# ═══════════════════════════════════════════════════════════
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$2b$12$YOUR_BCRYPT_HASH_HERE
SESSION_SECRET=your_64_char_random_string_here

# ═══════════════════════════════════════════════════════════
# MORALIS API (Always queries Base mainnet for real holder data)
# ═══════════════════════════════════════════════════════════
MORALIS_API_KEY=your_api_key

# ═══════════════════════════════════════════════════════════
# BLOCKCHAIN (Production only)
# ═══════════════════════════════════════════════════════════
# PRIVATE_KEY=your_private_key   # Required for production

# ═══════════════════════════════════════════════════════════
# OPTIONAL OVERRIDES
# ═══════════════════════════════════════════════════════════
# MIN_BALANCE=1000000000000000000000   # 1000 AQUARI minimum
# BATCH_SIZE=200                       # Recipients per transaction
# PORT=3000
```

### Mode Matrix

| Mode | AIRDROP_MODE | RPC_URL | MOCK_* | Use Case |
|------|--------------|---------|--------|----------|
| Full Mock | test | localhost | true | UI development |
| Fork Test | test | Anvil | false | **Recommended testing** |
| Production | production | mainnet.base.org | false | Live airdrops |

---

## Admin Dashboard

### What Dashboard Shows (Monitoring)

| Section | Information |
|---------|-------------|
| **Mode Banner** | TEST/PRODUCTION, Network, Chain ID |
| **Scheduler Status** | Current cycle, next action, countdown |
| **Active Jobs** | Progress bars, percentage, stage |
| **Job Logs** | Real-time streaming logs |
| **Distributions** | Status, recipients, amounts, txHash |
| **Config** | Timing, batch size, auto-approve |

### Manual Actions (When Needed)

| Action | When Used |
|--------|-----------|
| Approve Airdrop | If `TEST_AUTO_APPROVE=false` |
| Set Reward Pool | Before approving distribution |
| Clear Data | Reset test data (dev only) |

### Routes

| Route | Description |
|-------|-------------|
| `/admin/dashboard` | Main monitoring view |
| `/admin/distributions` | All distributions |
| `/admin/distributions/:id` | Distribution detail + approve |
| `/admin/snapshots` | All snapshots |
| `/admin/recipients` | All recipients |
| `/admin/batches` | Batch status + txHash |
| `/admin/search` | Search by wallet |

---

## Database Schema

```
┌─────────────────────────────────────────────────────────────────┐
│                        COLLECTIONS                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  snapshots          Snapshot metadata                           │
│  ├── weekId         "2025-W04" or "TEST-001-start"             │
│  ├── totalHolders   12,000                                     │
│  ├── status         pending | in_progress | completed          │
│  └── completedAt    Timestamp                                  │
│                                                                 │
│  holders            One doc per holder per snapshot             │
│  ├── snapshotId     Reference to snapshot                      │
│  ├── address        0x... (lowercase)                          │
│  ├── balance        Wei string                                 │
│  └── balanceFormatted  "10,000 AQUARI"                        │
│                                                                 │
│  distributions      Weekly distribution record                  │
│  ├── weekId         "2025-W04" or "TEST-001"                   │
│  ├── status         calculating | ready | processing | done    │
│  ├── config         { rewardPool, batchSize }                  │
│  └── stats          { eligible, excluded, total }              │
│                                                                 │
│  recipients         Eligible holders                            │
│  ├── distributionId Reference                                  │
│  ├── address        Wallet                                     │
│  ├── balances       { previous, current, min }                 │
│  ├── reward         Amount in wei                              │
│  └── txHash         When completed                             │
│                                                                 │
│  batches            Transaction batches (500 each)              │
│  ├── batchNumber    1, 2, 3...                                 │
│  ├── recipients     [{ address, amount }]                      │
│  ├── status         pending | completed | failed               │
│  └── execution      { txHash, gasUsed, block }                 │
│                                                                 │
│  jobs               Background job tracking                     │
│  ├── type           snapshot | calculation | airdrop           │
│  ├── status         running | completed | failed               │
│  ├── progress       { current, total, stage }                  │
│  └── logs           [{ time, message }]                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Deployment Checklist

### Fork Testing (Do First!)

```bash
# 1. Install Foundry (for Anvil)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 2. Start Anvil fork of Base mainnet
anvil --fork-url https://mainnet.base.org --port 8545

# 3. Start MongoDB
docker compose up -d mongodb

# 4. Configure .env
MODE=fork
SNAPSHOT_CRON=0 * * * *
CALCULATE_CRON=2 * * * *
AIRDROP_CRON=4 * * * *

# 5. Fund test wallet (see docs/fork_fund.md)
# 6. Start app
npm run dev

# 7. Watch dashboard - cycles run automatically!
# First cycle = baseline (no airdrop)
# Second cycle = full airdrop
```

### Production Launch

```
□ Fork testing completed successfully
□ At least 2 full cycles ran without errors
□ Transactions confirmed on fork
□ Dashboard shows correct cycle progress

□ Update .env:
  MODE=production
  PRIVATE_KEY=your_real_private_key
  BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
  MONGODB_URI=mongodb+srv://... (production DB)

  # Weekly schedule (Sundays)
  SNAPSHOT_CRON=0 0 * * 0
  CALCULATE_CRON=5 0 * * 0
  AIRDROP_CRON=10 0 * * 0

□ Generate new admin credentials:
  npm run generate-credentials -- --password "YourSecurePassword"

□ Fund production wallet:
  - ETH for gas (~0.01 ETH plenty)
  - AQUARI tokens for rewards

□ Sync restricted addresses:
  npm run sync-restricted

□ Deploy and start server
□ Wait for first snapshot (baseline)
□ Wait for second snapshot (first airdrop)
□ Verify on Basescan
```

---

## Summary

| What | How |
|------|-----|
| Snapshots | Moralis API (real mainnet data) |
| Calculations | Automatic (cron job) |
| Transactions | Disperse contract |
| Testing | Anvil fork (recommended) |
| Switching | Just change RPC_URL |
| Cost | ~$1-2 for 12,000 holders |
| Admin Role | Monitor + approve (optional) |

**The system is fully autonomous.** Set it up, configure timing, and watch the dashboard!

---

*Last Updated: January 2025*

---

## Security Notes

### Password Hashing

Admin passwords are hashed using bcrypt (12 rounds). Generate secure credentials:

```bash
npm run generate-credentials
```

The system supports backward compatibility with plain-text passwords but will show a warning. Always use bcrypt hashes in production.

### Restricted Addresses

The `restricted_addresses` collection stores bot-restricted addresses from the AQUARI contract's antibot system. These addresses are excluded from airdrops. This collection is preserved when running `npm run clear-collections`.
