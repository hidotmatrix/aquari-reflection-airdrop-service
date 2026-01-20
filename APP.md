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
│    START Balance (Week Begin)     END Balance (Week End)        │
│           ↓                              ↓                      │
│           └──────────┬───────────────────┘                      │
│                      ↓                                          │
│              MIN(START, END)                                    │
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

| Scenario | Start | End | MIN | Eligible? | Why |
|----------|-------|-----|-----|-----------|-----|
| Loyal Holder | 10,000 | 10,000 | 10,000 | ✅ Yes | Held full week |
| Partial Seller | 10,000 | 5,000 | 5,000 | ✅ Yes | Credit = lower amount |
| Accumulator | 5,000 | 15,000 | 5,000 | ✅ Yes | Credit = starting amount |
| Last-Minute Buy | 0 | 50,000 | 0 | ❌ No | Wasn't holding at start |
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

### Weekly Production Cycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PRODUCTION WEEKLY FLOW                           │
│                    (Fully Autonomous)                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ══════════════════════════════════════════════════════════════   │
│   WEEK 1 - BOOTSTRAP (First Time Only)                             │
│   ══════════════════════════════════════════════════════════════   │
│                                                                     │
│   Sunday 23:59 UTC ──► CRON: Take Snapshot #1                      │
│                        └─► Calls Moralis API                       │
│                        └─► Saves all 12,000 holders                │
│                        └─► Stored as reference                     │
│                        └─► NO AIRDROP YET (nothing to compare)     │
│                                                                     │
│   ──────────────────────────────────────────────────────────────   │
│                                                                     │
│   ══════════════════════════════════════════════════════════════   │
│   WEEK 2+ - REGULAR CYCLE (Repeats Forever)                        │
│   ══════════════════════════════════════════════════════════════   │
│                                                                     │
│   SUNDAY 23:59 UTC                                                 │
│   ┌────────────────────────────────────────────────────────────┐   │
│   │  CRON JOB 1: SNAPSHOT                                      │   │
│   │  ─────────────────────                                     │   │
│   │  • Call Moralis API                                        │   │
│   │  • Fetch all ~12,000 AQUARI holders                        │   │
│   │  • Save to MongoDB (holders collection)                    │   │
│   │  • This snapshot serves DUAL PURPOSE:                      │   │
│   │      → END of current week (for calculation)               │   │
│   │      → START of next week (for next cycle)                 │   │
│   └────────────────────────────────────────────────────────────┘   │
│                          │                                         │
│                          ▼                                         │
│   MONDAY 00:30 UTC                                                 │
│   ┌────────────────────────────────────────────────────────────┐   │
│   │  CRON JOB 2: CALCULATE                                     │   │
│   │  ─────────────────────                                     │   │
│   │  • Load previous snapshot (START)                          │   │
│   │  • Load current snapshot (END)                             │   │
│   │  • Compare all holders                                     │   │
│   │  • Apply MIN(start, end) rule                              │   │
│   │  • Filter: balance >= 1000 AQUARI                          │   │
│   │  • Generate eligible recipients list                       │   │
│   │  • Create batches (500 recipients each)                    │   │
│   │  • Status → "ready" (awaiting approval)                    │   │
│   └────────────────────────────────────────────────────────────┘   │
│                          │                                         │
│                          ▼                                         │
│   MONDAY 01:00 UTC                                                 │
│   ┌────────────────────────────────────────────────────────────┐   │
│   │  CRON JOB 3: AIRDROP                                       │   │
│   │  ─────────────────────                                     │   │
│   │                                                            │   │
│   │  IF auto-approve enabled:                                  │   │
│   │    • Use default reward pool                               │   │
│   │    • Execute all batches automatically                     │   │
│   │                                                            │   │
│   │  IF manual approval required:                              │   │
│   │    • Wait for admin to:                                    │   │
│   │      1. Set reward pool amount                             │   │
│   │      2. Click "Approve & Execute"                          │   │
│   │    • Then execute batches via Disperse contract            │   │
│   │                                                            │   │
│   │  EXECUTION:                                                │   │
│   │  • Process batches sequentially (500 recipients each)      │   │
│   │  • Call disperseTokenSimple() on Disperse contract         │   │
│   │  • Record txHash for each batch                            │   │
│   │  • Update recipient status to "completed"                  │   │
│   └────────────────────────────────────────────────────────────┘   │
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

### Cron Schedule Summary

| Job | Schedule | What It Does |
|-----|----------|--------------|
| Snapshot | Sunday 23:59 UTC | Fetch all holders from Moralis |
| Calculate | Monday 00:30 UTC | Compare snapshots, create batches |
| Airdrop | Monday 01:00 UTC | Execute batches (auto or manual) |

---

## Test Mode

### Overview

Test mode runs the **exact same cron job logic** but with **minute-based timing** instead of weekly. The UI is purely for monitoring - you don't trigger anything manually.

### Test vs Production Comparison

| Aspect | Test Mode | Production Mode |
|--------|-----------|-----------------|
| Network | Base Mainnet Fork (Anvil) | Base Mainnet |
| Snapshot Source | Moralis API (real data!) | Moralis API |
| Timing | Minutes (configurable) | Weekly cron |
| Transactions | Fork (no real funds) | Real AQUARI tokens |
| Week IDs | `TEST-001`, `TEST-002` | `2025-W04`, `2025-W05` |
| Full Cycle | ~15 minutes | 1 week |

