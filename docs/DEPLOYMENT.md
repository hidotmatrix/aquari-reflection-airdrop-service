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
NODE_ENV=production
MODE=production
PORT=3000

# Cloud MongoDB Atlas
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/aquari-airdrop

# Cloud Upstash Redis
REDIS_URL=redis://default:password@xxx.upstash.io:6379

# Blockchain
RPC_URL=https://mainnet.base.org
PRIVATE_KEY=your_private_key_without_0x

# Moralis
MORALIS_API_KEY=your_moralis_key

# Admin (generate with: openssl rand -base64 24)
ADMIN_USERNAME=secure_admin
ADMIN_PASSWORD=YourSecurePassword123!
SESSION_SECRET=generate_64_char_random_string

# Token
TOKEN_ADDRESS=0x7F0E9971D3320521Fc88F863E173a4cddBB051bA
TOKEN_SYMBOL=AQUARI
TOKEN_DECIMALS=18
MIN_BALANCE=1000000000000000000000

# Batch
BATCH_SIZE=500
MAX_GAS_PRICE=50000000000
CONFIRMATIONS=3
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
NODE_ENV=production
MODE=production
PORT=3000

# Local MongoDB (Docker service)
MONGODB_URI=mongodb://mongodb:27017/aquari-airdrop

# Local Redis (Docker service)
REDIS_URL=redis://redis:6379

# Blockchain
RPC_URL=https://mainnet.base.org
PRIVATE_KEY=your_private_key_without_0x

# Moralis
MORALIS_API_KEY=your_moralis_key

# Admin
ADMIN_USERNAME=secure_admin
ADMIN_PASSWORD=YourSecurePassword123!
SESSION_SECRET=generate_64_char_random_string

# Token
TOKEN_ADDRESS=0x7F0E9971D3320521Fc88F863E173a4cddBB051bA
TOKEN_SYMBOL=AQUARI
TOKEN_DECIMALS=18
MIN_BALANCE=1000000000000000000000

# Batch
BATCH_SIZE=500
MAX_GAS_PRICE=50000000000
CONFIRMATIONS=3
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

```bash
# Generate admin password
openssl rand -base64 24

# Generate session secret
openssl rand -hex 32
```

### Secure the Environment File

```bash
chmod 600 .env.production
```

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MODE` | production or fork | `production` |
| `MONGODB_URI` | MongoDB connection | `mongodb+srv://...` |
| `REDIS_URL` | Redis connection | `redis://...` |
| `RPC_URL` | Base RPC endpoint | `https://mainnet.base.org` |
| `PRIVATE_KEY` | Wallet private key | `abc123...` (no 0x) |
| `MORALIS_API_KEY` | Moralis API key | `eyJ...` |
| `ADMIN_USERNAME` | Dashboard username | `admin` |
| `ADMIN_PASSWORD` | Dashboard password | `SecurePass123!` |
| `SESSION_SECRET` | 64-char random | `a1b2c3...` |

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
- [ ] `PRIVATE_KEY` is set and wallet is funded
- [ ] Strong `ADMIN_PASSWORD` (16+ chars, mixed case, numbers, symbols)
- [ ] Random `SESSION_SECRET` (64 chars)
- [ ] `CONFIRMATIONS=3` for production
- [ ] MongoDB connected and accessible
- [ ] Redis connected
- [ ] Health endpoint returns OK: `curl localhost:3000/health`
- [ ] Dashboard accessible at `/admin`
- [ ] SSL/HTTPS configured
- [ ] Firewall configured (only 80/443/22 open)
- [ ] Container set to restart: `restart: unless-stopped`

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
