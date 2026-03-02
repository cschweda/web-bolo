# WebBolo: Project Structure & Codebase

**Document:** 04 of 09
**Version:** 0.3
**Date:** March 2026

---

## 1. Directory Layout

```
webbolo/
├── package.json                # Root package — workspace config, scripts
├── README.md
├── LICENSE
├── docker-compose.yml          # One-command WAN deployment
├── Dockerfile                  # Server container
│
├── shared/                     # Code that runs on BOTH client and server
│   ├── protocol.js             # Binary message encode/decode
│   ├── physics.js              # Tank movement, shell trajectories, collision math
│   ├── terrainTypes.js         # Terrain enum, speed modifiers, passability
│   ├── constants.js            # Tick rate, entity limits, balance values
│   └── mapFormat.js            # Map file parsing and serialization
│
├── server/
│   ├── package.json
│   ├── index.js                # Entry point — HTTP server + WebSocket setup
│   ├── gameLoop.js             # Fixed-timestep loop with time accumulation
│   ├── simulation.js           # Per-tick simulation step (orchestrates entities)
│   ├── room.js                 # Game room lifecycle (create, join, leave, destroy)
│   ├── lobby.js                # Room listing, creation, matchmaking
│   ├── network.js              # WebSocket server, connection management, message routing
│   ├── sessionManager.js       # Session tokens, reconnection, grace periods
│   ├── fogOfWar.js             # Per-client visibility calculation
│   ├── deltaCompressor.js      # Builds per-client delta updates
│   ├── entities/
│   │   ├── tank.js             # Tank state, movement, damage, resources
│   │   ├── shell.js            # Projectile flight, collision resolution
│   │   ├── pillbox.js          # Targeting AI, anger mechanic, health
│   │   ├── base.js             # Resource pool, regeneration, refueling
│   │   ├── engineer.js         # Task queue, pathfinding, vulnerability
│   │   └── mine.js             # Detonation, chain reaction resolver
│   ├── map.js                  # Tile map state, dynamic terrain changes
│   ├── bot.js                  # AI bot decision-making (uses same input interface)
│   └── config.js               # Server-specific config (port, max rooms, etc.)
│
├── client/
│   ├── package.json
│   ├── index.html              # Entry point — minimal HTML shell
│   ├── css/
│   │   └── style.css           # UI styling (lobby, chat, HUD overlay)
│   ├── js/
│   │   ├── main.js             # Client entry — connects game loop and renderer
│   │   ├── renderer.js         # Canvas rendering — viewport, tiles, entities, fog
│   │   ├── input.js            # Keyboard capture, input buffering
│   │   ├── network.js          # WebSocket client, binary message handling
│   │   ├── prediction.js       # Client-side prediction and server reconciliation
│   │   ├── interpolation.js    # Entity interpolation for remote entities
│   │   ├── audio.js            # Web Audio API — spatial sounds
│   │   ├── hud.js              # Health, ammo, mines, wood, minimap, ping
│   │   ├── chat.js             # Chat UI — global, team, direct
│   │   ├── lobby.js            # Room list, create/join UI
│   │   ├── mapMemory.js        # Client-side fog of war tile memory
│   │   └── assetLoader.js      # Sprite atlas, sound file loading
│   └── assets/
│       ├── sprites/            # Sprite atlas (tanks, pillboxes, bases, terrain, etc.)
│       ├── sounds/             # Gunfire, explosions, engine, engineer, parachute
│       └── maps/               # Bundled default maps (also loadable from server)
│
├── tools/
│   ├── mapEditor/              # Browser-based map editor (Phase 4)
│   │   ├── index.html
│   │   └── js/
│   │       └── editor.js       # Canvas tile painter, entity placement
│   └── loadTest.js             # Headless client simulator for stress testing
│
└── test/
    ├── shared/                 # Unit tests for shared code
    │   ├── protocol.test.js
    │   ├── physics.test.js
    │   └── terrainTypes.test.js
    ├── server/                 # Server integration tests
    │   ├── simulation.test.js
    │   ├── mineChain.test.js
    │   └── room.test.js
    └── network/                # Client-server integration tests
        └── reconnection.test.js
```

