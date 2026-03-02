/**
 * Terrain type enum, properties, and speed tables.
 * Authoritative values from WinBolo source (doc 09, bolo_map.h).
 *
 * This file must remain framework-agnostic — pure JS, no platform-specific imports.
 * Imported by both client (Nuxt/Canvas) and server (Node.js/Web Worker).
 */

import {
  TANK_SPEED_ROAD, TANK_SPEED_BOAT, TANK_SPEED_BASE, TANK_SPEED_GRASS,
  TANK_SPEED_FOREST, TANK_SPEED_RIVER, TANK_SPEED_SWAMP, TANK_SPEED_CRATER,
  TANK_SPEED_RUBBLE, TANK_SPEED_DEEPSEA,
  LGM_SPEED_ROAD, LGM_SPEED_GRASS, LGM_SPEED_FOREST, LGM_SPEED_SWAMP,
  LGM_SPEED_CRATER, LGM_SPEED_RUBBLE, LGM_SPEED_BOAT, LGM_SPEED_BASE,
} from './constants.js'

// --- Terrain Enum ---
// Values from WinBolo global.h. Order matters — mine terrain IDs are base + 8.
export const TERRAIN = {
  BUILDING:      0,
  RIVER:         1,
  SWAMP:         2,
  CRATER:        3,
  ROAD:          4,
  FOREST:        5,
  RUBBLE:        6,
  GRASS:         7,
  HALFBUILDING:  8,
  BOAT:          9,
  MINE_SWAMP:   10,
  MINE_CRATER:  11,
  MINE_ROAD:    12,
  MINE_FOREST:  13,
  MINE_RUBBLE:  14,
  MINE_GRASS:   15,
  DEEP_SEA:     0xFF,
}

// --- Terrain Properties ---
// Each terrain type's gameplay properties.
export const TERRAIN_PROPS = {
  [TERRAIN.BUILDING]:     { passable: false, deadly: false, tankSpeed: 0,                   lgmSpeed: 0,               destructible: true,  blocksVision: true,  blocksShells: true  },
  [TERRAIN.RIVER]:        { passable: true,  deadly: false, tankSpeed: TANK_SPEED_RIVER,    lgmSpeed: 0,               destructible: false, blocksVision: false, blocksShells: false, degradesAmmo: true },
  [TERRAIN.SWAMP]:        { passable: true,  deadly: false, tankSpeed: TANK_SPEED_SWAMP,    lgmSpeed: LGM_SPEED_SWAMP, destructible: false, blocksVision: false, blocksShells: false },
  [TERRAIN.CRATER]:       { passable: true,  deadly: false, tankSpeed: TANK_SPEED_CRATER,   lgmSpeed: LGM_SPEED_CRATER, destructible: false, blocksVision: false, blocksShells: false, floodsNearWater: true },
  [TERRAIN.ROAD]:         { passable: true,  deadly: false, tankSpeed: TANK_SPEED_ROAD,     lgmSpeed: LGM_SPEED_ROAD,  destructible: true,  blocksVision: false, blocksShells: false },
  [TERRAIN.FOREST]:       { passable: true,  deadly: false, tankSpeed: TANK_SPEED_FOREST,   lgmSpeed: LGM_SPEED_FOREST, destructible: true,  blocksVision: true,  blocksShells: true,  conceals: true, harvestable: true, regrows: true },
  [TERRAIN.RUBBLE]:       { passable: true,  deadly: false, tankSpeed: TANK_SPEED_RUBBLE,   lgmSpeed: LGM_SPEED_RUBBLE, destructible: false, blocksVision: false, blocksShells: false },
  [TERRAIN.GRASS]:        { passable: true,  deadly: false, tankSpeed: TANK_SPEED_GRASS,    lgmSpeed: LGM_SPEED_GRASS, destructible: false, blocksVision: false, blocksShells: false },
  [TERRAIN.HALFBUILDING]: { passable: false, deadly: false, tankSpeed: 0,                   lgmSpeed: 0,               destructible: true,  blocksVision: true,  blocksShells: true  },
  [TERRAIN.BOAT]:         { passable: true,  deadly: false, tankSpeed: TANK_SPEED_BOAT,     lgmSpeed: LGM_SPEED_BOAT,  destructible: true,  blocksVision: false, blocksShells: false },
  [TERRAIN.DEEP_SEA]:     { passable: false, deadly: true,  tankSpeed: TANK_SPEED_DEEPSEA,  lgmSpeed: 0,               destructible: false, blocksVision: false, blocksShells: false },
}

