# AQUARI Weekly Airdrop System - Technical Specification

## Project Overview

Build a **fully autonomous** Node.js backend system for distributing weekly revenue (trading fees) to AQUARI token holders on Base blockchain. The system automatically takes weekly snapshots, calculates eligible holders based on MIN balance method, and executes batch airdrops with minimal gas fees.

**Key Features:**
- Fully autonomous (no admin approval needed)
- Weekly cron-based execution
- Batch airdrops via Disperse contract (76% gas savings)
- Mock mode for development/testing
- Complete audit trail with txHash tracking
- **MongoDB connection via .env**
- **Admin dashboard for monitoring (read-only)**
- **Search by wallet address**
- **Secure authentication via .env credentials**

---

## Token Information

| Property | Value |
|----------|-------|
| Token Name | AQUARI |
| Contract Address | `0x7F0E9971D3320521Fc88F863E173a4cddBB051bA` |
| Chain | Base Mainnet (Chain ID: 8453) |
| Type | ERC-20 (Upgradeable Proxy) |
| Decimals | 18 |
| Approximate Holders | ~12,000 |

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ |
| Language | TypeScript |
| Framework | Express.js |
| Database | MongoDB (connection string from .env) |
| Job Queue | BullMQ + Redis |
| Blockchain | ethers.js v6 |
| Token Data API | Moralis (Free Tier) |
| Scheduler | node-cron |
| Admin UI | EJS + Tailwind CSS |
| Auth | Session-based (credentials from .env) |
| Logger | Winston |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AUTONOMOUS WEEKLY AIRDROP SYSTEM                         │
└─────────────────────────────────────────────────────────────────────────────┘

SUNDAY 23:59 UTC              MONDAY 00:30 UTC              MONDAY 01:00 UTC
─────────────────             ────────────────              ────────────────
      │                             │                             │
      ▼                             ▼                             ▼
┌──────────────┐              ┌──────────────┐              ┌──────────────┐
│  CRON JOB 1  │              │  CRON JOB 2  │              │  CRON JOB 3  │
│  SNAPSHOT    │─────────────▶│  CALCULATE   │─────────────▶│  AIRDROP     │
│              │   30 min     │  REWARDS     │   30 min     │  BATCHES     │
└──────┬───────┘   delay      └──────┬───────┘   delay      └──────┬───────┘
       │                             │                             │
       ▼                             ▼                             ▼
┌──────────────┐              ┌──────────────┐              ┌──────────────┐
│   Moralis    │              │   MongoDB    │              │    BASE      │
│   API        │              │ (from .env)  │              │  BLOCKCHAIN  │
└──────────────┘              └──────────────┘              └──────────────┘
                                     │
                              ┌──────▼───────┐
                              │    ADMIN     │
                              │  DASHBOARD   │
                              │ (read-only)  │
                              │  + SEARCH    │
                              └──────────────┘
```

---

## Environment Variables

```bash
# .env.example

# ═══════════════════════════════════════════════════════════
# APP
# ═══════════════════════════════════════════════════════════
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# ═══════════════════════════════════════════════════════════
# MOCK MODE (Development)
# Set to 'true' for development - simulates blockchain transactions
# Set to 'false' for production - executes real transactions
# ═══════════════════════════════════════════════════════════
MOCK_MODE=true

# ═══════════════════════════════════════════════════════════
# DATABASE - MongoDB Connection String
# Can be MongoDB Atlas or local MongoDB
# ═══════════════════════════════════════════════════════════
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/aquari-airdrop?retryWrites=true&w=majority

# ═══════════════════════════════════════════════════════════
# REDIS (For BullMQ job queue)
# ═══════════════════════════════════════════════════════════
REDIS_URL=redis://localhost:6379

# ═══════════════════════════════════════════════════════════
# ADMIN DASHBOARD CREDENTIALS
# ⚠️  KEEP THESE SECRET! Used for admin login
# ═══════════════════════════════════════════════════════════
ADMIN_USERNAME=aquari_admin
ADMIN_PASSWORD=your_super_secure_password_here_123!
SESSION_SECRET=random_64_char_string_for_session_encryption_abc123xyz

# ═══════════════════════════════════════════════════════════
# MORALIS API (Free Tier: 40,000 CU/day)
# ═══════════════════════════════════════════════════════════
MORALIS_API_KEY=your_moralis_api_key

# ═══════════════════════════════════════════════════════════
# BLOCKCHAIN (Only needed when MOCK_MODE=false)
# ═══════════════════════════════════════════════════════════
BASE_RPC_URL=https://mainnet.base.org
PRIVATE_KEY=                         # Airdropper wallet private key
DISPERSE_CONTRACT=0xD152f549545093347A162Dce210e7293f1452150

