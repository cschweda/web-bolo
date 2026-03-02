# WebBolo: WinBolo Source Code Reference

**Document:** 09 — Supplement
**Version:** 0.1
**Date:** March 2026
**Source:** `kippandrew/winbolo` on GitHub (WinBolo 1.15/1.17 source, GPL v2)

---

This document captures **exact numeric constants** from the WinBolo C source code. These are the authoritative values for replicating authentic Bolo gameplay. All values below are copied directly from the source headers and implementation files.

## 1. Game Timing

From `backend.h`:

```c
#define GAME_TICK_LENGTH 10           // ms between ticks (actual internal)
// The game timer is 20ms between events; GAME_TICK_LENGTH is half this,
// to give more resolution for tank movement and aiming.
// So: 50 "game ticks" per second, but game logic runs at 50 Hz internally
// with key/movement updates at 100 Hz.
```

**WebBolo interpretation:** The game runs at **50 Hz** for game logic (20ms per game tick), with an internal subdivision at **100 Hz** (10ms) for smoother tank movement interpolation. Our client renders at 60 FPS with interpolation between server ticks.

## 2. World Coordinate System

From `global.h`:

```c
typedef unsigned short WORLD;  // 16-bit world coordinate

// Top 8 bits = map position (0–255)
// Next 4 bits = sub-tile position in pixels (0–15)
// Last 4 bits = sub-pixel precision

#define MAP_SQUARE_MIDDLE 128  // Center of a map tile in world units
#define MIDDLE_PIXEL 8         // Center of a tile in pixels
#define M_W_SHIFT_SIZE 8       // Shift to convert map ↔ world coords
```

**Key insight:** The world coordinate is 256 units per tile. A WORLD value of `0x0A80` means map tile 10 (`0x0A`), at sub-tile position 128 (the center). This gives sub-pixel precision within each 16×16 pixel tile.

## 3. Tank Physics

From `tank.h`:

```c
// Rotation
#define TANK_FRAMES 16                    // 16 discrete rotation angles (22.5° each)

// Speed & acceleration
#define TANK_ACCELERATE_RATE 0.25         // Speed increase per tick when accelerating
#define TANK_TERRAIN_DECEL_RATE 0.25      // Speed decrease per tick for terrain slowdown
#define TANK_SLOWKEY_RATE 0.25            // Speed decrease per tick when braking
#define TANK_AUTOSLOW_SPEED 0.25          // Auto-deceleration when no key pressed

// Collision
#define TANK_WALL_SLOW_DOWN 1             // Speed loss when hitting a wall
#define BOAT_EXIT_SPEED 16                // Minimum speed to leave a boat

// Damage
#define MINE_DAMAGE 10                    // Armor loss from mine hit
// (from global.h)
#define DAMAGE 5                          // Armor loss from shell/pillbox hit

// Death
#define TANK_DEATH_WAIT 255               // Ticks to wait before respawn
#define TANK_BIG_EXPLOSION_THRESHOLD 20   // shells+mines > 20 = big explosion on death

// Reload
#define TANK_RELOAD_TIME 13               // Ticks between shots

// Water damage
#define TANK_WATER_TIME 15                // Ticks in water before losing 1 shell/mine

// Gunsight
#define GUNSIGHT_MIN 2                    // Minimum targeting range (half map squares)
#define GUNSIGHT_MAX 14                   // Maximum targeting range (half map squares)

// Tank slide (knockback from being hit)
#define TANK_SLIDE 16                     // World units per slide update
#define TANK_SLIDE_TICKS 7                // Number of slide updates (7+1 = 8 total)
#define TANK_BUMP 7                       // World units per bump update
#define TANK_BUMP_TICKS 7                 // Number of bump updates

// Forest visibility
#define MIN_TREEHIDE_DIST 768             // Minimum distance for seeing tank in trees
                                          // = 3 map squares = 768 world coords

// Death static display
#define STATIC_ON_TICKS 145               // Generic death static duration
#define STATIC_ON_TICKS_DEEPSEA 195       // Deep sea death static (longer)
#define STATIC_ON_TICKS_MINES 145         // Mine death static
#define STATIC_ON_TICKS_SHELL 145         // Shell death static
#define STATIC_CHANGE_TICKS 10            // Change static bitmap every 10 ticks
```

