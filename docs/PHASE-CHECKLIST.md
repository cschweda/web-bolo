# WebBolo — Phase Checklist

**Purpose:** Track completion of each component within every phase and sub-phase. Check off items as they are approved and working. Do not advance to the next phase until all items in the current phase are checked.

**Last updated:** March 2026

---

## Phase 1A — Local Prototype (No Networking)

**Deliverable:** Single HTML page where you drive a tank, shoot pillboxes, capture bases, use the engineer, and detonate mine chains. No AI. No server.

**Acceptance test:** Play for 10 minutes — drive around, destroy all pillboxes (retreating to bases to refuel), use the engineer to harvest/build, trigger mine chains near water. If it's fun, Phase 1A is done.

### Setup
- [x] Project directory structure created (`shared/`, `client/`, `docs/`)
- [x] `package.json` with workspace config and scripts
- [x] `shared/constants.js` — all game constants from doc 09
- [x] `shared/terrainTypes.js` — terrain enum, speed table, properties, mine helpers

### Step 1: Canvas + Tile Map
- [x] HTML5 Canvas rendering context set up (`imageSmoothingEnabled = false`)
- [x] Test map created (64x64, grass/forest/water/roads/buildings)
- [x] Tile rendering with colored rectangles (placeholder art)
- [x] Scrolling viewport centered on a position
- [x] Viewport scrolls smoothly (sub-tile precision)

### Step 2: Tank Movement
- [x] Keyboard input capture (arrows or WASD)
- [x] 16-direction rotation
- [x] Acceleration and deceleration per terrain speed table
- [x] Terrain speed modifiers applied correctly (road fast, swamp slow, etc.)
- [x] Collision with impassable tiles (buildings, water, halfbuildings)
- [x] Tank sprite rendered (placeholder: colored triangle with direction)
- [x] Camera follows tank

### Step 3: Shooting
- [x] Fire key spawns shell entity
- [x] Shell moves at correct speed in tank's facing direction (32 world/tick at 50 Hz, scaled to 20 Hz)
- [x] Shell-tile collision (stops at buildings, forests)
- [x] Building destruction: Building -> Halfbuilding -> Rubble
- [x] Rate of fire limited by reload timer (13 ticks at 50 Hz, scaled)
- [x] Shell lifetime/range correct (8 ticks at 50 Hz, scaled)

### Step 4: Pillboxes
- [x] Neutral pillboxes placed on test map (4-6)
- [x] Pillbox detects player tank within 8-tile range
- [x] Pillbox fires shells at player
- [x] Anger mechanic: fire rate accelerates from 32-tick to 6-tick cooldown when shot at
- [x] Anger decays when not provoked
- [x] Health system: 15 HP, 5 damage per player shell
- [x] Pillbox destroyed at 0 HP, becomes collectible

### Step 5: Bases
- [x] Neutral bases placed on test map (4)
- [x] Drive over neutral base to claim it
- [x] Stopping on friendly base refuels: 1 shell/tick, 1 mine/tick, 5 armor/tick
- [x] Base has resource pools (90/90/90 max)
- [x] Base pools deplete during refueling
- [x] Base pools slowly restock (every 1670 ticks at 50 Hz, scaled)
- [ ] Base capturable by enemy when armor reduced below threshold

### Step 6: Engineer
- [x] Send engineer to target tile (click or key+cursor)
- [x] Engineer exits tank, walks to target at terrain-dependent speed
- [x] Engineer performs action (build time: 20 ticks at 50 Hz, scaled)
- [x] Engineer walks back to tank after action
- [x] Harvest tree: forest -> grass, +4 wood
- [x] Build road: grass -> road, -2 wood
- [x] Build wall: grass -> building, -2 wood
- [ ] Plant mine: -1 mine from inventory
- [x] Collect destroyed pillbox into inventory
- [x] Place carried pillbox: -4 wood, creates friendly pillbox
- [ ] Engineer dies to explosion within blast radius
- [x] Replacement parachutes in after delay

