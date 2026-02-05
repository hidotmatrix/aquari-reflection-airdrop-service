# AQUARI Airdrop Service - Deployment Guide

## Server Details

- **Provider:** DigitalOcean Droplet
- **Location:** AMS3 (Amsterdam)
- **Specs:** 1 vCPU, 1GB RAM
- **OS:** Ubuntu
- **Node.js:** v24.13.0
- **Repo:** https://github.com/hidotmatrix/aquari-reflection-airdrop-service

## Directory Structure

```
/root/airdrop/              # Main application
```

---

- Same directory structure as above.

### Helper Scripts (Recommended)
We have provided helper scripts in the `scripts/` directory to simplify usage:

- **Start**: `./scripts/prod-start.sh`
- **Logs**: `./scripts/prod-logs.sh` (or `./scripts/prod-logs.sh app` for app only)
- **Stop**: `./scripts/prod-stop.sh`
- **Update/Rebuild**: `./scripts/prod-rebuild.sh`

### Manual Commands
If you prefer running commands manually:
Ensure Docker and Docker Compose are installed.

### 2. Setup
1. SSH into the server.
2. Clone the repository:
   ```bash
   git clone https://github.com/hidotmatrix/aquari-reflection-airdrop-service.git
   cd aquari-reflection-airdrop-service
   ```
3. Create `.env.production`:
   ```bash
   cp .env.production.example .env.production
   nano .env.production
   ```
   **Critical**: Ensure you set `ADMIN_PASSWORD` and `SESSION_SECRET` to secure values.

### 3. Run (Self-Hosted Option)
Since you chose the self-hosted option (app + DBs), use the `self-hosted` profile.

**1. Configure .env.production**:
Use the "Self-Hosted" connection strings in your `.env.production` file:
```env
# Internal Docker Network URLs
MONGODB_URI=mongodb://mongodb:27017/aquari-airdrop
REDIS_URL=redis://redis:6379
```

**2. Start Services**:
```bash
docker compose -f docker-compose.prod.yml --profile self-hosted up -d
```

### 4. Verify
- Dashboard: `https://redis.aquari.org/admin`
- Logs: `docker compose -f docker-compose.prod.yml --profile self-hosted logs -f app`

---

## Nginx Configuration (Reverse Proxy)

To serve the application on `redis.aquari.org`:

### 1. Install Nginx & Certbot
```bash
sudo apt install nginx certbot python3-certbot-nginx
```

### 2. Configure Site
Copy the provided template:
```bash
sudo cp scripts/nginx-aquari.conf /etc/nginx/sites-available/redis.aquari.org
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/redis.aquari.org /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 3. SSL Setup
Obtain an SSL certificate:
```bash
sudo certbot --nginx -d redis.aquari.org
```

This will automatically update the Nginx config to force HTTPS.

---

## Manual Deployment (Legacy)

---

## Initial Server Setup

### 1. SSH into Droplet

```bash
ssh root@<droplet-ip>
```

### 2. Update Ubuntu

```bash
sudo apt update && sudo apt upgrade -y
```

### 3. Install Essential Packages

```bash
sudo apt install -y curl git build-essential
```

### 4. Install Node.js (if not installed)

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v  # Should show v24.x.x
npm -v   # Should show npm version
```

### 5. Install PM2 (Process Manager)

```bash
npm install -g pm2
pm2 -v   # Verify installation
```

### 4. Clone Repository

```bash
cd /root
git clone https://github.com/hidotmatrix/aquari-reflection-airdrop-service.git airdrop
cd airdrop
```

### 5. Install Dependencies

```bash
npm install
```

### 6. Create .env File

```bash
nano .env
```

Paste the production configuration (see Environment Variables section below).

### 7. Build Application

```bash
npm run build
```

### 8. Sync Restricted Addresses

```bash
node scripts/sync-restricted.js
```

This loads 8 bot-restricted addresses into MongoDB. These addresses cannot receive airdrops.

### 9. Start with PM2

```bash
pm2 start dist/index.js --name airdrop
pm2 save
pm2 startup  # Enable auto-start on reboot
```

---

## Environment Variables (.env)

```env
# ═══════════════════════════════════════════════════════════
# AQUARI AIRDROP - PRODUCTION CONFIGURATION
# ═══════════════════════════════════════════════════════════

# Mode
MODE=production
PORT=3000
NODE_ENV=production

# ═══════════════════════════════════════════════════════════
# DATABASE - MongoDB Atlas
# ═══════════════════════════════════════════════════════════
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/aquari-airdrop?retryWrites=true&w=majority

# ═══════════════════════════════════════════════════════════
# REDIS - Upstash (Optional - for job queues)
# ═══════════════════════════════════════════════════════════
REDIS_URL=rediss://default:<password>@<host>.upstash.io:6379

# ═══════════════════════════════════════════════════════════
# BLOCKCHAIN - QuikNode RPC
# ═══════════════════════════════════════════════════════════
BASE_RPC_URL=https://<your-quicknode-endpoint>/

# ═══════════════════════════════════════════════════════════
# WALLET - Airdrop Wallet Private Key
# ═══════════════════════════════════════════════════════════
# The wallet needs:
#   - ETH for gas (~0.01 ETH is plenty)
#   - AQUARI tokens for the reward pool
PRIVATE_KEY=<your-private-key>

# ═══════════════════════════════════════════════════════════
# MORALIS API - For snapshot data
# ═══════════════════════════════════════════════════════════
MORALIS_API_KEY=<your-moralis-api-key>

# ═══════════════════════════════════════════════════════════
# ADMIN AUTHENTICATION
# ═══════════════════════════════════════════════════════════
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<bcrypt-hashed-password>
SESSION_SECRET=<random-64-char-string>

# ═══════════════════════════════════════════════════════════
# 3-STEP CRON SCHEDULE - Weekly on Sundays at midnight UTC
# ═══════════════════════════════════════════════════════════
# Step 1: Take snapshot of all holders (Sunday 00:00 UTC)
SNAPSHOT_CRON=0 0 * * 0

# Step 2: Calculate rewards (Sunday 00:05 UTC)
CALCULATE_CRON=5 0 * * 0

# Step 3: Execute airdrop (Sunday 00:10 UTC)
AIRDROP_CRON=10 0 * * 0

# ═══════════════════════════════════════════════════════════
# OPTIONAL OVERRIDES
# ═══════════════════════════════════════════════════════════
BATCH_SIZE=350    # Recipients per transaction (max ~380 for Base gas limit)
```