### 3.1 Starting Inventory

From `gametype.h` / `gametype.c`:

```c
#define TANK_FULL_ARMOUR 40
#define TANK_FULL_SHELLS 40
#define TANK_FULL_MINES  40
#define TANK_FULL_TREES  40
```

Game types affect starting inventory:

| Game Type | Shells | Mines | Trees | Armour |
|-----------|--------|-------|-------|--------|
| **Open** | 40 | 40 | 40 | 40 |
| **Tournament** | 2 × (neutral bases / total bases × 16) | 0 | 0 | 40 |
| **Strict Tournament** | 0 | 0 | 0 | 40 |

## 4. Terrain Speed Constants

From `bolo_map.h` — these are **maximum speed values** (world units per tick), not multipliers:

### Tank Speeds

```c
#define MAP_SPEED_TDEEPSEA       3   // Deep sea (kills tank — this just allows brief travel before death)
#define MAP_SPEED_TBUILDING      0   // Impassable
#define MAP_SPEED_TRIVER         3   // River (very slow without boat)
#define MAP_SPEED_TSWAMP         3   // Swamp (very slow)
#define MAP_SPEED_TCRATER        3   // Crater (very slow)
#define MAP_SPEED_TROAD         16   // Road (fastest)
#define MAP_SPEED_TFOREST        6   // Forest (moderate)
#define MAP_SPEED_TRUBBLE        3   // Rubble (very slow)
#define MAP_SPEED_TGRASS        12   // Grass (standard — note: NOT 16)
#define MAP_SPEED_THALFBUILDING  0   // Damaged building (impassable)
#define MAP_SPEED_TBOAT         16   // Boat (fast)
#define MAP_SPEED_TREFBASE      16   // On a refueling base
#define MAP_SPEED_TPILLBOX       0   // Alive pillbox (impassable)
```

**Relative speeds as ratios to Grass (12):**

| Terrain | Max Speed | Ratio to Grass |
|---------|-----------|---------------|
| Road | 16 | 1.33x |
| Boat | 16 | 1.33x |
| Base | 16 | 1.33x |
| Grass | 12 | 1.0x (baseline) |
| Forest | 6 | 0.5x |
| River | 3 | 0.25x |
| Swamp | 3 | 0.25x |
| Crater | 3 | 0.25x |
| Rubble | 3 | 0.25x |
| Deep Sea | 3 | 0.25x (then death) |
| Building | 0 | Impassable |
| Halfbuilding | 0 | Impassable |
| Pillbox | 0 | Impassable |

**IMPORTANT correction:** Our docs said road was 1.5x and swamp was 0.5x. The actual source shows road is 1.33x (16/12) and swamp/crater/rubble/river are all 0.25x (3/12). Forest is 0.5x (6/12). The speed differences are more dramatic than we estimated.

### Engineer (LGM/Man) Speeds

```c
#define MAP_MANSPEED_TDEEPSEA       0   // Instant death
#define MAP_MANSPEED_TBUILDING      0   // Can't enter
#define MAP_MANSPEED_TRIVER         0   // Can't enter water
#define MAP_MANSPEED_TSWAMP         4   // Slow
#define MAP_MANSPEED_TCRATER        4   // Slow
#define MAP_MANSPEED_TROAD         16   // Fast
#define MAP_MANSPEED_TFOREST        8   // Moderate
#define MAP_MANSPEED_TRUBBLE        4   // Slow
#define MAP_MANSPEED_TGRASS        16   // Fast (same as road!)
#define MAP_MANSPEED_THALFBUILDING  0   // Can't enter
#define MAP_MANSPEED_TBOAT         16   // Fast
#define MAP_MANSPEED_TREFBASE      16   // Fast
#define MAP_MANSPEED_TPILLBOX       0   // Can't enter
```

**Key insight:** The engineer moves at full speed on grass AND road (both 16), but is slowed by forest (8), and heavily slowed by swamp/crater/rubble (4). The engineer **cannot enter water, buildings, or halfbuildings** at all (speed 0).

## 5. Shell Constants

From `shells.h`:

