# AQUARI Weekly Airdrop System

Autonomous system for distributing weekly token rewards to AQUARI holders on Base blockchain.

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Quick Start - Fork Mode (Testing)](#quick-start---fork-mode-testing)
- [Quick Start - Production Mode](#quick-start---production-mode)
- [Mode Comparison](#mode-comparison)
- [Token Configuration](#token-configuration)
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
| Batch Airdrops | 500 recipients/tx via Disperse contract (76% gas savings) |
| Bot Filtering | Auto-excludes AQUARI antibot-restricted addresses |
| Multi-Token Support | Switch tokens via `TOKEN_ADDRESS` env var |
| Wallet Monitoring | Live balance display with funding warnings |
| Analytics | Charts, metrics, CSV exports |
| Rate Limiting | Login protection (5 attempts/15 min) |
| Pre-flight Checks | Validates balances & gas before airdrops |

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

### Anti-Gaming Examples

| Scenario | Start | End | MIN | Eligible? | Why |
|----------|-------|-----|-----|-----------|-----|
| Loyal Holder | 10,000 | 10,000 | 10,000 | ✅ Yes | Held full week |
| Partial Seller | 10,000 | 5,000 | 5,000 | ✅ Yes | Credit = lower amount |
| Accumulator | 5,000 | 15,000 | 5,000 | ✅ Yes | Credit = starting amount |
| Last-Minute Buy | 0 | 50,000 | 0 | ❌ No | Wasn't holding at start |
| Dumper | 10,000 | 500 | 500 | ❌ No | Below 1000 minimum |

### Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    WEEKLY AIRDROP FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. START SNAPSHOT                                               │
│     └─ Fetches all AQUARI holders via Moralis API                │
│     └─ Stores in snapshots + holders collections                 │
│                                                                  │
│  2. END SNAPSHOT (1 week later, or interval in fork mode)        │
│     └─ Fetches holders again                                     │
│     └─ Both snapshots needed for MIN balance calculation         │
│                                                                  │
│  3. CALCULATE REWARDS                                            │
│     └─ Compares START vs END balances                            │
│     └─ Excludes: config addresses, bot-restricted addresses      │
│     └─ Calculates: MIN(start, end) for each holder               │
│     └─ Creates batches of 500 recipients                         │
│                                                                  │
│  4. APPROVE & EXECUTE AIRDROP                                    │
│     └─ Admin enters reward pool amount                           │
│     └─ Recalculates proportional rewards                         │
│     └─ Executes batches via Disperse contract                    │
│     └─ Records txHash for each batch                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start - Fork Mode (Testing)

Fork mode uses **Anvil** to simulate Base mainnet locally. **No real funds are used.** Data comes from real Moralis API, but transactions go to the local fork.

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
# ═══════════════════════════════════════════════════════════
# MODE - Use 'fork' for testing
# ═══════════════════════════════════════════════════════════
MODE=fork
NODE_ENV=development

# ═══════════════════════════════════════════════════════════
# RPC - Point to local Anvil fork
# ═══════════════════════════════════════════════════════════
RPC_URL=http://localhost:8545

# ═══════════════════════════════════════════════════════════
# MOCK FLAGS
# false = real Moralis data, real transactions (on fork)
# ═══════════════════════════════════════════════════════════
MOCK_SNAPSHOTS=false
MOCK_TRANSACTIONS=false

# ═══════════════════════════════════════════════════════════
# DATABASE
# ═══════════════════════════════════════════════════════════
MONGODB_URI=mongodb://localhost:27017/aquari-airdrop
REDIS_URL=redis://localhost:6379

# ═══════════════════════════════════════════════════════════
# MORALIS API (Required - get free key at moralis.io)
# ═══════════════════════════════════════════════════════════
MORALIS_API_KEY=your_moralis_api_key_here

# ═══════════════════════════════════════════════════════════
# ADMIN DASHBOARD
# ═══════════════════════════════════════════════════════════
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
SESSION_SECRET=your_random_64_char_string_here_for_session_security

# ═══════════════════════════════════════════════════════════
# PRIVATE KEY - Auto-configured in fork mode (Anvil test key)
# ═══════════════════════════════════════════════════════════
# PRIVATE_KEY=  (leave empty for fork mode)

# ═══════════════════════════════════════════════════════════
# FORK MODE SCHEDULING
# ═══════════════════════════════════════════════════════════
AUTO_START=false
SNAPSHOT_INTERVAL=10
CALCULATE_DELAY=5
```

### Step 4: Start Services

**Terminal 1 - Start Anvil Fork:**
```bash
anvil --fork-url https://mainnet.base.org --block-time 2
```

You'll see:
```
Available Accounts
==================
(0) 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
...
(9) 0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199 (10000 ETH)

Private Keys
==================
...
(9) 0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e
```

**Terminal 2 - Start MongoDB (if not using Docker):**
```bash
mongod
```

**Terminal 3 - Start Redis (if not using Docker):**
```bash
redis-server
```

**Terminal 4 - Start Application:**
```bash
npm run dev
```

You'll see wallet balances logged:
```
═══════════════════════════════════════════════════════════
  AQUARI Weekly Airdrop System
═══════════════════════════════════════════════════════════
Environment: development
Mode: fork (FORK (Fast Cycles))
───────────────────────────────────────────────────────────
WALLET BALANCES:
  ETH Balance: 10000.000000 ETH ✓
  AQUARI Balance: 0 AQUARI ⚠️  LOW - Fund wallet with tokens to airdrop!
```

### Step 5: Fund Test Wallet with AQUARI Tokens

The fork uses Anvil's test account #9. You need to fund it with AQUARI tokens:

```bash
# Find a whale address (check BaseScan for large holders)
# Example whale: 0x... (find one with lots of AQUARI)

# Impersonate the whale
cast rpc anvil_impersonateAccount "0xWHALE_ADDRESS" --rpc-url http://localhost:8545

# Transfer AQUARI to test wallet (2 million tokens)
cast send 0x7F0E9971D3320521Fc88F863E173a4cddBB051bA \
  "transfer(address,uint256)" \
  0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199 \
  2000000000000000000000000 \
  --from "0xWHALE_ADDRESS" \
  --unlocked \
  --rpc-url http://localhost:8545

# Stop impersonating
cast rpc anvil_stopImpersonatingAccount "0xWHALE_ADDRESS" --rpc-url http://localhost:8545
```

### Step 6: Scan Bot-Restricted Addresses

**Important:** Run this before your first airdrop:

```bash
node scripts/scan-restricted.js
```

This scans all holders and stores bot-restricted addresses for automatic exclusion.

### Step 7: Run the Workflow

Open admin dashboard: **http://localhost:3000/admin**

Login with your `ADMIN_USERNAME` and `ADMIN_PASSWORD`.

**Manual Workflow:**
1. Click **"Start Snapshot"** - Takes START snapshot
2. Wait a few minutes (simulates time passing)
3. Click **"End Snapshot"** - Takes END snapshot
4. Click **"Calculate"** - Calculates eligible recipients
5. Enter **Reward Amount** (e.g., 1000000 for 1M AQUARI)
6. Click **"Approve & Execute"** - Executes airdrop batches

### Step 8: Verify Results

- Check **Distributions** page for status
- Check **Batches** page for transaction hashes
- Check **Recipients** page for individual rewards
- Search any wallet address to see their history

---

## Quick Start - Production Mode

Production mode runs on **Base mainnet** with **real funds**. Use with caution.

### Step 1: Configure Environment

```env
# ═══════════════════════════════════════════════════════════
# MODE - Use 'production' for real airdrops
# ═══════════════════════════════════════════════════════════
MODE=production
NODE_ENV=production

# ═══════════════════════════════════════════════════════════
# RPC - Base mainnet (or your own RPC provider)
# ═══════════════════════════════════════════════════════════
RPC_URL=https://mainnet.base.org

# ═══════════════════════════════════════════════════════════
# MOCK FLAGS - Must be false for production
# ═══════════════════════════════════════════════════════════
MOCK_SNAPSHOTS=false
MOCK_TRANSACTIONS=false

# ═══════════════════════════════════════════════════════════
# DATABASE - Use MongoDB Atlas or dedicated server
# ═══════════════════════════════════════════════════════════
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/aquari-airdrop
REDIS_URL=redis://your-redis-server:6379

# ═══════════════════════════════════════════════════════════
# MORALIS API
# ═══════════════════════════════════════════════════════════
MORALIS_API_KEY=your_moralis_api_key

# ═══════════════════════════════════════════════════════════
# ADMIN DASHBOARD - Use strong credentials!
# ═══════════════════════════════════════════════════════════
ADMIN_USERNAME=your_secure_username
ADMIN_PASSWORD=YourVerySecurePassword123!@#
SESSION_SECRET=generate_64_random_chars_here_use_openssl_rand_hex_32

# ═══════════════════════════════════════════════════════════
# PRIVATE KEY - Your airdrop wallet (KEEP SECRET!)
# ═══════════════════════════════════════════════════════════
PRIVATE_KEY=your_airdrop_wallet_private_key_here

# ═══════════════════════════════════════════════════════════
# BATCH SETTINGS
# ═══════════════════════════════════════════════════════════
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

### Fork Mode vs Production Mode

| Aspect | Fork Mode | Production Mode |
|--------|-----------|-----------------|
| **Purpose** | Testing & Development | Real Airdrops |
| **RPC** | `http://localhost:8545` (Anvil) | `https://mainnet.base.org` |
| **Funds** | Fake (Anvil test ETH) | Real (your wallet) |
| **Moralis Data** | Real holder data | Real holder data |
| **Transactions** | On local fork | On Base mainnet |
| **Private Key** | Auto (test key) | Required (your key) |
| **Gas Cost** | None (simulated) | Real ETH |

### Cron Job Schedules

| Mode | Snapshot | Calculate | Airdrop |
|------|----------|-----------|---------|
| **Fork (Interval)** | Manual or AUTO_START | +5 min after snapshot | Manual |
| **Fork (Cron)** | SNAPSHOT_CRON | CALCULATE_CRON | Manual |
| **Production** | Sunday 23:59 UTC | Monday 00:30 UTC | Manual approval |

### Fork Mode Scheduling Options

**Option A: Manual Trigger (Recommended for Testing)**
```env
AUTO_START=false
# Trigger from dashboard manually
```

**Option B: Auto-Start with Intervals**
```env
AUTO_START=true
START_DELAY_MINUTES=0
SNAPSHOT_INTERVAL=10      # Minutes between START and END snapshots
CALCULATE_DELAY=5         # Minutes after END to calculate
```

**Option C: Cron-Based (Specific Times)**
```env
SNAPSHOT_CRON=30 14 * * *    # 2:30 PM daily
CALCULATE_CRON=45 14 * * *   # 2:45 PM daily
```

### Production Mode Schedule

```
WEEKLY CYCLE (UTC):
───────────────────────────────────────────────────────────

Sunday 23:59  →  SNAPSHOT (automatic)
                 • Fetches all holders from Moralis
                 • Serves as END of current week
                 • Serves as START of next week

Monday 00:30  →  CALCULATE (automatic)
                 • Compares previous and current snapshot
                 • Calculates eligible recipients
                 • Creates batches
                 • Status = "ready"

Monday 01:00+ →  AIRDROP (manual approval required)
                 • Admin sets reward pool amount
                 • Admin clicks "Approve & Execute"
                 • Batches executed via Disperse contract
```

---

## Token Configuration

### Default Token (AQUARI)

```env
TOKEN_ADDRESS=0x7F0E9971D3320521Fc88F863E173a4cddBB051bA
TOKEN_SYMBOL=AQUARI
TOKEN_DECIMALS=18
```

### Switch to Different Token

To airdrop a different ERC20 token on Base:

```env
TOKEN_ADDRESS=0x...your_token_contract_address...
TOKEN_SYMBOL=YOUR_TOKEN
TOKEN_DECIMALS=18
```

Restart the application after changing token configuration.

---

## Admin Dashboard

### Pages

| Route | Description |
|-------|-------------|
| `/admin/dashboard` | Overview, wallet status, workflow controls |
| `/admin/snapshots` | All snapshots with holder counts |
| `/admin/snapshots/:id` | Snapshot detail with holder list |
| `/admin/distributions` | All distributions with status |
| `/admin/distributions/:id` | Distribution detail, approve airdrop |
| `/admin/recipients` | All recipients with filters |
| `/admin/batches` | Batch status, retry failed |
| `/admin/batches/:id` | Batch detail with recipients |
| `/admin/search` | Search wallet airdrop history |
| `/admin/analytics` | Charts, metrics, exports |

### Dashboard Features

**Wallet Status Panel:**
- Live ETH balance (for gas fees)
- Live token balance (for airdrops)
- Yellow warning border when funding needed
- Click-to-copy wallet address
- Direct link to BaseScan

**Workflow Controls:**
- Start Snapshot button
- End Snapshot button
- Calculate button
- Approve & Execute button

**Mode Indicators:**
- FORK MODE / PRODUCTION badge
- MOCK DATA badge (if mock snapshots)
- SIMULATED TX / LIVE TX badge

### Analytics & Exports

| Export | Route | Description |
|--------|-------|-------------|
| Summary CSV | `/admin/analytics/export/summary` | All distributions summary |
| Gas Report | `/admin/analytics/export/gas` | Gas usage per batch |
| Recipients | `/admin/export/distribution/:id/recipients` | Distribution recipients |
| Batches | `/admin/export/distribution/:id/batches` | Batch details |
| Holders | `/admin/export/snapshot/:id/holders` | Snapshot holders |

---

## Wallet Management

### Airdrop Wallet Requirements

The airdrop wallet needs:

| Asset | Purpose | Minimum |
|-------|---------|---------|
| ETH | Gas fees for transactions | 0.01 ETH |
| Tokens | Tokens to airdrop | Depends on reward pool |

### Startup Balance Logging

When the server starts, wallet balances are logged:

```
───────────────────────────────────────────────────────────
WALLET BALANCES:
  ETH Balance: 0.050000 ETH ✓
  AQUARI Balance: 50,000 AQUARI ✓
```

If balances are low:

```
WALLET BALANCES:
  ETH Balance: 0.001234 ETH ⚠️  LOW - Fund wallet for gas fees!
  AQUARI Balance: 500 AQUARI ⚠️  LOW - Fund wallet with tokens to airdrop!
───────────────────────────────────────────────────────────
⚠️  WALLET NEEDS FUNDING:
  Address: 0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199
  → Send ETH for gas fees (recommended: 0.01+ ETH)
  → Send AQUARI tokens to airdrop
```

### Dashboard Wallet Panel

The dashboard shows real-time wallet status:
- Current ETH balance (red if < 0.01 ETH)
- Current token balance (red if < 1000 tokens)
- Funding instructions with copy address button
- Yellow border when funding needed

---

## API Endpoints

### Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-21T12:00:00.000Z",
  "version": "1.0.0",
  "environment": "development",
  "mode": "fork",
  "mockSnapshots": false,
  "mockTransactions": false,
  "services": {
    "database": {
      "connected": true,
      "name": "aquari-airdrop"
    },
    "redis": {
      "connected": true
    },
    "blockchain": {
      "healthy": true,
      "walletAddress": "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199",
      "ethBalance": "10.0000 ETH",
      "tokenBalance": "2,000,000 AQUARI",
      "gasPrice": "0.01 gwei"
    }
  },
  "lastSnapshot": {
    "weekId": "2025-W03-end",
    "status": "completed",
    "timestamp": "2025-01-19T23:59:00.000Z"
  },
  "pendingBatches": 0
}
```

### Job Status

```bash
curl http://localhost:3000/admin/jobs/status
```

Response:
```json
{
  "scheduler": {
    "isRunning": true,
    "mode": "fork",
    "currentCycle": 1,
    "nextAction": "waiting-for-trigger",
    "nextActionTime": null,
    "lastSnapshot": "2025-01-21T12:00:00.000Z",
    "lastCalculation": "2025-01-21T12:05:00.000Z",
    "lastAirdrop": null
  },
  "activeJobs": [],
  "recentJobs": [
    {
      "id": "...",
      "type": "snapshot",
      "status": "completed",
      "createdAt": "2025-01-21T12:00:00.000Z"
    }
  ]
}
```

### Blockchain Status

```bash
curl http://localhost:3000/admin/blockchain/status
```

Response:
```json
{
  "network": "Base",
  "chainId": 8453,
  "walletAddress": "0x...",
  "ethBalance": "10.0000",
  "tokenBalance": "2000000.0000",
  "tokenSymbol": "AQUARI",
  "gasPrice": "0.01",
  "isReady": true
}
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MODE` | `fork` or `production` | `fork` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/aquari-airdrop` |
| `MORALIS_API_KEY` | Moralis API key | `eyJ...` |
| `ADMIN_USERNAME` | Dashboard login | `admin` |
| `ADMIN_PASSWORD` | Dashboard password | `secure_password` |
| `SESSION_SECRET` | 64+ char random string | `abc123...` |

### Token Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TOKEN_ADDRESS` | AQUARI address | ERC20 token to airdrop |
| `TOKEN_SYMBOL` | `AQUARI` | Display name |
| `TOKEN_DECIMALS` | `18` | Token decimals |
| `MIN_BALANCE` | `1000000000000000000000` | 1000 tokens (in wei) |

### Blockchain Settings

| Variable | Fork Mode | Production |
|----------|-----------|------------|
| `RPC_URL` | `http://localhost:8545` | `https://mainnet.base.org` |
| `PRIVATE_KEY` | Auto (test key) | **Required** |
| `MOCK_TRANSACTIONS` | `false` | `false` |

### Batch Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `BATCH_SIZE` | `500` | Recipients per transaction |
| `MAX_GAS_PRICE` | `50000000000` | 50 gwei max |
| `CONFIRMATIONS` | `1` (fork) / `3` (prod) | Blocks to wait |

### Scheduling (Fork Mode)

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTO_START` | `false` | Auto-start workflow on boot |
| `START_DELAY_MINUTES` | `0` | Delay before starting |
| `SNAPSHOT_INTERVAL` | `10` | Minutes between snapshots |
| `CALCULATE_DELAY` | `5` | Minutes after snapshot |
| `SNAPSHOT_CRON` | - | Cron expression for snapshot |
| `CALCULATE_CRON` | - | Cron expression for calculate |

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
| `config` | System configuration |
| `jobs` | Job execution records |

---

## Scripts

### Scan Bot-Restricted Addresses

**Required before first airdrop:**

```bash
# Use RPC from .env
node scripts/scan-restricted.js

# Use specific RPC
node scripts/scan-restricted.js --rpc http://localhost:8545
node scripts/scan-restricted.js --rpc https://mainnet.base.org
```

**What it does:**
- Fetches all unique holder addresses from database
- Checks each against AQUARI's `isBotRestricted()` function
- Stores restricted addresses in `restricted_addresses` collection
- These addresses are automatically excluded during calculation

**When to run:**
- Before your first airdrop
- Weekly (to catch newly restricted addresses)
- After seeing `RestrictedByAntiBot()` errors

---

## Troubleshooting

### Error: `RestrictedByAntiBot()`

**Cause:** Some recipients are bot-restricted by AQUARI's antibot system.

**Solution:**
```bash
node scripts/scan-restricted.js
# Then recalculate from dashboard
```

### Wallet Balance Shows 0

**Causes:**
- RPC not accessible
- Wrong RPC URL
- Private key not set

**Solution:**
1. Check `RPC_URL` is correct
2. Verify Anvil is running (fork mode)
3. Check `PRIVATE_KEY` (production mode)

### Transaction Reverts

**Causes:**
1. Bot-restricted addresses in batch
2. Insufficient token balance
3. Insufficient ETH for gas

**Solution:**
1. Run `scan-restricted.js`
2. Check wallet balances in dashboard
3. Fund wallet with ETH and tokens

### Gas Price Too High

**Cause:** Network congestion

**Solution:** System automatically waits. Adjust `MAX_GAS_PRICE` if needed.

### Moralis API Rate Limit

**Cause:** Free tier limited to 40,000 CU/day

**Solution:**
1. Upgrade Moralis plan
2. Use `MOCK_SNAPSHOTS=true` for testing
3. Space out snapshot requests

### Dashboard Shows Funding Warning

**Solution:** Send ETH (for gas) and tokens (for airdrops) to the wallet address shown.

### Anvil Fork is Slow

**Cause:** Anvil fetches state on-demand, causing RPC rate limits

**Solution:**
1. Use paid RPC with higher limits
2. Run `scan-restricted.js` first to warm cache
3. Reduce batch size temporarily

---

## Deployment

For detailed deployment instructions including:
- EC2 setup
- Docker deployment
- PM2 process management
- Nginx configuration
- SSL setup
- Environment security

See: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

---

## Technical Documentation

For detailed technical specifications:
- Database schemas
- Architecture diagrams
- API internals

See: **[docs/TECHNICAL.md](docs/TECHNICAL.md)**

---

## Security Features

| Feature | Description |
|---------|-------------|
| Login Rate Limiting | 5 attempts per 15 minutes per IP |
| Session Auth | httpOnly cookies, 24h expiry |
| Pre-flight Checks | Validates balances before airdrops |
| Gas Oracle | Monitors gas, waits for acceptable levels |
| Bot Filtering | Excludes antibot-restricted addresses |

---

## License

Private - AQUARI Project
