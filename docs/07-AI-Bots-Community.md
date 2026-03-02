# WebBolo: AI Bots & Community Features

**Document:** 07 of 09
**Version:** 0.4
**Date:** March 2026

---

## 1. AI Bots — Overview

### 1.1 Why AI Is a First-Class Feature

The original Bolo's fatal flaw for a modern audience: you needed human opponents. No one online? No game. WebBolo treats single-player AI not as an afterthought but as a core deliverable, built in Phase 1B — before any networking code exists.

The AI must be good enough that a player can open the game, click "Play," and have a satisfying 20–30 minute session against computer opponents. This is the difference between a project that gets played and one that sits on GitHub with a "requires multiplayer" caveat.

### 1.2 Design Principles

**Play through the same interface.** A bot is a virtual player that sends the same input messages (PlayerInput, EngineerCommand) as a human. It receives the same fog-of-war-limited game state a human client would see. No special hooks, no cheating, no access to hidden mines or enemy positions.

**Be readable, not optimal.** The AI should feel like playing against a human, not a perfect computer. Humans make suboptimal decisions, commit to plans even when conditions change, get "angry" and overcommit to revenge. The AI should exhibit these patterns at lower difficulty levels.

**Scale with difficulty, not with cheating.** Difficulty is controlled by reaction time, decision quality, and strategic depth — never by giving the AI extra resources, vision, or rule-breaking abilities.

### 1.3 Can It Be Done? (Feasibility)

Yes, and Bolo is well-suited for it. Here's why:

**Bounded action space.** At any tick, a bot can: move forward/backward, rotate left/right, fire, drop a mine, or issue an engineer command. That's fewer than 20 possible actions per tick.

**Observable state.** The game world is a 2D tile grid with a small number of entity types. The bot's "perception" is a region of tiles plus nearby entities — computationally trivial to analyze.

**Decomposable strategy.** Bolo strategy breaks into clear subproblems: economy (harvest wood, control bases), defense (place pillboxes, build walls), offense (attack enemy bases, destroy pillboxes), and survival (retreat, refuel). Each can be implemented as a module.

**Precedent.** The original Bolo had community-written "brains" (bot plugins) that played competitively. WinBolo includes AI opponents. The NetLogo reimplementation (Logo Bolo) includes a basic AI. The problem is solved in principle — the question is quality of execution.

**What's hard:** Multi-step tactical plans like pilltakes (building walls to block pillbox fire while attacking) require understanding spatial relationships and multi-entity coordination. The "Hard" difficulty should attempt these. Lower difficulties don't need to.

---

## 2. AI Architecture

### 2.1 Runtime Model

Bots run server-side (or in the Web Worker for single-player):

```
Each bot, every think interval:
  1. Receive visible game state (same fog-of-war view as a human player)
  2. Update internal world model (memory of previously seen areas)
  3. Evaluate priorities (survival > economy > territory > combat > building)
  4. Select or continue a plan
  5. Generate input commands for this tick
```

### 2.2 Core Architecture

```javascript
class Bot {
  constructor(playerId, difficulty, simulation) {
    this.playerId = playerId;
    this.difficulty = difficulty;
    this.sim = simulation;

    // World model — remembers what it has seen
    this.knownMap = new Uint8Array(MAP_WIDTH * MAP_HEIGHT); // Last-known terrain
    this.knownBases = new Map();     // baseId → { x, y, owner, lastSeen }
    this.knownPillboxes = new Map(); // pillboxId → { x, y, owner, health, lastSeen }
    this.lastKnownEnemyPositions = new Map(); // playerId → { x, y, tick }

    // Planning state
    this.currentGoal = null;    // { type: 'claimBase', target: baseId }
    this.currentPath = [];      // A* waypoints
    this.engineerTask = null;   // Current engineer assignment
    this.thinkCooldown = 0;

    // Personality (varies by difficulty and random seed)
    this.aggression = 0.5;      // 0 = purely defensive, 1 = reckless attacker
    this.caution = 0.5;         // 0 = ignores threats, 1 = retreats at first contact
  }
}
```