### Step 7: Mines
- [x] Tank drops mine at current position (costs 1 mine)
- [x] Mine detonates when any tank drives over it
- [x] Mine deals 10 damage
- [x] Detonation creates crater
- [x] Chain reaction: adjacent mines detonate after 10-tick delay (4-directional, not diagonal)
- [x] Crater flooding: crater adjacent to water becomes river after 16 ticks
- [x] Flood cascading to adjacent craters

### Step 8: Terrain Dynamics
- [x] Forest regrowth timer (simplified: regrow near existing forest after delay)
- [x] Bridge rendering: road placed on river tile renders as bridge
- [x] Building -> Halfbuilding -> Rubble two-stage destruction verified
- [x] HUD displays armor, shells, mines, wood counts

### Phase 1A Quality Gates
- [ ] Debug HUD toggleable with F3 (frame time, draw calls, entity count)
- [ ] Unit tests for `shared/physics.js` (tank movement per terrain type)
- [ ] Unit tests for `shared/terrainTypes.js` (speed modifiers match doc 09)
- [x] Tank feels good to drive (momentum, terrain speed changes, wall collisions)
- [x] Pillboxes feel threatening but beatable

---

## Phase 1B — Solo Play with AI

**Deliverable:** Click "Play" and face 1-3 AI opponents in a full game. Runs entirely in the browser (Web Worker). Includes pause, speed control, restart.

**Acceptance test:** Play a 20-minute skirmish against 2 Medium AI opponents that feels like a real game. AI claims bases, defends with pillboxes, attacks, retreats to refuel, uses its engineer. Pause, speed up, restart all work. No server required.

### Step 1: Web Worker Simulation
- [ ] Game simulation moved into Web Worker
- [ ] Main thread sends player input via `postMessage` as `ArrayBuffer`
- [ ] Worker runs game loop at 20 ticks/sec
- [ ] Worker sends state updates back via `postMessage`
- [ ] Uses same binary protocol format as future WebSocket messages
- [ ] Transport abstraction: `WorkerTransport` class implements same interface as future `WebSocketTransport`

### Step 2: Basic AI State Machine
- [ ] Bot class created with personality parameters
- [ ] Bot receives fog-of-war-limited game state (same view as human)
- [ ] Bot generates input commands in same format as human input
- [ ] Hierarchical goal system: SURVIVE > ECONOMY > TERRITORY > COMBAT > BUILD
- [ ] SURVIVE: retreat when low armor, evade fire
- [ ] ECONOMY: claim nearest base, harvest wood, place pillboxes near bases
- [ ] TERRITORY: expand to neutral/weak bases
- [ ] COMBAT: engage enemy tanks, assault pillboxes
- [ ] BUILD: roads between bases, walls around bases

### Step 3: A* Pathfinding
- [ ] A* on tile grid with terrain cost weighting
- [ ] Road preferred (low cost), swamp/crater avoided (high cost)
- [ ] Impassable tiles routed around
- [ ] Danger zone penalty near enemy pillboxes (difficulty-dependent)
- [ ] Path recalculation when blocked or threat appears

### Step 4: AI Combat Behavior
- [ ] Bot rotates to face enemy
- [ ] Bot fires when aim angle within tolerance (difficulty-dependent)
- [ ] Bot maintains distance, doesn't charge straight in
- [ ] Bot retreats to friendly base when armor below threshold
- [ ] Bot drops mines while retreating

