# AQUARI Weekly Airdrop System

Autonomous system for distributing weekly rewards to AQUARI token holders on Base blockchain.

## Table of Contents

- [Overview](#overview)
- [Quick Start - Fork Mode (Testing)](#quick-start---fork-mode-testing)
- [Quick Start - Production Mode](#quick-start---production-mode)
- [Workflow](#workflow)
- [Admin Dashboard](#admin-dashboard)
- [Scripts Reference](#scripts-reference)
- [Environment Variables](#environment-variables)
- [Docker Compose](#docker-compose)
- [Troubleshooting](#troubleshooting)

---

## Overview

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ |
| Language | TypeScript |
| Framework | Express.js |
| Database | MongoDB |
| Blockchain | ethers.js v6 on Base |
| Token Data | Moralis API |
| Admin UI | EJS + Tailwind CSS |

**Key Features:**
- Weekly snapshots of token holders via Moralis API
- MIN balance method (prevents gaming)
- Batch airdrops via Disperse contract (76% gas savings)
- Bot-restricted address filtering (AQUARI antibot)
- Admin dashboard for monitoring and control

---

## Quick Start - Fork Mode (Testing)

Fork mode uses Anvil to simulate Base mainnet locally. **No real funds are used.**

### 1. Prerequisites

```bash
# Install Foundry (for Anvil)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Or use Docker (recommended)
docker compose up -d
```

### 2. Environment Setup

```bash
cp .env.example .env
```

Edit `.env` for fork mode:
```env
# Mode
MODE=fork
NODE_ENV=development

# RPC - Use Anvil fork
RPC_URL=http://localhost:8545

# Real Moralis data, simulated transactions
MOCK_SNAPSHOTS=false
MOCK_TRANSACTIONS=false

# Database (local or Docker)
MONGODB_URI=mongodb://localhost:27017/aquari-airdrop

# Your Moralis API key
MORALIS_API_KEY=your_key_here

# Admin credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
SESSION_SECRET=your_random_secret_here
```

### 3. Start Services

```bash
# Option A: Docker (includes MongoDB, Redis, Anvil)
docker compose up -d

# Option B: Manual
# Terminal 1 - Anvil fork
anvil --fork-url https://mainnet.base.org --block-time 2

# Terminal 2 - MongoDB (if not using Docker)
mongod

# Terminal 3 - App
npm run dev
```

### 4. Fund Test Wallet

The fork mode uses Anvil's test account #9:
- **Address:** `0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199`
- **Private Key:** Auto-configured in fork mode

Fund it with AQUARI tokens:
```bash
# Impersonate a whale and transfer tokens
cast rpc anvil_impersonateAccount 0xYOUR_WHALE_ADDRESS --rpc-url http://localhost:8545

# Transfer AQUARI to test wallet
cast send 0x7F0E9971D3320521Fc88F863E173a4cddBB051bA \
  "transfer(address,uint256)" \
  0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199 \
  2000000000000000000000000 \
  --from 0xYOUR_WHALE_ADDRESS \
  --unlocked \
  --rpc-url http://localhost:8545
```

### 5. Scan for Bot-Restricted Addresses

**Important:** Run this before your first airdrop to prevent transaction failures.

```bash
node scripts/scan-restricted.js
```

This scans all holders and stores bot-restricted addresses in the database. They will be automatically excluded from future distributions.

### 6. Run the Workflow

Open admin dashboard: http://localhost:3000/admin

1. **Take START Snapshot** - Click "1. Start Snapshot"
2. **Wait** - Simulates time passing (or manually trigger)
3. **Take END Snapshot** - Click "2. End Snapshot"
4. **Calculate Rewards** - Click "3. Calculate"
5. **Enter Reward Amount** - Set the AQUARI amount to distribute
6. **Execute Airdrop** - Click "4. Execute Airdrop"

---

## Quick Start - Production Mode

Production mode runs on Base mainnet with real funds. **Use with caution.**

### 1. Environment Setup

```env
# Mode
MODE=production
NODE_ENV=production

# RPC - Base mainnet
RPC_URL=https://mainnet.base.org
# Or use a dedicated RPC: Alchemy, Infura, etc.

# Real data, real transactions
MOCK_SNAPSHOTS=false
MOCK_TRANSACTIONS=false

# Production MongoDB (use MongoDB Atlas or dedicated server)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/aquari-airdrop

# Your real airdropper wallet
PRIVATE_KEY=your_real_private_key_here

# Moralis API
MORALIS_API_KEY=your_key_here

# Secure admin credentials
ADMIN_USERNAME=secure_username
ADMIN_PASSWORD=very_secure_password_here
SESSION_SECRET=64_char_random_string_here

# Production batch settings
BATCH_SIZE=500
CONFIRMATIONS=3
MAX_GAS_PRICE=50000000000
```

### 2. Scan Bot-Restricted Addresses

```bash
# Scan against Base mainnet
node scripts/scan-restricted.js --rpc https://mainnet.base.org
```

### 3. Deploy with Docker

```bash
# Build and start
docker compose -f docker-compose.prod.yml up -d

# Or without Docker
npm run build
npm start
```

### 4. Weekly Schedule (Production)

Production mode uses cron schedules:
- **Sunday 23:59 UTC** - END snapshot
- **Monday 00:30 UTC** - Calculate rewards
- **Monday 01:00 UTC** - Manual airdrop approval required

---

## Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    WEEKLY AIRDROP FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. START SNAPSHOT                                              │
│     └─ Fetches all AQUARI holders via Moralis API              │
│     └─ Stores in `snapshots` + `holders` collections           │
│                                                                 │
│  2. END SNAPSHOT (1 week later, or interval in fork mode)      │
│     └─ Fetches holders again                                   │
│     └─ Both snapshots needed for MIN balance calculation       │
│                                                                 │
│  3. CALCULATE REWARDS                                          │
│     └─ Compares START vs END balances                          │
│     └─ Excludes: config addresses, bot-restricted addresses    │
│     └─ Calculates: MIN(start, end) for each holder             │
│     └─ Creates batches of 500 recipients                       │
│                                                                 │
│  4. APPROVE & EXECUTE AIRDROP                                  │
│     └─ Admin enters reward pool amount                         │
│     └─ Recalculates proportional rewards                       │
│     └─ Executes batches via Disperse contract                  │
│     └─ Records txHash for each batch                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Anti-Gaming: MIN Balance Method

| Scenario | Start | End | Credit | Result |
|----------|-------|-----|--------|--------|
| Loyal Holder | 10,000 | 10,000 | 10,000 | ✅ Full reward |
| Partial Seller | 10,000 | 5,000 | 5,000 | ✅ Reduced reward |
| Accumulator | 5,000 | 15,000 | 5,000 | ✅ Based on start |
| Last-Minute Buyer | 0 | 50,000 | 0 | ❌ Not eligible |
| Dumper | 10,000 | 500 | 0 | ❌ Below minimum |

---

## Admin Dashboard

Access at: `http://localhost:3000/admin`

### Pages

| Route | Description |
|-------|-------------|
| `/admin/dashboard` | Overview, trigger actions |
| `/admin/snapshots` | List all snapshots |
| `/admin/distributions` | List all distributions |
| `/admin/distributions/:id` | Distribution detail, execute airdrop |
| `/admin/batches` | Batch status |
| `/admin/search` | Search by wallet address |

### Manual Actions

From the dashboard you can:
1. Trigger START/END snapshots
2. Trigger calculation
3. Enter reward amount and approve distribution
4. Execute airdrop (processes all batches)
5. Retry failed batches

---

## Scripts Reference

### Scan Bot-Restricted Addresses

```bash
# Scan using RPC from .env
node scripts/scan-restricted.js

# Scan using specific RPC
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
- Periodically (weekly) to catch newly restricted addresses
- After seeing `RestrictedByAntiBot()` errors

---

## Environment Variables

### Core Settings

| Variable | Fork Mode | Production | Description |
|----------|-----------|------------|-------------|
| `MODE` | `fork` | `production` | Determines scheduling and defaults |
| `NODE_ENV` | `development` | `production` | Express environment |
| `RPC_URL` | `http://localhost:8545` | `https://mainnet.base.org` | Blockchain RPC endpoint |
| `PRIVATE_KEY` | Auto (test key) | **Required** | Wallet for signing transactions |

### Mock Flags

| Variable | Fork Mode | Production | Description |
|----------|-----------|------------|-------------|
| `MOCK_SNAPSHOTS` | `false` | `false` | Use real Moralis API |
| `MOCK_TRANSACTIONS` | `false` | `false` | Execute real blockchain txs |

### Database

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `REDIS_URL` | Redis for job queue (optional) |

### API Keys

| Variable | Description |
|----------|-------------|
| `MORALIS_API_KEY` | For fetching token holders |

### Admin Dashboard

| Variable | Description |
|----------|-------------|
| `ADMIN_USERNAME` | Dashboard login username |
| `ADMIN_PASSWORD` | Dashboard login password |
| `SESSION_SECRET` | 64+ char random string for sessions |

### Batch Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `BATCH_SIZE` | `500` | Recipients per transaction |
| `MAX_GAS_PRICE` | `50000000000` | 50 gwei max |
| `CONFIRMATIONS` | `1` (fork) / `3` (prod) | Blocks to wait |
| `MIN_BALANCE` | `1000000000000000000000` | 1000 AQUARI minimum |

---

## Docker Compose

### Development (with Anvil)

```bash
# Start all services (MongoDB, Redis, Anvil)
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Stop and clear data
docker compose down -v
```

### Production

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    container_name: aquari-airdrop
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - MODE=production
    env_file:
      - .env.production
    depends_on:
      - mongodb
      - redis
    restart: unless-stopped

  mongodb:
    image: mongo:7
    container_name: aquari-mongodb
    volumes:
      - mongo_data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASS}
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: aquari-redis
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped

volumes:
  mongo_data:
  redis_data:
```

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist
COPY src/admin/views ./dist/admin/views
COPY public ./public

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
```

Deploy:
```bash
# Build
npm run build

# Start production
docker compose -f docker-compose.prod.yml up -d
```

---

## Troubleshooting

### Error: `RestrictedByAntiBot()`

**Cause:** Some recipients are bot-restricted by AQUARI's antibot system.

**Solution:**
```bash
# Scan and store restricted addresses
node scripts/scan-restricted.js

# Recalculate distribution (restricted addresses will be excluded)
# From admin dashboard: delete distribution and recalculate
```

### Error: Transaction reverts with no data

**Causes:**
1. Bot-restricted addresses in batch
2. Insufficient token balance
3. Insufficient allowance for Disperse contract

**Solution:**
1. Run `scan-restricted.js` and recalculate
2. Check wallet balance in dashboard
3. Approval is automatic, but verify in dashboard

### Anvil fork is slow

**Cause:** Anvil fetches state on-demand from upstream RPC, causing rate limits.

**Solution:**
1. Use a paid RPC with higher limits
2. Pre-warm cache by running `scan-restricted.js` first
3. Reduce batch size temporarily

### Moralis API rate limit

**Cause:** Free tier limited to 40,000 CU/day.

**Solution:**
1. Upgrade Moralis plan
2. Use `MOCK_SNAPSHOTS=true` for testing
3. Cache snapshots and reuse

### Dashboard shows "Real funds will be transferred"

**Cause:** `RPC_URL` points to mainnet instead of Anvil.

**Solution:**
```env
# For fork mode testing
RPC_URL=http://localhost:8545
```

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

---

## License

Private - AQUARI Project
