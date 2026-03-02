# WebBolo: Development Phases & Roadmap

**Document:** 05 of 09
**Version:** 0.3
**Date:** March 2026

---

## Philosophy: Playable at Every Phase

Each phase produces something you can actually play and show to people. No phase is purely infrastructure. The worst outcome for a hobby project is spending months on an engine that never becomes a game. Every phase ends with a playable milestone.

---

## Phase 1: Local Prototype (Single-Player)

**Goal:** Get the game feeling right before touching networking. Nail the tank physics, the engineer behavior, the pillbox anger, the mine chain reactions. If it doesn't feel good in single-player, networking won't save it.

**Duration estimate:** 2–4 weeks

### Deliverables

1. **Canvas renderer with scrolling viewport**
   - Tile map rendering (256x256 or smaller for testing).
   - Viewport centered on the player's tank, scrolling as the tank moves.
   - Tile sprites for all terrain types (placeholder art is fine — colored squares work).
   - Entity rendering: tank (rotating sprite with 16 directions), pillboxes, bases, engineer, shells.

2. **Tank movement**
   - Keyboard input: arrow keys or WASD for rotation and forward.
   - 16-direction rotation.
   - Acceleration, deceleration, terrain speed modifiers.
   - Collision with impassable tiles (walls, water, buildings).
   - Death on deep water.

3. **Shooting**
   - Fire key spawns a shell entity moving in the tank's facing direction.
   - Shell-tile collision (stops at walls/buildings).
   - Shell-entity collision (damages pillboxes, bases, and — later — other tanks).
   - Rate of fire limiting.

4. **Pillboxes**
   - Neutral pillboxes on the map that shoot at the player's tank when in range.
   - Anger mechanic: fire rate increases when shot, decays over time.
   - Health: reduced by player shells. At 0, becomes collectible.

5. **Bases**
   - Neutral bases claimable by driving over them.
   - Refueling: stopping on a friendly base replenishes armor/shells/mines over time.
   - Base health: shootable, capturable when reduced to 0.

6. **Engineer**
   - Send engineer to a target tile (click or key + cursor).
   - Engineer walks from tank to target, performs action, walks back.
   - Tree harvesting (forest → grass, wood resource increases).
   - Mine planting (mine entity placed on tile).
   - Pillbox collection (destroyed pillbox → carried in inventory).
   - Pillbox placement (inventory → active friendly pillbox on tile).
   - Engineer death (hit by explosion) and parachute respawn timer.

7. **Mines**
   - Mine detonation on contact.
   - Crater creation.
   - Chain reaction: adjacent mines detonate in sequence.
   - Crater flooding when adjacent to water.

8. **Terrain dynamics**
   - Forest regrowth timer.
   - Road and wall building by engineer.

### What's NOT in Phase 1

- No networking.
- No fog of war (full map visibility for testing).
- No teams or chat.
- No polish — placeholder art is expected.

### Phase 1B: Single-Player AI (runs immediately after 1A)

**Goal:** Make the local prototype into a real game you can sit down and play. A single AI opponent that claims bases, defends territory, and fights back.

**Duration estimate:** 1–2 weeks (on top of Phase 1A)

1. **Web Worker game loop**
   - Move the simulation into a Web Worker.
   - Main thread sends inputs via `postMessage`, receives state updates.
   - Uses the same binary protocol format as the future WebSocket messages.
   - This is the single-player runtime — no server needed.

2. **Basic AI opponent**
   - One AI-controlled tank that plays the game through the same input interface as the player.
   - **State machine**: idle → claim nearest base → harvest wood → build pillbox near base → patrol → attack.
   - **Navigation**: A* pathfinding on the tile grid, with terrain cost weighting.
   - **Combat**: Rotate toward player when in range, fire. Retreat to friendly base when low on armor.
   - **Engineer use**: Harvest trees, place pillboxes near owned bases, build roads between bases.