### 2.3 Hierarchical Goal System

The bot uses a priority-based goal system. Each tick, it evaluates whether its current goal is still the best choice, or whether a higher-priority situation has arisen.

```
Priority 1: SURVIVE
  - Am I taking fire? → Evade (zigzag, retreat to cover).
  - Is my armor below 25%? → Path to nearest friendly base for refueling.
  - Is my engineer dead and I'm near enemies? → Play very cautiously.

Priority 2: ECONOMY
  - Do I have 0 friendly bases? → URGENT: claim nearest neutral or weakly defended base.
  - Do I have < 2 friendly bases? → Claim another base.
  - Do I have 0 wood and need to build? → Send engineer to harvest.
  - Is a friendly base undefended (no nearby pillbox)? → Place a pillbox near it.

Priority 3: TERRITORY
  - Are there uncontested neutral bases? → Claim them (easy expansion).
  - Are there weakly defended enemy bases (low armor, no nearby pillbox)? → Attack.
  - Can I spike an enemy base? (Place pillbox near it to deny refueling.) → Do it.

Priority 4: COMBAT
  - Is an enemy tank visible and within engagement range? → Fight.
  - Is an enemy pillbox blocking my expansion? → Evaluate: can I take it safely?
  - Can I mine a likely enemy approach route? → Place mines.

Priority 5: BUILD
  - Would a road between two of my bases improve logistics? → Build it.
  - Would walls around a key base create a defensible position? → Build them.
  - Is there an island with unclaimed bases reachable by boat? → Build a boat.
```

Goals at a given priority level are only evaluated if no higher-priority goal is active. If a higher-priority situation arises (e.g., the bot is attacked while building a road), the current goal is suspended and resumed later.

### 2.4 World Model & Memory

The bot maintains a "memory" of the map it has explored — identical to how the client renders fog of war. This is crucial for strategic planning:

```javascript
updateWorldModel(visibleState) {
  // Update known tile state for all visible tiles
  for (const tile of visibleState.tiles) {
    this.knownMap[tile.y * MAP_WIDTH + tile.x] = tile.type;
  }

  // Update known base states
  for (const base of visibleState.bases) {
    this.knownBases.set(base.id, {
      x: base.x, y: base.y,
      owner: base.owner,
      isFriendly: base.isFriendly,
      lastSeen: this.sim.tick
    });
  }

  // Track last-known enemy positions (for prediction)
  for (const tank of visibleState.enemyTanks) {
    this.lastKnownEnemyPositions.set(tank.owner, {
      x: tank.x, y: tank.y,
      rotation: tank.rotation,
      tick: this.sim.tick
    });
  }
}
```

The bot uses stale information for areas it hasn't revisited. A base it saw as neutral 5 minutes ago might now be enemy-controlled — the bot discovers this when it returns and adjusts.

### 2.5 Pathfinding

**A* on the tile grid** with terrain-weighted costs:

| Terrain | Movement Cost | Notes |
|---------|--------------|-------|
| Road | 0.67 | Preferred for travel. |
| Grass | 1.0 | Standard. |
| Forest | 1.25 | Slightly slower, but provides cover. |
| Swamp | 2.0 | Avoid unless necessary. |
| Crater | 1.67 | Avoid. |
| Water/Wall/Building | Impassable | Route around. |
| Tiles near enemy pillboxes | +5.0 penalty | Avoid fire zones (radius ~8 tiles). |

The pathfinding runs during the bot's `think()` call, not every tick. The path is stored as waypoints, and `generateInput()` steers the tank toward the next waypoint by calculating the required rotation and setting the forward flag.

**Path recalculation**: Repath if the current path is blocked (terrain changed), if a new threat appears along the path, or if the goal changes.

### 2.6 Combat Behavior