```c
#define SHELL_LIFE 8          // Ticks before shell expires (max range)
#define SHELL_DEATH 0         // Shell has expired
#define SHELL_SPEED 32        // World units per tick (2x max tank speed on road)
#define SHELL_START_EXPLODE 8 // Starting explosion animation frame
#define SHELL_START_ADD 6     // Starting frame for new shell (offset from tank)
```

**Shell range:** 8 ticks × 32 world units = 256 world units = exactly 1 map tile. With targeting cursor, shells can be detonated early (range 2–14 half-tiles = 1–7 tiles).

## 6. Pillbox Constants

From `pillbox.h`:

```c
#define PILL_MAX_HEALTH 15           // Full health (also PILLS_MAX_ARMOUR)
#define PILLBOX_RANGE 2048           // Detection/attack range in world units (= 8 tiles)
#define PILLBOX_FIRE_DISTANCE 8.5    // Shell start distance from pillbox center
#define PILLBOX_COOLDOWN_TIME 32     // Ticks between pillbox shots (base)
#define PILLBOX_MAX_FIRERATE 6       // Minimum ticks between shots when provoked
#define PILLBOX_ATTACK_NORMAL 100    // Default cooldown when idle / out of range
#define PILL_REPAIR_AMOUNT 4         // Health restored per repair action
#define MAX_AIM_ITERATE 200          // Aiming calculation iterations
```

**Key insights:**
- Pillbox health is 0–15. At 15, fully intact. At 0, dead and can be picked up.
- `DAMAGE = 5` (from global.h), so a shell does 5 damage to a pillbox. 15 / 5 = **3 hits to destroy a full pillbox**.
- Pillbox range is 2048 world units = **8 map tiles** (much larger than we estimated).
- Fire rate accelerates when under attack: from 32 ticks (0.64 sec) down to 6 ticks (0.12 sec) when provoked. This matches the manual's "when provoked, can fire very rapidly."

## 7. Base Constants

From `bases.h`:

```c
#define BASE_FULL_ARMOUR 90          // Max armour a base can stock
#define BASE_FULL_SHELLS 90          // Max shells
#define BASE_FULL_MINES  90          // Max mines
#define BASE_ADD_TIME 1670           // Ticks between base restocking itself (was 3340 in v1.09)
#define BASE_TICKS_BETWEEN_REFUEL 1000 // Ticks between refuel cycles
#define BASE_DEAD 9                  // Base armour level at which it's undefended
#define BASE_MIN_CAN_HIT 4          // Minimum armour to absorb hits
#define MIN_ARMOUR_CAPTURE 9         // Must reduce below this to capture
#define BASE_SHELLS_GIVE 1           // Shells given per refuel tick
#define BASE_ARMOUR_GIVE 5           // Armour given per refuel tick
#define BASE_MINES_GIVE 1            // Mines given per refuel tick
#define BASE_REFUEL_ARMOUR 46        // Rate for base self-restocking armour
#define BASE_REFUEL_SHELLS 7.5       // Rate for base self-restocking shells
#define BASE_REFUEL_MINES 7.5        // Rate for base self-restocking mines
#define BASE_STATUS_RANGE 1792       // Range to see base status (= 7 tiles)
```

## 8. Engineer (LGM) Constants

From `lgm.h`:

```c
// Build costs (in "wood" / tree units — tank stores 0–40 trees)
#define LGM_COST_ROAD 2              // Build road or bridge
#define LGM_COST_BUILDING 2          // Build wall
#define LGM_COST_REPAIRBUILDING 1    // Repair a damaged building
#define LGM_COST_BOAT 20             // Build a boat (very expensive! Manual says 5 trees)
#define LGM_COST_PILLNEW 4           // Place a new pillbox
#define LGM_COST_PILLREPAIR 1        // Repair a pillbox (min cost; can cost up to 4)
#define LGM_COST_MINE 1              // Plant a mine
#define LGM_GATHER_TREE 4            // Wood gained from harvesting a tree

// Engineer sprite
#define LGM_SIZE_X 3                 // Sprite width in pixels
#define LGM_SIZE_Y 4                 // Sprite height in pixels
#define LGM_MAX_FRAMES 2             // Walk animation frames

// Timing
#define LGM_BUILD_TIME 20            // Ticks to complete a build action
#define LGM_HELICOPTER_SPEED 3       // Speed when parachuting in (respawn)
#define LGM_HELICOPTER_FRAME 3       // Animation frame for parachuting
```