# ═══════════════════════════════════════════════════════════
# TOKEN CONFIG
# ═══════════════════════════════════════════════════════════
AQUARI_ADDRESS=0x7F0E9971D3320521Fc88F863E173a4cddBB051bA
MIN_BALANCE=1000                     # Minimum AQUARI to qualify
REWARD_TOKEN=ETH                     # ETH | USDC | AQUARI

# ═══════════════════════════════════════════════════════════
# DISTRIBUTION CONFIG
# ═══════════════════════════════════════════════════════════
REWARD_POOL=1000000000000000000      # 1 ETH in wei
BATCH_SIZE=100
MAX_GAS_PRICE=50000000000            # 50 gwei max
CONFIRMATIONS=3
```

---

## Distribution Logic

### Eligibility Rules

1. **Minimum Hold**: Must hold ≥ `MIN_BALANCE` (default: 1000 AQUARI) at BOTH snapshots
2. **Continuous Hold**: Must be present in both week START and week END snapshots
3. **Credit Calculation**: Uses `MIN(start_balance, end_balance)` to prevent gaming
4. **Excluded Addresses**: Foundation, LP pools, burn address are excluded

### Reward Formula

```
                      holder's MIN balance
Holder's Reward = ────────────────────────── × Reward Pool
                   SUM of all MIN balances
```

### Anti-Gaming Examples

| Scenario | Start Balance | End Balance | Result |
|----------|---------------|-------------|--------|
| Loyal Holder | 10,000 | 10,000 | ✅ Credit: 10,000 |
| Partial Seller | 10,000 | 5,000 | ✅ Credit: 5,000 |
| Accumulator | 5,000 | 15,000 | ✅ Credit: 5,000 |
| Last-Minute Buyer | 0 | 50,000 | ❌ Not Eligible |
| Dumper | 10,000 | 500 | ❌ Not Eligible |

---

## Cron Jobs Schedule

```
┌─────────────────────────────────────────────────────────────┐
│                      CRON SCHEDULE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  JOB 1: SNAPSHOT                                           │
│  Schedule: "59 23 * * 0"  (Sunday 23:59 UTC)               │
│  Action:   Fetch all holders from Moralis API              │
│            Save to `snapshots` collection                  │
│                                                             │
│  JOB 2: CALCULATE                                          │
│  Schedule: "30 0 * * 1"   (Monday 00:30 UTC)               │
│  Action:   Compare START & END snapshots                   │
│            Calculate eligible holders & rewards            │
│            Save to `recipients` & `batches` collections    │
│                                                             │
│  JOB 3: AIRDROP                                            │
│  Schedule: "0 1 * * 1"    (Monday 01:00 UTC)               │
│  Action:   Process all pending batches                     │
│            Execute multi-send transactions                 │
│            Update status & txHash in database              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Admin Dashboard (Read-Only + Secure)

### Security Features

```
┌─────────────────────────────────────────────────────────────┐
│                 ADMIN SECURITY                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✓ Credentials stored in .env (not in database)           │
│  ✓ Session-based authentication                            │
│  ✓ httpOnly cookies (prevents XSS attacks)                │
│  ✓ Secure cookies in production (HTTPS only)              │
│  ✓ 24-hour session expiry                                 │
│  ✓ All admin routes protected by middleware               │
│  ✓ READ-ONLY access (no write/delete operations)          │
│  ✓ No sensitive data exposed (private key hidden)         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Admin Pages

| Route | Description |
|-------|-------------|
| `/admin/login` | Login page (username/password from .env) |
| `/admin/logout` | Logout and destroy session |
| `/admin/dashboard` | Overview with stats and recent activity |
| `/admin/snapshots` | List all weekly snapshots (paginated) |
| `/admin/snapshots/:id` | Snapshot detail with holder list |
| `/admin/distributions` | List all distributions (paginated) |
| `/admin/distributions/:id` | Distribution detail with batch stats |
| `/admin/recipients` | Paginated recipient list with filters |
| `/admin/batches` | Batch status list |
| `/admin/batches/:id` | Batch detail with recipient list |
| `/admin/search` | **Search by wallet address** |

### Search Functionality

```
┌─────────────────────────────────────────────────────────────┐
│                 SEARCH BY ADDRESS                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Input: 0x... wallet address                               │
│                                                             │
│  Results show:                                              │
│  ─────────────                                             │
│  1. SNAPSHOT HISTORY                                       │
│     • All weeks where address held AQUARI                  │
│     • Balance at each snapshot                             │
│                                                             │
│  2. AIRDROP HISTORY                                        │
│     • All distributions where address was eligible         │
│     • Start/End/MIN balances                               │
│     • Reward amount received                               │
│     • Status (completed/pending/failed)                    │
│     • Transaction hash (clickable link to BaseScan)        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## MongoDB Collections (Normalized Schema)