### Step 5: AI Engineer Usage
- [ ] Bot sends engineer to harvest trees
- [ ] Bot places pillboxes near owned bases
- [ ] Bot builds roads between bases (hard difficulty)
- [ ] Bot protects engineer (doesn't send into danger)

### Step 6: Basic Spatial Audio
- [ ] Web Audio API initialized
- [ ] Engine hum sound (pitch varies with speed)
- [ ] Gunfire sound (own and remote)
- [ ] Explosion sounds (mines, deaths)
- [ ] Pillbox fire sound (distinct from tank)
- [ ] Base refuel sound
- [ ] Low armor warning tone
- [ ] Spatial panning based on screen position

### Step 7: Skirmish Mode UI
- [ ] Start screen with map selection
- [ ] AI opponent count selector (1-3)
- [ ] Difficulty selector (Easy/Medium/Hard)
- [ ] Start game button

### Step 8: Solo Controls
- [ ] Pause/resume (Escape key pauses Web Worker)
- [ ] Speed control: 0.5x, 1x, 2x, 4x
- [ ] Instant restart on same map (one-key reset)

### Step 9: Difficulty Tuning
- [ ] Easy difficulty parameters configured (doc 07 Section 3.1)
- [ ] Medium difficulty parameters configured
- [ ] Hard difficulty parameters configured
- [ ] Personality variance per bot (aggression, caution, greed)

### Step 10: Adaptive Difficulty
- [ ] Monitors player K/D ratio, base control %, armor trend
- [ ] Rolling 5-minute evaluation window
- [ ] Floating difficulty level interpolates between Easy and Hard
- [ ] Adjustments are gradual (player doesn't notice jumps)

### Step 11: Save/Load
- [ ] Save game state to IndexedDB
- [ ] Load game state from IndexedDB
- [ ] Multiple save slots

### Step 12: Tutorial Mode
- [ ] Tutorial Island map (small, simple layout)
- [ ] On-screen overlay prompts (move, shoot, capture base, use engineer, etc.)
- [ ] Passive AI that follows tutorial script

### Phase 1B Quality Gates
- [ ] Property-based tests: mine chain commutativity, protocol round-trips
- [ ] Performance: client < 4ms per frame, Worker tick < 10ms
- [ ] AI feels like a real opponent (claims bases, defends, attacks, doesn't do stupid things)
- [ ] 20-minute skirmish against 2 AI is genuinely fun
- [ ] Accessibility: color-blind toggle in settings (shape markers on entities)

---

## Phase 2 — LAN Multiplayer (Two Players)

**Deliverable:** Two people on a LAN play against each other in real-time. One runs `npx webbolo-server`, other opens the URL.

**Acceptance test:** Two machines on LAN. Both drive, shoot, capture bases, use engineers, fight. Add 100ms simulated latency — local tank still responsive (prediction), remote tank smooth (interpolation). Mine chains and terrain changes sync correctly.

### Step 1: Server Game Loop
- [ ] Node.js server process created (`server/index.js`)
- [ ] Fixed-timestep loop at 20 ticks/sec with time accumulation
- [ ] HTTP server serves client static files
- [ ] Server displays local IP and port on startup

### Step 2: Binary Protocol
- [ ] `shared/protocol.js` with encode/decode for all message types
- [ ] Client -> Server: PlayerInput, EngineerCommand
- [ ] Server -> Client: FullSnapshot, DeltaUpdate, EntitySpawned, EntityDestroyed, InputAck
- [ ] Round-trip encode/decode tests for every message type

### Step 3: Server Simulation
- [ ] All Phase 1 simulation code runs on server
- [ ] Client stripped to input capture + rendering
- [ ] Server is single source of truth for all game state
- [ ] Both players' inputs processed, state updates sent

### Step 4: Client-Side Prediction
- [ ] Client predicts own tank movement using `shared/physics.js`
- [ ] Inputs tagged with sequence numbers
- [ ] Server reconciliation: accept server state, re-apply unacknowledged inputs
- [ ] Tested with 50ms, 100ms, 200ms simulated latency

### Step 5: Entity Interpolation
- [ ] Remote tanks interpolated between two most recent server states
- [ ] 50ms interpolation delay
- [ ] Smooth movement at sub-tick granularity
- [ ] Rotation interpolation uses shortest angular path

### Step 6: Multi-Player Features
- [ ] Both players can see each other
- [ ] Both players can shoot each other, take damage, die, respawn
- [ ] Pillbox ownership works with multiple players
- [ ] Base capture works with multiple players
- [ ] Engineer actions work for both players
- [ ] Mine planting and detonation synced (server-authoritative)

### Step 7: Basic Lobby
- [ ] "Host Game" button
- [ ] "Join Game" with IP:port entry
- [ ] Player name entry
- [ ] Map selection

### Phase 2 Quality Gates
- [ ] Integration test: headless client connects, sends inputs, receives valid state
- [ ] Prediction accuracy: zero divergence at zero latency
- [ ] Feels responsive at 100ms latency
- [ ] Engineer conflicts resolved correctly (both target same pillbox)
- [ ] Mine interaction server-authoritative (Player A plants, Player B detonates)
- [ ] Performance: server tick < 10ms with 2 players

---

## Phase 3 — WAN Multiplayer (Full Feature Set)

**Deliverable:** Up to 16 players on the internet with fog of war, teams, chat, reconnection, and TLS.

**Acceptance test:** 8+ players in different locations play a full game. Fog of war works (can't see through forest, hidden mines invisible). Teams form and break. Chat works. Player disconnects and reconnects seamlessly. Server maintains 20 Hz under load.

### Step 1: Fog of War
- [ ] Server calculates per-client visibility radius
- [ ] Entities outside vision not sent to client
- [ ] Forests block line of sight
- [ ] Client-side map memory (previously seen terrain rendered darkened)
- [ ] Hidden mines never sent to non-allied clients
- [ ] Mine explosion events sent to all clients in blast visibility range

### Step 2: Teams & Alliances
- [ ] Team join/leave during gameplay
- [ ] Shared fog of war with allies
- [ ] Allied pillboxes don't fire at allies
- [ ] Allied base access (refueling at ally's base)
- [ ] Mine visibility for allies (real-time, not retroactive)
- [ ] Breaking alliance restores hostile status immediately

### Step 3: Chat System
- [ ] Global chat (all players)
- [ ] Team chat (allies only)
- [ ] Press Enter to type, Enter to send
- [ ] Chat doesn't block tank input while typing
- [ ] Messages fade after a few seconds, scrollable log

### Step 4: Delta Compression
- [ ] Server tracks last-acknowledged tick per client
- [ ] Only sends changed entities and tiles since last ack
- [ ] Full snapshot sent on join/reconnect
- [ ] Fallback to fuller update on prolonged disconnect

### Step 5: Reconnection
- [ ] Session token generated on join, stored in `sessionStorage`
- [ ] 30-second grace period on disconnect (tank stays, stops accepting input)
- [ ] Client auto-reconnect with exponential backoff (2s, up to 10s)
- [ ] Successful reconnect: FullSnapshot sent, player resumes
- [ ] Grace period expiry: tank removed, rejoin as new player

### Step 6: TLS & Deployment
- [ ] `wss://` support for WAN connections
- [ ] Docker Compose file with nginx + WebSocket proxy
- [ ] Let's Encrypt TLS documentation
- [ ] Server runs on VPS ($5/month target resource usage)

### Step 7: Full Spatial Audio
- [ ] Volume and pan calculated from distance/direction to player tank
- [ ] Audio occlusion (sounds behind buildings muffled)
- [ ] Ambient audio (wind, water)
- [ ] All Phase 1B sounds working for remote entities
- [ ] Sounds enter/exit cleanly with fog of war transitions

### Step 8: HUD Polish
- [ ] Ping display (green < 50ms, yellow < 150ms, red > 150ms)
- [ ] Minimap with known terrain and allied positions
- [ ] Kill feed / event log
- [ ] Team roster
- [ ] Packet loss indicator
- [ ] Server tick rate warning

### Step 9: Lobby Server
- [ ] Room listing for WAN play
- [ ] Room creation with settings (map, max players, hidden mines, time limit)
- [ ] Player count per room
- [ ] Auto-cleanup of empty rooms

### Phase 3 Quality Gates
- [ ] 16-player load test (`tools/loadTest.js`): server maintains 20 Hz
- [ ] WAN playtest: 50-200ms latency feels fair and responsive
- [ ] Fog of war: player hidden in forest invisible from outside
- [ ] Reconnection: kill tab, reopen, resume seamlessly
- [ ] Alliance dynamics: form team, break alliance, former ally's pillboxes now hostile
- [ ] CI gate: average server tick < 10ms with 16 bots

---

## Phase 4 — Polish & Community (Ongoing)

**Deliverable:** Map editor, spectator mode, replays, visual polish, bot scripting API. Each feature is independently testable.

### Map Editor
- [ ] Browser-based Canvas tile painter
- [ ] Place pillboxes, bases, spawn points
- [ ] Save/load `.wbmap` binary format
- [ ] Save/load JSON format
- [ ] Undo/redo (command stack)
- [ ] Zoom and pan
- [ ] Fill, rectangle, line tools
- [ ] Validation warnings (no bases, no spawns, unreachable areas)

### Original Bolo Map Import
- [ ] `tools/convertBoloMap.js` reads original `.map` format
- [ ] Terrain type mapping from original numbering to WebBolo enum
- [ ] Pillbox and base positions preserved
- [ ] Converted maps playable in WebBolo

### Spectator Mode
- [ ] Join game as spectator (no tank, no fog of war)
- [ ] Full map visibility, all entities visible
- [ ] Free camera pan or follow specific player
- [ ] Player stats overlay (armor, ammo, bases controlled)
- [ ] Spectators don't count toward player limit

### Game Recording & Replay
- [ ] Server logs all inputs per tick to replay file
- [ ] Replay file contains header (map, players, settings) + per-tick inputs
- [ ] Replay player loads file, runs deterministic simulation in Web Worker
- [ ] Play, pause, fast-forward (2x/4x/8x), skip to tick
- [ ] Free camera or follow any player
- [ ] Toggle per-player fog of war

### Visual Polish
- [ ] Hand-pixeled terrain tileset (16x16, all terrain types + 16 bitmask variants each)
- [ ] Hand-pixeled entity sprites (tank 16 rotations, engineer 4 directions, pillbox, base)
- [ ] Explosion animations
- [ ] Shell trails / muzzle flash
- [ ] Smooth camera transitions
- [ ] Player color tinting system (16 colors)

### Bot Enhancements
- [ ] Bot personalities (Rusher, Turtle, Sniper, Builder, Wildcard)
- [ ] Multi-bot coordination on same team (team board, pincer attacks, defense rotation)

### Leaderboards & Persistence (Optional)
- [ ] Player accounts (username/password or OAuth)
- [ ] Per-game stats recorded (kills, deaths, bases, pillboxes, trees, mines)
- [ ] Leaderboard page
- [ ] SQLite storage

### Bot Scripting API (Stretch)
- [ ] Sandboxed JavaScript API for custom bots
- [ ] Bot receives fog-of-war-limited state, returns input commands
- [ ] Time and memory limits per `think()` call
- [ ] Community bot tournament system

### PWA Support (Stretch)
- [ ] `manifest.json` with app name, icons, theme color
- [ ] Service Worker caching static assets
- [ ] Offline single-player detection and launch

---

## Progress Summary

| Phase | Status | Components | Completed |
|-------|--------|------------|-----------|
| 1A | Not started | 41 items | 0 / 41 |
| 1B | Not started | 36 items | 0 / 36 |
| 2 | Not started | 26 items | 0 / 26 |
| 3 | Not started | 32 items | 0 / 32 |
| 4 | Not started | 30 items | 0 / 30 |
| **Total** | | **165 items** | **0 / 165** |
