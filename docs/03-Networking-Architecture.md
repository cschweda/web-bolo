# WebBolo: Networking Architecture

**Document:** 03 of 09
**Version:** 0.3
**Date:** March 2026

---

## 1. Network Model Decision

### 1.1 The Three Options

There are three fundamental architectures for a multiplayer game like Bolo:

**Dedicated Authoritative Server** — A single server process runs the game simulation. All clients connect to it via WebSocket, send inputs, and receive state updates. The server is the single source of truth for all game state.

**Peer-to-Peer** — Every client connects directly to every other client (via WebRTC DataChannels). Each client runs its own simulation and broadcasts its own state. No central server.

**Hybrid (Relay/Listen Server)** — A lightweight server relays messages between clients. One client is designated "host" and runs an authoritative simulation. Other clients send inputs to the host via the relay.

### 1.2 Why Authoritative Server

WebBolo uses a **dedicated authoritative server**. The reasons are Bolo-specific:

**Consistency.** Bolo has deeply interacting systems — mine chain reactions that modify terrain, pillbox anger that changes over time, base resource pools that deplete and regenerate, engineers with multi-second task timers, forests that regrow. In a P2P model, keeping all of this in perfect sync across 16 clients is effectively impossible without a central arbiter. A single desynchronized mine chain can cascade into completely different map states.

**Cheat prevention.** Bolo's hidden mines mechanic requires that the server knows where all mines are, but only reveals them to the appropriate clients. In P2P, every client would need the full mine map — making "hidden" mines trivially hackable.

**Fog of war.** The server can enforce fog of war by simply not sending data about entities outside a player's vision range. In P2P, every client has all data.

**Connection topology.** 16 players in P2P means 120 peer connections (n*(n-1)/2). WebRTC connection setup through NATs requires STUN/TURN servers, and each connection involves ICE negotiation. With a central server, it's 16 simple WebSocket connections. Firewalls and corporate NATs that block WebRTC typically allow WebSocket (it's just HTTP upgrade on port 443).

**The original did this.** The Mac version of Bolo used a client-server model — one machine hosted the game, others connected to it. WebBolo follows the same pattern with modern transport.

### 1.3 What About P2P for LAN?

Even on a LAN, the authoritative server model is simpler and more reliable. The "server" for LAN play is just a Node.js process running on one player's machine — the same machine also runs their client. The overhead is negligible. This is cleaner than trying to support two entirely different networking architectures (P2P for LAN, client-server for WAN).

---

## 2. Server Architecture

### 2.1 Game Loop

The server runs a fixed-timestep simulation loop:

```
Target tick rate: 20 ticks/second (50ms per tick)

Every tick:
  1. Read all queued player inputs since last tick
  2. Validate inputs (rate limiting, legality checks)
  3. Apply inputs to simulation state
  4. Step the simulation:
     - Move tanks, shells, engineers
     - Check collisions (shell-entity, tank-mine, tank-water, etc.)
     - Resolve damage and destruction
     - Process mine chain reactions
     - Update pillbox AI (targeting, anger decay)
     - Regenerate base resources
     - Regrow forests (if timer elapsed)
     - Process engineer task completion
  5. Build per-client state updates (filtered by fog of war)
  6. Send state updates to all connected clients
```

The loop uses a high-resolution timer (`performance.now()` or `process.hrtime.bigint()`) with time accumulation to handle ticks that take longer or shorter than 50ms. If a tick takes 60ms, the next tick fires immediately and the simulation catches up. If a tick takes 30ms, the server waits 20ms before the next tick.

### 2.2 State Management

All game state lives in memory on the server. No database during gameplay. Key state objects:

- **Tile map**: `Uint8Array` of `MAP_WIDTH * MAP_HEIGHT` bytes. Each byte is a terrain type enum. A 256x256 map is 65,536 bytes — trivial.
- **Entity arrays**: Tanks, shells, pillboxes, bases, engineers, mines. Each entity is a plain object with position (x, y as floats), owner, health, state flags, etc.
- **Player sessions**: Map of player ID to session data (connected socket, team, name, associated tank entity, input queue, last acknowledged tick).
- **Tick counter**: Monotonically increasing integer. Every state update is tagged with the tick number.

