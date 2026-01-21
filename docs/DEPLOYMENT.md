# Deployment Guide

Complete guide for deploying the AQUARI Airdrop System to production.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Option 1: EC2 Deployment (Recommended)](#option-1-ec2-deployment-recommended)
- [Option 2: Docker Deployment](#option-2-docker-deployment)
- [Option 3: VPS Deployment](#option-3-vps-deployment)
- [Environment Security](#environment-security)
- [SSL Configuration](#ssl-configuration)
- [Monitoring](#monitoring)
- [Backup Strategy](#backup-strategy)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before deploying, ensure you have:

- [ ] **Airdrop Wallet** - Fresh wallet with private key
- [ ] **Wallet Funded** - ETH for gas + tokens to airdrop
- [ ] **MongoDB** - Atlas cluster or self-hosted
- [ ] **Redis** - For job queue (can use ElastiCache or self-hosted)
- [ ] **Moralis API Key** - From moralis.io
- [ ] **Domain Name** (optional) - For SSL/HTTPS
- [ ] **RPC Endpoint** - Base mainnet (public or private)

---

## Option 1: EC2 Deployment (Recommended)

### Step 1: Launch EC2 Instance

**Recommended specs:**
- **Instance Type:** t3.small (2 vCPU, 2 GB RAM) or larger
- **AMI:** Ubuntu 22.04 LTS
- **Storage:** 20 GB gp3
- **Security Group:**
  - SSH (22) - Your IP only
  - HTTP (80) - 0.0.0.0/0
  - HTTPS (443) - 0.0.0.0/0
  - Custom TCP (3000) - Your IP only (for testing)

### Step 2: Connect to Instance

```bash
ssh -i your-key.pem ubuntu@your-ec2-public-ip
```

### Step 3: Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should be v20.x.x
npm --version

# Install PM2 (process manager)
sudo npm install -g pm2

# Install Git
sudo apt install -y git

# Install Nginx (reverse proxy)
sudo apt install -y nginx
```

### Step 4: Install MongoDB (Optional - Skip if using Atlas)

```bash
# Import MongoDB GPG key
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# Add repository
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Install MongoDB
sudo apt update
sudo apt install -y mongodb-org

# Start and enable MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Verify
sudo systemctl status mongod
```

### Step 5: Install Redis

```bash
# Install Redis
sudo apt install -y redis-server

# Configure Redis for systemd
sudo sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf

# Restart Redis
sudo systemctl restart redis
sudo systemctl enable redis

# Verify
redis-cli ping  # Should return PONG
```

### Step 6: Clone and Build Application

```bash
# Create app directory
sudo mkdir -p /opt/aquari-airdrop
sudo chown ubuntu:ubuntu /opt/aquari-airdrop

# Clone repository
cd /opt/aquari-airdrop
git clone <your-repo-url> .

# Install dependencies
npm install

# Build TypeScript
npm run build
```

### Step 7: Create Environment File

```bash
# Create .env file
nano /opt/aquari-airdrop/.env
```

**Production .env contents:**

```env
# ═══════════════════════════════════════════════════════════
# APPLICATION
# ═══════════════════════════════════════════════════════════
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# ═══════════════════════════════════════════════════════════
# MODE - PRODUCTION
# ═══════════════════════════════════════════════════════════
MODE=production

# ═══════════════════════════════════════════════════════════
# RPC - Base Mainnet
# Use your own RPC for reliability (Alchemy, Infura, QuickNode)
# ═══════════════════════════════════════════════════════════
RPC_URL=https://mainnet.base.org

# ═══════════════════════════════════════════════════════════
# MOCK FLAGS - Must be FALSE for production!
# ═══════════════════════════════════════════════════════════
MOCK_SNAPSHOTS=false
MOCK_TRANSACTIONS=false

# ═══════════════════════════════════════════════════════════
# DATABASE
# Option A: Local MongoDB
# MONGODB_URI=mongodb://localhost:27017/aquari-airdrop
#
# Option B: MongoDB Atlas (Recommended for production)
# ═══════════════════════════════════════════════════════════
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/aquari-airdrop?retryWrites=true&w=majority

# ═══════════════════════════════════════════════════════════
# REDIS
# ═══════════════════════════════════════════════════════════
REDIS_URL=redis://localhost:6379

# ═══════════════════════════════════════════════════════════
# MORALIS API
# ═══════════════════════════════════════════════════════════
MORALIS_API_KEY=your_moralis_api_key_here

# ═══════════════════════════════════════════════════════════
# ADMIN DASHBOARD - USE STRONG CREDENTIALS!
# Generate password: openssl rand -base64 24
# Generate secret: openssl rand -hex 32
# ═══════════════════════════════════════════════════════════
ADMIN_USERNAME=your_secure_admin_username
ADMIN_PASSWORD=YourVerySecurePassword123!@#$%
SESSION_SECRET=generate_this_with_openssl_rand_hex_32

# ═══════════════════════════════════════════════════════════
# PRIVATE KEY - YOUR AIRDROP WALLET
# ⚠️  KEEP THIS SECRET! Never commit to git!
# ⚠️  Use a DEDICATED wallet for airdrops only!
# ═══════════════════════════════════════════════════════════
PRIVATE_KEY=your_airdrop_wallet_private_key_without_0x_prefix

# ═══════════════════════════════════════════════════════════
# TOKEN CONFIGURATION
# ═══════════════════════════════════════════════════════════
TOKEN_ADDRESS=0x7F0E9971D3320521Fc88F863E173a4cddBB051bA
TOKEN_SYMBOL=AQUARI
TOKEN_DECIMALS=18
MIN_BALANCE=1000000000000000000000

# ═══════════════════════════════════════════════════════════
# BATCH SETTINGS
# ═══════════════════════════════════════════════════════════
BATCH_SIZE=500
MAX_GAS_PRICE=50000000000
CONFIRMATIONS=3
```

**Secure the file:**

```bash
chmod 600 /opt/aquari-airdrop/.env
```

### Step 8: Generate Secure Credentials

```bash
# Generate strong admin password
openssl rand -base64 24
# Example output: Kj8mN2pL9qR4sT6uV8wX0yZ2aB4cD6eF

# Generate session secret
openssl rand -hex 32
# Example output: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

### Step 9: Run Database Scan

```bash
cd /opt/aquari-airdrop

# Scan for bot-restricted addresses
node scripts/scan-restricted.js --rpc https://mainnet.base.org
```

### Step 10: Configure PM2

Create PM2 ecosystem file:

```bash
nano /opt/aquari-airdrop/ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'aquari-airdrop',
    script: 'dist/index.js',
    cwd: '/opt/aquari-airdrop',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: '/var/log/aquari/error.log',
    out_file: '/var/log/aquari/out.log',
    log_file: '/var/log/aquari/combined.log',
    time: true
  }]
};
```

Create log directory:

```bash
sudo mkdir -p /var/log/aquari
sudo chown ubuntu:ubuntu /var/log/aquari
```

### Step 11: Start Application with PM2

```bash
cd /opt/aquari-airdrop

# Start application
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command it outputs (will look like: sudo env PATH=... pm2 startup ...)

# Verify
pm2 status
pm2 logs aquari-airdrop
```

### Step 12: Configure Nginx Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/aquari-airdrop
```

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Or use EC2 public IP

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/aquari-airdrop /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 13: Setup SSL with Let's Encrypt (Optional)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal (already configured by certbot)
sudo certbot renew --dry-run
```

### Step 14: Verify Deployment

```bash
# Check application status
pm2 status

# Check health endpoint
curl http://localhost:3000/health

# Check logs
pm2 logs aquari-airdrop --lines 50

# Access dashboard
# http://your-domain.com/admin or http://your-ec2-ip/admin
```

---

## Option 2: Docker Deployment

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    container_name: aquari-airdrop
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    depends_on:
      - mongodb
      - redis
    networks:
      - aquari-network

  mongodb:
    image: mongo:7
    container_name: aquari-mongodb
    restart: unless-stopped
    volumes:
      - mongo_data:/data/db
    networks:
      - aquari-network

  redis:
    image: redis:7-alpine
    container_name: aquari-redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    networks:
      - aquari-network

  nginx:
    image: nginx:alpine
    container_name: aquari-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - app
    networks:
      - aquari-network

volumes:
  mongo_data:
  redis_data:

networks:
  aquari-network:
    driver: bridge
```

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built application
COPY dist ./dist
COPY src/admin/views ./src/admin/views
COPY public ./public

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start application
CMD ["node", "dist/index.js"]
```

### Deploy with Docker

```bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f app

# Stop
docker compose down

# Rebuild after code changes
docker compose build --no-cache
docker compose up -d
```

---

## Option 3: VPS Deployment

Same as EC2 deployment, works on any VPS provider:
- DigitalOcean Droplet
- Linode
- Vultr
- Hetzner

Just follow the EC2 steps starting from Step 2.

---

## Environment Security

### Private Key Security

**CRITICAL: Never expose your private key!**

1. **Use environment variables** - Never hardcode in source
2. **Restrict file permissions** - `chmod 600 .env`
3. **Use dedicated wallet** - Only for airdrops, minimal funds
4. **No git commits** - Add `.env` to `.gitignore`

### AWS Secrets Manager (Advanced)

For enhanced security, use AWS Secrets Manager:

```bash
# Store secret
aws secretsmanager create-secret \
  --name aquari-airdrop-private-key \
  --secret-string "your-private-key"

# Retrieve in application (modify index.ts)
# Use @aws-sdk/client-secrets-manager
```

### Environment File Protection

```bash
# Correct permissions
chmod 600 /opt/aquari-airdrop/.env
chown ubuntu:ubuntu /opt/aquari-airdrop/.env

# Verify
ls -la /opt/aquari-airdrop/.env
# Should show: -rw------- 1 ubuntu ubuntu
```

---

## SSL Configuration

### Using Cloudflare (Easiest)

1. Add domain to Cloudflare
2. Point DNS to EC2 IP
3. Enable "Full" SSL mode
4. Cloudflare handles certificates automatically

### Using Let's Encrypt (Free)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Test renewal
sudo certbot renew --dry-run
```

### Using AWS ACM + ALB

1. Request certificate in ACM
2. Create Application Load Balancer
3. Add HTTPS listener with ACM certificate
4. Point ALB to EC2 target group

---

## Monitoring

### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# Process info
pm2 show aquari-airdrop

# Logs
pm2 logs aquari-airdrop --lines 100

# Restart
pm2 restart aquari-airdrop

# Reload (zero-downtime)
pm2 reload aquari-airdrop
```

### Health Check Script

Create `/opt/aquari-airdrop/healthcheck.sh`:

```bash
#!/bin/bash
HEALTH_URL="http://localhost:3000/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $RESPONSE != "200" ]; then
    echo "Health check failed! Status: $RESPONSE"
    pm2 restart aquari-airdrop
    # Optional: Send alert
    # curl -X POST -H 'Content-type: application/json' \
    #   --data '{"text":"Aquari Airdrop health check failed!"}' \
    #   YOUR_SLACK_WEBHOOK_URL
fi
```

Add to crontab:

```bash
crontab -e
# Add: */5 * * * * /opt/aquari-airdrop/healthcheck.sh
```

### CloudWatch (AWS)

```bash
# Install CloudWatch agent
sudo apt install amazon-cloudwatch-agent

# Configure to send PM2 logs and metrics
```

---

## Backup Strategy

### MongoDB Backup

```bash
# Manual backup
mongodump --uri="your-mongodb-uri" --out=/backup/$(date +%Y%m%d)

# Automated daily backup (crontab)
0 2 * * * mongodump --uri="$MONGODB_URI" --out=/backup/$(date +\%Y\%m\%d) --gzip
```

### MongoDB Atlas Backup

Atlas provides automatic backups:
1. Go to Atlas dashboard
2. Click your cluster
3. Enable "Continuous Backup" or "Cloud Backup"

---

## Troubleshooting

### Application Won't Start

```bash
# Check PM2 logs
pm2 logs aquari-airdrop --err --lines 50

# Check if port is in use
sudo lsof -i :3000

# Verify environment file
cat /opt/aquari-airdrop/.env | head -5
```

### Cannot Connect to Database

```bash
# Test MongoDB connection
mongosh "your-mongodb-uri"

# Check MongoDB status
sudo systemctl status mongod

# Check Redis
redis-cli ping
```

### Nginx 502 Bad Gateway

```bash
# Check if app is running
pm2 status

# Check Nginx config
sudo nginx -t

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log
```

### High Memory Usage

```bash
# Check memory
free -h

# Check PM2 memory
pm2 monit

# Restart app
pm2 restart aquari-airdrop
```

---

## Production Checklist

Before going live, verify:

- [ ] `MODE=production` in .env
- [ ] `MOCK_TRANSACTIONS=false` in .env
- [ ] `MOCK_SNAPSHOTS=false` in .env
- [ ] `PRIVATE_KEY` is set and wallet is funded
- [ ] Strong `ADMIN_PASSWORD` (16+ chars)
- [ ] Random `SESSION_SECRET` (64 chars)
- [ ] `CONFIRMATIONS=3` for production
- [ ] MongoDB connected and indexes created
- [ ] Redis connected
- [ ] Bot-restricted addresses scanned
- [ ] SSL/HTTPS configured
- [ ] Health check endpoint responding
- [ ] PM2 configured for auto-restart
- [ ] Log files being written
- [ ] Firewall configured (only 80/443 open)

---

## Useful Commands

```bash
# Application
pm2 status                    # Check status
pm2 logs aquari-airdrop       # View logs
pm2 restart aquari-airdrop    # Restart
pm2 reload aquari-airdrop     # Zero-downtime reload

# Nginx
sudo systemctl status nginx   # Check status
sudo nginx -t                 # Test config
sudo systemctl reload nginx   # Reload config

# MongoDB
sudo systemctl status mongod  # Check status
mongosh                       # Connect to shell

# Redis
redis-cli ping               # Test connection
redis-cli info               # Server info

# System
htop                         # Resource monitor
df -h                        # Disk space
free -h                      # Memory

# Logs
tail -f /var/log/aquari/combined.log
sudo tail -f /var/log/nginx/access.log
```

---

## Update Procedure

```bash
cd /opt/aquari-airdrop

# Pull latest code
git pull origin main

# Install any new dependencies
npm install

# Rebuild TypeScript
npm run build

# Reload application (zero-downtime)
pm2 reload aquari-airdrop

# Verify
pm2 logs aquari-airdrop --lines 20
curl http://localhost:3000/health
```