### Test Mode Timeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TEST MODE FLOW (~15 min cycle)                   │
│                    Cron Jobs Do Everything!                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   CONFIG:                                                          │
│   TEST_SNAPSHOT_INTERVAL=5   (minutes between snapshots)           │
│   TEST_CALCULATE_DELAY=1     (minutes after END snapshot)          │
│   TEST_AIRDROP_DELAY=1       (minutes after calculation)           │
│   TEST_AUTO_APPROVE=true     (skip manual approval)                │
│                                                                     │
│   ──────────────────────────────────────────────────────────────   │
│                                                                     │
│   CYCLE 1:                                                         │
│   ─────────                                                        │
│   T+0:00  ──► Scheduler: Take START Snapshot (TEST-001-start)      │
│               └─► Moralis API fetches real holder data             │
│                                                                     │
│   T+5:00  ──► Scheduler: Take END Snapshot (TEST-001-end)          │
│               └─► Moralis API fetches updated balances             │
│                                                                     │
│   T+6:00  ──► Scheduler: Calculate Rewards                         │
│               └─► Compare START vs END                             │
│               └─► Create eligible list + batches                   │
│                                                                     │
│   T+7:00  ──► Scheduler: Execute Airdrop                           │
│               └─► If AUTO_APPROVE: Execute immediately             │
│               └─► If not: Wait for admin approval in UI            │
│                                                                     │
│   ──────────────────────────────────────────────────────────────   │
│                                                                     │
│   CYCLE 2 (starts automatically):                                  │
│   ─────────                                                        │
│   T+7:00  ──► TEST-001-end becomes TEST-002-start                  │
│   T+12:00 ──► Take END Snapshot (TEST-002-end)                     │
│   T+13:00 ──► Calculate                                            │
│   T+14:00 ──► Airdrop                                              │
│                                                                     │
│   ... continues forever until stopped ...                          │
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
# AIRDROP MODE
# ═══════════════════════════════════════════════════════════
AIRDROP_MODE=test                # test | production

# ═══════════════════════════════════════════════════════════
# RPC CONFIGURATION
# The ONLY thing you change between fork testing and production!
# ═══════════════════════════════════════════════════════════
RPC_URL=http://127.0.0.1:8545    # Fork: Anvil local
# RPC_URL=https://mainnet.base.org  # Production: Base mainnet

# ═══════════════════════════════════════════════════════════
# CONTRACT ADDRESSES (Same for fork AND production!)
# ═══════════════════════════════════════════════════════════
AQUARI_TOKEN=0x7F0E9971D3320521Fc88F863E173a4cddBB051bA
DISPERSE_CONTRACT=0xD152f549545093347A162Dce210e7293f1452150

# ═══════════════════════════════════════════════════════════
# TEST MODE TIMING (only when AIRDROP_MODE=test)
# ═══════════════════════════════════════════════════════════
TEST_SNAPSHOT_INTERVAL=5         # Minutes between snapshots
TEST_CALCULATE_DELAY=1           # Minutes after snapshot
TEST_AIRDROP_DELAY=1             # Minutes after calculation
TEST_AUTO_APPROVE=true           # Auto-approve airdrops
TEST_REWARD_POOL=1000000000000000000000  # 1000 AQUARI

# ═══════════════════════════════════════════════════════════
# MOCK FLAGS (for development without APIs)
# ═══════════════════════════════════════════════════════════
MOCK_SNAPSHOTS=false             # true = fake holder data
MOCK_TRANSACTIONS=false          # true = simulate transactions

# ═══════════════════════════════════════════════════════════
# DATABASE
# ═══════════════════════════════════════════════════════════
MONGODB_URI=mongodb://localhost:27017/aquari-airdrop

# ═══════════════════════════════════════════════════════════
# ADMIN AUTH
# ═══════════════════════════════════════════════════════════
ADMIN_USERNAME=admin
ADMIN_PASSWORD=secure_password_here
SESSION_SECRET=random_64_char_string

# ═══════════════════════════════════════════════════════════
# MORALIS API (Always queries mainnet for real holder data)
# ═══════════════════════════════════════════════════════════
MORALIS_API_KEY=your_api_key

# ═══════════════════════════════════════════════════════════
# BLOCKCHAIN
# ═══════════════════════════════════════════════════════════
PRIVATE_KEY=                     # Airdropper wallet private key
BATCH_SIZE=500                   # Recipients per transaction
MAX_GAS_PRICE=50000000000        # 50 gwei max
CONFIRMATIONS=3                  # Blocks to wait

# ═══════════════════════════════════════════════════════════
# TOKEN CONFIG
# ═══════════════════════════════════════════════════════════
MIN_BALANCE=1000000000000000000000   # 1000 AQUARI minimum
REWARD_TOKEN=AQUARI
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
│  ├── balances       { start, end, min }                        │
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

# 2. Start fork
anvil --fork-url https://mainnet.base.org

# 3. Configure .env
AIRDROP_MODE=test
RPC_URL=http://127.0.0.1:8545
TEST_AUTO_APPROVE=true
MOCK_SNAPSHOTS=false
MOCK_TRANSACTIONS=false

# 4. Start app
npm run dev

# 5. Watch dashboard - cycles run automatically!
```

### Production Launch

```
□ Fork testing completed successfully
□ All cycles ran without errors
□ Transactions confirmed on fork

□ Change RPC_URL to https://mainnet.base.org
□ Set AIRDROP_MODE=production
□ Set TEST_AUTO_APPROVE=false (require manual approval)
□ Add real PRIVATE_KEY (wallet with AQUARI + ETH)
□ Verify wallet has enough AQUARI for reward pool
□ Verify wallet has ETH for gas (~0.01 ETH plenty)

□ Take first snapshot (bootstrap)
□ Wait for Week 2 snapshot
□ Review calculation results
□ Set reward pool amount
□ Approve airdrop
□ Monitor batch execution
□ Verify recipients received tokens (Basescan)
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