**Engagement:**
1. Rotate to face the enemy.
2. Fire when the aim angle is within tolerance (tighter tolerance = higher difficulty).
3. Maintain distance — don't charge straight in.
4. Strafe: alternate between moving forward and rotating, creating a zigzag approach that's harder to hit.

**Retreat:**
1. When armor drops below threshold (varies by difficulty), break engagement.
2. Path to nearest friendly base, using forests for cover.
3. Drop mines while retreating to discourage pursuit.

**Pillbox assault:**
- Easy: drive toward pillbox, shoot, take damage, brute-force it.
- Medium: approach from the side with lowest threat, use terrain for partial cover.
- Hard: build a wall to block the pillbox's line of fire, then shoot it safely (pilltake). This requires multi-step planning: harvest wood → build wall at calculated position → approach behind wall → shoot pillbox.

### 2.7 Engineer Management

The engineer is the bot's most valuable non-tank asset. The bot protects it:

- Never send the engineer out when enemies are nearby (visible within ~6 tiles).
- Harvest from forests that are behind friendly territory, not on the front line.
- Queue engineer tasks: harvest → build pillbox → harvest → build road → etc.
- If the engineer dies, increase caution and prioritize base defense until replacement arrives.

---

## 3. Difficulty Scaling

### 3.1 Difficulty Parameters

| Parameter | Easy | Medium | Hard |
|-----------|------|--------|------|
| Think interval | 2.0 sec | 1.0 sec | 0.4 sec |
| Aim tolerance | ±2 directions (of 16) | ±1 direction | ±0 (must be exact) |
| Reaction delay | 500ms before responding to threats | 250ms | 50ms |
| Pathfinding | Ignores pillbox danger zones | Avoids most danger zones | Full danger zone avoidance |
| Pillbox tactics | Brute force only | Uses terrain cover | Full pilltakes with walls |
| Mine usage | Drops mines randomly when scared | Places at chokepoints | Strategic minefields, tree-mine traps |
| Engineer protection | Sends engineer into danger | Some caution | Never sends engineer without clear safety |
| Retreat threshold | 10% armor | 25% armor | 40% armor (early retreat, re-engage with advantage) |
| Multi-bot coordination | None (each bot independent) | Basic (avoid attacking same target) | Coordinated pincer attacks, base defense rotation |
| Memory usage | Forgets enemy positions after 30s | Remembers for 2 min | Remembers for 5 min, predicts enemy movement |
| Personality variance | High (sometimes does dumb things) | Moderate | Low (consistently competent) |

### 3.2 Personality System

Each bot has randomized personality traits within its difficulty band. This prevents all bots from behaving identically:

- **Aggression** (0.0–1.0): High → attacks early, pushes forward, risks engineer. Low → turtles, builds defenses, only attacks weak targets.
- **Caution** (0.0–1.0): High → retreats early, avoids fights, prioritizes economy. Low → commits to fights, ignores damage.
- **Greed** (0.0–1.0): High → expands rapidly, claims distant bases, over-extends. Low → consolidates territory, defends what it has.

```javascript
// Personality generation per difficulty
function generatePersonality(difficulty) {
  switch (difficulty) {
    case 'easy':
      return {
        aggression: 0.2 + Math.random() * 0.5,  // 0.2–0.7, wide variance
        caution: 0.2 + Math.random() * 0.5,
        greed: 0.3 + Math.random() * 0.4,
      };
    case 'medium':
      return {
        aggression: 0.3 + Math.random() * 0.4,  // 0.3–0.7, moderate variance
        caution: 0.3 + Math.random() * 0.4,
        greed: 0.3 + Math.random() * 0.4,
      };
    case 'hard':
      return {
        aggression: 0.4 + Math.random() * 0.3,  // 0.4–0.7, tight variance
        caution: 0.5 + Math.random() * 0.2,      // Generally cautious
        greed: 0.3 + Math.random() * 0.3,
      };
  }
}
```

### 3.3 Adaptive Difficulty (Solo Mode)

Beyond fixed Easy/Medium/Hard, solo mode offers an **Adaptive** difficulty that adjusts bot behavior in real-time based on the player's performance. This is the recommended default for solo play.

