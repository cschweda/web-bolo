# WebBolo: Deployment Guide

**Target:** DigitalOcean droplet (applicable to any Ubuntu 22.04+ VPS)
**Date:** March 2026

---

## 1. Droplet Sizing

| Scenario | Droplet | Monthly Cost | Notes |
|----------|---------|-------------|-------|
| Dev/testing, 1-2 rooms | Basic, 1 vCPU, 1 GB RAM, 25 GB SSD | $6 | More than enough for development and small games |
| Community server, 4 rooms | Basic, 1 vCPU, 2 GB RAM, 50 GB SSD | $12 | Comfortable headroom for 4 concurrent 16-player games |
| Large community, 8+ rooms | Basic, 2 vCPU, 4 GB RAM, 80 GB SSD | $24 | Only needed if hosting many concurrent games |

**Why these are sufficient:** A single 16-player game room at 20 Hz uses ~2% of a modern core and ~10 MB RAM. The bottleneck is bandwidth (~200 KB/s upload per room), and even the smallest droplet includes 1 TB/month transfer.

**Region:** Choose the region closest to the majority of your players. For US players, NYC or SFO. For EU, AMS or FRA.

**OS:** Ubuntu 24.04 LTS (or 22.04 LTS).

---

## 2. Initial Server Setup

### 2.1 Create the Droplet

1. Create a droplet on DigitalOcean with Ubuntu 24.04 LTS.
2. Add your SSH key during creation.
3. Note the droplet's public IP address.

### 2.2 Secure the Server

```bash
# SSH into the droplet
ssh root@YOUR_DROPLET_IP

# Create a non-root user
adduser webbolo
usermod -aG sudo webbolo

# Copy SSH key to new user
rsync --archive --chown=webbolo:webbolo ~/.ssh /home/webbolo

# Disable root SSH login
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart sshd

# Log out and reconnect as the new user
exit
ssh webbolo@YOUR_DROPLET_IP
```

### 2.3 Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp      # HTTP (for Let's Encrypt and redirect)
sudo ufw allow 443/tcp     # HTTPS + WSS
sudo ufw enable
```

Do NOT open port 3000 publicly — nginx will proxy to it internally.

### 2.4 Install Node.js

```bash
# Install Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version   # v20.x.x
npm --version    # 10.x.x

# Install Yarn 1.x (project requirement)
sudo npm install -g yarn@1.22.22
```

---

## 3. Deploy the Application

### 3.1 Clone and Install

```bash
cd /home/webbolo
git clone https://github.com/YOUR_USER/webbolo.git
cd webbolo
yarn install --production
```

### 3.2 Environment Configuration

```bash
# Create environment file
cat > .env << 'EOF'
PORT=3000
MAX_ROOMS=4
MAX_PLAYERS_PER_ROOM=16
RECONNECT_GRACE_PERIOD=30000
LOG_LEVEL=info
NODE_ENV=production
EOF
```

### 3.3 Test Manually

```bash
node server/index.js
# Should print: "WebBolo server running on port 3000"
# Ctrl+C to stop
```

---

## 4. Process Management with PM2

PM2 keeps the server running, restarts it on crash, and manages logs.

### 4.1 Install PM2

```bash
sudo npm install -g pm2
```

### 4.2 Create PM2 Ecosystem File

```bash
cat > /home/webbolo/webbolo/ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'webbolo',
    script: 'server/index.js',
    cwd: '/home/webbolo/webbolo',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      MAX_ROOMS: 4,
      MAX_PLAYERS_PER_ROOM: 16,
      RECONNECT_GRACE_PERIOD: 30000,
      LOG_LEVEL: 'info'
    },
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/home/webbolo/logs/webbolo-error.log',
    out_file: '/home/webbolo/logs/webbolo-out.log',
    merge_logs: true,
    max_restarts: 10,
    restart_delay: 5000,
    watch: false
  }]
};
EOF

# Create log directory
mkdir -p /home/webbolo/logs
```

### 4.3 Start and Enable on Boot

```bash
# Start the application
pm2 start ecosystem.config.cjs

# Verify it's running
pm2 status
pm2 logs webbolo --lines 20

