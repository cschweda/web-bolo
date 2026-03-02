# WebBolo: Gameplay Mechanics

**Document:** 02 of 09
**Version:** 0.3
**Date:** March 2026

---

## Overview

This document specifies the gameplay mechanics that WebBolo must implement to faithfully recreate the Bolo experience. All values (speeds, costs, timers) are drawn from the WinBolo source code (`global.h`, `bolo_map.h`, `tank.h`, etc.) and the original Bolo manual. See doc 09 for the complete source reference.

---

## 1. The Tank

### 1.1 Movement

The player controls a single tank, viewed top-down. Movement is continuous (not tile-snapped), with physics-based momentum:

- **Rotation**: The tank rotates in place. Rotation is divided into 16 discrete directions (matching the original's 16-direction sprite system). Rotation speed is constant regardless of terrain.
- **Acceleration**: Pressing forward accelerates the tank in the direction it faces. There is a maximum speed, which varies by terrain.
- **Deceleration**: Releasing the forward key causes gradual deceleration (friction). The tank slides slightly before stopping.
- **No reverse**: The original Bolo had no reverse gear. The player must rotate and drive forward. (Design decision: consider adding slow reverse as a modernization option.)
- **Terrain speed modifiers**: See Section 6 (Terrain).

### 1.2 Health & Armor

- Tanks have an armor value (e.g., 40 points, matching the original).
- Each hit from a shell or pillbox reduces armor by 5 (`DAMAGE = 5` in WinBolo source).
- Mines deal heavy damage: 10 armor per mine (`MINE_DAMAGE = 10` — double a shell hit).
- At 0 armor, the tank is destroyed. The player respawns on a boat in deep sea (matching original Bolo), heading toward the island.
- Driving into deep water instantly destroys the tank.
- Armor is replenished at friendly bases.
- Tanks experience knockback (slide) when hit — pushed backward from the impact for several ticks.

### 1.3 Weapons

**Primary — Cannon:**
- Fires a shell in the direction the tank is currently facing.
- Shells travel in a straight line at a fixed speed (32 world units/tick) until they hit a wall, entity, or reach maximum range (~1 tile). A targeting cursor allows the player to control shell range manually — useful for detonating mines at a distance.
- Rate of fire: ~3.8 shells per second (reload time: 13 ticks at 50 Hz = 0.26 sec). Shell range is short — only ~1 map tile at max range.
- Each shot costs 1 shell from the tank's ammo supply.

**Secondary — Mines:**
- The tank can drop a mine at its current position (fast, visible to nearby enemies).
- Alternatively, the engineer can plant a mine at a target tile (slower, invisible to enemies if "hidden mines" is enabled).
- Mines detonate on contact (any tank or engineer driving/walking over them).
- Adjacent mines chain-detonate, creating chain reactions.
- Detonation creates a crater at that tile.
- Each mine placed costs 1 mine from the tank's supply.

### 1.4 Resources

| Resource | Starting | Max | Replenished At |
|----------|----------|-----|----------------|
| Armor | 40 | 40 | Friendly bases |
| Shells | 40 | 40 | Friendly bases |
| Mines | 40 | 40 | Friendly bases (Open game). Tournament: 0. |
| Trees (wood) | 0 | 40 | Harvested by engineer |

Resources are replenished by stopping on a friendly base. Replenishment is not instant — the base transfers resources over a few seconds, and the base's own supply decreases accordingly.

---

## 2. The Engineer (LGM — "Little Green Man")

### 2.1 Basic Behavior

Each tank has exactly one engineer. The engineer is a small, slow-moving unit that exits the tank to perform tasks:

- The player issues a command (harvest, build, place mine, collect/place pillbox) by targeting a tile.
- The engineer exits the tank, walks to the target tile, performs the action, and walks back.
- While outside the tank, the engineer is vulnerable — killed by any explosion, shell, or mine within the blast radius.
- The engineer moves at approximately 1/3 tank speed.

### 2.2 Engineer Death & Replacement

If the engineer is killed:

- A replacement parachutes in after a significant delay (original: ~2 minutes). This is one of the most punishing losses in the game.
- During this delay, the tank cannot perform any engineer actions — no building, no harvesting, no mine planting, no pillbox collection.
- The parachute drop is visible to nearby players, potentially revealing the tank's location.

### 2.3 Engineer Actions

| Action | Target | Cost | Time | Notes |
|--------|--------|------|------|-------|
| Harvest trees | Forest tile | Free | ~0.4 sec | Collects wood. Tile becomes grass. Trees regrow over time. |
| Build road | Grass/swamp tile | 2 wood (0.5 tree) | ~0.4 sec | Converts tile to road. Speeds movement. |
| Build wall | Grass tile | 2 wood (0.5 tree) | ~0.4 sec | Converts tile to BUILDING. Blocks movement and shells. No separate wall type. |
| Build boat | Water tile (edge) | 20 wood (5 trees) | ~0.4 sec | Creates a boat for water crossing. Fragile (1 hit destroys). |
| Plant mine | Any passable tile | 1 mine | ~0.4 sec | Mine is invisible to enemies (if hidden mines enabled). |
| Collect pillbox | Destroyed pillbox tile | Free | ~0.4 sec | Picks up the pillbox. Tank now carries it. |
| Place pillbox | Passable tile | 4 wood (1 tree) | ~0.4 sec | Deploys carried pillbox. It becomes friendly and active. |

### 2.4 Tactical Depth

The engineer is where Bolo's strategy comes alive. Key patterns from the original:

- **Tree-mine traps**: Plant a mine in a forest where an enemy is known to harvest trees. Their engineer walks in and dies.
- **Wall forts**: Build walls around a friendly base to protect it. Leave a gap for your own tank but force enemies through a chokepoint covered by pillboxes.
- **Road networks**: Build roads between your bases for rapid resupply and reinforcement.
- **Boat bridges**: Build boats to cross water barriers and attack from unexpected directions.
- **Engineer sniping**: Shoot the tile an enemy engineer is walking toward. The explosion kills the engineer, costing them minutes of downtime.

---

## 3. Pillboxes

### 3.1 Behavior

Pillboxes are stationary automated turrets placed on the map. They are the primary strategic asset in Bolo.

- **Targeting**: A pillbox shoots at the nearest enemy tank within its range.
- **Anger mechanic**: A pillbox's fire rate increases when it is shot at ("angered"). It calms down over time. This creates a tactical dilemma — shooting a hostile pillbox provokes it to shoot faster. Conversely, shooting your *own* pillbox angers it, which is useful when an enemy is nearby.
- **Health**: Pillboxes have 15 health points (`PILL_MAX_HEALTH = 15`). Each shell deals 5 damage, so a full-health pillbox dies in **3 hits**. When reduced to 0, the pillbox is destroyed and can be collected by an engineer.
- **Range**: Fixed radius of exactly 8 tiles (2048 world units). This is 8× the shell's max range — you cannot outrange a pillbox.
- **Ammo**: Infinite. Pillboxes never run out of shells.
- **Ownership**: Pillboxes start neutral (hostile to all players). Once captured and placed by a player, they are friendly to that player's team and hostile to all others.

### 3.2 Capture Flow

1. Shoot the pillbox until its health reaches 0. It becomes a destroyed husk.
2. Send your engineer to the destroyed pillbox tile. The engineer picks it up.
3. The tank now "carries" the pillbox (shown in HUD inventory).
4. Send your engineer to a target tile. The engineer places the pillbox.
5. The placed pillbox is now active and friendly — it shoots at your enemies.

### 3.3 Advanced Tactics

- **Pilltakes**: Use walls or friendly pillboxes to block a hostile pillbox's line of fire while you shoot it from safety. A classic Bolo skill.
- **Decoys**: One player draws pillbox fire while an ally shoots it from a different angle.
- **Spiking bases**: Place a hostile pillbox adjacent to an enemy base. The pillbox prevents them from safely refueling, effectively denying the base without destroying it.
- **Pillbox fronts**: Two teams establish opposing lines of pillboxes. Breaking through the enemy's front and deploying pillboxes behind their line is often decisive.
- **Self-anger**: Shoot your own pillbox when an enemy is nearby to increase its fire rate against them.

---

## 4. Bases

### 4.1 Function

Bases are fixed positions on the map that supply tanks with armor, shells, and mines. Controlling bases is the strategic objective of the game.

### 4.2 Ownership

- **Neutral**: At game start, all bases are neutral (gray). Any tank can claim a neutral base by driving over it.
- **Friendly**: A base you or your team controls. Stopping on it replenishes your tank's resources.
- **Hostile**: A base controlled by an enemy team. You cannot refuel here.

### 4.3 Capture

- Shoot a hostile base to reduce its armor to 0.
- Drive over the destroyed base to claim it for your team.
- Bases that recently refueled a damaged tank have lower armor (their supplies were depleted), making them easier to capture. This creates a strategic tempo — attacking right after an enemy refuels is optimal.

### 4.4 Resource Economy

Each base has its own internal resource pool:

| Resource | Pool Size | Regeneration Rate |
|----------|-----------|-------------------|
| Armor | 90 | 5 per restock cycle (~33 sec) |
| Shells | 90 | 1 per restock cycle (~33 sec) |
| Mines | 90 | 1 per restock cycle (~33 sec) |

Bases restock slowly. `BASE_ADD_TIME = 1670` ticks at 50 Hz ≈ 33 seconds between restock events. A depleted base takes many minutes to fully recover.

When a tank refuels, the base's pool decreases. If the base is depleted, it cannot provide resources until it regenerates. This means a single base supporting multiple tanks will run dry quickly — controlling more bases is essential.

---

## 5. Mines

### 5.1 Placement

- **Tank drop**: Press the mine key to drop a mine at the tank's current position. Fast, but the mine is briefly visible to nearby enemies.
- **Engineer plant**: Send the engineer to a target tile. The mine is placed invisibly (if "hidden mines" game option is on). Slower, but more strategic.

### 5.2 Visibility

With "hidden mines" enabled (the standard game mode):

- Mines planted by the engineer are invisible to enemies.
- Mines planted by the engineer are visible to the planting player and their allies.
- Enemies only see a hidden mine when they are very close — often too close to stop.
- Mines dropped by the tank (not the engineer) are briefly visible to everyone.

### 5.3 Detonation

- A mine detonates when any tank or engineer moves onto its tile.
- Detonation deals 10 armor damage (double a shell hit) and creates a crater.
- **Chain reactions**: If an adjacent tile also contains a mine, it detonates too. A line of adjacent mines all explode in sequence. To prevent chain reactions, players lay mines in a checkerboard pattern.
- Craters adjacent to water flood, creating new water tiles. A chain of mines leading to the sea creates an artificial river — a powerful terrain modification tactic.

### 5.4 Strategic Uses

- Minefields around bases and pillboxes.
- Trap lines along likely enemy approach routes.
- Moats: a chain of mines near water, when detonated, creates a water barrier.
- Tree-mine traps (mine in a forest where enemies harvest).
- Denial: mining your own roads when retreating.

---

## 6. Terrain

### 6.1 Terrain Types

**Corrected to match WinBolo `global.h` enum and the original Bolo manual.**

| Type | ID | Movement Speed | Passable | Destructible | Notes |
|------|----|---------------|----------|-------------|-------|
| Building | 0 | Impassable | No | Yes → Halfbuilding → Rubble | Barrier. Blocks movement and shells. Also used for player-built walls (no separate "wall" type). |
| River | 1 | Very slow (0.25x) | Boat only | No | Water. Damages shells/mines over time if tank enters without boat. Bridges can be built over rivers. |
| Swamp | 2 | Very slow (0.25x) | Yes | No | Looks similar to grass. Natural defense terrain. |
| Crater | 3 | Very slow (0.25x) | Yes | No | Created by mine explosions. Floods if adjacent to water, creating artificial rivers/moats. |
| Road | 4 | Fast (1.33x) | Yes | Yes | Built by engineer. When placed on a river tile, renders as a bridge. Boats can't pass under bridges. |
| Forest | 5 | Slow (0.50x) | Yes | Yes (harvest/explosion) | Conceals tank when completely surrounded by forest on all 8 sides. Harvestable. Regrows over time. |
| Rubble | 6 | Very slow (0.25x) | Yes | No | Remains of fully destroyed buildings. |
| Grass | 7 | Normal (1.0x) | Yes | No | Default terrain. Most of the island. |
| Halfbuilding | 8 | Impassable | No | Yes → Rubble | Damaged building. Still blocks movement. Intermediate destruction state. |
| Boat | 9 | Normal (1.0x) | Yes | Yes (1 hit) | Moored boat on water. Players spawn on a boat in deep sea. Costs 5 trees to build. |
| Mine variants | 10–15 | Same as base | Yes | Detonates | Mines are terrain variants, not entities. MINE_SWAMP=10 through MINE_GRASS=15. Subtract 8 for visual base terrain. Invisible to enemies. |
| Deep Sea | 0xFF | Instant death | No (boat only) | No | Immutable ocean border. Can't build on it. |

**Key corrections from original Bolo manual and WinBolo source:**

- **No separate "wall" type.** Player-built walls use BUILDING (ID 0).
- **Bridge is ROAD on RIVER**, not a separate terrain type. Renderer draws bridge graphic contextually.
- **Building destruction is two-stage**: BUILDING → HALFBUILDING (still impassable) → RUBBLE (passable).
- **Forest concealment is binary**: tank must be surrounded on all 8 sides to be hidden, not just standing on a forest tile.
- **River damages ammo**: driving through water without a boat depletes shells and mines over time.
- **Tank spawns on a boat at sea**, not on land.

### 6.2 Dynamic Terrain

Terrain changes persist for the duration of the game:

- **Harvesting**: Forest → Grass.
- **Regrowth**: Grass (formerly forest) → Forest, over time (e.g., 5 minutes). Only tiles that were originally forest regrow.
- **Building road**: Grass/Swamp → Road.
- **Building wall**: Grass → Building. (Player-built walls use BUILDING type, no separate wall type.)
- **Explosion on forest**: Forest → Grass (trees destroyed).
- **Explosion on road**: Road → Crater.
- **Building road on river**: River → Road (renders as bridge). Boats can't pass under.
- **Explosion on building**: Building → Halfbuilding (damaged, still impassable).
- **Explosion on halfbuilding**: Halfbuilding → Rubble (passable debris).
- **Explosion on grass**: Grass → Crater.
- **Crater near water**: Crater → River (floods). Chain of mines leading to sea creates artificial river/moat.
- **Mine chain detonation**: Adjacent mines set each other off. Lay in checkerboard pattern to prevent chain reactions.

### 6.3 Visibility

- Forests block line of sight. A tank is hidden from enemies and pillboxes only when **completely enclosed** — surrounded by forest on all 8 neighboring tiles.
- The player's viewport is centered on their tank and shows a limited area (the original showed roughly 17x17 tiles).
- Fog of war has three states: **visible** (in range, fully rendered), **previously seen** (terrain remembered, entities hidden, dark overlay), and **unexplored** (solid black).
- Mine visibility: mines are invisible to enemies. Visible to the owning player and allies. Allied mine positions shared in real-time during alliance (not retroactively for pre-alliance mines).

---

## 7. Teams & Alliances

### 7.1 Team Mechanics

- Players can form teams. Team membership is fluid — alliances can be formed and broken mid-game.
- Allied players share:
  - Map visibility (fog of war is shared).
  - Pillbox ownership (allied pillboxes don't shoot each other).
  - Base access (can refuel at allied bases).
  - Hidden mine visibility (can see allied mines).
- Enemies do not see any of the above.

### 7.2 Communication

- **Global chat**: All players can see messages.
- **Team chat**: Only allies see messages.
- **Direct message**: Private to one player (optional).

Communication is a core part of Bolo. Alliance negotiation, strategy coordination, threats, and deception all happen through chat. The UI should make chatting quick and unobtrusive during gameplay.

---

## 8. Solo Play Mode

### 8.1 Why Solo Play Matters

The original Bolo's biggest limitation was that it *required* human opponents. No one online? No game. This was true throughout the Mac Bolo era and remains true for WinBolo today — the active player base is tiny, and finding a game often means coordinating in Discord and hoping someone shows up. WebBolo fixes this by treating single-player as a **first-class game mode**, not a consolation prize.

Solo play serves four purposes:

- **The front door**: A new visitor clicks "Play Solo" and is in a full game in seconds. No server, no waiting for opponents, no account creation. This is how most people will first experience WebBolo.
- **Onboarding**: Learn the mechanics in a forgiving environment — tank movement, engineer commands, pillbox capture, mine tactics, terrain modification — without getting obliterated by experienced players.
- **Practice**: Experienced players test new strategies, learn new maps, and warm up before multiplayer.
- **Standalone value**: Sometimes you just want to play a quick game. A strong AI makes this genuinely fun, not just target practice.

### 8.2 Solo Game Modes

| Mode | Description | AI Behavior |
|------|-------------|-------------|
| **Tutorial** | Guided introduction to each mechanic, one at a time. Step-by-step overlay prompts. Small map, controlled scenarios. | Passive — AI follows scripted scenarios. Doesn't attack until the tutorial calls for it. |
| **Skirmish** | Full game against 1–15 AI opponents on any map. The core solo experience. | Active — AI plays to win at selected difficulty. |
| **Challenge** | Pre-designed scenarios with specific objectives (e.g., "capture all bases starting from one corner," "survive 10 minutes against 8 Hard bots," "defeat an entrenched opponent with only 2 pillboxes"). | Tailored per scenario. Some challenges restrict player resources or starting conditions. |
| **Sandbox** | All mechanics available, AI optional. For experimenting, learning mine chains, practicing pilltakes, testing build strategies. | Configurable — passive, defensive, or aggressive. Can be spawned/removed mid-game. |

### 8.3 Solo Configuration

| Setting | Options | Default |
|---------|---------|---------|
| Number of AI opponents | 1–15 | 3 |
| AI difficulty | Easy / Medium / Hard / Adaptive | Medium |
| Map | Any available map | Tutorial Island (first time) |
| Teams | Solo vs. all bots / Team with bots vs. enemy bots / Free-for-all | Solo vs. all bots |
| Hidden mines | On / Off | On |
| Game speed | 0.5x / 1x / 2x / 4x | 1x |

### 8.4 Adaptive Difficulty

Beyond fixed Easy/Medium/Hard levels, an "Adaptive" difficulty mode adjusts bot behavior in real-time based on the player's performance:

**Signals the system monitors:**
- Player kill/death ratio over the last 5 minutes.
- Bases controlled (player vs. bots).
- Player armor trend (consistently high = dominating, consistently near-death = struggling).
- Time since player last lost a tank.

**How it adapts:**
- Player dominating → Bots coordinate attacks, use advanced tactics (pilltakes, mine traps, base spiking), react faster, aim more accurately.
- Player struggling → Bots become less accurate, react slower (250ms → 500ms delay), make occasional strategic mistakes (ignore a vulnerable base, send engineer into danger), reduce coordination.
- The adaptation is gradual — no sudden jumps. The goal is to keep the game in a flow state where the player is challenged but not helpless.

**Why this matters:** Fixed-difficulty bots have a narrow window of fun. Too easy and you're bored in 5 minutes. Too hard and you quit. Adaptive difficulty extends the solo experience dramatically — the game is always interesting regardless of skill level.

### 8.5 Solo-Specific Features

Features available only in solo mode (not multiplayer):

- **Pause**: Press Escape to pause the game. The Web Worker simulation stops ticking. Resume at any time.
- **Speed control**: Play at 0.5x (slow motion — useful for learning), 1x (normal), 2x (faster pacing), or 4x (skip through early-game base claiming). Adjustable during play.
- **Save/Load**: Snapshot the full game state to browser storage (IndexedDB) and resume later. Serializes the tile map, all entity states, bot internal states, and the random seed. Multiple save slots.
- **Instant restart**: One-key restart on the same map with fresh state. No menu navigation.
- **Fog of war toggle**: Option to play with full map visibility (for learning) or standard fog of war (for realistic practice).
- **Bot vision overlay**: Debug option that shows what each bot can "see" — useful for understanding how the AI makes decisions.

### 8.6 Technical Architecture

Solo mode runs entirely in the browser with **no server needed**:

```
Main Thread (client):              Web Worker (server simulation):
  Keyboard input capture    →      Receive player inputs
  Canvas rendering          ←      Run game simulation (20 ticks/sec)
  Audio playback                   Run all bot AI decision-making
  HUD display                      Send state updates via postMessage
  Pause/speed control       →      Adjust tick rate or stop ticking
```

The client code is identical whether playing solo or multiplayer — it sends binary input messages and receives binary state updates. The only difference is the transport layer: `postMessage` to a Web Worker instead of `WebSocket.send()` to a remote server. Prediction, interpolation, and rendering code don't change at all.

This architecture means:
- Solo mode is available offline (PWA-capable, no network required).
- Every bug fix and feature added to the networked simulation automatically works in solo.
- Solo mode is a perfect test harness for the game simulation during development.
- Performance is excellent — a Web Worker has its own thread, so bot AI computation doesn't block rendering.

### 8.7 Can the AI Be "Smart Enough"?

This is the key question. Bolo's tactical depth is real — experienced human players develop sophisticated strategies over hundreds of hours. Can an AI opponent provide a comparable challenge?

**The honest answer: yes, up to a point.** Here's why:

**What the AI can do well:**
- **Mechanical execution**: A bot can aim perfectly, react instantly, and manage resources optimally. The difficulty settings throttle these abilities to feel human, but the underlying capability is superhuman.
- **Known strategies**: The Bolo community documented optimal tactics over decades — pilltakes, wall forts, base spiking, mine perimeters, road networks. A bot programmed with these patterns executes them reliably.
- **Multi-front coordination**: When multiple bots are allied, they can share information and coordinate attacks across the map simultaneously — something human teams do poorly without voice chat.
- **Patience**: A bot never gets bored, never overextends out of frustration, never forgets to check its flanks.

**What the AI will struggle with:**
- **Creative adaptation**: A human player invents novel strategies mid-game. The AI works from a repertoire of known patterns. An experienced human who figures out the AI's decision-making can exploit it.
- **Deception**: Bolo's alliance and betrayal dynamics are deeply human. A bot can be programmed to "betray" at a strategic moment, but it won't read social cues in chat or set up elaborate bluffs.
- **Long-term strategic planning**: The AI evaluates the best action right now, re-evaluated every 0.5–2 seconds. It doesn't think 10 minutes ahead. ("If I sacrifice this base now, I can build a road network to flank their rear in 5 minutes" — that's beyond a utility-based AI.)

**The design target**: A Hard AI should feel like a competent human player who's been playing for a few months — good at mechanics, knows the standard tactics, makes sound strategic decisions, but doesn't innovate. An expert human player will eventually figure out the AI's patterns and dominate, but getting to that point should take many hours of play. That's a satisfying single-player arc.

See [07 - AI Bots & Community](./07-AI-Bots-Community.md) for the complete AI architecture, decision tree, and difficulty tuning.

---

## 9. Win Conditions

### 9.1 Primary

There is no mandatory win condition. The strategic objective is to capture all bases on the map, which denies the enemy ammunition and repairs. In practice, games end when one side concedes that their supply situation is untenable — they've lost too many bases, too many are spiked by enemy pillboxes, and they can't refuel.

### 9.2 Optional Modes

| Mode | Description |
|------|-------------|
| Base domination | First team to hold all bases simultaneously wins. |
| Timed | Game ends after a set time. Team with most bases wins. |
| Elimination | Last tank (or team) standing wins. Respawns disabled. |
| Free-for-all | No teams. Every player for themselves. |

### 9.3 Game Flow

A typical Bolo game follows a recognizable arc:

1. **Opening**: Players spawn and rush to claim nearby neutral bases and pillboxes. Engineers harvest wood.
2. **Mid-game**: Teams form. Players build road networks, fortify bases with walls and pillboxes, and probe enemy territory. Pillbox fronts establish.
3. **Late game**: One side breaks through. Pillboxes are deployed behind enemy lines to spike bases. The losing side's territory shrinks. Supply lines collapse.
4. **Endgame**: The losing side concedes or is eliminated. Or alliances shift and the dynamic resets.

---

## 10. Game Settings (Room Configuration)

The room host configures these before the game starts:

| Setting | Options | Default |
|---------|---------|---------|
| Map | Selection from available maps | (first map) |
| Max players | 2–16 | 16 |
| Hidden mines | On / Off | On |
| AI bots | 0–14 (fills empty slots) | 0 |
| Teams | Free-for-all / Manual teams / Auto-balance | Manual |
| Time limit | None / 15 / 30 / 60 min | None |
| Allow mid-game join | Yes / No | Yes |
| Friendly fire | On / Off | Off |
| Engineer respawn time | Fast (30s) / Normal (120s) / Slow (300s) | Normal |

---

## 11. Balance Considerations

The original Bolo's balance emerged from playtesting over years. WebBolo should start with values close to the original and tune from there. Key balance levers:

- **Engineer respawn time**: The single most impactful balance parameter. A long respawn makes engineer preservation critical. A short respawn makes the game more forgiving but less strategic.
- **Pillbox range and health**: Determines how hard they are to assault. Too tough and the game stalemates. Too fragile and they're not worth the effort to place.
- **Base regeneration rate**: Affects the resource economy. Faster regen means more sustained combat. Slower regen means territory control matters more.
- **Mine damage** (10 armor per mine, vs 5 for shells): High damage makes minefields deadly but also makes aggressive mine-clearing (deliberately detonating them) more costly.
- **Tank speed vs. pillbox tracking**: If tanks are fast relative to pillbox turn rate, pillboxes become less threatening. The original struck a careful balance here.

All balance values should be defined in a single constants file, easily tunable without code changes.

---

*See also: [03 - Networking Architecture](./03-Networking-Architecture.md) for how these mechanics are synchronized across clients.*