**Signals monitored (rolling 5-minute window):**

| Signal | Indicates Player Is... |
|--------|----------------------|
| Kill/death ratio > 2.0 | Dominating |
| Kill/death ratio < 0.5 | Struggling |
| Controls > 60% of bases | Dominating |
| Controls < 25% of bases | Struggling |
| Armor consistently > 70% | Taking little damage |
| Armor consistently < 30% | Under constant pressure |
| Time since last death > 5 min | Playing safely and winning |

**Adaptation mechanism:**

The adaptive system maintains a floating "effective difficulty" value between 0.0 (easy) and 1.0 (hard). Each parameter from the difficulty table (Section 3.1) is interpolated between its Easy and Hard values based on the effective difficulty.

```javascript
class AdaptiveDifficulty {
  constructor() {
    this.level = 0.4; // Start slightly below medium
    this.adjustRate = 0.02; // Change per evaluation (every 30 seconds)
  }

  evaluate(playerStats) {
    let pressure = 0;

    // Player dominating → increase difficulty
    if (playerStats.kdRatio > 2.0) pressure += 0.3;
    if (playerStats.baseControlRatio > 0.6) pressure += 0.2;
    if (playerStats.avgArmor > 0.7) pressure += 0.1;

    // Player struggling → decrease difficulty
    if (playerStats.kdRatio < 0.5) pressure -= 0.3;
    if (playerStats.baseControlRatio < 0.25) pressure -= 0.2;
    if (playerStats.avgArmor < 0.3) pressure -= 0.1;

    // Adjust gradually
    this.level = Math.max(0, Math.min(1, this.level + pressure * this.adjustRate));
  }

  getParam(easyValue, hardValue) {
    return easyValue + (hardValue - easyValue) * this.level;
  }
}

// Usage:
const thinkInterval = adaptive.getParam(2.0, 0.4); // seconds
const aimTolerance = Math.round(adaptive.getParam(2, 0));  // direction steps
const retreatThreshold = adaptive.getParam(0.1, 0.4);  // armor fraction
```

**Design goals for adaptive difficulty:**
- Adjustments are gradual — the player should never notice a sudden jump in bot competence.
- The system biases slightly toward making the game harder over time (rewarding improvement).
- If the player is clearly losing (e.g., pushed to last base), the system eases off enough to prevent a hopeless endgame but doesn't hand them a win.
- The adaptation is invisible — no UI indicator of current difficulty level. The game just "feels right."

---

## 4. Multi-Bot Coordination

When multiple bots are on the same team, they should coordinate — otherwise 3 bots attacking 3 different targets is worse than 3 bots attacking one target together.

### 4.1 Coordination Mechanism

Bots on the same team share a lightweight "team board" — a shared data structure that tracks:

- Which bases each bot is targeting (avoid duplication).
- Which enemy targets are assigned.
- Requests for help ("I'm under attack at base X").

```javascript
class TeamBoard {
  constructor() {
    this.claimedTargets = new Map();  // targetId → botId
    this.helpRequests = [];            // [{ botId, position, urgency }]
  }

  claimTarget(botId, targetId) {
    if (!this.claimedTargets.has(targetId)) {
      this.claimedTargets.set(targetId, botId);
      return true;
    }
    return false; // Already claimed by another bot
  }

  requestHelp(botId, position, urgency) {
    this.helpRequests.push({ botId, position, urgency, tick: currentTick });
  }

  getHelpRequests(maxAge) {
    return this.helpRequests.filter(r => currentTick - r.tick < maxAge);
  }
}
```

### 4.2 Coordination Behaviors (Hard Difficulty)

- **Pincer attacks**: Two bots approach an enemy base from different directions simultaneously.
- **Base defense rotation**: When one bot leaves to attack, another moves to cover the vacated territory.
- **Decoy + assault**: One bot draws pillbox fire while the other shoots the pillbox from safety.
- **Resource sharing**: A bot with excess wood builds roads/walls near an ally's base.

