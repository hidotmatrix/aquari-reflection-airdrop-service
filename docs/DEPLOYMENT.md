# Deployment Guide

Complete guide for deploying the AQUARI Airdrop System to production.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Deployment Options](#deployment-options)
- [Quick Start with Docker](#quick-start-with-docker)
- [Manual Deployment](#manual-deployment)
- [Environment Configuration](#environment-configuration)
- [SSL Configuration](#ssl-configuration)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Production Checklist](#production-checklist)

---

## Prerequisites

Before deploying, ensure you have:

- [ ] **Airdrop Wallet** - Fresh wallet with private key
- [ ] **Wallet Funded** - ETH for gas + tokens to airdrop
- [ ] **Moralis API Key** - From moralis.io
- [ ] **Server** - EC2/VPS with Docker installed
- [ ] **Domain Name** (optional) - For SSL/HTTPS

---

## Deployment Options

| Option | Setup | Cost | Best For |
|--------|-------|------|----------|
| **Cloud Services** | Docker (app only) + Atlas + Upstash | ~$8/mo | Most projects |
| **Self-Hosted** | Docker (all services) | ~$15/mo | Full control |

**Cloud Services** uses free tiers of MongoDB Atlas and Upstash Redis.
**Self-Hosted** runs everything on one server using Docker.

---

## Quick Start with Docker

### Option A: Cloud Services (Recommended)

Uses MongoDB Atlas (free tier) + Upstash Redis (free tier). Cheapest option.

**Step 1: Setup Cloud Services**

1. **MongoDB Atlas** (free tier)
   - Go to https://cloud.mongodb.com
   - Create free M0 cluster
   - Get connection string: `mongodb+srv://user:pass@cluster.mongodb.net/aquari-airdrop`

2. **Upstash Redis** (free tier)
   - Go to https://upstash.com
   - Create free Redis database
   - Get URL: `redis://default:xxx@xxx.upstash.io:6379`

**Step 2: Setup Server**

```bash
# Connect to your EC2/VPS
ssh -i your-key.pem ubuntu@your-server-ip

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in

# Clone repository
git clone <your-repo-url> /opt/aquari-airdrop
cd /opt/aquari-airdrop
```

**Step 3: Create Environment File**

```bash
cp .env.example .env.production
nano .env.production
```

```env
# Mode
MODE=production
PORT=3000

# Cloud MongoDB Atlas
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/aquari-airdrop

# Blockchain (use Alchemy or Infura for reliability)
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=your_private_key_here

# Moralis
MORALIS_API_KEY=your_moralis_key

# Admin (generate with: npm run generate-credentials)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$2b$12$YOUR_BCRYPT_HASH_HERE
SESSION_SECRET=your_64_char_random_string_here

# 3-Step Cron Schedule (Sundays at midnight UTC)
SNAPSHOT_CRON=0 0 * * 0
CALCULATE_CRON=5 0 * * 0
AIRDROP_CRON=10 0 * * 0

# Optional Overrides
# MIN_BALANCE=1000000000000000000000  # 1000 AQUARI
# BATCH_SIZE=200
```

**Step 4: Build & Deploy**

```bash
# Build TypeScript
npm install
npm run build

# Start with Docker
docker compose -f docker-compose.prod.yml up -d app

# View logs
docker compose -f docker-compose.prod.yml logs -f app

# Check health
curl http://localhost:3000/health
```

**Done!** Access dashboard at `http://your-server-ip:3000/admin`

---

### Option B: Self-Hosted (All-in-One)

Runs MongoDB + Redis + App all on one server. Requires t3.small or larger.

**Step 1: Setup Server**

```bash
# Connect to your EC2/VPS
ssh -i your-key.pem ubuntu@your-server-ip

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in

# Clone repository
git clone <your-repo-url> /opt/aquari-airdrop
cd /opt/aquari-airdrop
```

**Step 2: Create Environment File**

```bash
cp .env.example .env.production
nano .env.production
```

```env
# Mode
MODE=production
PORT=3000

# Local MongoDB (Docker service)
MONGODB_URI=mongodb://mongodb:27017/aquari-airdrop

# Blockchain (use Alchemy or Infura for reliability)
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=your_private_key_here

# Moralis
MORALIS_API_KEY=your_moralis_key

# Admin (generate with: npm run generate-credentials)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$2b$12$YOUR_BCRYPT_HASH_HERE
SESSION_SECRET=your_64_char_random_string_here

# 3-Step Cron Schedule (Sundays at midnight UTC)
SNAPSHOT_CRON=0 0 * * 0
CALCULATE_CRON=5 0 * * 0
AIRDROP_CRON=10 0 * * 0

# Optional Overrides
# MIN_BALANCE=1000000000000000000000  # 1000 AQUARI
# BATCH_SIZE=200
```

**Step 3: Build & Deploy**

```bash
# Build TypeScript
npm install
npm run build

# Start everything (app + mongodb + redis)
docker compose -f docker-compose.prod.yml --profile self-hosted up -d

# View logs
docker compose -f docker-compose.prod.yml --profile self-hosted logs -f

# Check health
curl http://localhost:3000/health
```

**Done!** Access dashboard at `http://your-server-ip:3000/admin`

---

## Docker Commands Reference

```bash
# Start (cloud services - app only)
docker compose -f docker-compose.prod.yml up -d app

# Start (self-hosted - all services)
docker compose -f docker-compose.prod.yml --profile self-hosted up -d

# View logs
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml logs -f app

# Stop
docker compose -f docker-compose.prod.yml down

# Rebuild after code changes
npm run build
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d app

# Check status
docker compose -f docker-compose.prod.yml ps

# Shell into container
docker exec -it aquari-airdrop sh
```

---

## Manual Deployment

If you prefer running without Docker:

### Step 1: Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx
```

### Step 2: Install MongoDB (if self-hosted)

```bash
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update && sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
```

### Step 3: Install Redis

```bash
sudo apt install -y redis-server
sudo sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf
sudo systemctl enable --now redis
```

### Step 4: Deploy Application

```bash
# Clone and build
cd /opt/aquari-airdrop
git clone <your-repo-url> .
npm install
npm run build

# Create .env file
cp .env.example .env
nano .env

# Start with PM2
pm2 start dist/index.js --name aquari-airdrop
pm2 save
pm2 startup
```

### Step 5: Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/aquari-airdrop
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/aquari-airdrop /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## Environment Configuration

### Generate Secure Credentials

**Recommended: Use the built-in credential generator**

```bash
# Generate bcrypt-hashed password and secure session secret
npm run generate-credentials

# Or with a custom password
npm run generate-credentials -- --password "YourSecurePassword123!"
```

This generates:
- `ADMIN_PASSWORD` - bcrypt hash (starts with `$2b$12$...`)
- `SESSION_SECRET` - 64-character random string

**Alternative: Manual generation**

```bash
# Generate admin password (you'll need to hash it manually)
openssl rand -base64 24

# Generate session secret
openssl rand -hex 32
```

> **Note:** The system now uses bcrypt password hashing. Store the bcrypt hash in `ADMIN_PASSWORD`, not the plain-text password.

### Secure the Environment File

```bash
chmod 600 .env.production
```

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MODE` | production or fork | `production` |
| `MONGODB_URI` | MongoDB connection | `mongodb+srv://...` |
| `BASE_RPC_URL` | Base RPC endpoint | `https://base-mainnet.g.alchemy.com/v2/...` |
| `PRIVATE_KEY` | Wallet private key | `abc123...` |
| `MORALIS_API_KEY` | Moralis API key | `eyJ...` |
| `ADMIN_USERNAME` | Dashboard username | `admin` |
| `ADMIN_PASSWORD` | bcrypt hash (use `npm run generate-credentials`) | `$2b$12$...` |
| `SESSION_SECRET` | 64-char random | `a1b2c3...` |
| `SNAPSHOT_CRON` | When to take snapshot | `0 0 * * 0` (Sunday midnight) |
| `CALCULATE_CRON` | When to calculate | `5 0 * * 0` (Sunday 00:05) |
| `AIRDROP_CRON` | When to airdrop | `10 0 * * 0` (Sunday 00:10) |

---

## Utility Scripts

### Generate Credentials

```bash
# Generate secure bcrypt password hash and session secret
npm run generate-credentials

# With custom password
npm run generate-credentials -- --password "MySecurePassword123!"
```

### Clear Collections

Reset the database while preserving restricted addresses:

```bash
npm run clear-collections
```

This deletes all collections **except** `restricted_addresses` (bot-restricted addresses from AQUARI contract).

---

## SSL Configuration

### Using Let's Encrypt (Free)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Test renewal
sudo certbot renew --dry-run
```

### Using Cloudflare (Easiest)

1. Add domain to Cloudflare
2. Point DNS to server IP
3. Enable "Full" SSL mode
4. Certificates auto-managed

---

## Monitoring

### Docker Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Just the app
docker compose -f docker-compose.prod.yml logs -f app

# Last 100 lines
docker compose -f docker-compose.prod.yml logs --tail 100 app
```

### PM2 (Manual Deploy)

```bash
pm2 status
pm2 logs aquari-airdrop
pm2 monit
```

### Health Checks

```bash
# App health
curl http://localhost:3000/health

# Job status (requires auth cookie)
curl http://localhost:3000/admin/jobs/status

# Blockchain status
curl http://localhost:3000/admin/blockchain/status
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker compose -f docker-compose.prod.yml logs app

# Check if build succeeded
npm run build

# Rebuild container
docker compose -f docker-compose.prod.yml build --no-cache
```

### Cannot Connect to Database

```bash
# Test MongoDB (cloud)
mongosh "your-mongodb-uri"

# Test MongoDB (self-hosted)
docker exec -it aquari-mongodb-prod mongosh

# Test Redis
docker exec -it aquari-redis-prod redis-cli ping
```

### Nginx 502 Bad Gateway

```bash
# Check if app is running
docker compose -f docker-compose.prod.yml ps

# Check app health
curl http://localhost:3000/health

# Check Nginx config
sudo nginx -t
```

---

## Production Checklist

Before going live:

- [ ] `MODE=production` in .env.production
- [ ] `PRIVATE_KEY` is set and wallet is funded (ETH + AQUARI)
- [ ] `ADMIN_PASSWORD` is bcrypt hash (run `npm run generate-credentials`)
- [ ] Random `SESSION_SECRET` (64 chars, from credential generator)
- [ ] `BASE_RPC_URL` points to reliable RPC (Alchemy/Infura recommended)
- [ ] Cron schedule configured for weekly (e.g., Sundays):
  - `SNAPSHOT_CRON=0 0 * * 0`
  - `CALCULATE_CRON=5 0 * * 0`
  - `AIRDROP_CRON=10 0 * * 0`
- [ ] MongoDB connected and accessible
- [ ] Restricted addresses synced: `npm run sync-restricted`
- [ ] Health endpoint returns OK: `curl localhost:3000/health`
- [ ] Dashboard accessible at `/admin`
- [ ] SSL/HTTPS configured
- [ ] Firewall configured (only 80/443/22 open)
- [ ] Container set to restart: `restart: unless-stopped`
- [ ] First snapshot taken (baseline week)
- [ ] Verified logs show correct week IDs (e.g., `2026-W04`)

---

## Update Procedure

```bash
cd /opt/aquari-airdrop

# Pull latest code
git pull origin main

# Rebuild
npm install
npm run build

# Restart container
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d app

# Verify
docker compose -f docker-compose.prod.yml logs -f app
curl http://localhost:3000/health
```
