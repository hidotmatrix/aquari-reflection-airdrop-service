# AQUARI Weekly Airdrop System

> Automated weekly reward distribution system for AQUARI token holders on Base blockchain.

---

## Table of Contents

1. [Overview](#overview)
2. [How It Works](#how-it-works)
3. [Production Timeline](#production-timeline)
4. [Technical Architecture](#technical-architecture)
5. [Current Progress](#current-progress)
6. [What's Left To Build](#whats-left-to-build)
7. [Configuration](#configuration)
8. [Admin Dashboard](#admin-dashboard)
9. [Database Schema](#database-schema)
10. [API Endpoints](#api-endpoints)
11. [Deployment Checklist](#deployment-checklist)

---

## Overview

### What Is This?

A system that automatically rewards loyal AQUARI token holders every week. Holders who maintain their tokens throughout the week receive a proportional share of the weekly reward pool (ETH).

### Key Features

- **Weekly Snapshots**: Captures all token holder balances
- **MIN Balance Method**: Uses minimum of (start, end) balance to prevent gaming
- **Batch Airdrops**: Gas-efficient multi-send via Disperse contract
- **Admin Approval**: Manual review before executing real transactions
- **Full Audit Trail**: Every transaction tracked with txHash

### Token Information

| Property | Value |
|----------|-------|
| Token | AQUARI |
| Contract | `0x7F0E9971D3320521Fc88F863E173a4cddBB051bA` |
| Chain | Base Mainnet (Chain ID: 8453) |
| Decimals | 18 |
| Holders | ~12,000 |

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

## Production Timeline

### Launch Week (Week 0)

```
DAY 1 - ANNOUNCEMENT
├── Announce airdrop program to community
├── "Hold AQUARI for the full week to earn ETH rewards!"
├── Explain the MIN balance system
└── Take FIRST SNAPSHOT (this becomes Week 1 START)

NO AIRDROP THIS WEEK - Need 2 snapshots to compare
```

### First Airdrop (Week 1)

```
SUNDAY 23:59 UTC
├── Automatic: Take END snapshot
└── Week 1 data complete (have START and END)

MONDAY
├── Automatic: Calculate eligible holders
├── Admin: Review distribution details
├── Admin: Enter reward pool amount (e.g., 0.5 ETH)
├── Admin: Approve and execute airdrop
└── Recipients receive ETH!

This END snapshot → Next week's START snapshot
```

### Ongoing (Week 2+)

```
┌─────────────────────────────────────────────────────────────────┐
│                     WEEKLY CYCLE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   SUNDAY 23:59 UTC                                              │
│   └── Take END snapshot (only 1 API call needed!)              │
│                                                                 │
│   MONDAY 00:30 UTC                                              │
│   └── Calculate rewards automatically                          │
│                                                                 │
│   MONDAY (Admin Action)                                         │
│   ├── Review eligible holders                                  │
│   ├── Enter this week's reward pool                            │
│   ├── Approve airdrop                                          │
│   └── Monitor execution                                        │
│                                                                 │
│   Previous END snapshot = Next START snapshot                  │
│   (Saves 50% of API calls!)                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SYSTEM ARCHITECTURE                                 │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │   ADMIN     │
                              │  DASHBOARD  │
                              └──────┬──────┘
                                     │
                              ┌──────▼──────┐
                              │   EXPRESS   │
                              │   SERVER    │
                              └──────┬──────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
        ▼                            ▼                            ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│   MORALIS     │           │   MONGODB     │           │     BASE      │
│     API       │           │   DATABASE    │           │  BLOCKCHAIN   │
├───────────────┤           ├───────────────┤           ├───────────────┤
│ Token Holders │           │ • snapshots   │           │ • Disperse    │
│ Balance Data  │           │ • holders     │           │   Contract    │
│               │           │ • distribs    │           │ • ETH Transfer│
│               │           │ • recipients  │           │               │
│               │           │ • batches     │           │               │
│               │           │ • jobs        │           │               │
└───────────────┘           └───────────────┘           └───────────────┘
```

### Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ |
| Language | TypeScript |
| Framework | Express.js |
| Database | MongoDB |
| Token API | Moralis |
| Blockchain | ethers.js v6 |
| Views | EJS + Tailwind CSS |
| Auth | Session-based |

### Project Structure

```
src/
├── index.ts                    # App entry point
│
├── config/
│   ├── env.ts                  # Environment validation
│   └── database.ts             # MongoDB connection
│
├── models/
│   ├── Snapshot.ts             # Snapshot metadata
│   ├── Holder.ts               # Holder per snapshot
│   ├── Distribution.ts         # Weekly distribution
│   ├── Recipient.ts            # Eligible recipient
│   ├── Batch.ts                # Transaction batch
│   └── Job.ts                  # Background job
│
├── services/
│   ├── moralis.service.ts      # Fetch token holders
│   ├── snapshot.service.ts     # Snapshot operations
│   ├── calculation.service.ts  # Reward calculations
│   ├── job.runner.ts           # Job execution
│   ├── job.service.ts          # Job management
│   └── blockchain.service.ts   # [TODO] Real transactions
│
├── admin/
│   ├── routes/
│   │   └── admin.routes.ts     # All admin routes
│   ├── controllers/
│   │   └── admin.controller.ts # Route handlers
│   ├── middleware/
│   │   └── auth.middleware.ts  # Authentication
│   └── views/                  # EJS templates
│       ├── layout.ejs
│       ├── dashboard.ejs
│       ├── distributions.ejs
│       ├── distribution-detail.ejs
│       ├── snapshots.ejs
│       ├── snapshot-detail.ejs
│       ├── recipients.ejs
│       ├── batches.ejs
│       ├── search.ejs
│       └── login.ejs
│
└── utils/
    ├── week.ts                 # Week ID utilities
    ├── format.ts               # Formatting helpers
    ├── pagination.ts           # Pagination utilities
    └── logger.ts               # Winston logger
```

---

## Current Progress

### Completed Features ✅

#### Core System
- [x] MongoDB database with proper indexes
- [x] Job queue system with progress tracking
- [x] Real-time job logs in terminal UI
- [x] Duplicate job prevention

#### Snapshots
- [x] Moralis API integration (real API calls work)
- [x] Mock snapshot mode for testing
- [x] Paginated holder storage (handles 12k+ holders)
- [x] Resume from cursor if interrupted
- [x] Rate limit handling with backoff

#### Calculations
- [x] MIN balance eligibility logic
- [x] Proportional reward calculation
- [x] Batch creation for gas efficiency
- [x] Excluded address filtering

#### Distribution Flow
- [x] Week reference system (prev END = current START)
- [x] Single snapshot per week (50% API savings)
- [x] Admin approval modal with reward input
- [x] Reward recalculation on approval
- [x] Simulated transaction execution

#### Admin Dashboard
- [x] Secure login with session auth
- [x] Dashboard with stats and mode indicators
- [x] Real-time job progress terminal
- [x] Distribution list with status
- [x] Distribution detail with flow steps
- [x] Recipient list with balances
- [x] Batch status tracking
- [x] Wallet search functionality
- [x] Basescan links for addresses/txHash

#### UI/UX
- [x] TBD display for unconfigured reward pools
- [x] Approval modal with per-holder estimate
- [x] Mode indicators (MOCK/SIMULATED/PRODUCTION)
- [x] Pagination on all list views

### In Progress 🔄

- [ ] Real blockchain transaction execution

### Not Started ❌

- [ ] Automated cron jobs
- [ ] Wallet balance display
- [ ] Low balance warnings
- [ ] Email/webhook notifications
- [ ] Production security hardening

---

## What's Left To Build

### 1. Blockchain Service (HIGH PRIORITY)

**File:** `src/services/blockchain.service.ts`

```typescript
// Required functions:

// Connect to Base RPC and load wallet
async function initializeWallet(): Promise<Wallet>

// Get wallet ETH balance
async function getWalletBalance(): Promise<bigint>

// Execute batch transfer via Disperse contract
async function disperseEther(
  recipients: string[],
  amounts: bigint[]
): Promise<{
  txHash: string;
  gasUsed: bigint;
  blockNumber: number;
}>

// Estimate gas for a batch
async function estimateGas(
  recipients: string[],
  amounts: bigint[]
): Promise<bigint>
```

**Disperse Contract:** `0xD152f549545093347A162Dce210e7293f1452150`

```solidity
// Contract interface we need to call:
function disperseEther(
  address[] recipients,
  uint256[] values
) external payable
```

### 2. Update Airdrop Job

**File:** `src/services/job.runner.ts`

Replace simulated execution with real blockchain calls:

```typescript
// Current (simulated):
const fakeTxHash = `0x${'sim'.repeat(4)}...`;

// Production:
const { txHash, gasUsed } = await disperseEther(
  batch.recipients.map(r => r.address),
  batch.recipients.map(r => BigInt(r.amount))
);
```

### 3. Wallet Balance in Dashboard

**Changes needed:**

1. Add to `admin.controller.ts`:
```typescript
const walletBalance = await getWalletBalance();
```

2. Display in `dashboard.ejs`:
```html
<div>
  <span>Airdropper Balance</span>
  <span>1.5 ETH</span>
</div>
```

3. Block approval if balance < reward pool

### 4. Automated Cron Jobs

**File:** `src/jobs/cron.ts`

```typescript
// Sunday 23:59 UTC - Take snapshot
cron.schedule('59 23 * * 0', () => {
  startJob(db, 'snapshot', `${getCurrentWeekId()}-end`);
});

// Monday 00:30 UTC - Calculate rewards
cron.schedule('30 0 * * 1', () => {
  startJob(db, 'calculation', getCurrentWeekId());
});

// Note: Airdrop execution remains MANUAL (admin approval required)
```

### 5. Notifications

**Options:**
- Discord webhook for job completion/failure
- Email alerts for admin
- Telegram bot notifications

### 6. Security Hardening

```typescript
// Rate limiting
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// Helmet security headers
app.use(helmet());

// HTTPS redirect in production
if (process.env.NODE_ENV === 'production') {
  app.use(httpsRedirect);
}
```

---

## Configuration

### Environment Variables

```bash
# .env file

# ═══════════════════════════════════════════════════════════
# APP
# ═══════════════════════════════════════════════════════════
NODE_ENV=development          # development | production
PORT=3000

# ═══════════════════════════════════════════════════════════
# MODE FLAGS
# ═══════════════════════════════════════════════════════════
MOCK_MODE=true               # Legacy flag
MOCK_SNAPSHOTS=true          # true = fake data, false = real Moralis
MOCK_TRANSACTIONS=true       # true = simulate, false = real blockchain

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
# MORALIS API
# ═══════════════════════════════════════════════════════════
MORALIS_API_KEY=your_api_key

# ═══════════════════════════════════════════════════════════
# BLOCKCHAIN (Required when MOCK_TRANSACTIONS=false)
# ═══════════════════════════════════════════════════════════
BASE_RPC_URL=https://mainnet.base.org
PRIVATE_KEY=                  # Airdropper wallet private key
DISPERSE_CONTRACT=0xD152f549545093347A162Dce210e7293f1452150

# ═══════════════════════════════════════════════════════════
# TOKEN CONFIG
# ═══════════════════════════════════════════════════════════
AQUARI_ADDRESS=0x7F0E9971D3320521Fc88F863E173a4cddBB051bA
MIN_BALANCE=1000000000000000000000   # 1000 AQUARI in wei
REWARD_TOKEN=ETH
REWARD_POOL=1000000000000000000      # 1 ETH (used for preview calc only)

# ═══════════════════════════════════════════════════════════
# BATCH CONFIG
# ═══════════════════════════════════════════════════════════
BATCH_SIZE=100                # Recipients per transaction
MAX_GAS_PRICE=50000000000     # 50 gwei
CONFIRMATIONS=3               # Blocks to wait
```

### Mode Configurations

| Mode | MOCK_SNAPSHOTS | MOCK_TRANSACTIONS | Use Case |
|------|----------------|-------------------|----------|
| Full Mock | true | true | Local development |
| Real Snapshots | false | true | Test with real data, no tx |
| Production | false | false | Live airdrop execution |

---

## Admin Dashboard

### Pages

| Route | Description |
|-------|-------------|
| `/admin/login` | Login page |
| `/admin/dashboard` | Main dashboard with stats |
| `/admin/snapshots` | List all snapshots |
| `/admin/snapshots/:id` | Snapshot detail with holders |
| `/admin/distributions` | List all distributions |
| `/admin/distributions/:id` | Distribution detail with recipients |
| `/admin/recipients` | All recipients with filters |
| `/admin/batches` | Batch status list |
| `/admin/batches/:id` | Batch detail |
| `/admin/search` | Search by wallet address |

### Dashboard Features

1. **Config Panel**: Shows MIN_BALANCE, reward token, mode indicators
2. **Stats Cards**: Total snapshots, distributions, pending batches
3. **Test Triggers**: Manual buttons for snapshot/calculate/full-flow
4. **Ready for Airdrop**: Distributions awaiting approval with TBD amounts
5. **Job Terminal**: Real-time progress with logs
6. **Recent Jobs**: History with status and "View Logs" option
7. **Recent Distributions**: Quick access to latest distributions

---

## Database Schema

### Collections

```
┌─────────────────────────────────────────────────────────────────┐
│                        COLLECTIONS                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  snapshots          Snapshot metadata (not holders)             │
│  ├── weekId         "2026-W03-start" or "2026-W03-end"         │
│  ├── totalHolders   Count of holders                           │
│  ├── totalBalance   Sum of all balances                        │
│  ├── status         pending | in_progress | completed | failed │
│  └── metadata       API call stats, duration                   │
│                                                                 │
│  holders            One document per holder per snapshot        │
│  ├── weekId         Links to snapshot                          │
│  ├── snapshotId     ObjectId reference                         │
│  ├── address        Wallet address (lowercase)                 │
│  ├── balance        Raw balance in wei                         │
│  └── balanceFormatted  Human readable                          │
│                                                                 │
│  distributions      Weekly distribution record                  │
│  ├── weekId         "2026-W03"                                 │
│  ├── status         calculating | ready | processing | done    │
│  ├── config         { rewardPool, rewardToken, minBalance }    │
│  └── stats          { eligible, excluded, totalBalance }       │
│                                                                 │
│  recipients         Eligible holders for a distribution         │
│  ├── distributionId Reference                                  │
│  ├── address        Wallet address                             │
│  ├── balances       { start, end, min }                        │
│  ├── reward         Calculated reward in wei                   │
│  ├── status         pending | completed | failed               │
│  └── txHash         Transaction hash when completed            │
│                                                                 │
│  batches            Transaction batches                         │
│  ├── distributionId Reference                                  │
│  ├── batchNumber    1, 2, 3...                                 │
│  ├── recipients     [{ address, amount }]                      │
│  ├── status         pending | processing | completed | failed  │
│  └── execution      { txHash, gasUsed, blockNumber }           │
│                                                                 │
│  jobs               Background job tracking                     │
│  ├── type           snapshot | calculation | airdrop | full-flow│
│  ├── weekId         Associated week                            │
│  ├── status         pending | running | completed | failed     │
│  ├── progress       { percentage, stage, current, total }      │
│  └── logs           [{ timestamp, level, message }]            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Public
- `GET /health` - Health check

### Auth
- `GET /admin/login` - Login page
- `POST /admin/login` - Authenticate
- `GET /admin/logout` - Logout

### Dashboard
- `GET /admin/dashboard` - Main dashboard

### Snapshots
- `GET /admin/snapshots` - List snapshots
- `GET /admin/snapshots/:id` - Snapshot detail

### Distributions
- `GET /admin/distributions` - List distributions
- `GET /admin/distributions/:id` - Distribution detail

### Recipients & Batches
- `GET /admin/recipients` - List recipients
- `GET /admin/batches` - List batches
- `GET /admin/batches/:id` - Batch detail

### Search
- `GET /admin/search?address=0x...` - Search wallet

### Job Triggers
- `POST /admin/trigger/snapshot` - Start snapshot job
- `POST /admin/trigger/calculate` - Start calculation job
- `POST /admin/trigger/full-flow` - Run full flow
- `POST /admin/trigger/airdrop` - Start airdrop job
- `POST /admin/approve-airdrop` - Approve with reward amount

### Job Status
- `GET /admin/jobs/status` - Get active/recent jobs
- `GET /admin/jobs/:jobId/logs` - Get job logs

### Dev Tools
- `POST /admin/dev/clear-data` - Clear database (dev only)

---

## Deployment Checklist

### Pre-Launch

- [ ] Set `NODE_ENV=production`
- [ ] Set `MOCK_SNAPSHOTS=false`
- [ ] Set `MOCK_TRANSACTIONS=false`
- [ ] Configure real `MONGODB_URI`
- [ ] Set secure `ADMIN_PASSWORD`
- [ ] Generate secure `SESSION_SECRET`
- [ ] Add `MORALIS_API_KEY`
- [ ] Add `PRIVATE_KEY` for airdropper wallet
- [ ] Fund airdropper wallet with ETH
- [ ] Test on Base testnet first
- [ ] Set up database backups
- [ ] Configure HTTPS

### Launch Day

- [ ] Take first snapshot (Week 1 START)
- [ ] Announce to community
- [ ] Verify snapshot data looks correct
- [ ] Monitor for any errors

### First Airdrop (Week 1 End)

- [ ] Verify END snapshot completed
- [ ] Review eligible holder count
- [ ] Check recipient calculations
- [ ] Enter reward pool amount
- [ ] Approve airdrop
- [ ] Monitor batch execution
- [ ] Verify recipients received ETH
- [ ] Announce completion to community

---

## Development Commands

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

---

## Support

- **Issues**: https://github.com/anthropics/claude-code/issues
- **Basescan**: https://basescan.org
- **AQUARI Token**: https://basescan.org/token/0x7F0E9971D3320521Fc88F863E173a4cddBB051bA

---

*Last Updated: January 2026*