**Key correction:** Build costs differ from what the manual says. The manual says boats cost "5 trees" but the source says `LGM_COST_BOAT = 20` wood units, and `LGM_GATHER_TREE = 4` wood per tree harvested. So 20 / 4 = **5 trees** — the manual was giving tree counts, the source uses wood units (4 wood = 1 tree). Similarly, a road costs 2 wood = 0.5 trees, matching the manual's "1/2 a tree."

| Action | Wood Cost | Trees Equivalent |
|--------|-----------|-----------------|
| Harvest tree | +4 wood | +1 tree |
| Build road/bridge | 2 wood | 0.5 trees |
| Build wall | 2 wood | 0.5 trees |
| Repair building | 1 wood | 0.25 trees |
| Build boat | 20 wood | 5 trees |
| Place new pillbox | 4 wood | 1 tree |
| Repair pillbox | 1–4 wood | 0.25–1 tree |
| Plant mine | 1 mine | (from mine inventory) |

## 9. Flood Fill Mechanic

From `floodfill.h` / `floodfill.c`:

```c
#define FLOOD_FILL_WAIT 16  // Ticks before a crater floods (0.32 seconds at 50 Hz)
```

**Algorithm:** When a crater is created adjacent to water (RIVER, DEEP_SEA, or BOAT), it's added to a flood queue with a 16-tick timer. When the timer expires, the crater becomes RIVER. The algorithm then checks the crater's 4 cardinal neighbors — any neighboring CRATER or MINE_CRATER tiles are added to the queue with their own 16-tick timer. This creates a cascading flood effect. Pillboxes and bases adjacent to flooding are treated as ROAD (they don't flood).

## 10. Mine Chain Detonation

From `minesexp.h` / `minesexp.c`:

```c
#define MINES_EXPLOSION_WAIT 10  // Ticks before chain-detonating adjacent mine (0.2 sec)
```

**Algorithm:** When a mine detonates, the tile becomes CRATER, an explosion is spawned, flood fill is triggered, and all 4 cardinal neighbors are checked. Any neighbor that is a mine (terrain 10–15) is added to a chain detonation queue with a 10-tick delay. This propagates outward. Adjacent mines chain; checkerboard-pattern mines don't.

## 11. Tree Regrowth

From `treegrow.h` / `treegrow.c`:

```c
#define TREEGROW_TIME 3000          // Ticks between tree growth evaluations (60 sec at 50 Hz)
#define TREEGROW_INITIAL_TIME 30000 // Initial delay before first growth (10 min)

// Scoring: higher score = more likely to grow a tree
#define TREE_GROW_FOREST 100         // Adjacent forest strongly encourages growth
#define TREE_GROW_GRASS 25           // Grass mildly encourages growth
#define TREE_GROW_RIVER 2            // Water slightly helps
#define TREE_GROW_DEEP_SWAMP 2       // Swamp slightly helps
#define TREE_GROW_DEEP_RUBBLE -2     // Rubble slightly discourages
#define TREE_GROW_CRATER -2          // Craters slightly discourage
#define TREE_GROW_ROAD -100          // Roads strongly prevent growth
#define TREE_GROW_BUILDING -20       // Buildings prevent growth
#define TREE_GROW_HALF_BUILDING -15  // Damaged buildings prevent growth
#define TREE_GROW_MINE -7            // Mines somewhat prevent growth
```

**Algorithm:** Each tick, a random map tile is selected. Its growth score is calculated by summing the scores of all 8 neighboring tiles. The highest-scoring candidate grows into forest every 3000 ticks (~60 seconds). Trees grow back best next to existing forest and grass, and are prevented by roads, buildings, and mines. Trees never grow on river, buildings, halfbuildings, or tiles with pillboxes/bases.

## 12. Angular Measurement

From `global.h`:

```c
#define BRADIANS_MAX 256.0        // Full circle = 256 "bradians" (binary radians)
#define BRADIANS_NORTH 0
#define BRADIANS_EAST 64
#define BRADIANS_SOUTH 128
#define BRADIANS_WEST 192
#define BRADIANS_GAP 16           // 256/16 = 16 angular steps, matching 16 sprite frames

// Conversion factors
#define BRADIAN_TO_RADIAN_FACTOR 0.024544
#define RADIAN_TO_BRADIAN_FACTOR 40.743665
```

**Key insight:** WinBolo uses "bradians" (binary radians) — a 256-unit circle. 0 = North, 64 = East, 128 = South, 192 = West. Each of the 16 tank sprite frames covers 16 bradians (22.5°). This makes rotation math very efficient: incrementing by 1 bradian = 1.40625° rotation.

## 13. Screen Rendering (Auto-Tiling)

From `screencalc.c`:

The auto-tiling system uses **8-neighbor** checking (all 8 surrounding tiles), not just 4 cardinals as initially documented. The road/bridge rendering has 11+ specific water-crossing variants (`ROAD_WATER1` through `ROAD_WATER11`) for different bridge configurations.

The system normalizes DEEP_SEA and BOAT to RIVER for edge calculations, so water rendering treats all water types uniformly for shore/bridge calculations.

## 14. Max Players & Entity Limits

From `global.h`:

```c
#define MAX_TANKS 16
// Pillbox and base arrays are 0–15 (16 each, matching MAX_TANKS)
#define NEUTRAL 0xFF     // Owner value for unclaimed entities
```

## 15. Summary of Corrections to Our Docs

| Topic | Our Assumption | Actual Source Value | Impact |
|-------|---------------|-------------------|--------|
| Grass speed | 1.0x baseline | 12 (1.0x ✓) | Correct |
| Road speed | 1.5x | 16 (1.33x of grass) | Road is slightly slower than we said |
| Swamp speed | 0.5x | 3 (0.25x of grass) | Swamp is MUCH slower than we said |
| Crater speed | 0.75x | 3 (0.25x) | Crater is MUCH slower than we said |
| Rubble speed | 0.75x | 3 (0.25x) | Rubble is MUCH slower than we said |
| Forest speed | 0.75x | 6 (0.5x) | Forest is slower than we said |
| River speed | "very slow" | 3 (0.25x) | Matches—very slow confirmed |
| Tank reload | ~10 ticks | 13 ticks (0.26 sec) | Slightly slower fire rate |
| Shell speed | 32 world/tick | 32 ✓ | Correct |
| Shell range | — | 8 ticks × 32 = 256 world = 1 tile | Very short! |
| Pillbox health | ? | 15 max, 5 damage per hit = 3 hits | Lower than expected |
| Pillbox range | ~10–12 tiles | 2048 world = 8 tiles | We overestimated |
| Pillbox fire rate | ? | 32 ticks idle → 6 ticks provoked | Dramatic acceleration |
| Mine damage | 5 | 10 (double shell damage!) | Mines are much deadlier |
| Starting inventory | ? | 40/40/40/40 (open game) | Now known exactly |
| Game tick rate | 20 Hz | 50 Hz (100 Hz internal) | Faster than we assumed |
| Flood delay | ? | 16 ticks (0.32 sec) | Now known |
| Mine chain delay | ? | 10 ticks (0.2 sec) | Now known |
| Tree regrowth | "5 minutes" | 3000 ticks (~60 sec between growths) | Faster than assumed |
| Engineer sprite | ~20 frames | 3×4 pixels, 2 walk frames | Much smaller than assumed |
| Build time | "~3 sec" | 20 ticks (0.4 sec) | MUCH faster than assumed |
| Boat cost | "5 trees" | 20 wood (= 5 trees at 4 wood/tree) | Same, but internal unit is wood not trees |
| Angular system | Degrees/radians | Bradians (256 per circle) | Important for rotation math |
| Death respawn wait | ? | 255 ticks (~5.1 sec) | Now known |

---

*Source: WinBolo 1.15/1.17, kippandrew/winbolo on GitHub. Code copyright 1998-2008 John Morrison, GNU GPL v2. Graphics/sounds copyright 1993 Stuart Cheshire.*
