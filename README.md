# AQUARI Weekly Airdrop System

Fully automated system for distributing weekly token rewards to AQUARI holders on Base blockchain.

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Quick Start - Fork Mode (Testing)](#quick-start---fork-mode-testing)
- [Quick Start - Production Mode](#quick-start---production-mode)
- [Mode Comparison](#mode-comparison)
- [Cron Scheduling](#cron-scheduling)
- [Auto-Airdrop](#auto-airdrop)
- [Admin Dashboard](#admin-dashboard)
- [Wallet Management](#wallet-management)
- [API Endpoints](#api-endpoints)
- [Environment Variables](#environment-variables)
- [Database Collections](#database-collections)
- [Scripts](#scripts)
- [Troubleshooting](#troubleshooting)
- [Deployment](#deployment)

---

## Overview

### Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ |
| Language | TypeScript |
| Framework | Express.js |
| Database | MongoDB |
| Job Queue | BullMQ + Redis |
| Blockchain | ethers.js v6 |
| Chain | Base Mainnet (8453) |
| Token Data | Moralis API |
| Admin UI | EJS + Tailwind CSS |

### Key Features

| Feature | Description |
|---------|-------------|
| Weekly Snapshots | Automatic holder snapshots via Moralis API |
| MIN Balance Method | Anti-gaming: uses MIN(start, end) balance |
| Auto-Airdrop | 100% wallet balance auto-distributed |
| Batch Airdrops | 500 recipients/tx via Disperse contract (76% gas savings) |
| Bot Filtering | Auto-excludes AQUARI antibot-restricted addresses |
| Connectivity Checks | Validates MongoDB, Redis, and RPC on startup |
| Wallet Monitoring | Live balance display with funding warnings |
| Analytics | Charts, metrics, CSV exports |

### Contract Addresses

| Contract | Address |
|----------|---------|
| AQUARI Token | `0x7F0E9971D3320521Fc88F863E173a4cddBB051bA` |
| Disperse | `0xD152f549545093347A162Dce210e7293f1452150` |

---

## How It Works

### The MIN Balance Anti-Gaming System

```
┌─────────────────────────────────────────────────────────────────┐
│                    ELIGIBILITY CALCULATION                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  For each holder:                                                │
│                                                                  │
│    START Balance (Week Begin)     END Balance (Week End)         │
│           ↓                              ↓                       │
│           └──────────┬───────────────────┘                       │
│                      ↓                                           │
│              MIN(START, END)                                     │
│                      ↓                                           │
│         Is MIN >= 1000 AQUARI?                                   │
│                      │                                           │
│           ┌─────────┴─────────┐                                  │
│           ↓                   ↓                                  │
│          YES                  NO                                 │
│           ↓                   ↓                                  │
│       ELIGIBLE            EXCLUDED                               │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  REWARD FORMULA:                                                 │
│                                                                  │
│                    Holder's MIN Balance                          │
│  Holder Reward = ────────────────────────── × Total Reward Pool  │
│                   Sum of ALL MIN Balances                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4-Step Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    WEEKLY AIRDROP FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: START SNAPSHOT (START_SNAPSHOT_CRON)                    │
│     └─ Fetches all AQUARI holders via Moralis API                │
│     └─ Stores in snapshots + holders collections                 │
│                                                                  │
│  Step 2: END SNAPSHOT (END_SNAPSHOT_CRON)                        │
│     └─ Fetches holders again                                     │
│     └─ Both snapshots needed for MIN balance calculation         │
│                                                                  │
│  Step 3: CALCULATE REWARDS (CALCULATE_CRON)                      │
│     └─ Compares START vs END balances                            │
│     └─ Excludes: config addresses, bot-restricted addresses      │
│     └─ Calculates: MIN(start, end) for each holder               │
│     └─ Creates batches of 500 recipients                         │
│                                                                  │
│  Step 4: AUTO-AIRDROP (AIRDROP_CRON)                             │
│     └─ Reads wallet's current AQUARI balance                     │
│     └─ Uses 100% as reward pool (no manual approval)             │
│     └─ Executes batches via Disperse contract                    │
│     └─ Records txHash for each batch                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start - Fork Mode (Testing)

Fork mode uses **Anvil** to simulate Base mainnet locally. **No real funds are used.**

### Step 1: Install Prerequisites

```bash
# Install Foundry (for Anvil)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Verify installation
anvil --version
```

### Step 2: Clone and Install

```bash
git clone <your-repo>
cd aquari-airdrop
npm install
```

### Step 3: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` for fork mode:

```env
# MODE
MODE=fork

# CRON SCHEDULING - 4 Steps (5 min apart for demo)
START_SNAPSHOT_CRON=00 17 * * *
END_SNAPSHOT_CRON=05 17 * * *
CALCULATE_CRON=10 17 * * *
AIRDROP_CRON=15 17 * * *

# DATABASE
MONGODB_URI=mongodb://localhost:27017/aquari-airdrop
REDIS_URL=redis://localhost:6379

# MORALIS API (Required - get free key at moralis.io)
MORALIS_API_KEY=your_moralis_api_key_here

# ADMIN DASHBOARD
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
SESSION_SECRET=your_random_64_char_string_here

# RPC - Anvil fork
RPC_URL=http://localhost:8545
```

### Step 4: Start Services with Docker

```bash
# Start all services (MongoDB, Redis, Anvil)
docker compose up -d

# Check services are running
docker compose ps
```

Or start services manually:

```bash
# Terminal 1 - Anvil Fork
anvil --fork-url https://mainnet.base.org --block-time 2

# Terminal 2 - MongoDB
mongod

# Terminal 3 - Redis
redis-server
```

### Step 5: Start Application

```bash
npm run dev
```

You'll see connectivity checks:

```
═══════════════════════════════════════════════════════════
  AQUARI Weekly Airdrop System
═══════════════════════════════════════════════════════════
Environment: development
Mode: fork (FORK (Fast Cycles))
───────────────────────────────────────────────────────────

CONNECTIVITY CHECKS:
  [1/3] Checking MongoDB...
        MongoDB: Connected
  [2/3] Checking Redis...
        Redis: Connected
  [3/3] Checking RPC...
        RPC: Connected (Chain 8453, Block #12345678)

All connectivity checks passed
```

### Step 6: Fund Test Wallet

The fork uses Anvil's test account #9. Fund it with ETH and AQUARI tokens.

> **Full guide:** See [docs/fork_fund.md](docs/fork_fund.md) for detailed instructions and troubleshooting.

```bash
# Fund with ETH (100 ETH)
cast rpc anvil_setBalance \
  0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199 \
  0x56BC75E2D63100000 \
  --rpc-url http://localhost:8545

# Fund with AQUARI (100k tokens)
cast rpc anvil_impersonateAccount 0x187ED96248Bbbbf4D5b059187e030B7511b67801 --rpc-url http://localhost:8545

cast send 0x7F0E9971D3320521Fc88F863E173a4cddBB051bA \
  "transfer(address,uint256)" \
  0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199 \
  100000000000000000000000 \
  --from 0x187ED96248Bbbbf4D5b059187e030B7511b67801 \
  --unlocked \
  --rpc-url http://localhost:8545

cast rpc anvil_stopImpersonatingAccount 0x187ED96248Bbbbf4D5b059187e030B7511b67801 --rpc-url http://localhost:8545

# Verify balances
cast balance 0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199 --ether --rpc-url http://localhost:8545
cast call 0x7F0E9971D3320521Fc88F863E173a4cddBB051bA "balanceOf(address)(uint256)" 0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199 --rpc-url http://localhost:8545
```

### Step 7: Scan Bot-Restricted Addresses

**Required before first airdrop:**

```bash
node scripts/scan-restricted.js
```

### Step 8: Access Dashboard

Open: **http://localhost:3000/admin**

The system will automatically run at the configured cron times:
- 5:00 PM - START Snapshot
- 5:05 PM - END Snapshot
- 5:10 PM - Calculate Rewards
- 5:15 PM - Auto-Airdrop (100% wallet balance)

---

## Quick Start - Production Mode

Production mode runs on **Base mainnet** with **real funds**.

### Step 1: Configure Environment

```env
# MODE
MODE=production

# CRON SCHEDULING - Weekly (Sunday night, 10 min apart)
START_SNAPSHOT_CRON=30 23 * * 0
END_SNAPSHOT_CRON=40 23 * * 0
CALCULATE_CRON=50 23 * * 0
AIRDROP_CRON=00 00 * * 1

# DATABASE - Use MongoDB Atlas or dedicated server
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/aquari-airdrop
REDIS_URL=redis://your-redis-server:6379

# MORALIS API
MORALIS_API_KEY=your_moralis_api_key

# ADMIN DASHBOARD - Use strong credentials!
ADMIN_USERNAME=your_secure_username
ADMIN_PASSWORD=YourVerySecurePassword123!@#
SESSION_SECRET=generate_64_random_chars_here_use_openssl_rand_hex_32

# RPC - Base mainnet
RPC_URL=https://mainnet.base.org

# WALLET - Your airdrop wallet (KEEP SECRET!)
PRIVATE_KEY=your_airdrop_wallet_private_key_here

# BATCH SETTINGS
BATCH_SIZE=500
MAX_GAS_PRICE=50000000000
CONFIRMATIONS=3
```

### Step 2: Fund Airdrop Wallet

Your airdrop wallet needs:
1. **ETH** - For gas fees (minimum 0.1 ETH recommended)
2. **AQUARI** - The tokens to airdrop

### Step 3: Scan Bot-Restricted Addresses

```bash
node scripts/scan-restricted.js --rpc https://mainnet.base.org
```

### Step 4: Deploy and Start

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions.

---

## Mode Comparison

| Aspect | Fork Mode | Production Mode |
|--------|-----------|-----------------|
| **Purpose** | Testing & Development | Real Airdrops |
| **RPC** | `http://localhost:8545` (Anvil) | `https://mainnet.base.org` |
| **Funds** | Fake (Anvil test ETH) | Real (your wallet) |
| **Moralis Data** | Real holder data | Real holder data |
| **Transactions** | On local fork | On Base mainnet |
| **Private Key** | Auto (test key) | Required (your key) |
| **Gas Cost** | None (simulated) | Real ETH |

---

## Cron Scheduling

The system uses 4 separate cron jobs for full control:

### Cron Format

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday = 0)
│ │ │ │ │
* * * * *
```

### Fork Mode Example (Daily at 5:00 PM, 5 min apart)

```env
START_SNAPSHOT_CRON=00 17 * * *   # 5:00 PM
END_SNAPSHOT_CRON=05 17 * * *     # 5:05 PM
CALCULATE_CRON=10 17 * * *        # 5:10 PM
AIRDROP_CRON=15 17 * * *          # 5:15 PM
```

### Production Mode Example (Sunday night, 10 min apart)

```env
START_SNAPSHOT_CRON=30 23 * * 0   # Sunday 23:30 UTC
END_SNAPSHOT_CRON=40 23 * * 0     # Sunday 23:40 UTC
CALCULATE_CRON=50 23 * * 0        # Sunday 23:50 UTC
AIRDROP_CRON=00 00 * * 1          # Monday 00:00 UTC
```

---

## Auto-Airdrop

The system is fully automated - no manual approval required!

### How It Works

1. At `AIRDROP_CRON` time, the system:
   - Reads the airdrop wallet's current AQUARI balance
   - Uses 100% of the balance as the reward pool
   - Distributes proportionally to all eligible holders
   - Records the wallet balance used in the distribution

2. The distribution document stores:
   - `config.autoApproved: true`
   - `config.walletBalanceUsed: "500000000000000000000000"` (raw balance)
   - `config.autoApprovedAt: Date`

### Skipped Airdrops

If the wallet balance is 0, the airdrop is skipped (logged as warning).

---

## Admin Dashboard

### Pages

| Route | Description |
|-------|-------------|
| `/admin/dashboard` | Overview, wallet status, workflow status |
| `/admin/snapshots` | All snapshots with holder counts |
| `/admin/distributions` | All distributions with status |
| `/admin/recipients` | All recipients with filters |
| `/admin/batches` | Batch status, retry failed |
| `/admin/search` | Search wallet airdrop history |
| `/admin/analytics` | Charts, metrics, exports |

### Dashboard Features

**Wallet Status Panel:**
- Live ETH balance (for gas fees)
- Live token balance (for airdrops)
- Yellow warning border when funding needed

**Workflow Status:**
- Current cron schedule
- Next scheduled action
- Last snapshot/calculation/airdrop times

---

## Wallet Management

### Airdrop Wallet Requirements

| Asset | Purpose | Minimum |
|-------|---------|---------|
| ETH | Gas fees for transactions | 0.01 ETH |
| AQUARI | Tokens to airdrop | Whatever you want to distribute |

### Startup Balance Logging

When the server starts, wallet balances are logged:

```
WALLET BALANCES:
  ETH Balance: 0.050000 ETH ✓
  AQUARI Balance: 500,000 AQUARI ✓
```

---

## API Endpoints

### Health Check

```bash
curl http://localhost:3000/health
```

Returns service status including MongoDB, Redis, and blockchain connectivity.

### Readiness Probe

```bash
curl http://localhost:3000/ready
```

### Liveness Probe

```bash
curl http://localhost:3000/live
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MODE` | `fork` or `production` | `fork` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/aquari-airdrop` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `MORALIS_API_KEY` | Moralis API key | `eyJ...` |
| `ADMIN_USERNAME` | Dashboard login | `admin` |
| `ADMIN_PASSWORD` | Dashboard password | `secure_password` |
| `SESSION_SECRET` | 64+ char random string | `abc123...` |

### Cron Configuration (Required)

| Variable | Description |
|----------|-------------|
| `START_SNAPSHOT_CRON` | Cron for START snapshot |
| `END_SNAPSHOT_CRON` | Cron for END snapshot |
| `CALCULATE_CRON` | Cron for calculation |
| `AIRDROP_CRON` | Cron for auto-airdrop |

### Blockchain Settings

| Variable | Fork Mode | Production |
|----------|-----------|------------|
| `RPC_URL` | `http://localhost:8545` | `https://mainnet.base.org` |
| `PRIVATE_KEY` | Auto (test key) | **Required** |

### Batch Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `BATCH_SIZE` | `500` | Recipients per transaction |
| `MAX_GAS_PRICE` | `50000000000` | 50 gwei max |
| `CONFIRMATIONS` | `1` (fork) / `3` (prod) | Blocks to wait |

---

## Database Collections

| Collection | Description |
|------------|-------------|
| `snapshots` | Snapshot metadata (weekId, timestamp, status) |
| `holders` | One doc per holder per week (address, balance) |
| `distributions` | Distribution records (config, stats, status) |
| `recipients` | Eligible recipients with calculated rewards |
| `batches` | Batch records with recipients and txHash |
| `restricted_addresses` | Bot-restricted addresses to exclude |

---

## Scripts

### Scan Bot-Restricted Addresses

**Required before first airdrop:**

```bash
# Use RPC from .env
node scripts/scan-restricted.js

# Use specific RPC
node scripts/scan-restricted.js --rpc https://mainnet.base.org
```

---

## Troubleshooting

### Startup Connectivity Failures

```
MongoDB: FAILED - connection refused
```
**Solution:** Ensure MongoDB is running: `docker compose up -d mongodb`

```
Redis: FAILED - connection refused
```
**Solution:** Ensure Redis is running: `docker compose up -d redis`

```
RPC: FAILED - could not detect network
```
**Solution:**
- Fork mode: Start Anvil with `anvil --fork-url https://mainnet.base.org`
- Production: Check `RPC_URL` is correct

### Error: `RestrictedByAntiBot()`

**Solution:**
```bash
node scripts/scan-restricted.js
# Then recalculate from dashboard
```

### Wallet Balance Shows 0

**Solution:**
1. Check `RPC_URL` is correct
2. Verify Anvil is running (fork mode)
3. Check `PRIVATE_KEY` (production mode)

---

## Deployment

For detailed deployment instructions including:
- EC2 setup
- Docker deployment
- PM2 process management
- Nginx configuration
- SSL setup

See: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

---

## Security Features

| Feature | Description |
|---------|-------------|
| Login Rate Limiting | 5 attempts per 15 minutes per IP |
| Session Auth | httpOnly cookies, 24h expiry |
| Pre-flight Checks | Validates balances before airdrops |
| Gas Oracle | Monitors gas, waits for acceptable levels |
| Bot Filtering | Excludes antibot-restricted addresses |
| Connectivity Checks | Validates all services on startup |

---

## License

Private - AQUARI Project