3. **Difficulty configuration**
   - Single difficulty level initially ("Medium"). Tuned so a new player can win after learning the mechanics, but not trivially.
   - Difficulty scales via: reaction time, aim accuracy, strategic planning depth, think interval.

4. **Skirmish mode**
   - Start screen: select map, select number of AI opponents (1–3 initially), start game.
   - Win condition: capture all bases, or hold majority for 10 minutes, or eliminate all AI tanks.

5. **Solo-specific features**
   - Pause/resume (Escape key pauses the Web Worker simulation).
   - Speed control: 0.5x, 1x, 2x, 4x — adjustable during play.
   - Save/Load game state to IndexedDB. Multiple save slots.
   - Instant restart on same map (one-key reset).

6. **Adaptive difficulty (follows initial Easy/Medium/Hard)**
   - Monitors player K/D ratio, base control percentage, and armor trend over a rolling 5-minute window.
   - Interpolates bot parameters between Easy and Hard values based on a floating difficulty level.
   - Adjustments are gradual — the player should never notice a jump. The game just stays interesting.

7. **Tutorial mode**
   - Tutorial Island map (small, simple layout).
   - On-screen overlay prompts: move → shoot → capture base → use engineer → capture pillbox → place mines.
   - Passive AI that follows the tutorial script.

This is critical because it means WebBolo is playable and demonstrable after Phase 1 — before any networking code exists. You can hand someone a URL, they click "Play," and they're in a game.

### Testing & Validation (Phase 1A + 1B)

- **Does the tank feel good to drive?** Momentum, turn radius, terrain changes — this is the #1 feel question.
- **Are pillboxes threatening but beatable?** The anger mechanic should make direct assault dangerous but not impossible.
- **Do mine chains work correctly?** Place a line of mines near water, detonate one end, verify the chain and flooding.
- **Is the engineer fun to use?** The risk/reward of sending your vulnerable engineer out should feel meaningful.
- **Can you sit down and play a full game against the AI?** This is the Phase 1 litmus test. If you can play for 20 minutes and have fun, Phase 1 is done.
- **Does the AI feel like a real opponent?** It doesn't need to be brilliant, but it should claim bases, defend them, and attack you. It should not do obviously stupid things (driving into water, ignoring undefended bases, firing at nothing).

---

## Phase 2: LAN Multiplayer (Two Players)

**Goal:** Move the simulation to the server. Get two players fighting each other on a LAN. This is the critical networking milestone — everything after is refinement.

**Duration estimate:** 3–5 weeks

### Deliverables

1. **Server game loop**
   - Node.js process with fixed-timestep loop (20 ticks/second).
   - All game simulation from Phase 1 ported to run on the server.
   - Client stripped down to input capture + rendering.

2. **Binary message protocol**
   - Implement `shared/protocol.js` with encode/decode for all message types.
   - Client → Server: PlayerInput, EngineerCommand.
   - Server → Client: FullSnapshot, DeltaUpdate, EntitySpawned, EntityDestroyed.

3. **Client-side prediction**
   - Client predicts own tank movement using `shared/physics.js`.
   - Input sequence numbers.
   - Server reconciliation: accept server state, re-apply unacknowledged inputs.
   - Test with simulated latency (add artificial delay to WebSocket messages).

4. **Entity interpolation**
   - Remote tanks rendered with interpolation between server states.
   - Smooth movement at sub-tick granularity.

5. **Basic lobby**
   - "Host Game" button (starts the server or connects to one).
   - "Join Game" with IP:port entry.
   - Player name entry.
   - Room creation with map selection.

6. **Two-player combat**
   - Both players can see each other, shoot each other, die, respawn.
   - Pillboxes and bases work with multiple players (ownership, capture, refueling).
   - Engineers work (both players can build, harvest, capture pillboxes).

### What's NOT in Phase 2

- No fog of war (both players see everything).
- No delta compression (send full visible state each tick).
- No reconnection handling.
- No teams (free-for-all only).
- No chat.
- No WAN support (LAN only, `ws://`).

### Testing & Validation