> **Design Decision**: Holders are stored in a separate collection (not embedded in snapshots) for better query performance, no document size limits, and efficient wallet search across all weeks.

### Storage Estimates

| Collection | Documents/Year | Avg Size | Total/Year |
|------------|----------------|----------|------------|
| `snapshots` | 104 | 500B | ~50KB |
| `holders` | 1.2M | 200B | ~240MB |
| `distributions` | 52 | 1KB | ~50KB |
| `recipients` | 600K | 300B | ~180MB |
| `batches` | 6K | 2KB | ~12MB |
| **Total** | | | **~450MB/year** |

---

### 1. snapshots (Metadata Only)

```typescript
interface Snapshot {
  _id: ObjectId;
  weekId: string;                    // "2025-W04" (unique)
  timestamp: Date;
  totalHolders: number;              // Denormalized count
  totalBalance: string;              // Sum of all balances (wei)
  metadata: {
    fetchDurationMs: number;
    apiCallCount: number;
    moralisCursor?: string;          // For resume if failed
  };
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

// Indexes
{ weekId: 1 }                        // Unique
{ timestamp: -1 }                    // List recent first
{ status: 1 }                        // Find pending/failed
```

---

### 2. holders (Normalized - One doc per holder per week)

```typescript
interface Holder {
  _id: ObjectId;
  weekId: string;                    // "2025-W04"
  snapshotId: ObjectId;              // Reference to snapshot
  address: string;                   // Lowercase, indexed
  balance: string;                   // Raw wei string
  balanceFormatted: string;          // Human readable (e.g., "10,000")
  isContract: boolean;
  label?: string;                    // "Binance", "Uniswap LP", etc.
  entity?: string;                   // Entity name from Moralis
  createdAt: Date;
}

// Indexes (Critical for performance)
{ weekId: 1, address: 1 }            // Unique compound
{ address: 1 }                       // ⚡ Fast wallet search across ALL weeks
{ address: 1, weekId: -1 }           // ⚡ Wallet history sorted by week
{ weekId: 1, balance: -1 }           // Top holders per week
{ snapshotId: 1 }                    // Get all holders for a snapshot
```

### 3. distributions

```typescript
interface Distribution {
  _id: ObjectId;
  weekId: string;                    // "2025-W04" (unique)
  status: 'pending' | 'calculating' | 'ready' | 'processing' | 'completed' | 'failed';
  startSnapshotId: ObjectId;         // Week start snapshot
  endSnapshotId: ObjectId;           // Week end snapshot
  config: {
    minBalance: string;              // Minimum AQUARI to qualify
    rewardPool: string;              // Total rewards (wei)
    rewardToken: 'ETH' | 'USDC' | 'AQUARI';
    batchSize: number;
  };
  stats: {
    totalHolders: number;            // Total unique holders
    eligibleHolders: number;         // Holders meeting criteria
    excludedHolders: number;         // LPs, contracts, etc.
    totalEligibleBalance: string;    // Sum of MIN balances
    totalDistributed: string;        // Actual distributed (wei)
  };
  createdAt: Date;
  calculatedAt?: Date;
  completedAt?: Date;
  error?: string;
}

// Indexes
{ weekId: 1 }                        // Unique
{ createdAt: -1 }                    // List recent first
{ status: 1, createdAt: -1 }         // Filter by status
```

### 4. recipients

```typescript
interface Recipient {
  _id: ObjectId;
  distributionId: ObjectId;
  weekId: string;
  address: string;                   // Lowercase (indexed for search)
  balances: {
    start: string;                   // Balance at week start
    end: string;                     // Balance at week end
    min: string;                     // MIN(start, end) - used for reward calc
  };
  reward: string;                    // Reward amount (wei)
  rewardFormatted: string;           // Human readable (e.g., "0.05 ETH")
  percentage: number;                // % of total distribution
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed';
  batchId?: ObjectId;                // Reference to batch
  batchNumber?: number;
  txHash?: string;                   // Transaction hash when completed
  error?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Indexes (Critical for wallet search)
{ address: 1 }                       // ⚡ Fast wallet search across ALL weeks
{ address: 1, weekId: -1 }           // ⚡ Wallet airdrop history sorted
{ distributionId: 1, address: 1 }    // Unique compound
{ distributionId: 1, reward: -1 }    // Top recipients per distribution
{ weekId: 1, status: 1 }             // Filter by week + status
{ status: 1 }                        // Find pending/failed
{ txHash: 1 }                        // Lookup by transaction (sparse)
```

### 5. batches