# Save the process list and enable startup on boot
pm2 save
pm2 startup systemd
# PM2 will print a command — copy and run it (it requires sudo)
```

### 4.4 Common PM2 Commands

```bash
pm2 status              # Check process status
pm2 logs webbolo        # Tail logs (Ctrl+C to exit)
pm2 restart webbolo     # Restart the server
pm2 stop webbolo        # Stop the server
pm2 reload webbolo      # Zero-downtime reload
pm2 monit               # Real-time CPU/memory dashboard
pm2 flush               # Clear log files
```

---

## 5. Nginx Reverse Proxy + TLS

Nginx serves static client files, terminates TLS, and proxies WebSocket connections to the Node.js server.

### 5.1 Install Nginx

```bash
sudo apt-get install -y nginx
```

### 5.2 Configure Nginx (HTTP first, TLS added after)

```bash
sudo cat > /etc/nginx/sites-available/webbolo << 'NGINX'
server {
    listen 80;
    server_name YOUR_DOMAIN.com;

    # Static client files (nginx serves these directly — much faster than Node)
    location / {
        root /home/webbolo/webbolo/client;
        try_files $uri $uri/ /index.html;

        # Cache static assets aggressively
        location ~* \.(js|css|png|jpg|gif|ico|wav|mp3|ogg|woff2?)$ {
            expires 7d;
            add_header Cache-Control "public, immutable";
        }
    }

    # WebSocket proxy to Node.js
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;   # Keep WebSocket alive for 24h
        proxy_send_timeout 86400;
    }

    # API endpoints (lobby, room listing, etc.)
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
NGINX
```

```bash
# Enable the site
sudo ln -sf /etc/nginx/sites-available/webbolo /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### 5.3 Domain Setup

1. Register a domain (or use a subdomain you own).
2. In your DNS provider, create an **A record** pointing to the droplet's IP:
   ```
   Type: A
   Name: @ (or subdomain like "play")
   Value: YOUR_DROPLET_IP
   TTL: 300
   ```
3. Wait for DNS propagation (usually < 5 minutes with low TTL).
4. Verify: `curl http://YOUR_DOMAIN.com` should return the game's HTML.

### 5.4 TLS with Let's Encrypt (Certbot)

```bash
# Install certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Obtain certificate and auto-configure nginx
sudo certbot --nginx -d YOUR_DOMAIN.com

# Certbot will:
# - Obtain a free TLS certificate
# - Modify the nginx config to listen on 443 with SSL
# - Add a redirect from HTTP to HTTPS
# - Set up auto-renewal
```

Verify auto-renewal is configured:

```bash
sudo certbot renew --dry-run
```

Certbot installs a systemd timer that renews certificates automatically before they expire (every 60–90 days).

After TLS is configured, the nginx config will be updated to:
- Listen on 443 with SSL
- Redirect all HTTP (80) traffic to HTTPS
- WebSocket connections use `wss://YOUR_DOMAIN.com/ws`

### 5.5 Client WebSocket URL

The client code should connect to the WebSocket based on the current page URL:

```javascript
// client/js/network.js
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${wsProtocol}//${window.location.host}/ws`;
```

This works for both local development (`ws://localhost:3000/ws`) and production (`wss://yourdomain.com/ws`).

---

## 6. Docker Alternative

If you prefer Docker over bare-metal Node.js + PM2, the project includes Docker support.

### 6.1 Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker webbolo

# Install Docker Compose
sudo apt-get install -y docker-compose-plugin

# Log out and back in for group change to take effect
```

### 6.2 Docker Compose Deployment

```yaml
# docker-compose.yml (in project root)
version: '3.8'
services:
  webbolo:
    build: .
    restart: unless-stopped
    environment:
      - PORT=3000
      - MAX_ROOMS=4
      - MAX_PLAYERS_PER_ROOM=16
      - NODE_ENV=production
    expose:
      - "3000"
    mem_limit: 512m

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./client:/var/www/webbolo/client:ro
      - certbot-etc:/etc/letsencrypt:ro
      - certbot-var:/var/lib/letsencrypt
    depends_on:
      - webbolo

  certbot:
    image: certbot/certbot
    volumes:
      - certbot-etc:/etc/letsencrypt
      - certbot-var:/var/lib/letsencrypt
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do sleep 12h & wait $${!}; certbot renew --quiet; done'"

volumes:
  certbot-etc:
  certbot-var:
```

```bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f webbolo

# Restart
docker compose restart webbolo