---

## 2. The `shared/` Directory — Why It Matters

The `shared/` directory is the architectural linchpin of the project. It contains code that executes identically on both the client and the server.

### 2.1 Why Shared Code?

**Client-side prediction requires identical physics.** When the client predicts the player's tank movement, it must use exactly the same math the server uses. If the client's movement function calculates a slightly different position than the server's, prediction will constantly disagree with the server, causing rubber-banding (the tank snapping back to a corrected position).

**Protocol consistency.** The binary message encoder on the client must produce exactly the same byte layout the server's decoder expects, and vice versa. Sharing the protocol code eliminates this class of bugs entirely.

**Single source of truth for game rules.** Terrain speed modifiers, entity limits, balance constants — if these are defined in one place and imported by both client and server, they can never drift out of sync.

### 2.2 Module Format

Use ES modules (`import`/`export`) for all shared code. Both modern browsers and Node.js (with `"type": "module"` in `package.json`) support ES modules natively. No bundler required for development, though one can be added later for production builds.

```javascript
// shared/constants.js
export const TICK_RATE = 20;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE;
export const MAP_WIDTH = 256;
export const MAP_HEIGHT = 256;
export const MAX_PLAYERS = 16;
export const TANK_MAX_ARMOR = 40;
export const TANK_MAX_SHELLS = 40;
export const TANK_MAX_MINES = 40;
export const TANK_MAX_WOOD = 40;
export const SHELL_SPEED = 8.0;    // tiles per second
export const TANK_MAX_SPEED = 3.0; // tiles per second on grass
export const ENGINEER_SPEED = 1.0; // tiles per second
export const PILLBOX_RANGE = 8;    // tiles (2048 world units)
export const MINE_DAMAGE = 10;       // Double shell damage
// ... etc
```

```javascript
// shared/physics.js
import { TANK_MAX_SPEED } from './constants.js';
import { getSpeedModifier } from './terrainTypes.js';

export function stepTank(tank, input, tileMap, dt) {
  // Identical on client (prediction) and server (authoritative)
  const terrainType = tileMap[Math.floor(tank.y) * MAP_WIDTH + Math.floor(tank.x)];
  const speedMod = getSpeedModifier(terrainType);
  const maxSpeed = TANK_MAX_SPEED * speedMod;

  if (input.forward) {
    tank.speed = Math.min(tank.speed + TANK_ACCELERATION * dt, maxSpeed);
  } else {
    tank.speed = Math.max(tank.speed - TANK_FRICTION * dt, 0);
  }

  // Apply rotation
  if (input.rotateLeft) tank.rotation = (tank.rotation + 15) % 16;
  if (input.rotateRight) tank.rotation = (tank.rotation + 1) % 16;

  // Apply movement
  const angle = (tank.rotation / 16) * Math.PI * 2;
  const dx = Math.sin(angle) * tank.speed * dt;
  const dy = -Math.cos(angle) * tank.speed * dt;

  // Collision check against tile map
  const newX = tank.x + dx;
  const newY = tank.y + dy;
  if (isTilePassable(tileMap, newX, newY)) {
    tank.x = newX;
    tank.y = newY;
  } else {
    tank.speed = 0; // Stop on collision
  }
}
```

### 2.3 No Node.js-Specific Code in `shared/`

The shared directory must contain zero Node.js-specific imports (`fs`, `path`, `Buffer`, etc.) and zero browser-specific APIs (`document`, `window`, `Canvas`, etc.). It is pure computational JavaScript — math, data structures, encode/decode. If you find yourself importing something platform-specific, the code belongs in `server/` or `client/`, not `shared/`.

---

## 3. Server Entry Point

