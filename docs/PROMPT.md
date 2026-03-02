# WebBolo — Development Prompt

You are building **WebBolo**, a browser-based reimplementation of the classic 1987 networked tank game Bolo. The complete design documentation is in the `/docs` directory (9 documents + audit). Read those docs before writing any code — they contain authoritative game constants derived from the WinBolo C source code and the original Bolo manual.

## Project Context

Bolo is a top-down multiplayer tank game where players control tanks on an island map, capturing refueling bases and deploying pillboxes (automated turrets) for territorial control. Each tank has an engineer who exits to harvest trees, build roads/walls, plant mines, and relocate pillboxes. The game features dynamic terrain modification, hidden mine warfare, fluid team alliances, and emergent strategy from simple systems.

WebBolo runs entirely in the browser (HTML5 Canvas, vanilla JavaScript) with a Node.js WebSocket server. Solo play runs in a Web Worker with no server needed.

## Documentation Reference

Read these docs in this order before starting each phase:

| Doc | File | Read Before |
|-----|------|-------------|
| 09 | `09-WinBolo-Source-Constants.md` | **Always first** — authoritative numeric values |
| 01 | `01-Project-Overview.md` | Phase 1A — vision, tech stack |
| 02 | `02-Gameplay-Mechanics.md` | Phase 1A — all game mechanics |
| 06 | `06-Map-System.md` | Phase 1A — terrain enum, map format |
| 08 | `08-Rendering-and-Graphics.md` | Phase 1A — Canvas renderer, sprites, auto-tiling |
| 04 | `04-Project-Structure.md` | Phase 1A — directory layout, shared code |
| 05 | `05-Development-Phases.md` | All phases — build order, priorities, deliverables |
| 07 | `07-AI-Bots-Community.md` | Phase 1B — AI architecture, difficulty, bots |
| 03 | `03-Networking-Architecture.md` | Phase 2 — protocol, prediction, interpolation |

The `AUDIT-March2026.md` documents remaining P2 issues (redundancies, structural notes). It's informational, not prescriptive.

## Technology Stack

