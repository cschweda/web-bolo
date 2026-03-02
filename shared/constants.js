/**
 * WebBolo game constants — authoritative values from WinBolo source (doc 09).
 *
 * TIMING: WebBolo runs at 20 Hz (50ms ticks). WinBolo runs at 50 Hz (20ms ticks).
 * All tick-based values below are PRE-SCALED to 20 Hz unless noted otherwise.
 * Scaling: durations × 0.4, speeds × 2.5.
 *
 * COORDINATES: 256 world units per tile. A world coordinate's top 8 bits = tile index,
 * bottom 8 bits = sub-tile position. MAP_SQUARE_MIDDLE (128) = center of a tile.
 */

// --- Timing ---
export const TICK_RATE = 20          // Server ticks per second
export const TICK_INTERVAL_MS = 50   // Milliseconds per tick
export const CLIENT_FPS = 60         // Client render target

// --- Map ---
export const MAP_WIDTH = 256
export const MAP_HEIGHT = 256
export const TILE_SIZE_PX = 16       // Pixels per tile at base scale
export const MAP_SQUARE_MIDDLE = 128 // Center of a tile in world units (256 units/tile)
export const WORLD_UNITS_PER_TILE = 256

// --- Players ---
export const MAX_PLAYERS = 16
export const NEUTRAL_OWNER = 0xFF

// --- Tank ---
export const TANK_FRAMES = 16       // 16 discrete rotation angles (22.5° each)
export const TANK_MAX_ARMOR = 40
export const TANK_MAX_SHELLS = 40
export const TANK_MAX_MINES = 40
export const TANK_MAX_WOOD = 40

// Tank speeds (world units per tick at 20 Hz)
// Original 50 Hz values × 2.5 to maintain same real-world velocity
export const TANK_SPEED_ROAD = 40        // 16 × 2.5 (fastest)
export const TANK_SPEED_BOAT = 40        // 16 × 2.5
export const TANK_SPEED_BASE = 40        // 16 × 2.5
export const TANK_SPEED_GRASS = 30       // 12 × 2.5 (standard)
export const TANK_SPEED_FOREST = 15      // 6 × 2.5
export const TANK_SPEED_RIVER = 7.5      // 3 × 2.5 (very slow without boat)
export const TANK_SPEED_SWAMP = 7.5      // 3 × 2.5
export const TANK_SPEED_CRATER = 7.5     // 3 × 2.5
export const TANK_SPEED_RUBBLE = 7.5     // 3 × 2.5
export const TANK_SPEED_DEEPSEA = 7.5    // 3 × 2.5 (then death)

// Tank physics
export const TANK_ACCELERATE_RATE = 0.625  // 0.25 × 2.5 per tick
export const TANK_DECELERATE_RATE = 0.625  // 0.25 × 2.5 per tick
export const TANK_BRAKE_RATE = 0.625       // 0.25 × 2.5 per tick
export const TANK_AUTOSLOW_SPEED = 0.625   // 0.25 × 2.5 per tick
export const TANK_WALL_SLOW_DOWN = 2.5     // 1 × 2.5

// Tank damage
export const DAMAGE_SHELL = 5             // Armor loss from shell/pillbox hit
export const DAMAGE_MINE = 10             // Armor loss from mine hit

// Tank timing (ticks at 20 Hz — original 50 Hz values × 0.4)
export const TANK_RELOAD_TIME = 5         // 13 × 0.4 = 5.2, rounded to 5
export const TANK_DEATH_WAIT = 102        // 255 × 0.4 = 102
export const TANK_WATER_TIME = 6          // 15 × 0.4 = 6
export const TANK_BIG_EXPLOSION_THRESHOLD = 20 // shells + mines > 20 = big explosion

// Tank knockback
export const TANK_SLIDE_SPEED = 40        // 16 × 2.5 world units/tick
export const TANK_SLIDE_TICKS = 3         // 7 × 0.4 ≈ 3 (original 7+1=8 updates)
export const TANK_BUMP_SPEED = 17.5       // 7 × 2.5
export const TANK_BUMP_TICKS = 3          // 7 × 0.4 ≈ 3

// Tank visibility
export const TANK_TREE_HIDE_DIST = 768    // Min distance to see tank in trees (3 tiles)
export const BOAT_EXIT_SPEED = 40         // 16 × 2.5, min speed to leave a boat

// Death static display (ticks at 20 Hz)
export const STATIC_ON_TICKS = 58         // 145 × 0.4
export const STATIC_ON_TICKS_DEEPSEA = 78 // 195 × 0.4
export const STATIC_CHANGE_TICKS = 4      // 10 × 0.4

// Gunsight range (in half-map-squares)
export const GUNSIGHT_MIN = 2
export const GUNSIGHT_MAX = 14

// Starting inventory by game type
export const START_OPEN = { armor: 40, shells: 40, mines: 40, wood: 40 }
export const START_STRICT = { armor: 40, shells: 0, mines: 0, wood: 0 }