```typescript
interface Batch {
  _id: ObjectId;
  distributionId: ObjectId;
  weekId: string;                    // Denormalized for easier queries
  batchNumber: number;
  recipients: Array<{
    address: string;
    amount: string;
  }>;
  recipientCount: number;
  totalAmount: string;               // Sum of all amounts in batch (wei)
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed';
  execution?: {
    txHash: string;
    gasUsed: string;
    gasPrice: string;
    blockNumber: number;
    confirmedAt: Date;
  };
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Indexes
{ distributionId: 1, batchNumber: 1 }  // Unique compound
{ distributionId: 1, status: 1 }       // Batches per distribution + status
{ weekId: 1, status: 1 }               // Filter by week + status
{ status: 1, createdAt: -1 }           // Pending batches for processing
{ 'execution.txHash': 1 }              // Lookup by txHash (sparse)
```

### 6. config (Single Document)

```typescript
interface Config {
  _id: 'settings';                   // Always 'settings' - singleton
  token: {
    address: string;                 // AQUARI contract address
    symbol: string;                  // "AQUARI"
    decimals: number;                // 18
    chainId: number;                 // 8453 (Base)
  };
  distribution: {
    minBalance: string;              // Minimum tokens to qualify (wei)
    rewardToken: string;             // "ETH" | "USDC" | "AQUARI"
    rewardPool: string;              // Default reward pool (wei)
  };
  batch: {
    size: number;                    // Recipients per batch (100)
    gasLimit: number;                // Gas limit per batch
    maxGasPrice: string;             // Max gas price (wei)
    confirmations: number;           // Block confirmations required
  };
  excludedAddresses: string[];       // LPs, foundation, burn, etc.
  contracts: {
    disperse: string;                // Disperse contract address
  };
  updatedAt: Date;
}

// No indexes needed - direct _id lookup
```

---

## Project Structure

```
aquari-airdrop/
├── src/
│   ├── index.ts                     # App entry point
│   │
│   ├── config/
│   │   ├── env.ts                   # Environment validation
│   │   ├── database.ts              # MongoDB connection + index creation
│   │   └── redis.ts                 # Redis connection
│   │
│   ├── models/
│   │   ├── Snapshot.ts              # Snapshot metadata
│   │   ├── Holder.ts                # ⭐ NEW - Holder per week (normalized)
│   │   ├── Distribution.ts
│   │   ├── Recipient.ts
│   │   ├── Batch.ts
│   │   └── Config.ts
│   │
│   ├── services/
│   │   ├── moralis.service.ts       # Fetch token holders
│   │   ├── snapshot.service.ts      # Take & save snapshots
│   │   ├── calculation.service.ts   # Calculate rewards
│   │   ├── airdrop.service.ts       # Orchestrate airdrops
│   │   └── blockchain.service.ts    # Execute transactions (MOCK/REAL)
│   │
│   ├── jobs/
│   │   ├── index.ts                 # Initialize cron jobs
│   │   ├── snapshot.job.ts          # Sunday 23:59 UTC
│   │   ├── calculate.job.ts         # Monday 00:30 UTC
│   │   └── airdrop.job.ts           # Monday 01:00 UTC
│   │
│   ├── admin/                       # ══════ ADMIN DASHBOARD ══════
│   │   ├── routes/
│   │   │   └── admin.routes.ts      # All admin routes
│   │   ├── controllers/
│   │   │   └── admin.controller.ts  # Route handlers
│   │   ├── middleware/
│   │   │   └── auth.middleware.ts   # Auth check middleware
│   │   └── views/                   # EJS templates
│   │       ├── layout.ejs           # Base layout
│   │       ├── login.ejs            # Login form
│   │       ├── dashboard.ejs        # Overview
│   │       ├── snapshots.ejs        # Snapshot list
│   │       ├── snapshot-detail.ejs  # Single snapshot
│   │       ├── distributions.ejs    # Distribution list
│   │       ├── distribution-detail.ejs
│   │       ├── recipients.ejs       # Recipients list
│   │       ├── batches.ejs          # Batch list
│   │       ├── batch-detail.ejs     # Single batch
│   │       └── search.ejs           # Search by address
│   │
│   └── utils/
│       ├── week.ts
│       ├── format.ts
│       ├── pagination.ts            # ⭐ Pagination helper
│       └── logger.ts
│
├── public/
│   └── css/styles.css
│
├── package.json
├── tsconfig.json
├── .env.example
├── .env
├── docker-compose.yml
└── CLAUDE.md
```

---

## Core Implementation

### Database Connection & Index Creation

