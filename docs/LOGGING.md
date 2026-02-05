# Container Logging System

This document explains the logging configuration for all Docker containers in the application.

---

## 📁 Log Storage

All container logs are stored in the `logs/` directory:

```
logs/
├── app/         # Node.js application logs
├── mongodb/     # MongoDB container logs (if using self-hosted)
└── redis/       # Redis container logs (if using self-hosted)
```

**Note:** The `logs/` directory is in `.gitignore` and will not be committed to version control.

---

## ⚙️ Log Configuration

### All Containers

Each container uses Docker's JSON file logging driver with the following settings:

| Setting | Value | Description |
|---------|-------|-------------|
| **max-size** | 50MB | Rotate log file after reaching 50MB |
| **max-file** | 10 | Keep 10 rotated files max |
| **compress** | true | Compress rotated files (saves ~80% space) |
| **Total Storage** | ~500MB | Per container (10 files × 50MB) |

### Automatic Rotation

Docker automatically:
1. Rotates logs when file reaches 50MB
2. Compresses older files (`.gz` format)
3. Deletes oldest file when limit (10 files) is reached
4. Maintains most recent logs uncompressed

---

## 📊 Viewing Logs

### Real-Time Logs (Live Tail)

```bash
# All containers
docker compose -f docker-compose.prod.yml logs -f

# Specific container
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f mongodb
docker compose -f docker-compose.prod.yml logs -f redis

# Last 100 lines
docker logs --tail 100 -f aquari-airdrop
```

### Historical Logs

```bash
# Last N lines
docker logs --tail 500 aquari-airdrop

# Since specific time
docker logs --since 1h aquari-airdrop
docker logs --since 2024-01-01T00:00:00 aquari-airdrop

# Between timestamps
docker logs --since 2024-01-01T00:00:00 --until 2024-01-02T00:00:00 aquari-airdrop
```

### Container-Specific Logs

```bash
# Application logs
docker logs aquari-airdrop

# MongoDB logs
docker logs aquari-mongodb-prod

# Redis logs  
docker logs aquari-redis-prod
```

---

## 🔍 Searching Logs

### Using grep

```bash
# Search for errors
docker logs aquari-airdrop 2>&1 | grep -i error

# Search for specific pattern
docker logs aquari-airdrop 2>&1 | grep "snapshot job"

# Count occurrences
docker logs aquari-airdrop 2>&1 | grep -c "ERROR"
```

### Using jq (for JSON logs)

```bash
# Pretty print JSON logs
docker logs aquari-airdrop 2>&1 | jq '.'

# Filter by level
docker logs aquari-airdrop 2>&1 | jq 'select(.level == "error")'

# Extract specific field
docker logs aquari-airdrop 2>&1 | jq '.message'
```

---

## 💾 Accessing Raw Log Files

### Direct Access

Docker stores logs in its data directory. To find the exact location:

```bash
# Get log file path
docker inspect --format='{{.LogPath}}' aquari-airdrop

# View raw log file
sudo cat $(docker inspect --format='{{.LogPath}}' aquari-airdrop)
```

Typical locations:
- **Linux:** `/var/lib/docker/containers/<container-id>/<container-id>-json.log`
- **Mac/Windows:** Inside Docker Desktop VM

### Copying Logs

```bash
# Copy current log file
docker inspect aquari-airdrop --format='{{.LogPath}}' | \
  xargs -I {} sudo cp {} ./exported-logs/app-$(date +%Y%m%d-%H%M%S).log

# Archive all container logs
docker logs aquari-airdrop > app-logs-$(date +%Y%m%d-%H%M%S).log 2>&1
```

---

## 🗂️ Log Rotation Details

### How It Works

1. **Active Log:** Current log file (uncompressed, up to 50MB)
   - `/var/lib/docker/containers/<id>/<id>-json.log`

2. **Rotated Logs:** Compressed archives (up to 9 files)
   - `<id>-json.log.1.gz` (most recent)
   - `<id>-json.log.2.gz`
   - `<id>-json.log.9.gz` (oldest)