- **Play across two machines on a LAN.** Does it feel responsive? Can both players shoot each other accurately?
- **Add 50ms, 100ms, 200ms simulated latency.** Does prediction keep the local tank feeling responsive? Does interpolation keep the remote tank looking smooth?
- **Engineer conflicts.** Both players send engineers to the same pillbox. Server arbitrates correctly?
- **Mine interaction.** Player A plants a mine, Player B drives over it. Detonation and damage are server-authoritative?

---

## Phase 3: WAN Multiplayer (Full Feature Set)

**Goal:** Robust internet play for up to 16 players with all core features.

**Duration estimate:** 4–6 weeks

### Deliverables

1. **Fog of war**
   - Server calculates per-client visibility.
   - Entities outside vision range are not sent to the client.
   - Client-side map memory (remember previously seen terrain).
   - Forest blocks line of sight.

2. **Delta compression**
   - Server tracks last acknowledged state per client.
   - Only send changed entities and tiles since last ack.
   - Full snapshot on join/reconnect.

3. **Reconnection**
   - Session tokens in `sessionStorage`.
   - Disconnect grace period (30 seconds).
   - Automatic reconnection with exponential backoff.

4. **Teams & alliances**
   - Team join/leave during gameplay.
   - Shared fog of war with allies.
   - Allied pillboxes don't shoot allies.
   - Allied base access.
   - Hidden mines visible to allies.

5. **Chat system**
   - Global chat (all players).
   - Team chat (allies only).
   - Chat UI that doesn't obstruct gameplay.

6. **Lobby server**
   - Room listing for WAN play.
   - Room creation with full settings (map, max players, hidden mines, time limit, etc.).
   - Player count per room.
   - Auto-cleanup of empty rooms.

7. **TLS support**
   - `wss://` for WAN connections.
   - Documentation for setting up with Let's Encrypt + nginx.
   - Docker Compose file with nginx + auto-TLS.

8. **HUD improvements**
   - Ping display.
   - Minimap showing known terrain and allied positions.
   - Kill feed / event log.
   - Team roster.

9. **Sound effects**
   - Engine hum (pitch varies with speed).
   - Gunfire (own and distant).
   - Explosions (mines, deaths).
   - Pillbox shots.
   - Engineer parachute.
   - Spatial audio (volume/pan based on distance and direction).

### Testing & Validation

- **16-player load test.** Run `tools/loadTest.js` with 16 headless clients. Server maintains 20Hz tick rate?
- **WAN playtest.** Players in different geographic locations. Latency 50–200ms. Game feels fair and responsive?
- **Fog of war correctness.** Player A hidden in forest. Player B cannot see them from outside the forest?
- **Reconnection.** Kill the client tab, reopen, resume playing. Seamless?
- **Alliance dynamics.** Form a team, break alliance mid-game, former ally's pillboxes now shoot you?

---

## Phase 4: Polish & Community

**Goal:** Make it a complete, shareable experience that a community can form around.

**Duration estimate:** Ongoing

### Deliverables

1. **Map editor** (browser-based)
   - Canvas tile painter.
   - Place pillboxes, bases, spawn points.
   - Save/load map files.
   - Export in WebBolo format (and optionally import original Bolo .map files).

2. **Advanced AI enhancements** (builds on Phase 1B bots)
   - Bot personalities (Rusher, Turtle, Sniper, Builder, Wildcard).
   - Bot scripting API for community-written AI.
   - Bot tournaments.

3. **Spectator mode**
   - Join a game as a spectator (see the full map, no fog of war).
   - Free camera or follow a specific player.
   - Useful for tournaments and learning.

4. **Game recording & replay**
   - Server logs all inputs per tick.
   - Replay file can be loaded in the client for deterministic playback.
   - Scrub timeline forward/backward.

5. **Visual polish**
   - Proper sprite art (or find an artist).
   - Explosion animations, shell trails, water ripples.
   - Smooth camera transitions.
   - Day/night cycle (cosmetic only — optional).