# Update (pull latest code, rebuild)
git pull
docker compose up -d --build
```

**Trade-offs:** Docker adds a layer of abstraction and slightly higher memory usage (~50 MB overhead). PM2 on bare metal is simpler for a single-app server. Docker is better if you want reproducible deployments or plan to run other services on the same droplet.

---

## 7. Updating the Application

### 7.1 PM2 (Bare Metal)

```bash
cd /home/webbolo/webbolo
git pull
yarn install --production
pm2 reload webbolo
```

### 7.2 Docker

```bash
cd /home/webbolo/webbolo
git pull
docker compose up -d --build
```

### 7.3 Zero-Downtime Considerations

`pm2 reload` performs a graceful restart — it starts a new process before killing the old one. However, active WebSocket connections will be dropped during a reload. Players will experience a brief disconnect and auto-reconnect (the 30-second grace period in the game handles this).

For true zero-downtime deploys, you would need two server instances behind a load balancer. This is overkill for a community game server — a brief reconnect during updates is acceptable.

---

## 8. Monitoring

### 8.1 PM2 Monitoring

```bash
# Real-time dashboard
pm2 monit

# Process info
pm2 show webbolo
```

### 8.2 System Monitoring

```bash
# Check resource usage
htop

# Disk usage
df -h

# Network connections
ss -tunlp
```

### 8.3 Log Management

PM2 logs grow over time. Set up log rotation:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

### 8.4 Health Check

Add a simple health endpoint to the server for monitoring:

```
GET /health → 200 OK { "status": "ok", "rooms": 2, "players": 12, "uptime": 86400 }
```

This can be polled by DigitalOcean's built-in monitoring alerts, or by an external service like UptimeRobot (free tier).

---

## 9. Backups

### 9.1 What to Back Up

| Data | Location | Frequency |
|------|----------|-----------|
| Game maps (custom) | `/home/webbolo/webbolo/client/assets/maps/` | After each new map |
| Player data (if using leaderboards) | SQLite file (Phase 4+) | Daily |
| Configuration | `.env`, `ecosystem.config.cjs`, nginx config | After changes |
| Replay files (if enabled) | Server data directory | Optional |

The application code itself is in Git — no need to back up separately.

### 9.2 Simple Backup Script

```bash
#!/bin/bash
# /home/webbolo/backup.sh
BACKUP_DIR="/home/webbolo/backups"
DATE=$(date +%Y%m%d)

mkdir -p "$BACKUP_DIR"

# Back up configuration and data
tar czf "$BACKUP_DIR/webbolo-$DATE.tar.gz" \
  /home/webbolo/webbolo/.env \
  /home/webbolo/webbolo/ecosystem.config.cjs \
  /home/webbolo/webbolo/client/assets/maps/ \
  /etc/nginx/sites-available/webbolo

# Keep only last 30 days
find "$BACKUP_DIR" -name "webbolo-*.tar.gz" -mtime +30 -delete
```

```bash
chmod +x /home/webbolo/backup.sh

# Run daily at 3 AM
crontab -e
# Add: 0 3 * * * /home/webbolo/backup.sh
```

For off-server backups, use DigitalOcean Spaces, S3, or enable DigitalOcean's weekly droplet backups ($1.20/month for the $6 droplet).

---

## 10. Troubleshooting

### WebSocket connections failing

```bash
# Check nginx is proxying correctly
sudo nginx -t
sudo tail -f /var/log/nginx/error.log

# Check Node.js is running and listening
pm2 status
curl http://127.0.0.1:3000/health

# Check firewall isn't blocking
sudo ufw status
```

### High CPU usage

```bash
# Check which process
htop

# Check PM2 process details
pm2 show webbolo

# If the game loop is consuming too much CPU, check room count
# and consider MAX_ROOMS limit in .env
```

### Out of memory

```bash
# Check memory usage
free -h
pm2 show webbolo  # Look at "heap size" and "heap usage"

# PM2 auto-restarts at 512M (configured in ecosystem file)
# Reduce MAX_ROOMS if memory is tight
```

### Certificate renewal failing

```bash
sudo certbot renew --dry-run
# If it fails, check that port 80 is open and nginx is running
sudo ufw status
sudo systemctl status nginx
```

---

## 11. Cost Summary

| Item | Monthly Cost |
|------|-------------|
| DigitalOcean Basic Droplet (1 vCPU, 1 GB) | $6 |
| DigitalOcean weekly backups | $1.20 |
| Domain name (typical .com) | ~$1 (annually ~$12) |
| Let's Encrypt TLS | Free |
| **Total** | **~$8/month** |

This runs a community server capable of hosting 4 concurrent 16-player games.