```typescript
// src/config/database.ts

import { MongoClient, Db } from 'mongodb';
import { logger } from '../utils/logger';

let db: Db;

export async function connectDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI not set in .env');
  }

  const client = new MongoClient(uri);
  await client.connect();

  db = client.db();
  logger.info('Connected to MongoDB');

  return db;
}

export function getDb(): Db {
  if (!db) throw new Error('Database not connected');
  return db;
}

// ═══════════════════════════════════════════════════════════
// INDEX CREATION - Critical for query performance
// ═══════════════════════════════════════════════════════════

export async function createIndexes(db: Db): Promise<void> {

  // SNAPSHOTS (metadata only)
  await db.collection('snapshots').createIndexes([
    { key: { weekId: 1 }, unique: true },
    { key: { timestamp: -1 } },
    { key: { status: 1 } }
  ]);

  // HOLDERS (normalized - one doc per holder per week)
  await db.collection('holders').createIndexes([
    { key: { weekId: 1, address: 1 }, unique: true },
    { key: { address: 1 } },                      // ⚡ Wallet search
    { key: { address: 1, weekId: -1 } },          // ⚡ Wallet history sorted
    { key: { weekId: 1, balance: -1 } },          // Top holders per week
    { key: { snapshotId: 1 } }
  ]);

  // DISTRIBUTIONS
  await db.collection('distributions').createIndexes([
    { key: { weekId: 1 }, unique: true },
    { key: { createdAt: -1 } },
    { key: { status: 1, createdAt: -1 } }
  ]);

  // RECIPIENTS (critical for wallet search)
  await db.collection('recipients').createIndexes([
    { key: { address: 1 } },                      // ⚡ Wallet search
    { key: { address: 1, weekId: -1 } },          // ⚡ Wallet airdrop history
    { key: { distributionId: 1, address: 1 }, unique: true },
    { key: { distributionId: 1, reward: -1 } },   // Top recipients
    { key: { weekId: 1, status: 1 } },
    { key: { status: 1 } },
    { key: { txHash: 1 }, sparse: true }
  ]);

  // BATCHES
  await db.collection('batches').createIndexes([
    { key: { distributionId: 1, batchNumber: 1 }, unique: true },
    { key: { distributionId: 1, status: 1 } },
    { key: { weekId: 1, status: 1 } },
    { key: { status: 1, createdAt: -1 } },
    { key: { 'execution.txHash': 1 }, sparse: true }
  ]);

  logger.info('All database indexes created');
}
```

### Pagination Utility

```typescript
// src/utils/pagination.ts

import { Request } from 'express';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Default limits per endpoint type
export const LIMITS = {
  SNAPSHOTS: 20,
  HOLDERS: 100,
  DISTRIBUTIONS: 20,
  RECIPIENTS: 100,
  BATCHES: 50,
  SEARCH_HISTORY: 50
} as const;

/**
 * Parse pagination params from request query
 */
export function getPagination(req: Request, defaultLimit: number = 20): PaginationParams {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(
    Math.max(1, parseInt(req.query.limit as string) || defaultLimit),
    500  // Max limit cap
  );
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

/**
 * Build paginated response object
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / params.limit);

  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1
    }
  };
}
```

### Auth Middleware

```typescript
// src/admin/middleware/auth.middleware.ts

import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.isAuthenticated) {
    return next();
  }
  
  // Save intended URL for redirect after login
  req.session.returnTo = req.originalUrl;
  res.redirect('/admin/login');
}
```

### Admin Controller