- **Client:** Nuxt 4 / Vue 3 / Nuxt UI 4 — HTML5 Canvas 2D game rendering, Web Audio API
- **Server:** Node.js, `ws` package for WebSocket (separate from Nuxt's Nitro server)
- **Shared code:** `shared/` directory — physics, protocol, terrain, constants — pure JS, no framework deps, identical on client and server
- **Package manager:** pnpm (workspaces)
- **Build:** Nuxt handles client bundling. No separate build step needed for dev.
- **Test:** Vitest

## Critical Constants (from WinBolo source — doc 09 has the full set)

These are the values that must be used. Do not guess or approximate.

### World Coordinates
- Map is 256×256 tiles. Each tile is 16×16 pixels at base scale.
- WORLD coordinate: `uint16`. Top 8 bits = map tile, bottom 8 bits = sub-tile (256 units per tile).
- `MAP_SQUARE_MIDDLE = 128` (center of a tile in world units).

### Angles
- **Bradians**: 256 units per full circle. 0=North, 64=East, 128=South, 192=West.
- 16 sprite frames, each covering 16 bradians (22.5°).

### Tank
- Armor: 40 max. Shells: 40 max. Mines: 40 max. Trees (wood): 40 max.
- Open game starts with 40/40/40/40. Tournament: shells vary, 0 mines/trees. Strict: 0/0/0.
- Acceleration: 0.25 speed units per tick. Deceleration: 0.25 per tick.
- Reload: 13 ticks. Shell speed: 32 world/tick. Shell life: 8 ticks (range = 256 world = 1 tile).
- Damage from shell/pillbox: 5 per hit. Damage from mine: 10 per hit.
- Death respawn: 255 ticks. Death causes big explosion if shells+mines > 20.
- Water timer: lose ammo every 15 ticks in water without boat.
- Knockback on hit: 16 world units/tick for 8 ticks.
- 16 discrete rotation directions.

### Terrain Max Speeds (world units per tick)

| Terrain | ID | Tank Speed | Engineer Speed |
|---------|----|-----------|---------------|
| Building | 0 | 0 (impassable) | 0 |
| River | 1 | 3 (boat: 16) | 0 |
| Swamp | 2 | 3 | 4 |
| Crater | 3 | 3 | 4 |
| Road | 4 | 16 | 16 |
| Forest | 5 | 6 | 8 |
| Rubble | 6 | 3 | 4 |
| Grass | 7 | 12 | 16 |
| Halfbuilding | 8 | 0 (impassable) | 0 |
| Boat | 9 | 16 | 16 |
| Mines | 10–15 | Same as base terrain | Same |
| Deep Sea | 0xFF | 3 (then death) | 0 (instant death) |

### Pillbox
- Health: 15 max. Damage per shell: 5. Dies in 3 hits.
- Range: 2048 world units = 8 tiles.
- Fire rate: 32 ticks (idle) → 6 ticks (provoked). Cooldown decays back to 32.
- Repair: +4 health per repair action.

### Base
- Pools: 90 shells, 90 mines, 90 armor max.
- Restock: every 1670 ticks. Gives 1 shell, 1 mine, 5 armor per cycle.
- Refuel to tank: 1 shell/tick, 1 mine/tick, 5 armor/tick while tank is stopped on base.
- Capture: reduce armor below 9, then drive over.

### Engineer (LGM)
- Build time: 20 ticks per action.
- Harvest: +4 wood per tree. Costs: road=2, wall=2, repair=1, boat=20, new pillbox=4, mine=1.
- Death: replacement parachutes in after significant delay. Helicopter speed: 3 world/tick.
- 3×4 pixel sprite, 2 walk frames.

### Dynamic Terrain
- Flood fill: crater adjacent to water floods after 16 ticks. Cascades to adjacent craters.
- Mine chain: adjacent mines detonate after 10-tick delay. 4-directional (not diagonal).
- Tree regrowth: scoring system based on 8 neighbors. Forest=+100, grass=+25, road=-100. Best candidate grows every 3000 ticks. Initial delay: 30000 ticks.

### Timing
- WebBolo server: **20 ticks/sec** (50ms). Client renders at 60 FPS with interpolation.
- WinBolo source runs at 50 Hz. All tick-based constants from doc 09 are at 50 Hz — scale to 20 Hz by multiplying by 0.4 (e.g., reload: 13 × 0.4 ≈ 5 ticks at 20 Hz).

---

## Build Phases

Each phase ends with a **playable deliverable**. Do not move to the next phase until the current phase's deliverable is working.

---

### PHASE 1A — Local Prototype (No Networking)

**Deliverable:** A single HTML page where you drive a tank around a map, shoot pillboxes, capture bases, use the engineer, and detonate mine chains. No AI opponents. No server.

**Read:** docs 09, 01, 02, 04, 06, 08

**Directory structure to create:**

```
webbolo/
├── package.json
├── shared/
│   ├── constants.js        # All game constants (from doc 09)
│   ├── terrainTypes.js     # Terrain enum, speed table, properties
│   ├── physics.js          # Tank movement, shell flight, collision
│   └── mapFormat.js        # Map parsing
├── client/
│   ├── index.html
│   ├── js/
│   │   ├── main.js         # Entry point, game loop
│   │   ├── renderer.js     # Canvas 2D rendering
│   │   ├── input.js        # Keyboard capture
│   │   └── hud.js          # Armor/shells/mines/wood display
│   └── assets/
│       └── sprites/        # Placeholder colored squares are fine
└── docs/                   # All 10 .md files
```

**Build order (each step should be testable):**

1. **Canvas + tile map.** Render a 64×64 test map (mostly grass with some forest, water, roads, buildings). Scrolling viewport centered on a position. Use colored rectangles as placeholder tiles — don't get stuck on art. Just get something on screen.

2. **Tank movement.** Keyboard input (arrows or WASD). 16-direction rotation. Acceleration/deceleration per terrain speed table. Collision with impassable tiles. The tank should feel good to drive — momentum, terrain speed changes, wall collisions.

3. **Shooting.** Fire key spawns a shell entity. Shell moves at 32 world/tick in tank's facing direction. Collides with buildings (Building → Halfbuilding), entities. Rate of fire limited by reload timer. Targeting cursor for range control.

4. **Pillboxes.** Place 4–6 neutral pillboxes on the test map. They detect the player tank within 8-tile range and fire shells. Implement the anger mechanic: fire rate accelerates from 32-tick to 6-tick cooldown when shot at, decays when not provoked. Health system: 15 HP, 5 damage per hit, destroyed at 0.

5. **Bases.** Place 4 neutral bases. Drive over to claim. Stopping on a friendly base refuels (1 shell/tick, 1 mine/tick, 5 armor/tick). Base has its own pool (90/90/90) that depletes and slowly restocks.

6. **Engineer.** Click or key+cursor to target a tile. Engineer exits tank, walks to target at terrain-dependent speed, performs action (build time: 20 ticks), walks back. Actions: harvest tree (forest→grass, +4 wood), build road (grass→road, -2 wood), build wall (grass→building, -2 wood), plant mine (-1 mine), collect destroyed pillbox, place carried pillbox (-4 wood). Engineer dies to any explosion within blast radius. Replacement parachutes in after delay.

7. **Mines.** Tank drops mine at current position (costs 1 mine from inventory). Mine detonates when tank drives over it. Creates crater. Chain detonation: adjacent mines fire after 10-tick delay, 4-directional. Crater flooding: crater adjacent to water becomes river after 16 ticks, cascading.

8. **Terrain dynamics.** Building → Halfbuilding → Rubble destruction chain. Forest regrowth (simplified: grow back after fixed timer near existing forest). Road-on-river = bridge rendering.

**Acceptance test:** You can drive the tank around the map, shoot and destroy all pillboxes (taking damage, retreating to bases to refuel), use the engineer to harvest trees and build walls, plant mines and trigger chain reactions near water to create artificial rivers. If this is fun to do for 10 minutes, Phase 1A is done.

---

### PHASE 1B — Solo Play with AI

**Deliverable:** Click "Play" and face 1–3 AI opponents in a full game. Runs entirely in the browser (Web Worker). Includes pause, speed control, restart.

**Read:** docs 07, 05

**Key additions:**

1. **Move simulation into a Web Worker.** The main thread sends player input via `postMessage` (as `ArrayBuffer`). The Worker runs the game loop at 20 ticks/sec, sends state updates back via `postMessage`. Use the same binary message format that will later go over WebSocket — this is the transport abstraction from doc 07 Section 5.2.

2. **AI bot.** A bot is a virtual player that receives fog-of-war-limited game state and generates input commands (same format as human input). Implement the hierarchical goal system from doc 07 Section 2.3:
   - Priority 1: SURVIVE (retreat when low armor, evade fire)
   - Priority 2: ECONOMY (claim bases, harvest wood, place pillboxes)
   - Priority 3: TERRITORY (expand to neutral/weak bases)
   - Priority 4: COMBAT (engage enemy tanks, assault pillboxes)
   - Priority 5: BUILD (roads between bases, walls around bases)

3. **A* pathfinding** on the tile grid with terrain cost weighting (doc 07 Section 2.5).

4. **Difficulty levels.** Start with Medium. Adjust: think interval (1.0 sec), aim tolerance (±1 direction), reaction delay (250ms), retreat threshold (25% armor). See doc 07 Section 3.1 for the full parameter table.

5. **Solo UI.** Start screen with map selection and AI count (1–3). Pause (Escape). Speed control (0.5x/1x/2x/4x). Instant restart.

**Acceptance test:** You can play a 20-minute skirmish against 2 Medium AI opponents and it feels like a real game. The AI claims bases, defends them with pillboxes, attacks you, retreats to refuel, and uses its engineer. You can pause, speed up, and restart. This runs with no server — just open the HTML file.

---

### PHASE 2 — LAN Multiplayer (Two Players)

**Deliverable:** Two people on a LAN can play against each other in real-time. One runs `npx webbolo-server`, the other opens the URL.

**Read:** docs 03, 04

**Key additions:**

1. **Node.js server.** Fixed-timestep game loop (20 ticks/sec). The simulation code from Phase 1 moves to the server (or is shared). All game state is authoritative on the server.

2. **Binary WebSocket protocol.** Implement `shared/protocol.js` with encode/decode for all message types defined in doc 03 Section 3.2. Client→Server: PlayerInput, EngineerCommand. Server→Client: FullSnapshot, DeltaUpdate, EntitySpawned, EntityDestroyed, InputAck.

3. **Client-side prediction.** Client predicts own tank movement using `shared/physics.js`. Tags inputs with sequence numbers. On server state receipt: accept server position, re-apply unacknowledged inputs. See doc 03 Section 4.1.

4. **Entity interpolation.** Remote tanks rendered by interpolating between the two most recent server states. 50ms interpolation delay. See doc 03 Section 4.2.

5. **Basic lobby.** "Host Game" button starts server (or connects to `localhost`). "Join" with IP:port. Player name entry. Map selection.

**Acceptance test:** Two players on separate machines on a LAN. Both can drive, shoot, capture bases, use engineers, and fight each other. Add 100ms simulated latency — the local tank still feels responsive (prediction), the remote tank moves smoothly (interpolation). Mine chains and terrain changes sync correctly.

---

### PHASE 3 — WAN Multiplayer (Full Feature Set)

**Deliverable:** Up to 16 players on the internet with fog of war, teams, chat, reconnection, and TLS.

**Read:** docs 03 (sections 5–8), 02 (section 7)

**Key additions:**

1. **Fog of war.** Server filters state updates per client — only entities within vision radius are sent. Forests block line of sight. Client maintains map memory (previously seen terrain rendered darkened, entities hidden).

2. **Delta compression.** Server tracks last-acked tick per client. Only sends changed entities and tiles since last ack.

3. **Teams & alliances.** Team join/leave mid-game. Shared fog of war with allies. Allied pillboxes don't fire at allies. Shared base access. Mine visibility for allies (real-time, not retroactive).

4. **Chat.** Global channel (all players), team channel (allies only). Press Enter to type, Enter to send. Messages don't block tank input.

5. **Reconnection.** Session token in `sessionStorage`. 30-second grace period on disconnect. Auto-reconnect with exponential backoff.

6. **TLS.** `wss://` for WAN. Docker Compose with nginx + Let's Encrypt.

7. **HUD.** Ping display, minimap, kill feed, team roster.

8. **Sound.** Engine hum, gunfire, explosions, pillbox shots, spatial audio (volume/pan by distance).

**Acceptance test:** 8+ players in different locations play a full game. Fog of war works (can't see through forest, hidden mines invisible). Teams form and break. Chat works. A player disconnects and reconnects seamlessly. Server maintains 20 Hz under load.

---

### PHASE 4 — Polish & Community (Ongoing)

**Deliverable:** Map editor, spectator mode, replays, visual polish, bot scripting API.

**Read:** docs 06 (section 4), 07 (sections 2–6)

See doc 05 for the full Phase 4 feature list. Priority order:
1. Browser-based map editor (Canvas tile painter, pillbox/base placement, save/load)
2. Original Bolo .map import converter
3. Spectator mode (full-map view, follow player, no fog)
4. Game recording & replay (log inputs per tick, deterministic playback)
5. Bot personalities (Rusher, Turtle, Builder, etc.)
6. Visual polish (proper sprite art, animations, effects)
7. Leaderboards & accounts (SQLite, optional)
8. Bot scripting API (sandboxed JS, community tournaments)

---

## Development Principles

1. **Playable at every phase.** Each phase ends with something you can hand to someone and say "play this." Don't build infrastructure that isn't immediately playable.

2. **Shared code is the linchpin.** `shared/` must contain zero platform-specific imports. Pure computational JS only. This is what makes prediction work and what lets solo mode share code with the server.

3. **Doc 09 is ground truth for numbers.** When in doubt about a constant, check doc 09. When doc 09 conflicts with other docs, doc 09 wins (it's from the source code).

4. **Start ugly.** Colored rectangles for tiles, circles for tanks. Get the game feel right before polishing visuals. Art is Phase 4.

5. **The transport abstraction is key.** The client shouldn't know if it's talking to a Web Worker (solo) or WebSocket (multiplayer). Design this interface in Phase 1B and never break it.

6. **Test with latency.** From Phase 2 onward, always test with simulated latency (50ms, 100ms, 200ms). If it feels bad at 100ms, the netcode needs work.

7. **Scale tick-based constants.** WinBolo runs at 50 Hz. WebBolo runs at 20 Hz. Multiply tick-based durations by 0.4 when implementing. Example: `TANK_RELOAD_TIME = 13` at 50 Hz → `5` at 20 Hz. The world-unit speeds (like `SHELL_SPEED = 32`) need to be scaled by 2.5× to maintain the same real-world velocity (32 × 2.5 = 80 world/tick at 20 Hz, covering the same distance per second).

8. **Test the simulation, not just the game.** Write unit tests for `shared/` code from Phase 1A. The simulation is deterministic — use property-based tests (e.g., mine chain commutativity, protocol round-trip fidelity). See doc 05 Testing Strategy section for details.

9. **Accessibility is not optional.** Friend/foe differentiation must work without relying solely on red/green color. Use shape and pattern markers in addition to color. Every gameplay-critical audio cue must have a visual fallback. See doc 08 Section 13 for full requirements.

10. **Sound is gameplay, not polish.** Implement basic spatial audio in Phase 1B (engine hum, gunfire, explosions). Audio conveys information the screen cannot — off-screen threats, enemy positions through fog of war, battle sounds across the map. See doc 05 Sound Design section.

11. **Measure performance continuously.** Include a debug HUD (toggle with F3) showing frame time, draw calls, entity count, and server tick time from Phase 1A onward. Set a CI gate: average server tick < 10ms with 16 bots. See doc 08 Section 12.3.

---

## Begin

Start with **Phase 1A, Step 1**: create the project directory structure, set up `package.json`, implement `shared/constants.js` and `shared/terrainTypes.js` from doc 09's values, and get a Canvas rendering a scrollable test map with colored rectangles for terrain tiles.