6. **Leaderboards & persistence** (optional)
   - Player accounts (simple username/password or OAuth).
   - Game results tracked: wins, kills, bases captured, etc.
   - Leaderboard on the lobby page.
   - Requires a persistent database (SQLite or PostgreSQL).

7. **Bot scripting API** (stretch goal)
   - Expose a sandboxed JavaScript API for custom bots.
   - Bots receive limited game state (what a player would see) and return input commands.
   - Community bot tournaments.

8. **WebRTC transport option** (stretch goal)
   - Offer WebRTC DataChannels as an alternative to WebSocket for lower latency.
   - Requires signaling server and STUN/TURN infrastructure.

---

## Milestone Summary

| Phase | Milestone | Players | Networking | Priority |
|-------|-----------|---------|------------|----------|
| 1A | Local prototype | 1 (vs pillboxes/bases) | None | **Now** |
| 1B | Single-player AI | 1 vs 1–3 AI | Web Worker | **Now** |
| 2 | LAN multiplayer | 2 on LAN | WebSocket, prediction | **Next** |
| 3 | WAN multiplayer | Up to 16 on internet | Full netcode, fog, delta, reconnect | **Core** |
| 4 | Polish & community | Up to 16 + spectators | Stable | **Ongoing** |

---

## What to Build First Within Each Phase

### Phase 1A priority order:
1. Canvas renderer + tile map (see something on screen immediately).
2. Tank movement (interact with what you see).
3. Shooting + shell collision (satisfying feedback loop).
4. Pillboxes (something to shoot at that shoots back).
5. Bases (resource economy creates purpose).
6. Engineer (strategic depth).
7. Mines (advanced tactics).
8. Terrain dynamics (depth).

### Phase 1B priority order:
1. Move simulation into Web Worker with `postMessage` transport.
2. Basic AI state machine (claim bases → harvest → defend → attack).
3. A* pathfinding on the tile grid.
4. AI combat behavior (approach, aim, fire, retreat when damaged).
5. AI engineer usage (harvest, place pillboxes).
6. **Basic spatial audio** (engine hum, gunfire, explosions — see Sound section below).
7. Skirmish mode UI (map select, AI count, difficulty, start game).
8. Pause, speed control, instant restart.
9. Difficulty tuning through playtesting.
10. Adaptive difficulty mode.
11. Save/load game state.
12. Tutorial mode with guided overlay.

### Phase 2 priority order:
1. Server game loop with one entity (get the tick loop running).
2. WebSocket connection + binary protocol (get bytes flowing).
3. Move tank simulation to server, client sends inputs and renders.
4. Client-side prediction (make it feel responsive).
5. Entity interpolation (make the other player look smooth).
6. All Phase 1 features running through the server.
7. Basic lobby UI.

### Phase 3 priority order:
1. Fog of war (biggest gameplay impact).
2. Teams and alliances (social layer).
3. Chat (communication).
4. Delta compression (bandwidth optimization for 16 players).
5. Reconnection (quality of life).
6. TLS + deployment tooling (enables WAN play).
7. Full spatial audio (occlusion, ambient, complete sound library).
8. HUD polish (minimap, kill feed, team roster).

---

## Testing Strategy

Testing is not a phase — it runs continuously from Phase 1A onward.

### Unit Tests (Phase 1A+)

All shared code must have unit tests (Vitest). The simulation is deterministic: same inputs on same state must produce the same output. This makes the shared code highly testable:

- **`shared/physics.js`**: Test tank movement against every terrain type. Test wall collision. Test that prediction code matches authoritative code exactly (fuzz with random inputs, compare output byte-for-byte).
- **`shared/protocol.js`**: Round-trip encode/decode for every message type. Fuzz with random payloads. Verify that encode(decode(x)) === x.
- **`shared/terrainTypes.js`**: Verify speed modifiers, passability, and mine helpers match doc 09 constants exactly.

### Property-Based Tests (Phase 1A+)