Lower difficulties coordinate less or not at all.

---

## 5. Single-Player Runtime

### 5.1 Web Worker Architecture

```
┌──────────────────────────────────────────────────┐
│ Main Thread (Browser)                            │
│  ┌─────────────┐  ┌─────────────┐               │
│  │ Renderer     │  │ Input       │               │
│  │ (Canvas)     │  │ Handler     │               │
│  └──────┬───── │  └──────┬──────│               │
│         │ render state    │ player input         │
│         │ (postMessage)   │ (postMessage)        │
│  ┌──────┴────────────────┴──────────────────┐    │
│  │         postMessage bridge                │    │
│  │    (same binary protocol as WebSocket)    │    │
│  └──────────────────┬───────────────────────┘    │
└─────────────────────┼────────────────────────────┘
                      │
┌─────────────────────┼────────────────────────────┐
│ Web Worker                                       │
│  ┌──────────────────┴───────────────────────┐    │
│  │ Game Simulation (20 ticks/sec)            │    │
│  │  - Physics, collision, terrain            │    │
│  │  - Entity management                      │    │
│  │  - All the same code as server/           │    │
│  ├───────────────────────────────────────────┤    │
│  │ AI Bots (1–15)                            │    │
│  │  - Think → decide → generate input        │    │
│  │  - Fed into simulation as virtual players │    │
│  └───────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

The key insight: the simulation code is identical to what runs on the Node.js server. The Web Worker imports the same `shared/` modules and `server/` simulation code. The transport abstraction (`postMessage` vs `WebSocket`) is the only difference.

### 5.2 Transport Abstraction

```javascript
// client/js/network.js
class NetworkTransport {
  constructor() {
    this.onMessage = null; // callback(ArrayBuffer)
  }
  send(buffer) { /* abstract */ }
  close() { /* abstract */ }
}

class WebSocketTransport extends NetworkTransport {
  constructor(url) {
    super();
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onmessage = (e) => this.onMessage?.(e.data);
  }
  send(buffer) { this.ws.send(buffer); }
  close() { this.ws.close(); }
}

class WorkerTransport extends NetworkTransport {
  constructor(worker) {
    super();
    this.worker = worker;
    this.worker.onmessage = (e) => this.onMessage?.(e.data);
  }
  send(buffer) { this.worker.postMessage(buffer, [buffer]); }
  close() { this.worker.terminate(); }
}
```

The game client doesn't know or care whether it's talking to a remote server or a local Web Worker.

---

## 2. Spectator Mode

### 2.1 Overview

A spectator joins a game room but does not control a tank. They observe the game with special privileges:

- **Full map visibility**: No fog of war. The spectator sees all entities, all terrain, all players.
- **Free camera**: Pan around the map freely, or lock the camera to follow a specific player.
- **Player list with stats**: See each player's armor, ammo, bases controlled, pillboxes owned.
- **Team vision overlay**: Toggle colored overlays showing each team's territory and fog of war.

### 2.2 Implementation

The server treats a spectator as a special client:

- The spectator's state update includes all entities (no fog-of-war filtering).
- The spectator sends no game inputs (only camera position, for interest management if the map is very large).
- Spectators are listed in the room but do not count toward the player limit.

### 2.3 Use Cases

- **Learning**: New players watch experienced players to learn tactics.
- **Tournaments**: Casters observe and commentate matches.
- **Debugging**: Developers watch the full game state to diagnose issues.

---

## 3. Game Recording & Replay

### 3.1 Recording

The server can optionally log all inputs per tick to a replay file:

```
Replay file format:

Header:
  Map file hash (to load the correct map)
  Player list (names, IDs, teams at game start)
  Game settings (hidden mines, time limit, etc.)
  Start timestamp

Per tick:
  Tick number (uint32)
  Input count (uint8)
  For each input:
    Player ID (uint8)
    Input data (same format as PlayerInput message)