// --- Shell ---
export const SHELL_SPEED = 80            // 32 × 2.5 world units per tick at 20 Hz
export const SHELL_LIFE = 3              // 8 × 0.4 = 3.2, rounded to 3
                                         // Range: 3 × 80 = 240 world units ≈ 0.94 tiles
export const SHELL_RANGE_WORLD = SHELL_SPEED * SHELL_LIFE // 240 world units

// --- Pillbox ---
export const PILL_MAX_HEALTH = 15
export const PILLBOX_RANGE = 2048        // World units = 8 tiles exactly
export const PILLBOX_RANGE_TILES = 8
export const PILLBOX_COOLDOWN_IDLE = 13  // 32 × 0.4 = 12.8, rounded to 13
export const PILLBOX_COOLDOWN_MAX_FIRE = 2 // 6 × 0.4 = 2.4, rounded to 2
export const PILL_REPAIR_AMOUNT = 4

// --- Base ---
export const BASE_MAX_ARMOR = 90
export const BASE_MAX_SHELLS = 90
export const BASE_MAX_MINES = 90
export const BASE_RESTOCK_INTERVAL = 668   // 1670 × 0.4 = 668 ticks
export const BASE_DEAD_ARMOR = 9           // Below this = undefended
export const BASE_CAPTURE_THRESHOLD = 9    // Reduce below this to capture
export const BASE_SHELLS_GIVE = 1          // Per refuel tick
export const BASE_ARMOR_GIVE = 5           // Per refuel tick
export const BASE_MINES_GIVE = 1           // Per refuel tick
export const BASE_STATUS_RANGE = 1792      // World units = 7 tiles

// --- Engineer (LGM) ---
export const LGM_BUILD_TIME = 8           // 20 × 0.4 = 8 ticks
export const LGM_HELICOPTER_SPEED = 7.5   // 3 × 2.5 world units/tick
export const LGM_SPRITE_W = 3             // Pixels
export const LGM_SPRITE_H = 4             // Pixels
export const LGM_MAX_FRAMES = 2           // Walk animation frames

// Engineer speeds (world units per tick at 20 Hz)
export const LGM_SPEED_ROAD = 40         // 16 × 2.5
export const LGM_SPEED_GRASS = 40        // 16 × 2.5 (same as road!)
export const LGM_SPEED_FOREST = 20       // 8 × 2.5
export const LGM_SPEED_SWAMP = 10        // 4 × 2.5
export const LGM_SPEED_CRATER = 10       // 4 × 2.5
export const LGM_SPEED_RUBBLE = 10       // 4 × 2.5
export const LGM_SPEED_BOAT = 40         // 16 × 2.5
export const LGM_SPEED_BASE = 40         // 16 × 2.5

// Engineer build costs (in wood units — 4 wood = 1 tree harvested)
export const LGM_COST_ROAD = 2
export const LGM_COST_WALL = 2
export const LGM_COST_REPAIR_BUILDING = 1
export const LGM_COST_BOAT = 20           // 5 trees worth
export const LGM_COST_PILLBOX_NEW = 4     // 1 tree worth
export const LGM_COST_PILLBOX_REPAIR = 1  // Min cost (up to 4)
export const LGM_COST_MINE = 1            // From mine inventory, not wood
export const LGM_GATHER_WOOD = 4          // Wood gained per tree harvested

// --- Dynamic Terrain ---
export const FLOOD_FILL_DELAY = 6         // 16 × 0.4 = 6.4, rounded to 6 ticks
export const MINE_CHAIN_DELAY = 4         // 10 × 0.4 = 4 ticks
export const TREE_REGROW_INTERVAL = 1200  // 3000 × 0.4 = 1200 ticks (~60 sec)
export const TREE_REGROW_INITIAL = 12000  // 30000 × 0.4 = 12000 ticks (~10 min)

// Tree regrowth neighbor scoring
export const TREE_GROW_FOREST = 100
export const TREE_GROW_GRASS = 25
export const TREE_GROW_RIVER = 2
export const TREE_GROW_SWAMP = 2
export const TREE_GROW_RUBBLE = -2
export const TREE_GROW_CRATER = -2
export const TREE_GROW_ROAD = -100
export const TREE_GROW_BUILDING = -20
export const TREE_GROW_HALFBUILDING = -15
export const TREE_GROW_MINE = -7

// --- Angular System (Bradians) ---
export const BRADIANS_MAX = 256          // Full circle
export const BRADIANS_NORTH = 0
export const BRADIANS_EAST = 64
export const BRADIANS_SOUTH = 128
export const BRADIANS_WEST = 192
export const BRADIANS_PER_FRAME = 16     // 256/16 = 16 bradians per sprite frame
export const BRADIAN_TO_RADIAN = 0.024544
export const RADIAN_TO_BRADIAN = 40.743665