### 2.3 Rooms

A single server process can host multiple concurrent game rooms. Each room has:

- Its own game loop (separate `setInterval` or `setTimeout` chain).
- Its own tile map and entity state.
- Its own player list.
- Complete isolation — no shared mutable state between rooms.

For most deployments, a single process handling 2–4 concurrent rooms is fine. For larger deployments, run multiple processes behind a load balancer with sticky sessions (since WebSocket connections are long-lived).

---

## 3. Client-Server Communication

### 3.1 Transport: WebSocket

All communication uses WebSocket (`ws://` on LAN, `wss://` on WAN). WebSocket provides:

- Full-duplex, low-latency communication over a single TCP connection.
- Binary message support (`ArrayBuffer`).
- Works through firewalls and NATs without special infrastructure.
- Native browser API — no library needed on the client.

**Why not WebRTC DataChannels?** WebRTC offers UDP-like unreliable transport, which is ideal for games where packet loss is preferable to head-of-line blocking. However, WebRTC's connection setup is complex (STUN/TURN/ICE), it struggles with NATs and firewalls, and for Bolo's moderate tick rate (20Hz) and entity count, TCP's head-of-line blocking is not a practical problem. WebRTC is a valid Phase 4 optimization but not worth the complexity for initial development.

**Why not Socket.IO?** Socket.IO adds convenience (automatic reconnection, rooms, fallback to HTTP polling) but also overhead (its own protocol framing, JSON encoding by default, 50KB+ bundle). For a game that needs tight control over a binary protocol and where every millisecond matters, raw `ws` is better. The room management and reconnection logic Socket.IO provides is straightforward to implement manually and gives full control.

### 3.2 Message Protocol: Binary

All messages are binary (`ArrayBuffer`), not JSON. At 20 ticks/second with 16 players, the server sends hundreds of messages per second. JSON's parsing overhead and string encoding bloat are unacceptable.

**Message structure:**

```
Byte 0:      Message type (uint8 — up to 256 message types)
Bytes 1–N:   Payload (varies by message type)
```

**Client → Server messages (inputs):**

| Type ID | Name | Payload |
|---------|------|---------|
| 0x01 | PlayerInput | tick: uint32, keys: uint8 (bitmask of pressed keys), rotation: uint8 (0–15) |
| 0x02 | EngineerCommand | tick: uint32, action: uint8, targetX: uint16, targetY: uint16 |
| 0x03 | ChatMessage | channel: uint8, text: UTF-8 string (length-prefixed) |
| 0x04 | JoinRoom | roomId: string, playerName: string, sessionToken: string |
| 0x05 | LeaveRoom | (empty) |

**Server → Client messages (state):**

| Type ID | Name | Payload |
|---------|------|---------|
| 0x10 | FullSnapshot | tick: uint32, complete map + all entities (sent on join/reconnect) |
| 0x11 | DeltaUpdate | tick: uint32, changed tiles + visible entity states |
| 0x12 | EntitySpawned | tick: uint32, entityType: uint8, entityId: uint16, position, owner, etc. |
| 0x13 | EntityDestroyed | tick: uint32, entityId: uint16, reason: uint8 |
| 0x14 | ChatBroadcast | channel: uint8, senderId: uint8, text: string |
| 0x15 | PlayerJoined | playerId: uint8, playerName: string, team: uint8 |
| 0x16 | PlayerLeft | playerId: uint8 |
| 0x17 | InputAck | lastProcessedTick: uint32, lastProcessedSeq: uint32 |
| 0x18 | RoomConfig | map data, settings, player list (sent on join) |

**Entity state (within DeltaUpdate):**

```
Per visible entity:
  entityId:   uint16
  entityType: uint8 (tank, shell, pillbox, base, engineer, mine-explosion)
  posX:       uint16 (fixed-point, tile * 256 + subtile)
  posY:       uint16
  rotation:   uint8 (0–15, for tanks/shells)
  health:     uint8
  state:      uint8 (bitmask: firing, moving, carrying pillbox, etc.)
  owner:      uint8 (player ID)
```