```typescript
// src/admin/controllers/admin.controller.ts

import { Request, Response } from 'express';
import { Db, ObjectId } from 'mongodb';
import { getPagination, LIMITS } from '../../utils/pagination';

// ═══════════════════════════════════════════════════════════
// LOGIN / LOGOUT
// ═══════════════════════════════════════════════════════════

export function showLogin(req: Request, res: Response) {
  if (req.session?.isAuthenticated) {
    return res.redirect('/admin/dashboard');
  }
  res.render('login', { error: null });
}

export function handleLogin(req: Request, res: Response) {
  const { username, password } = req.body;
  
  // Credentials from .env
  const validUsername = process.env.ADMIN_USERNAME;
  const validPassword = process.env.ADMIN_PASSWORD;
  
  if (!validUsername || !validPassword) {
    return res.render('login', { error: 'Admin credentials not configured' });
  }
  
  if (username === validUsername && password === validPassword) {
    req.session.isAuthenticated = true;
    req.session.username = username;
    
    const returnTo = req.session.returnTo || '/admin/dashboard';
    delete req.session.returnTo;
    return res.redirect(returnTo);
  }
  
  res.render('login', { error: 'Invalid username or password' });
}

export function handleLogout(req: Request, res: Response) {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════

export async function dashboard(req: Request, res: Response) {
  const db: Db = req.app.locals.db;
  
  const [
    latestDistribution,
    totalSnapshots,
    totalDistributions,
    pendingBatches,
    recentDistributions
  ] = await Promise.all([
    db.collection('distributions').findOne({}, { sort: { createdAt: -1 } }),
    db.collection('snapshots').countDocuments(),
    db.collection('distributions').countDocuments(),
    db.collection('batches').countDocuments({ status: { $in: ['pending', 'processing'] } }),
    db.collection('distributions').find({}).sort({ createdAt: -1 }).limit(5).toArray()
  ]);
  
  res.render('dashboard', {
    latestDistribution,
    totalSnapshots,
    totalDistributions,
    pendingBatches,
    recentDistributions,
    mockMode: process.env.MOCK_MODE === 'true'
  });
}

// ═══════════════════════════════════════════════════════════
// SNAPSHOTS (READ-ONLY)
// ═══════════════════════════════════════════════════════════

export async function listSnapshots(req: Request, res: Response) {
  const db: Db = req.app.locals.db;
  const { page, limit, skip } = getPagination(req, LIMITS.SNAPSHOTS);

  const [snapshots, total] = await Promise.all([
    db.collection('snapshots')
      .find({})
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection('snapshots').countDocuments()
  ]);

  const totalPages = Math.ceil(total / limit);

  res.render('snapshots', {
    snapshots,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  });
}

export async function snapshotDetail(req: Request, res: Response) {
  const db: Db = req.app.locals.db;
  const { id } = req.params;
  const { page, limit, skip } = getPagination(req, LIMITS.HOLDERS);

  const snapshot = await db.collection('snapshots').findOne({ _id: new ObjectId(id) });

  if (!snapshot) {
    return res.status(404).render('error', { message: 'Snapshot not found' });
  }

  // Query holders from NORMALIZED collection (not embedded)
  // Uses index: { snapshotId: 1 } and { weekId: 1, balance: -1 }
  const [holders, total] = await Promise.all([
    db.collection('holders')
      .find({ snapshotId: snapshot._id })
      .sort({ balance: -1 })           // Top holders first
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection('holders').countDocuments({ snapshotId: snapshot._id })
  ]);

  const totalPages = Math.ceil(total / limit);

  res.render('snapshot-detail', {
    snapshot,
    holders,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  });
}

// ═══════════════════════════════════════════════════════════
// DISTRIBUTIONS (READ-ONLY)
// ═══════════════════════════════════════════════════════════

export async function listDistributions(req: Request, res: Response) {
  const db: Db = req.app.locals.db;
  const { page, limit, skip } = getPagination(req, LIMITS.DISTRIBUTIONS);

  const [distributions, total] = await Promise.all([
    db.collection('distributions')
      .find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection('distributions').countDocuments()
  ]);

  const totalPages = Math.ceil(total / limit);

  res.render('distributions', {
    distributions,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  });
}

export async function distributionDetail(req: Request, res: Response) {
  const db: Db = req.app.locals.db;
  const { id } = req.params;
  const { page, limit, skip } = getPagination(req, LIMITS.RECIPIENTS);

  const distribution = await db.collection('distributions').findOne({ _id: new ObjectId(id) });

  if (!distribution) {
    return res.status(404).render('error', { message: 'Distribution not found' });
  }

  // Paginated recipients query
  const [batchStats, recipients, totalRecipients] = await Promise.all([
    db.collection('batches').aggregate([
      { $match: { distributionId: distribution._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray(),
    db.collection('recipients')
      .find({ distributionId: distribution._id })
      .sort({ reward: -1 })           // Top recipients first
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection('recipients').countDocuments({ distributionId: distribution._id })
  ]);

  const totalPages = Math.ceil(totalRecipients / limit);

  res.render('distribution-detail', {
    distribution,
    batchStats,
    recipients,
    pagination: {
      page,
      limit,
      total: totalRecipients,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  });
}

// ═══════════════════════════════════════════════════════════
// RECIPIENTS (READ-ONLY)
// ═══════════════════════════════════════════════════════════

export async function listRecipients(req: Request, res: Response) {
  const db: Db = req.app.locals.db;
  const { page, limit, skip } = getPagination(req, LIMITS.RECIPIENTS);
  const { status, weekId } = req.query;

  const query: any = {};
  if (status) query.status = status;
  if (weekId) query.weekId = weekId;

  const [recipients, total, weeks] = await Promise.all([
    db.collection('recipients')
      .find(query)
      .sort({ reward: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection('recipients').countDocuments(query),
    db.collection('distributions').distinct('weekId')
  ]);

  const totalPages = Math.ceil(total / limit);

  res.render('recipients', {
    recipients,
    filters: { status, weekId },
    weeks,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  });
}

// ═══════════════════════════════════════════════════════════
// BATCHES (READ-ONLY)
// ═══════════════════════════════════════════════════════════

export async function listBatches(req: Request, res: Response) {
  const db: Db = req.app.locals.db;
  const { page, limit, skip } = getPagination(req, LIMITS.BATCHES);
  const { status } = req.query;

  const query: any = {};
  if (status) query.status = status;

  const [batches, total] = await Promise.all([
    db.collection('batches')
      .find(query, { projection: { recipients: 0 } })  // Exclude recipients for list
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection('batches').countDocuments(query)
  ]);

  const totalPages = Math.ceil(total / limit);

  res.render('batches', {
    batches,
    filters: { status },
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  });
}

export async function batchDetail(req: Request, res: Response) {
  const db: Db = req.app.locals.db;
  const { id } = req.params;
  const { page, limit, skip } = getPagination(req, LIMITS.RECIPIENTS);

  const batch = await db.collection('batches').findOne({ _id: new ObjectId(id) });

  if (!batch) {
    return res.status(404).render('error', { message: 'Batch not found' });
  }

  // Paginate the recipients array (in-memory since batch is already loaded)
  const totalRecipients = batch.recipients?.length || 0;
  const paginatedRecipients = batch.recipients?.slice(skip, skip + limit) || [];
  const totalPages = Math.ceil(totalRecipients / limit);

  res.render('batch-detail', {
    batch: {
      ...batch,
      recipients: paginatedRecipients  // Only send paginated slice
    },
    pagination: {
      page,
      limit,
      total: totalRecipients,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  });
}

// ═══════════════════════════════════════════════════════════
// SEARCH BY ADDRESS (READ-ONLY) - Paginated
// ═══════════════════════════════════════════════════════════

export async function searchByAddress(req: Request, res: Response) {
  const db: Db = req.app.locals.db;
  const address = (req.query.address as string || '').toLowerCase().trim();
  const tab = (req.query.tab as string) || 'airdrops';  // 'airdrops' | 'balances'
  const { page, limit, skip } = getPagination(req, LIMITS.SEARCH_HISTORY);

  // Validate address format
  if (!address) {
    return res.render('search', {
      address: '',
      results: null,
      pagination: null,
      tab,
      error: null
    });
  }

  if (!/^0x[a-f0-9]{40}$/i.test(address)) {
    return res.render('search', {
      address,
      results: null,
      pagination: null,
      tab,
      error: 'Invalid address format'
    });
  }

  let results: any[] = [];
  let total = 0;

  if (tab === 'balances') {
    // Balance history from HOLDERS collection (paginated)
    // Index: { address: 1, weekId: -1 }
    [results, total] = await Promise.all([
      db.collection('holders')
        .find({ address })
        .sort({ weekId: -1 })
        .skip(skip)
        .limit(limit)
        .project({
          weekId: 1,
          balance: 1,
          balanceFormatted: 1,
          createdAt: 1
        })
        .toArray(),
      db.collection('holders').countDocuments({ address })
    ]);
  } else {
    // Airdrop history from RECIPIENTS collection (paginated)
    // Index: { address: 1, weekId: -1 }
    [results, total] = await Promise.all([
      db.collection('recipients')
        .find({ address })
        .sort({ weekId: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('recipients').countDocuments({ address })
    ]);
  }

  const totalPages = Math.ceil(total / limit);

  res.render('search', {
    address,
    results,
    tab,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    error: null
  });
}
```