```javascript
// server/index.js
import http from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Lobby } from './lobby.js';

const PORT = process.env.PORT || 3000;

// HTTP server — serves client static files
const httpServer = http.createServer((req, res) => {
  // Serve client files from ../client/
  // In production, use nginx for static files instead
  const filePath = join(import.meta.dirname, '..', 'client', req.url === '/' ? 'index.html' : req.url);
  try {
    const content = readFileSync(filePath);
    res.writeHead(200);
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

// WebSocket server — game communication
const wss = new WebSocketServer({ server: httpServer });
const lobby = new Lobby();

wss.on('connection', (ws, req) => {
  lobby.handleConnection(ws, req);
});

httpServer.listen(PORT, () => {
  console.log(`WebBolo server running on port ${PORT}`);
  console.log(`Players connect at: http://localhost:${PORT}`);
  // Also print local network IP for LAN discovery
});
```

---

## 4. Build & Development Tooling

### 4.1 Development (No Build Step)

During development, no bundler is needed:

- ES modules work natively in both Node.js and modern browsers.
- The server serves client files directly via the HTTP handler.
- `shared/` code is imported via relative paths by both client and server.
- Hot-reload: use `nodemon` for the server, and the browser's own refresh for the client.

```bash
# Start server with auto-restart on file changes
npx nodemon server/index.js

# Or just:
node server/index.js
```

### 4.2 Production Build (Optional)

For production deployment, add a build step:

- **Client**: Bundle and minify with `esbuild` or `rollup`. Tree-shake unused code. Generate a single JS file + sprite atlas.
- **Server**: No bundling needed — Node.js runs the source directly.
- **Docker**: `Dockerfile` copies server + shared + pre-built client into the image.

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY shared/ ./shared/
COPY server/ ./server/
COPY client/ ./client/   # Pre-built in CI
RUN npm install --production
EXPOSE 3000
CMD ["node", "server/index.js"]
```

### 4.3 Testing

```bash
# Unit tests (shared code)
npx vitest test/shared/

# Server tests
npx vitest test/server/

# Network integration tests
npx vitest test/network/

# Load test (16 headless clients)
node tools/loadTest.js --server localhost:3000 --clients 16 --duration 60
```

The load test tool (`tools/loadTest.js`) creates headless WebSocket clients that connect to a server and send random inputs at the expected rate. It measures server tick consistency, message latency, and memory usage over time.

---

## 5. Package Management

Use **Yarn 1.22.22** (per standard project preferences). The project is structured as a yarn workspace:

```json
// Root package.json
{
  "name": "webbolo",
  "private": true,
  "workspaces": ["server", "client", "shared"],
  "scripts": {
    "start": "node server/index.js",
    "dev": "nodemon server/index.js",
    "test": "vitest",
    "build": "esbuild client/js/main.js --bundle --outfile=client/dist/bundle.js --minify",
    "docker": "docker build -t webbolo ."
  }
}
```

---

## 6. Static File Serving Strategy

### Development

The Node.js server serves client files directly. Simple, no extra tools.

### Production — Self-Hosted

Two options:

**Option A**: Server serves everything (simpler). The Node.js process handles both WebSocket connections and static file serving. Fine for small deployments.

**Option B**: Nginx serves static files, proxies WebSocket to Node (better performance). Nginx is far more efficient at serving static files and can handle TLS termination.

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Static client files
    location / {
        root /var/www/webbolo/client;
        try_files $uri $uri/ /index.html;
    }

    # WebSocket proxy
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400; # Keep WebSocket alive
    }
}
```

### Production — CDN + Server

For maximum performance, serve client static files from a CDN (Netlify, Cloudflare Pages, GitHub Pages) and point the WebSocket connection at the game server:

```javascript
// client/js/network.js
const WS_URL = window.location.hostname === 'localhost'
  ? `ws://${window.location.host}/ws`        // Development
  : 'wss://play.webbolo.io/ws';             // Production
```

---

## 7. Environment Configuration

```bash
# Server environment variables
PORT=3000                    # HTTP + WebSocket port
MAX_ROOMS=4                  # Maximum concurrent game rooms
TICK_RATE=20                 # Server tick rate (Hz)
MAX_PLAYERS_PER_ROOM=16      # Maximum players per room
RECONNECT_GRACE_PERIOD=30000 # Milliseconds before disconnected player is removed
LOG_LEVEL=info               # debug | info | warn | error
```

---

*See also: [03 - Networking Architecture](./03-Networking-Architecture.md) for protocol and message format details.*
*See also: [05 - Development Phases](./05-Development-Phases.md) for what to build first.*