That's roughly 12 bytes per entity. With 20–30 visible entities, a DeltaUpdate is ~250–400 bytes plus any changed tiles.

### 3.3 Delta Compression

The server tracks what state each client has acknowledged (via the InputAck tick number). For each DeltaUpdate:

- Only include entities whose state has changed since the client's last acknowledged tick.
- Only include tile changes since the client's last acknowledged tick.
- If many ticks have elapsed without acknowledgment (poor connection), fall back to a fuller update.

For the tile map specifically, maintain a "dirty tiles" list per tick. Each DeltaUpdate includes only the tiles that changed in the intervening ticks.

---

## 4. Latency Compensation

### 4.1 Client-Side Prediction

On a WAN with 50–200ms latency, waiting for the server to confirm every input before rendering makes the game feel unresponsive. Client-side prediction eliminates this:

1. **Player presses a key.** The client immediately applies the input to its local copy of the tank state (position, rotation). This uses the same physics code the server runs (from `shared/physics.js`).
2. **Client sends the input to the server**, tagged with a sequence number.
3. **Server processes the input** during its next tick and includes the result in its state update, along with the sequence number of the last processed input.
4. **Client receives the server's authoritative state.** It sets the tank's position to what the server says, discards all inputs up to the acknowledged sequence number, and re-applies any unacknowledged inputs on top of the server's state.

This "prediction + reconciliation" loop means the player's own tank responds instantly to input, while the server remains authoritative. If the server disagrees (e.g., the client predicted moving through a wall that was actually built by another player), the correction happens smoothly.

**What to predict:**
- Tank movement and rotation: yes, always.
- Shell firing: show the shell locally, but the server determines hits.
- Mine dropping: show the mine locally, server confirms.
- Engineer commands: show the engineer starting to move, server confirms task completion.

**What NOT to predict:**
- Damage to other entities (server determines all hit resolution).
- Pillbox targeting and firing (server-side only).
- Other players' movement (handled by interpolation, see below).

### 4.2 Entity Interpolation

Other players' tanks (and their engineers, shells, etc.) are rendered based on server updates that arrive at 20Hz. Without smoothing, remote entities teleport between positions every 50ms. Entity interpolation fixes this:

- The client buffers the two most recent server states for each remote entity.
- It renders each entity at a position linearly interpolated between those two states.
- The interpolation runs slightly behind real-time — typically one tick period (50ms) in the past.

This introduces a 50ms display delay for remote entities, but their movement appears smooth. For Bolo's tank speeds, this delay is imperceptible.

**Interpolation formula:**

```
renderTime = currentTime - interpolationDelay  (e.g., 50ms)

Find the two server states that bracket renderTime:
  state_before (tick N, received at time T1)
  state_after  (tick N+1, received at time T2)

alpha = (renderTime - T1) / (T2 - T1)   // 0.0 to 1.0

renderX = state_before.x + (state_after.x - state_before.x) * alpha
renderY = state_before.y + (state_after.y - state_before.y) * alpha
```

For rotation, interpolate the shortest angular path to avoid the tank spinning 350° instead of turning 10°.

### 4.3 Lag Compensation for Shooting

When a player fires at a moving target, the target's position on their screen is slightly in the past (due to interpolation delay + network latency). Without compensation, shots that look like hits on the shooter's screen are actually misses.

For Bolo, this is less critical than in a first-person shooter — the shells are visible projectiles with travel time, not hitscan. The server simulates the shell as a moving entity, and collision detection happens server-side in real time. If a shell intersects a tank at any point during its flight, it's a hit. This naturally handles most cases without explicit lag compensation.

If playtesting reveals that shooting feels unfair, the server can rewind entity positions to the shooter's estimated view time when resolving shell collisions. But start without this and add it only if needed.

---

## 5. Fog of War & Interest Management

### 5.1 Server-Side Filtering

The server enforces fog of war by only including visible entities in each client's state update:

- Calculate the player's vision radius (e.g., 8–10 tiles around their tank).
- Account for terrain blocking: forests block line of sight.
- Only include entities within the player's vision in their DeltaUpdate.
- For allied players (shared fog of war), union all allies' vision areas.