---

## Common Operations

### Deploy Updates

```bash
cd /root/airdrop && git pull && npm run build && pm2 restart airdrop
```

### View Logs

```bash
pm2 logs airdrop           # Live logs
pm2 logs airdrop --lines 100  # Last 100 lines
```

### Check Status

```bash
pm2 status
pm2 monit   # Interactive monitor
```

### Restart Service

```bash
pm2 restart airdrop
```

### Stop Service

```bash
pm2 stop airdrop
```

### Clear Collections (Reset Data)

```bash
cd /root/airdrop
npx ts-node scripts/clear-collections.ts
```

This deletes all data EXCEPT restricted_addresses.

### Sync Restricted Addresses

```bash
node scripts/sync-restricted.js
```

---

## Cron Schedule Reference

| Schedule | Meaning |
|----------|---------|
| `0 0 * * 0` | Every Sunday at 00:00 UTC |
| `0 0 * * *` | Every day at 00:00 UTC |
| `0 */6 * * *` | Every 6 hours |
| `*/30 * * * *` | Every 30 minutes |

---

## Admin Dashboard

- **URL:** `http://<droplet-ip>:3000/admin`
- **Login:** admin / admin123

### Dashboard Features:
- View snapshots and holder data
- Trigger manual snapshot/calculate/airdrop
- View distribution history
- Monitor batch status
- Retry failed batches

---

## Troubleshooting

### Rate Limiting (QuickNode)

If you see "15/second request limit reached":
- The service has 1s delays between RPC calls
- The service has 60s delays between batches
- If still failing, increase delays in `src/services/blockchain.service.ts`

### Transaction Reverts

If batches fail with "Transaction reverted":
1. Check restricted_addresses collection exists
2. Run `node scripts/sync-restricted.js`
3. Retry from admin dashboard

### Out of Gas

If transactions fail with gas errors:
- Reduce BATCH_SIZE in .env (default 350)
- Ensure wallet has enough ETH for gas

### MongoDB Connection Issues

```bash
# Test connection
mongosh "mongodb+srv://<connection-string>"
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CRON SCHEDULER                       │
│  SNAPSHOT_CRON → CALCULATE_CRON → AIRDROP_CRON         │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   3-STEP PROCESS                        │
│                                                         │
│  1. SNAPSHOT                                            │
│     └─ Moralis API → Get all AQUARI holders             │
│     └─ Store in MongoDB (snapshots, holders)            │
│                                                         │
│  2. CALCULATE                                           │
│     └─ Compare current vs previous snapshot             │
│     └─ Filter restricted addresses                      │
│     └─ Calculate rewards (pro-rata)                     │
│     └─ Create distribution & batches                    │
│                                                         │
│  3. AIRDROP                                             │
│     └─ Execute batches via Disperse contract            │
│     └─ 350 recipients per batch                         │
│     └─ 60s delay between batches                        │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    BLOCKCHAIN                           │
│  Network: Base Mainnet                                  │
│  Token: AQUARI (0x6885E4A4E7ED6601D032453F09De0F9E6a57e2E9)  │
│  Disperse: 0xD152f549545093347A162Dce210e7293f1452150   │
└─────────────────────────────────────────────────────────┘
```

---

## Cost Estimates

Based on actual production run (2890 recipients, 9 batches):

| Item | Cost |
|------|------|
| Per batch (350 recipients) | ~0.00004 ETH |
| Total airdrop (2890 recipients) | ~0.005 ETH |
| At $3300/ETH | ~$17 |

Gas costs vary with network congestion.

---

## Restricted Addresses

8 bot-restricted addresses are excluded from airdrops:

```
0x0ad7c815d969c8a46c098d44d0e1a5a443410e12
0x2f7839f4a0535647390812c4936b141f1f89c6eb
0x63ecf53cf1d5d719b68df6fb8fb705315733c6b2
0x6b1438e780ec9e4180598c0dcc5837a887394243
0x97d6d3db3fcf4b56784b176d2c859b34e63d9961
0xc90d71a9d7d00de3bb9017397bb1acf60ff22340
0xccbcee3ebc81d1f684bf0de1a34aff18d735dcb5
0xd3c0c8f97e5e3e8b8c490f2ace92dc43fcf5293a
```

These are stored in MongoDB `restricted_addresses` collection.

---

## Server Maintenance

### Update Ubuntu

```bash
sudo apt update && sudo apt upgrade -y
```

### Update Node.js

```bash
# Check current version
node -v

# Update to latest LTS
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Update PM2

```bash
npm install -g pm2@latest
pm2 update
```

### Update Application Dependencies

```bash
cd /root/airdrop
npm update
npm run build
pm2 restart airdrop
```

---

## Security Notes

- Never commit `.env` to git
- Keep private keys secure
- Rotate SESSION_SECRET periodically
- Use strong admin password in production
- Restrict droplet firewall to necessary ports only