For a deterministic simulation, property-based testing catches subtle bugs that example-based tests miss:

- **Mine chain commutativity**: Detonating mine A then mine B produces the same final map state as detonating B then A (when both are in the same chain).
- **Flood fill idempotency**: Running flood fill twice on the same state produces no additional changes.
- **Physics symmetry**: A tank at position P facing direction D, given input I for N ticks, then reversing direction and repeating, should return to approximately P.
- **Protocol completeness**: For any valid game state, serializing to a FullSnapshot and deserializing produces an identical state.

### Integration Tests (Phase 2+)

- **Client-server round trip**: Headless client connects, sends inputs, receives state. Verify the state is valid and matches server-side truth.
- **Prediction accuracy**: Run client prediction alongside server. Measure divergence. With zero latency, divergence should be zero.
- **Reconnection**: Connect, disconnect, reconnect with session token. Verify player state is preserved.

### Latency Simulation (Phase 2+)

From Phase 2 onward, always test with artificial latency injected into the WebSocket (or postMessage) transport:

| Latency | What It Tests |
|---------|--------------|
| 0ms | Baseline correctness |
| 50ms | Typical LAN |
| 100ms | Good WAN |
| 200ms | Poor WAN / cross-continent |
| 500ms | Stress test — game should remain playable, not break |

If the game feels bad at 100ms, the prediction or interpolation code needs work. If it breaks at 500ms, there's a correctness bug.

### Performance Regression (Phase 1B+)

Track frame time (ms per frame) and server tick time (ms per tick) in CI. Flag regressions. The targets:

- Client: < 4ms per frame (60 FPS with headroom).
- Server: < 10ms per tick at 16 players (20 Hz with headroom).

---

## Sound Design

Sound is **not polish** — it is gameplay-critical. In Bolo, audio provides information that the screen cannot:

- **Hidden threats**: A mine explosion off-screen tells you an enemy is nearby. Engine noise through fog of war reveals tank positions. Pillbox firing sounds tell you a battle is happening two screens away.
- **Spatial awareness**: Left/right panning and volume falloff with distance give directional cues. You hear an enemy approaching from the east before you see them.
- **Feedback**: The satisfying "thunk" of a shell hitting a pillbox, the "clink" of base refueling, the alarm of low armor — these are not decoration, they are information.

### When to Implement

**Phase 1B** (solo play): Basic audio. Engine hum (pitch = speed), gunfire, explosions, pillbox shots, mine detonation, base refueling. Use Web Audio API with simple oscillator-generated sounds or short samples. Spatial panning based on screen position.

**Phase 2** (LAN): Full spatial audio for remote entities. Volume and pan calculated from distance and direction relative to the player's tank. Ensure audio doesn't break when entities enter/leave fog of war.

**Phase 3** (WAN): Audio occlusion (sounds behind buildings are muffled). Ambient audio (wind, water). The full sound library.

### Core Sound List (Phase 1B minimum)

| Sound | Trigger | Spatial | Notes |
|-------|---------|---------|-------|
| Engine idle | Tank stationary | No (own tank) | Low drone |
| Engine moving | Tank in motion | Yes (other tanks) | Pitch increases with speed |
| Shell fire | Tank fires | Yes | Sharp crack |
| Shell impact | Shell hits entity/wall | Yes | Thud/explosion |
| Mine explosion | Mine detonates | Yes | Heavy boom, larger than shell |
| Pillbox fire | Pillbox shoots | Yes | Distinct from tank fire |
| Base refuel | Tank refueling at base | No (own tank) | Quiet hiss/click |
| Low armor warning | Armor < 25% | No | Repeating alarm tone |
| Tank death | Tank destroyed | Yes | Large explosion |
| Engineer parachute | Engineer respawning | No (own tank) | Distant helicopter |

---

*See also: [04 - Project Structure](./04-Project-Structure.md) for codebase organization.*
*See also: [01 - Project Overview](./01-Project-Overview.md) for goals and tech stack.*