This is both a gameplay mechanic (you can't see through forests, you don't know where enemies are) and a bandwidth optimization (each client receives only ~20–30 entities instead of all entities on the map).

### 5.2 Map Knowledge

- Static terrain the player has previously seen is "remembered" on the client. The client stores its own copy of the last-known tile state for every tile it has ever seen.
- The server sends tile changes only when they occur within the player's current vision.
- If a player revisits an area, they see the current state (pushed by the server), which may differ from their memory if terrain was modified while they were away.

### 5.3 Hidden Mines

Mines require special handling:

- The server never sends enemy mine positions to a client, regardless of vision range, until the mine is triggered.
- Allied mine positions are sent normally.
- When a mine detonates, the server sends the explosion event to all clients within blast visibility range.

---

## 6. Hosting Models

### 6.1 LAN — Self-Hosted, One Command

For LAN play, one player runs the server on their machine:

```bash
# Option A: npx (no install, just run)
npx webbolo-server --port 3000

# Option B: global install
npm install -g webbolo-server
webbolo-server --port 3000

# Option C: Docker
docker run -p 3000:3000 webbolo/server
```

The server process:
- Starts a WebSocket server on the specified port.
- Serves the client static files (HTML/JS/CSS/assets) on the same port over HTTP.
- Displays the local IP address and port in the terminal: "Players can connect at http://192.168.1.42:3000"

Other players on the LAN open that URL in their browser. Done.

**Web Worker alternative (zero-install, fully in-browser):**

For the ultimate simplicity, the "Host Game" button in the client could spawn the server simulation in a Web Worker running entirely in the browser. The host player's client communicates with the Worker via `postMessage`. Other LAN players would still need to connect somehow — this is where it gets tricky, because a browser can't listen for incoming WebSocket connections.

Possible approaches:
- **WebRTC for LAN peers**: The host generates a room code, LAN peers connect via WebRTC using a simple signaling mechanism (manual code exchange, or a tiny signaling relay). This adds WebRTC complexity specifically for LAN, which is the opposite of what we want.
- **BroadcastChannel API**: Only works between tabs/windows in the same browser on the same origin. Not useful for multi-machine LAN.

**Recommendation**: Don't pursue the Web Worker approach for multiplayer LAN. The Node.js `npx` command is simple enough, and it avoids the architectural split. The Web Worker approach *is* useful for single-player (playing against bots with no server needed), and should be supported for that use case.

### 6.2 WAN — Self-Hosted VPS

Anyone can run a WebBolo server on a cloud VPS:

```bash
# On a $5/month VPS (DigitalOcean, Linode, Vultr, etc.)
git clone https://github.com/user/webbolo
cd webbolo
npm install
npm start
```

Or with Docker Compose (includes nginx reverse proxy with TLS):

```yaml
# docker-compose.yml
version: '3.8'
services:
  webbolo:
    image: webbolo/server
    environment:
      - MAX_ROOMS=4
      - PORT=3000
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/letsencrypt
    depends_on:
      - webbolo
```

The nginx config terminates TLS and upgrades WebSocket connections:

```
location /ws {
    proxy_pass http://webbolo:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

Players connect via `https://yourdomain.com`. The client files are served as static assets; the WebSocket connects to `wss://yourdomain.com/ws`.

### 6.3 WAN — Community Server

For players who don't want to self-host, a community server provides:

- A lobby page listing active game rooms.
- Room creation with configurable settings.
- Automatic room cleanup when empty.
- Optional: player accounts, stats, leaderboards (requires a database — SQLite is fine).

This is the same server software as self-hosted, just running on an always-on VPS maintained by the project. The server resources are minimal — 16 players at 20Hz is a trivial workload. A single $5/month VPS can host multiple concurrent games.

### 6.4 Resource Requirements

| Component | CPU | Memory | Bandwidth |
|-----------|-----|--------|-----------|
| 1 game room (16 players, 20Hz) | ~2% of a modern core | ~10 MB | ~200 KB/s upload |
| 4 concurrent rooms | ~8% | ~40 MB | ~800 KB/s |
| Client static files | Negligible (served once, cached) | — | ~500 KB initial load |