```

Because the simulation is deterministic (same inputs → same state), the replay file contains only inputs, not state. The replay player runs the simulation forward from the initial map state, applying recorded inputs at each tick.

### 3.2 Replay Player

The replay player is a mode of the game client:

- Load the replay file and the corresponding map.
- Run the simulation forward tick by tick (in a Web Worker).
- Render each tick.
- Controls: play, pause, fast-forward (2x, 4x, 8x), rewind (requires re-simulating from the start), skip to tick.
- Camera: free pan or follow any player.
- Toggle fog of war per player (see what a specific player saw at each moment).

### 3.3 File Size Estimate

- 20 ticks/second × 16 players × ~5 bytes per input = ~1,600 bytes/second.
- A 30-minute game: ~2.8 MB uncompressed. ~500 KB compressed.
- Very manageable for storage and sharing.

---

## 4. Chat & Communication

### 4.1 Channels

| Channel | Visibility | Purpose |
|---------|------------|---------|
| Global | All players + spectators | General communication, trash talk. |
| Team | Allied players only | Strategy coordination. |
| Direct | One specific player | Private negotiation, alliance proposals. |
| System | All players | Join/leave notifications, game events. |

### 4.2 UI Design

- Chat overlay at bottom-left of the game screen.
- Press Enter to open chat, type message, press Enter to send.
- Tab to cycle between Global and Team channels.
- Messages fade after a few seconds but remain in a scrollable log.
- Chat should never block gameplay — the tank continues to respond to movement keys while chatting.

### 4.3 Alliance Negotiation

Communication is central to Bolo. The chat system should facilitate:

- Proposing alliances: "Want to team up against the south?"
- Coordinating attacks: "I'll hit the pillbox, you capture the base."
- Betrayal: "Sorry, nothing personal." (Then shooting your former ally.)

Consider adding quick-chat commands for common messages:

| Command | Message |
|---------|---------|
| `/ally <player>` | Sends alliance request to a player. |
| `/unally <player>` | Breaks alliance with a player. |
| `/help` | "I need help at my position!" (broadcasts to allies with map ping) |
| `/attack <direction>` | "Attack north/south/east/west!" |

---

## 5. Leaderboards & Persistence (Optional)

### 5.1 Overview

For a community server that tracks player stats over time:

- Player accounts (username + password, or OAuth via Google/GitHub).
- Per-game stats recorded at game end.
- Aggregate stats displayed on a leaderboard page.

### 5.2 Stats Tracked

| Stat | Description |
|------|-------------|
| Games played | Total games participated in. |
| Wins | Games where the player's team captured all bases or held majority at time limit. |
| Kills | Enemy tanks destroyed. |
| Deaths | Times the player's tank was destroyed. |
| Bases captured | Total bases claimed or seized. |
| Pillboxes captured | Total pillboxes collected and placed. |
| Trees harvested | Total wood collected. |
| Mines planted | Total mines placed. |
| Time played | Total game time. |

### 5.3 Storage

SQLite is sufficient for a single-server community deployment. Schema:

```sql
CREATE TABLE players (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE game_results (
  id INTEGER PRIMARY KEY,
  map_name TEXT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  duration_seconds INTEGER
);

CREATE TABLE player_stats (
  id INTEGER PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  game_id INTEGER REFERENCES game_results(id),
  team INTEGER,
  kills INTEGER DEFAULT 0,
  deaths INTEGER DEFAULT 0,
  bases_captured INTEGER DEFAULT 0,
  pillboxes_captured INTEGER DEFAULT 0,
  trees_harvested INTEGER DEFAULT 0,
  mines_planted INTEGER DEFAULT 0,
  won BOOLEAN DEFAULT FALSE
);
```

### 5.4 Leaderboard Page

A simple server-rendered HTML page (or a static page that fetches JSON from an API):

- Top players by wins, kills, K/D ratio.
- Recent games with results.
- Player profile pages with per-game history.

This is a Phase 4+ feature. The game should be fully playable without accounts or persistence.

---

## 6. Bot Scripting API (Stretch Goal)

### 6.1 Vision

The original Bolo had a beloved "brain" plugin system where players could write custom AI bots. WebBolo can offer a modern equivalent: a JavaScript API for scripting bots.

### 6.2 API Surface

A bot script receives a sanitized game state (what a human player would see) and returns input commands:

```javascript
// Example bot script
export function think(state) {
  // state contains:
  //   state.myTank: { x, y, rotation, armor, shells, mines, wood, hasEngineer }
  //   state.visibleTanks: [{ x, y, rotation, owner, team }]
  //   state.visiblePillboxes: [{ x, y, owner, health, isFriendly }]
  //   state.visibleBases: [{ x, y, owner, isFriendly }]
  //   state.mapTiles: 2D array of visible tile types
  //   state.tick: current tick number

  // Return input commands:
  return {
    forward: true,
    rotateLeft: false,
    rotateRight: true,
    fire: state.visibleTanks.length > 0,
    dropMine: false,
    engineerTarget: null // or { x, y, action: 'harvest' }
  };
}
```

### 6.3 Sandboxing

Bot scripts run in a sandboxed environment to prevent:

- Access to the full game state (only the fog-of-war-limited view).
- Infinite loops or excessive computation (timeout per `think()` call).
- Network access or file system access.

Options for sandboxing:
- **Web Worker with restricted API**: Strip `fetch`, `XMLHttpRequest`, `importScripts` from the Worker global.
- **`vm2` or `isolated-vm` on the server**: Run bot scripts in a V8 isolate with memory and time limits.
- **WASM sandbox**: For maximum isolation, compile bot scripts to WASM and run in a restricted WASM runtime.

The simplest approach for Phase 4 is a Web Worker (for client-hosted bots) or `isolated-vm` (for server-hosted bots).

### 6.4 Community Bot Tournaments

Once the scripting API exists:

- Players upload bot scripts to the community server.
- Tournaments are run automatically: all bots play in a round-robin on a standard map.
- Results posted to the leaderboard.
- Bot scripts are open-source so players can learn from each other.

This was one of the most engaging aspects of the original Bolo community, and would give WebBolo long-term appeal beyond casual play.

---

## 7. Progressive Web App (PWA) Support

### 7.1 Benefits

Making WebBolo a PWA allows:

- **Install to home screen** on mobile/desktop.
- **Offline single-player** mode (bots + Web Worker simulation).
- **Update notifications** when a new version is deployed.

### 7.2 Implementation

- Add a `manifest.json` with app name, icons, and theme color.
- Add a Service Worker that caches static assets (HTML, JS, CSS, sprites, sounds).
- The Service Worker does NOT cache WebSocket connections or dynamic game state.
- Offline mode: detect no network, offer single-player bot game.

### 7.3 Mobile Considerations

While WebBolo is desktop-first, PWA support makes mobile play possible:

- Touch controls: virtual joystick (left thumb) + fire/action buttons (right thumb).
- Landscape orientation enforced.
- Reduced viewport (smaller visible area).
- This is a Phase 4+ consideration and should not influence core design decisions.

---

## 8. Feature Priority Matrix

| Feature | Phase | Effort | Impact | Priority |
|---------|-------|--------|--------|----------|
| AI bots (basic) | **1B** | Medium | High (enables single-player) | **Critical** |
| Chat system | 3 | Low | High (core Bolo experience) | High |
| Spectator mode | 4 | Low | Medium | Medium |
| Game replay | 4 | Medium | Medium | Medium |
| Leaderboards | 4+ | Medium | Low (nice-to-have) | Low |
| Bot scripting API | 4+ | High | High (community engagement) | Medium |
| PWA support | 4+ | Low | Low | Low |
| Bot tournaments | 4+ | High | Medium | Low |

---

*See also: [05 - Development Phases](./05-Development-Phases.md) for when these features are built.*
*See also: [03 - Networking Architecture](./03-Networking-Architecture.md) for how bots and spectators integrate with the server.*