### Admin Routes

```typescript
// src/admin/routes/admin.routes.ts

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/admin.controller';

const router = Router();

// Public routes
router.get('/login', ctrl.showLogin);
router.post('/login', ctrl.handleLogin);
router.get('/logout', ctrl.handleLogout);

// Protected routes (all READ-ONLY)
router.use(requireAuth);

router.get('/dashboard', ctrl.dashboard);
router.get('/snapshots', ctrl.listSnapshots);
router.get('/snapshots/:id', ctrl.snapshotDetail);
router.get('/distributions', ctrl.listDistributions);
router.get('/distributions/:id', ctrl.distributionDetail);
router.get('/recipients', ctrl.listRecipients);
router.get('/batches', ctrl.listBatches);
router.get('/batches/:id', ctrl.batchDetail);
router.get('/search', ctrl.searchByAddress);

export default router;
```

### App Entry Point

```typescript
// src/index.ts

import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { connectDatabase, createIndexes } from './config/database';
import { initializeJobs } from './jobs';
import adminRoutes from './admin/routes/admin.routes';
import { logger } from './utils/logger';

async function main() {
  // Validate required env vars
  const required = ['MONGODB_URI', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'SESSION_SECRET'];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }

  // Connect to MongoDB
  const db = await connectDatabase();

  // Create indexes (critical for query performance)
  await createIndexes(db);

  // Initialize cron jobs
  initializeJobs(db);

  // Express app
  const app = express();
  app.locals.db = db;

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, '../public')));

  // Session (for admin auth)
  app.use(session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000  // 24 hours
    }
  }));

  // View engine
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'admin/views'));

  // Routes
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/admin', adminRoutes);
  app.get('/', (req, res) => res.redirect('/admin/dashboard'));

  // Start server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Admin: http://localhost:${PORT}/admin`);
    logger.info(`Mock mode: ${process.env.MOCK_MODE === 'true'}`);
  });
}