These numbers are well within a $5/month VPS (1 vCPU, 1GB RAM, 1TB bandwidth).

---

## 7. Reconnection

### 7.1 Session Tokens

When a player joins a game:

1. The server generates a random session token (e.g., 128-bit hex string).
2. The server sends the token to the client in the JoinRoom response.
3. The client stores the token in `sessionStorage`.

### 7.2 Disconnect Handling

When the server detects a WebSocket disconnect:

1. Mark the player as "disconnected" but do not remove them.
2. Their tank stops accepting input (stops moving, stops firing).
3. The tank remains on the map and can be damaged/destroyed.
4. Start a grace period timer (e.g., 30 seconds).

### 7.3 Reconnection Flow

If the client reconnects within the grace period:

1. Client sends JoinRoom with the stored session token.
2. Server validates the token and matches it to the disconnected player.
3. Server sends a FullSnapshot (current complete game state).
4. Player resumes control of their tank.

If the grace period expires, the player's tank is removed from the game. They can rejoin as a new player.

### 7.4 Client-Side Reconnection

The client should automatically attempt to reconnect on disconnect:

```
On WebSocket close:
  1. Show "Reconnecting..." overlay.
  2. Attempt reconnection every 2 seconds, with exponential backoff up to 10 seconds.
  3. On successful reconnection, send JoinRoom with stored session token.
  4. On FullSnapshot received, hide overlay, resume gameplay.
  5. After 30 seconds of failed attempts, show "Disconnected" with a manual rejoin button.
```

---

## 8. Security

### 8.1 Input Validation

The server validates every input:

- **Rate limiting**: Cap input messages to 30/second per client (slightly above the tick rate to allow for timing jitter). Flag clients that exceed this.
- **Legality checks**: Can this player fire? (Do they have ammo?) Can they place a mine? (Do they have mines? Is the tile valid?) Is the rotation value in range (0–15)?
- **Sequence numbers**: Input sequence numbers must be monotonically increasing. Out-of-order or duplicate sequence numbers are discarded.

### 8.2 No Client Trust

The server never trusts client claims about:
- Hit detection (server resolves all collisions).
- Resource counts (server tracks all ammo, armor, wood, mines).
- Entity positions (server is authoritative for all positions).
- Fog of war (server decides what each client can see).

### 8.3 Transport Security

- **WAN**: Always use `wss://` (WebSocket Secure = WebSocket over TLS). Use Let's Encrypt for free certificates.
- **LAN**: `ws://` is acceptable on a trusted local network.
- **Connection limits**: Cap connections per IP address (e.g., 4) to prevent simple DOS.

---

## 9. Network Quality Indicators

The client HUD should display:

- **Ping**: Round-trip time to the server (measured by periodic ping/pong messages). Displayed as a number and a colored indicator (green < 50ms, yellow < 150ms, red > 150ms).
- **Packet loss indicator**: If the client detects gaps in the server's tick sequence, show a warning.
- **Server tick rate**: If the server is struggling to maintain 20Hz, the client should show a "server lag" warning.

---

## 10. Future Optimizations

These are not needed for initial development but are worth noting for Phase 4+:

- **WebRTC DataChannels**: Optionally offer UDP-like transport for lower latency. Requires a signaling server and STUN/TURN infrastructure.
- **Snapshot compression**: Run-length encoding or LZ4 on full snapshots. Useful for reconnection but not needed for delta updates.
- **Interest management optimization**: Use spatial hashing to efficiently determine which entities are visible to which players.
- **Server-side recording**: Log all inputs per tick for deterministic replay. Useful for spectating, anti-cheat review, and post-game analysis.
- **Horizontal scaling**: For many concurrent rooms, run multiple server processes behind a load balancer with sticky sessions. Use Redis pub/sub if rooms need to communicate (e.g., a cross-room lobby).

---

*See also: [02 - Gameplay Mechanics](./02-Gameplay-Mechanics.md) for what the networking layer must synchronize.*
*See also: [04 - Project Structure](./04-Project-Structure.md) for how shared code is organized between client and server.*