// Mine variants inherit properties from their base terrain + detonation
for (let mineId = TERRAIN.MINE_SWAMP; mineId <= TERRAIN.MINE_GRASS; mineId++) {
  const baseId = mineId - 8 // MINE_SWAMP(10) - 8 = SWAMP(2), etc.
  TERRAIN_PROPS[mineId] = { ...TERRAIN_PROPS[baseId], mined: true, detonatesOnContact: true }
}

// --- Helper Functions ---

/**
 * Get the visual base terrain for a mined tile (for rendering to enemies).
 * MINE_GRASS (15) → GRASS (7), MINE_ROAD (12) → ROAD (4), etc.
 */
export function getBaseTerrain(terrainId) {
  if (terrainId >= TERRAIN.MINE_SWAMP && terrainId <= TERRAIN.MINE_GRASS) {
    return terrainId - 8
  }
  return terrainId
}

/** Check if a terrain tile is mined. */
export function isMined(terrainId) {
  return terrainId >= TERRAIN.MINE_SWAMP && terrainId <= TERRAIN.MINE_GRASS
}

/** Get the mined version of a base terrain. Returns null if terrain can't be mined. */
export function getMinedTerrain(terrainId) {
  if (terrainId >= TERRAIN.SWAMP && terrainId <= TERRAIN.GRASS) {
    return terrainId + 8
  }
  return null
}

/** Check if terrain is passable by a tank. */
export function isTankPassable(terrainId) {
  const props = TERRAIN_PROPS[terrainId] || TERRAIN_PROPS[getBaseTerrain(terrainId)]
  return props ? props.passable : false
}

/** Get tank max speed on a terrain type (world units per tick at 20 Hz). */
export function getTankSpeed(terrainId) {
  const props = TERRAIN_PROPS[terrainId] || TERRAIN_PROPS[getBaseTerrain(terrainId)]
  return props ? props.tankSpeed : 0
}

/** Get engineer max speed on a terrain type. Returns 0 if engineer can't enter. */
export function getLgmSpeed(terrainId) {
  const props = TERRAIN_PROPS[terrainId] || TERRAIN_PROPS[getBaseTerrain(terrainId)]
  return props ? props.lgmSpeed : 0
}

/** Check if terrain blocks line of sight (for fog of war). */
export function blocksVision(terrainId) {
  const props = TERRAIN_PROPS[terrainId] || TERRAIN_PROPS[getBaseTerrain(terrainId)]
  return props ? props.blocksVision : false
}

/** Check if terrain blocks shell travel. */
export function blocksShells(terrainId) {
  const props = TERRAIN_PROPS[terrainId] || TERRAIN_PROPS[getBaseTerrain(terrainId)]
  return props ? props.blocksShells : false
}

/** Check if terrain is water (river, deep sea, or boat). */
export function isWater(terrainId) {
  return terrainId === TERRAIN.RIVER || terrainId === TERRAIN.DEEP_SEA || terrainId === TERRAIN.BOAT
}

// --- Rendering Colors (placeholder — colored rectangles for Phase 1A) ---
// RGB values for each terrain type, used by the Canvas renderer.
export const TERRAIN_COLORS = {
  [TERRAIN.BUILDING]:     '#555555', // Gray
  [TERRAIN.RIVER]:        '#2266cc', // Blue
  [TERRAIN.SWAMP]:        '#556b2f', // Dark olive
  [TERRAIN.CRATER]:       '#8b7355', // Tan brown
  [TERRAIN.ROAD]:         '#999999', // Light gray
  [TERRAIN.FOREST]:       '#006400', // Dark green
  [TERRAIN.RUBBLE]:       '#8b8682', // Gray-brown
  [TERRAIN.GRASS]:        '#228b22', // Forest green
  [TERRAIN.HALFBUILDING]: '#777777', // Medium gray
  [TERRAIN.BOAT]:         '#4488cc', // Light blue
  [TERRAIN.DEEP_SEA]:     '#003366', // Dark navy
}

// Mine variants render as their base terrain color (enemies can't see them)
for (let mineId = TERRAIN.MINE_SWAMP; mineId <= TERRAIN.MINE_GRASS; mineId++) {
  TERRAIN_COLORS[mineId] = TERRAIN_COLORS[mineId - 8]
}