3. **Rotation Trigger:** When active log reaches 50MB

4. **Compression:** Automatic (gzip compression, ~80% size reduction)

### Storage Calculation

Per container:
- Active log: 50MB (uncompressed)
- 9 compressed logs: ~90MB (9 × 10MB compressed)
- **Total:** ~140MB actual disk usage (500MB uncompressed)

All containers:
- App: ~140MB
- MongoDB: ~140MB (if self-hosted)
- Redis: ~140MB (if self-hosted)
- **Total:** ~140-420MB depending on setup

---

## 🛠️ Maintenance

### Manual Cleanup

```bash
# Clear all logs for a container (CAUTION!)
truncate -s 0 $(docker inspect --format='{{.LogPath}}' aquari-airdrop)

# Restart container to start fresh logs
docker restart aquari-airdrop
```

### Monitoring Disk Usage

```bash
# Check log file sizes
du -sh /var/lib/docker/containers/*/

# Check total Docker disk usage
docker system df

# Detailed breakdown
docker system df -v
```

### Cleanup Old Logs

Docker automatically manages log rotation, but you can manually clean up:

```bash
# Remove stopped containers and their logs
docker container prune

# Full Docker cleanup (CAUTION: removes unused images, volumes, etc.)
docker system prune -a
```

---

## 📝 Log Format

### Application Logs

The Node.js application uses structured logging:

```json
{
  "timestamp": "2024-02-05T13:26:51.123Z",
  "level": "info",
  "message": "Starting snapshot job for 2026-W06",
  "service": "snapshot-job"
}
```

### Docker Wrapper Format

Docker wraps each log line:

```json
{
  "log": "[13:26:51] Starting snapshot job for 2026-W06\n",
  "stream": "stdout",
  "time": "2024-02-05T13:26:51.123456789Z"
}
```

---

## 🚨 Troubleshooting

### Logs Not Appearing

```bash
# Check if container is running
docker ps

# Check container status
docker inspect aquari-airdrop

# Verify logging driver
docker inspect aquari-airdrop | jq '.[0].HostConfig.LogConfig'
```

### Disk Space Issues

```bash
# Check available space
df -h

# Check Docker's disk usage
docker system df

# Clear old logs (CAUTION!)
docker system prune --volumes
```

### Permission Issues

```bash
# Grant read access to log files
sudo chmod +r /var/lib/docker/containers/*/*-json.log*
```

---

## 🔄 Changing Log Configuration

To modify log settings, edit `docker-compose.prod.yml`:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "100m"   # Change rotation size
    max-file: "20"     # Change number of files
    compress: "false"  # Disable compression
```

Then rebuild:

```bash
docker compose -f docker-compose.prod.yml up -d
```

**Note:** Changes only apply to new containers. Existing logs remain unchanged.

---

## 📊 Log Levels

The application uses these log levels (in order of severity):

1. **error** - Critical errors that need immediate attention
2. **warn** - Warning messages about potential issues
3. **info** - General informational messages (default)
4. **debug** - Detailed debugging information

Configure via `.env.production`:
```bash
LOG_LEVEL=info  # Options: error, warn, info, debug
```

---

## 🎯 Best Practices

1. **Monitor disk usage** regularly with `docker system df`
2. **Export important logs** before they rotate out
3. **Use log levels** appropriately (set to `info` in production)
4. **Set up alerts** for error patterns in logs
5. **Backup logs** for compliance/audit requirements
6. **Use structured logging** (JSON) for easier parsing
7. **Avoid logging sensitive data** (passwords, API keys, etc.)

---

## 📞 Quick Reference

```bash
# View live logs
docker logs -f aquari-airdrop

# Last 100 lines
docker logs --tail 100 aquari-airdrop

# Search errors
docker logs aquari-airdrop 2>&1 | grep ERROR

# Check disk usage
docker system df

# Log file location
docker inspect --format='{{.LogPath}}' aquari-airdrop

# Restart with fresh logs
docker restart aquari-airdrop
```