main().catch(err => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
```

---

## Package.json

```json
{
  "name": "aquari-airdrop",
  "version": "1.0.0",
  "scripts": {
    "dev": "ts-node-dev --respawn src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "dotenv": "^16.3.1",
    "ejs": "^3.1.9",
    "ethers": "^6.9.0",
    "express": "^4.18.2",
    "express-session": "^1.17.3",
    "mongodb": "^6.3.0",
    "node-cron": "^3.0.3",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/express-session": "^1.17.10",
    "@types/node": "^20.10.0",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.3.0"
  }
}
```

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create .env file
cp .env.example .env

# 3. Configure .env with:
#    - MONGODB_URI (your MongoDB connection string)
#    - ADMIN_USERNAME (unique admin username)
#    - ADMIN_PASSWORD (strong password)
#    - SESSION_SECRET (random 64 char string)
#    - MORALIS_API_KEY

# 4. Start in development
npm run dev

# 5. Access admin dashboard
#    http://localhost:3000/admin
#    Login with ADMIN_USERNAME and ADMIN_PASSWORD from .env
```

---

## Security Summary

| Feature | Implementation |
|---------|----------------|
| Admin credentials | Stored in `.env` only |
| Session security | httpOnly + secure cookies |
| Session expiry | 24 hours |
| Route protection | Middleware on all admin routes |
| Database access | READ-ONLY operations only |
| Private key | Never exposed in admin UI |
| Address search | Sanitized and validated |

---

## Pagination Summary

All admin APIs are paginated to handle large datasets efficiently:

| Endpoint | Default Limit | Max Limit | Query Params |
|----------|---------------|-----------|--------------|
| `/admin/snapshots` | 20 | 500 | `?page=1&limit=20` |
| `/admin/snapshots/:id` | 100 | 500 | `?page=1&limit=100` (holders) |
| `/admin/distributions` | 20 | 500 | `?page=1&limit=20` |
| `/admin/distributions/:id` | 100 | 500 | `?page=1&limit=100` (recipients) |
| `/admin/recipients` | 100 | 500 | `?page=1&limit=100&status=&weekId=` |
| `/admin/batches` | 50 | 500 | `?page=1&limit=50&status=` |
| `/admin/batches/:id` | 100 | 500 | `?page=1&limit=100` (recipients) |
| `/admin/search` | 50 | 500 | `?address=0x...&tab=airdrops&page=1` |

### Pagination Response Format

All paginated endpoints return:
```typescript
{
  data: [...],
  pagination: {
    page: 1,
    limit: 100,
    total: 12000,
    totalPages: 120,
    hasNext: true,
    hasPrev: false
  }
}
```

### URL Examples
```
/admin/snapshots?page=2&limit=50
/admin/recipients?status=completed&weekId=2025-W04&page=1
/admin/search?address=0x1234...&tab=balances&page=3
/admin/distributions/abc123?page=5&limit=50
```

---

## Query Performance Summary

With the normalized schema and proper indexes, all admin queries are optimized:

| Query | Collection | Index Used | Expected Time |
|-------|------------|------------|---------------|
| Search wallet `0x...` | `holders` | `{ address: 1 }` | <5ms |
| Wallet balance history | `holders` | `{ address: 1, weekId: -1 }` | <10ms |
| Wallet airdrop history | `recipients` | `{ address: 1, weekId: -1 }` | <10ms |
| List snapshots | `snapshots` | `{ timestamp: -1 }` | <5ms |
| Snapshot holders (paginated) | `holders` | `{ snapshotId: 1 }` | <10ms |
| Top holders per week | `holders` | `{ weekId: 1, balance: -1 }` | <5ms |
| List distributions | `distributions` | `{ createdAt: -1 }` | <5ms |
| Pending batches | `batches` | `{ status: 1, createdAt: -1 }` | <5ms |
| Lookup by txHash | `recipients` | `{ txHash: 1 }` | <5ms |

### Key Design Decisions

1. **Normalized holders**: Separate `holders` collection instead of embedded array
   - Enables direct index lookup for wallet search
   - No 16MB document size limit
   - Efficient pagination

2. **Compound indexes**: `{ address: 1, weekId: -1 }` for sorted wallet history
   - Single index serves both filter and sort
   - Avoids in-memory sorting

3. **Sparse indexes**: `{ txHash: 1, sparse: true }` for optional fields
   - Only indexes documents with txHash
   - Saves space for pending records

4. **Denormalized weekId**: Stored in multiple collections
   - Avoids joins for common queries
   - Enables direct filtering without lookups